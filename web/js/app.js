const CITY = "Кривий Ріг";
const LAT = 47.9105;
const LON = 33.3918;

let unit = "C";
let tab = "temp";

// UI helpers
const $ = (s) => document.querySelector(s);
const cToF = (c) => Math.round((c * 9/5) + 32);

function setActiveButtons() {
  document.querySelectorAll(".unit").forEach(b =>
    b.classList.toggle("is-active", b.dataset.unit === unit)
  );
  document.querySelectorAll(".tab").forEach(b =>
    b.classList.toggle("is-active", b.dataset.tab === tab)
  );
}

// --- Data model used by the UI
let data = {
  now: { c: 0, precip: 0, humidity: 0, windKmh: 0, summary: "—", dayName: "—" },
  hours: [],   // [{t:"12:00", c:1, precip:15, wind:6}, ...] length 24
  days: []     // optional row; we can keep 8 days from API
};

function renderDays() {
  const host = $("#days");
  host.innerHTML = "";
  data.days.forEach(d => {
    const el = document.createElement("div");
    el.className = `day ${d.today ? "is-today" : ""}`;
    el.innerHTML = `
      <div class="dname">${d.name}</div>
      <div class="dicon">${d.icon}</div>
      <div class="dtemp">${d.hi}° ${d.lo}°</div>
    `;
    host.appendChild(el);
  });
}

function renderXLabels() {
  const host = $("#xlabels");
  host.innerHTML = "";
  data.hours.forEach(h => {
    const s = document.createElement("div");
    s.textContent = h.t;
    host.appendChild(s);
  });
}

function seriesByTab() {
  if (tab === "temp") return data.hours.map(h => unit === "C" ? h.c : cToF(h.c));
  if (tab === "precip") return data.hours.map(h => h.precip);
  return data.hours.map(h => h.wind);
}

function renderSpark() {
  const svgW = 700, svgH = 140, padX = 18, padY = 18;
  const values = seriesByTab();
  if (!values.length) return;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = (max - min) || 1;

  const n = values.length;
  const xStep = (svgW - padX * 2) / (n - 1);

  const pts = values.map((v, i) => {
    const x = padX + i * xStep;
    const y = padY + (svgH - padY * 2) * (1 - (v - min) / span);
    return { x, y };
  });

  const dLine = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  $("#line").setAttribute("d", dLine);

  const dArea =
    `${dLine} L ${(padX + (n - 1) * xStep).toFixed(2)} ${(svgH - padY).toFixed(2)} ` +
    `L ${padX.toFixed(2)} ${(svgH - padY).toFixed(2)} Z`;
  $("#area").setAttribute("d", dArea);

  const dots = $("#dots");
  dots.innerHTML = "";
  pts.forEach(p => {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("class", "dot");
    c.setAttribute("cx", p.x);
    c.setAttribute("cy", p.y);
    c.setAttribute("r", 3.5);
    dots.appendChild(c);
  });
}

function setNow() {
  const tempNow = unit === "C" ? data.now.c : cToF(data.now.c);
  $("#tempNow").textContent = tempNow;
  $("#precipNow").textContent = `${data.now.precip}%`;
  $("#humidityNow").textContent = `${data.now.humidity}%`;
  $("#windNow").textContent = `${data.now.windKmh} км/ч`;
  $("#summary").textContent = data.now.summary;
  $("#dayName").textContent = data.now.dayName;
}

function wire() {
  document.querySelectorAll(".unit").forEach(b => {
    b.addEventListener("click", () => {
      unit = b.dataset.unit;
      setActiveButtons();
      setNow();
      renderSpark();
    });
  });

  document.querySelectorAll(".tab").forEach(b => {
    b.addEventListener("click", () => {
      tab = b.dataset.tab;
      setActiveButtons();
      renderSpark();
    });
  });
}

// --- Fetch 24h forecast from Open-Meteo
async function loadForecast24h() {
  // hourly: temp, precip prob, wind, relative humidity
  // daily: min/max
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&hourly=temperature_2m,precipitation_probability,windspeed_10m,relativehumidity_2m` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&current_weather=true&timezone=Europe%2FKyiv`;

  const r = await fetch(url);
  if (!r.ok) throw new Error("Не вдалося завантажити прогноз");
  const j = await r.json();

  // build 24 next hours starting "now"
  const times = j.hourly.time;
  const idxNow = findClosestHourIndex(times, j.current_weather.time);

  const sliceStart = Math.max(0, idxNow);
  const sliceEnd = Math.min(times.length, sliceStart + 24);

  data.hours = [];
  for (let i = sliceStart; i < sliceEnd; i++) {
    data.hours.push({
      t: formatHHMM(times[i]),
      c: Math.round(j.hourly.temperature_2m[i]),
      precip: Math.round(j.hourly.precipitation_probability[i] ?? 0),
      wind: Math.round(j.hourly.windspeed_10m[i] ?? 0)
    });
  }

  // now block
  data.now = {
    c: Math.round(j.current_weather.temperature),
    precip: Math.round((j.hourly.precipitation_probability[idxNow] ?? 0)),
    humidity: Math.round((j.hourly.relativehumidity_2m[idxNow] ?? 0)),
    windKmh: Math.round(j.current_weather.windspeed),
    summary: "Кривий Ріг",
    dayName: dayNameUA(new Date())
  };

  // simple 8-day row (optional)
  data.days = (j.daily.time || []).slice(0, 8).map((d, k) => ({
    name: shortDowUA(d),
    icon: "☁️",
    hi: Math.round(j.daily.temperature_2m_max[k]),
    lo: Math.round(j.daily.temperature_2m_min[k]),
    today: k === 0
  }));
}

function findClosestHourIndex(hourlyTimes, currentTimeISO) {
  // hourlyTimes: ["2025-..T10:00", ...], currentTimeISO: "2025-..T10:30" or "T10:00"
  // We'll match by same hour prefix.
  const key = currentTimeISO.slice(0, 13); // "YYYY-MM-DDTHH"
  let i = hourlyTimes.findIndex(t => t.startsWith(key));
  if (i !== -1) return i;
  // fallback: first item
  return 0;
}

function formatHHMM(iso) {
  // "YYYY-MM-DDTHH:MM" -> "HH:MM"
  const t = iso.split("T")[1] || "";
  return t.slice(0, 5);
}

function dayNameUA(d) {
  const names = ["неділя","понеділок","вівторок","середа","четвер","пʼятниця","субота"];
  return names[d.getDay()];
}
function shortDowUA(isoDate) {
  const d = new Date(isoDate);
  const names = ["НД","ПН","ВТ","СР","ЧТ","ПТ","СБ"];
  return names[d.getDay()];
}

// init
(async function init(){
  wire();
  setActiveButtons();

  try {
    await loadForecast24h();
    setNow();
    renderXLabels();
    renderSpark();
    renderDays();
  } catch (e) {
    // fallback minimal
    $("#summary").textContent = "Немає з’єднання з прогнозом";
    console.error(e);
  }
})();
