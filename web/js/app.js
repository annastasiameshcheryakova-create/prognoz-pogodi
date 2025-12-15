const CITY = "Кривий Ріг";
const LAT = 47.9105;
const LON = 33.3918;

let unit = "C";
let tab = "temp";

let model = null;
let scaler = null;

let data = {
  now: { c: 0, precip: 0, humidity: 0, windKmh: 0, summary: CITY, dayName: "—" },
  hours: [],
  days: []
};

const $ = (s) => document.querySelector(s);
const cToF = (c) => Math.round((c * 9/5) + 32);

function setStatus(msg){
  const el = $("#status");
  if (el) el.textContent = msg; // не ломаем сайт, если элемента нет
}

function setActiveButtons(){
  document.querySelectorAll(".unit").forEach(b =>
    b.classList.toggle("is-active", b.dataset.unit === unit)
  );
  document.querySelectorAll(".tab").forEach(b =>
    b.classList.toggle("is-active", b.dataset.tab === tab)
  );
}

function setNow(){
  const t = unit === "C" ? data.now.c : cToF(data.now.c);
  $("#tempNow").textContent = t;
  $("#precipNow").textContent = `${data.now.precip}%`;
  $("#humidityNow").textContent = `${data.now.humidity}%`;
  $("#windNow").textContent = `${data.now.windKmh} км/ч`;
  $("#summary").textContent = data.now.summary;
  $("#dayName").textContent = data.now.dayName;
}

function renderDays(){
  const host = $("#days");
  host.innerHTML = "";
  data.days.forEach(d=>{
    const el = document.createElement("div");
    el.className = `day ${d.today ? "is-today":""}`;
    el.innerHTML = `
      <div class="dname">${d.name}</div>
      <div class="dicon">${d.icon}</div>
      <div class="dtemp">${d.hi}° ${d.lo}°</div>
    `;
    host.appendChild(el);
  });
}

function renderXLabels(){
  const host = $("#xlabels");
  host.innerHTML = "";
  data.hours.forEach(h=>{
    const s = document.createElement("div");
    s.textContent = h.t;
    host.appendChild(s);
  });
}

function seriesByTab(){
  if (tab === "temp") return data.hours.map(h => unit === "C" ? h.c : cToF(h.c));
  if (tab === "precip") return data.hours.map(h => h.precip);
  return data.hours.map(h => h.wind);
}

function renderSpark(){
  const svgW = 700, svgH = 140, padX = 18, padY = 18;
  const values = seriesByTab();
  if (!values.length) return;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = (max - min) || 1;

  const n = values.length;
  const xStep = (svgW - padX*2) / (n - 1);

  const pts = values.map((v, i) => {
    const x = padX + i * xStep;
    const y = padY + (svgH - padY*2) * (1 - (v - min)/span);
    return {x, y};
  });

  const dLine = pts.map((p,i)=> `${i===0?"M":"L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  $("#line").setAttribute("d", dLine);

  const dArea = `${dLine} L ${(padX + (n-1)*xStep).toFixed(2)} ${(svgH-padY).toFixed(2)} L ${padX.toFixed(2)} ${(svgH-padY).toFixed(2)} Z`;
  $("#area").setAttribute("d", dArea);

  const dots = $("#dots");
  dots.innerHTML = "";
  pts.forEach(p=>{
    const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("class","dot");
    c.setAttribute("cx", p.x);
    c.setAttribute("cy", p.y);
    c.setAttribute("r", 3.5);
    dots.appendChild(c);
  });
}

function wire(){
  document.querySelectorAll(".unit").forEach(b=>{
    b.addEventListener("click", ()=>{
      unit = b.dataset.unit;
      setActiveButtons();
      setNow();
      renderSpark();
    });
  });

  document.querySelectorAll(".tab").forEach(b=>{
    b.addEventListener("click", ()=>{
      tab = b.dataset.tab;
      setActiveButtons();
      renderSpark();
    });
  });
}

function dayNameUA(d){
  const names = ["неділя","понеділок","вівторок","середа","четвер","пʼятниця","субота"];
  return names[d.getDay()];
}
function shortDowUA(isoDate){
  const d = new Date(isoDate);
  const names = ["НД","ПН","ВТ","СР","ЧТ","ПТ","СБ"];
  return names[d.getDay()];
}
function formatHHMM(iso){
  const t = iso.split("T")[1] || "";
  return t.slice(0,5);
}
function findClosestHourIndex(hourlyTimes, currentTimeISO){
  const key = currentTimeISO.slice(0, 13);
  const i = hourlyTimes.findIndex(t => t.startsWith(key));
  return i !== -1 ? i : 0;
}

/** ВАЖНО: на Pages scaler лежит тут */
async function loadScaler(){
  const r = await fetch("web/scaler.json");
  if (!r.ok) throw new Error("Не знайдено web/scaler.json");
  return await r.json();
}

function scaleRow(row){
  const out = [];
  for (let i=0;i<row.length;i++){
    out.push((row[i] - scaler.mean[i]) / scaler.scale[i]);
  }
  return out;
}

async function fetchHistoryAndReal24h(){
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&hourly=temperature_2m,precipitation_probability,windspeed_10m,relativehumidity_2m` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&current_weather=true&timezone=Europe%2FKyiv`;

  const r = await fetch(url);
  if (!r.ok) throw new Error("Не вдалося завантажити дані погоди");
  const j = await r.json();

  const times = j.hourly.time;
  const idxNow = findClosestHourIndex(times, j.current_weather.time);

  const inputHours = scaler.input_hours; // 48
  const horizon = scaler.horizon;        // 24

  const startIn = Math.max(0, idxNow - (inputHours - 1));
  const endIn = startIn + inputHours;

  const inTimes = times.slice(startIn, endIn);

  const Xwin = inTimes.map((_,k) => {
    const i = startIn + k;
    const row = [
      j.hourly.temperature_2m[i],
      j.hourly.relativehumidity_2m[i] ?? 0,
      j.hourly.windspeed_10m[i] ?? 0,
      j.hourly.precipitation_probability[i] ?? 0
    ];
    return scaleRow(row);
  });

  data.now = {
    c: Math.round(j.current_weather.temperature),
    precip: Math.round(j.hourly.precipitation_probability[idxNow] ?? 0),
    humidity: Math.round(j.hourly.relativehumidity_2m[idxNow] ?? 0),
    windKmh: Math.round(j.current_weather.windspeed),
    summary: CITY,
    dayName: dayNameUA(new Date())
  };

  data.days = (j.daily.time || []).slice(0, 8).map((d, k) => ({
    name: shortDowUA(d),
    icon: "☁️",
    hi: Math.round(j.daily.temperature_2m_max[k]),
    lo: Math.round(j.daily.temperature_2m_min[k]),
    today: k === 0
  }));

  const start24 = idxNow;
  const end24 = Math.min(times.length, start24 + horizon);
  const labels24 = times.slice(start24, end24).map(formatHHMM);

  const real24 = [];
  for (let i=start24;i<end24;i++){
    real24.push({
      t: formatHHMM(times[i]),
      precip: Math.round(j.hourly.precipitation_probability[i] ?? 0),
      wind: Math.round(j.hourly.windspeed_10m[i] ?? 0),
    });
  }

  return { Xwin, labels24, real24 };
}

async function predict24h(){
  setStatus("Завантаження scaler…");
  scaler = await loadScaler();

  setStatus("Завантаження TF.js моделі…");
  // ВАЖНО: модель лежит в web/model/
  model = await tf.loadLayersModel("web/model/model.json");

  setStatus("Отримання даних (Кривий Ріг)…");
  const { Xwin, labels24, real24 } = await fetchHistoryAndReal24h();

  setStatus("Прогноз на 24 години…");
  const x = tf.tensor(Xwin, [1, scaler.input_hours, scaler.features.length], "float32");
  const y = model.predict(x);
  const yArr = Array.from(await y.data());

  x.dispose(); y.dispose();

  data.hours = yArr.map((temp, i) => ({
    t: labels24[i] ?? `${i}:00`,
    c: Math.round(temp),
    precip: real24[i]?.precip ?? 0,
    wind: real24[i]?.wind ?? 0,
  }));

  setStatus("Готово ✅");
  setNow();
  renderXLabels();
  renderSpark();
  renderDays();
}

(async function init(){
  wire();
  setActiveButtons();

  try{
    await predict24h();
  }catch(e){
    console.error(e);
    setStatus("Помилка: " + (e?.message || e));
  }
})();

