const CITY = "Кривий Ріг";
const LAT = 47.9105;
const LON = 33.3918;

let unit = "C";
let tab = "temp";

let model = null;
let scaler = null;

let data = {
  now: { c: 0, precip: 0, humidity: 0, windKmh: 0, summary: CITY, dayName: "—" },
  hours: [],   // [{t, c, precip, wind}]
  days: []     // [{name, icon, hi, lo, today}]
};

const $ = (s) => document.querySelector(s);
const cToF = (c) => Math.round((c * 9/5) + 32);

function setStatus(msg){
  const el = $("#status");
  if (el) el.textContent = msg;
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
  // Щоб не злипалось — показуємо 7 підписів (0..23)
  const idxs = data.hours.length >= 24 ? [0,4,8,12,16,20,23] : data.hours.map((_,i)=>i);
  idxs.forEach(i=>{
    const s = document.createElement("div");
    s.textContent = data.hours[i]?.t ?? "";
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
  const key = currentTimeISO.slice(0, 13); // YYYY-MM-DDTHH
  const i = hourlyTimes.findIndex(t => t.startsWith(key));
  return i !== -1 ? i : 0;
}

/* ✅ Під твою структуру: index.html у корені, сайт у web/ */
async function tryLoadScaler(){
  const r = await fetch("web/scaler.json").catch(()=>null);
  if (!r || !r.ok) return null;
  return await r.json();
}
async function tryLoadModel(){
  // Якщо tfjs не підключено — не падаємо
  if (typeof tf === "undefined") return null;
  try{
    return await tf.loadLayersModel("web/model/model.json");
  }catch{
    return null;
  }
}

function scaleRow(row){
  const out = [];
  for (let i=0;i<row.length;i++){
    out.push((row[i] - scaler.mean[i]) / scaler.scale[i]);
  }
  return out;
}

async function fetchOpenMeteo(){
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&hourly=temperature_2m,precipitation_probability,windspeed_10m,relativehumidity_2m` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&current_weather=true&timezone=Europe%2FKyiv`;

  const r = await fetch(url);
  if (!r.ok) throw new Error("Не вдалося завантажити дані погоди");
  return await r.json();
}

async function buildFromApiOnly(j){
  const times = j.hourly.time;
  const idxNow = findClosestHourIndex(times, j.current_weather.time);

  // now
  data.now = {
    c: Math.round(j.current_weather.temperature),
    precip: Math.round(j.hourly.precipitation_probability[idxNow] ?? 0),
    humidity: Math.round(j.hourly.relativehumidity_2m[idxNow] ?? 0),
    windKmh: Math.round(j.current_weather.windspeed),
    summary: CITY,
    dayName: dayNameUA(new Date())
  };

  // days
  data.days = (j.daily.time || []).slice(0, 8).map((d, k) => ({
    name: shortDowUA(d),
    icon: "☁️",
    hi: Math.round(j.daily.temperature_2m_max[k]),
    lo: Math.round(j.daily.temperature_2m_min[k]),
    today: k === 0
  }));

  // 24h прям з API (без ML)
  const horizon = 24;
  const start24 = idxNow;
  const end24 = Math.min(times.length, start24 + horizon);

  data.hours = [];
  for (let i=start24;i<end24;i++){
    data.hours.push({
      t: formatHHMM(times[i]),
      c: Math.round(j.hourly.temperature_2m[i] ?? 0),
      precip: Math.round(j.hourly.precipitation_probability[i] ?? 0),
      wind: Math.round(j.hourly.windspeed_10m[i] ?? 0),
    });
  }
}

async function buildWithML(j){
  const times = j.hourly.time;
  const idxNow = findClosestHourIndex(times, j.current_weather.time);

  const inputHours = scaler.input_hours; // 48
  const horizon = scaler.horizon;        // 24

  const startIn = Math.max(0, idxNow - (inputHours - 1));
  const endIn = startIn + inputHours;

  const Xwin = [];
  for (let k=0;k<inputHours;k++){
    const i = startIn + k;
    const row = [
      j.hourly.temperature_2m[i],
      j.hourly.relativehumidity_2m[i] ?? 0,
      j.hourly.windspeed_10m[i] ?? 0,
      j.hourly.precipitation_probability[i] ?? 0
    ];
    Xwin.push(scaleRow(row));
  }

  // now + days так само з API
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

  // реальні precip/wind + labels на 24h
  const start24 = idxNow;
  const end24 = Math.min(times.length, start24 + horizon);

  const labels24 = times.slice(start24, end24).map(formatHHMM);
  const real24 = [];
  for (let i=start24;i<end24;i++){
    real24.push({
      precip: Math.round(j.hourly.precipitation_probability[i] ?? 0),
      wind: Math.round(j.hourly.windspeed_10m[i] ?? 0),
    });
  }

  // predict
  const x = tf.tensor(Xwin, [1, inputHours, scaler.features.length], "float32");
  const y = model.predict(x);
  const yArr = Array.from(await y.data());
  x.dispose(); y.dispose();

  data.hours = yArr.map((temp, i) => ({
    t: labels24[i] ?? `${i}:00`,
    c: Math.round(temp),
    precip: real24[i]?.precip ?? 0,
    wind: real24[i]?.wind ?? 0,
  }));
}

async function main(){
  wire();
  setActiveButtons();
  setStatus("Завантаження даних…");

  try{
    const j = await fetchOpenMeteo();

    // пробуємо ML (але не обов'язково)
    setStatus("Перевірка моделі…");
    scaler = await tryLoadScaler();
    model = await tryLoadModel();

    if (scaler && model){
      setStatus("ML прогноз на 24 години…");
      await buildWithML(j);
    }else{
      setStatus("Прогноз з Open-Meteo (без ML)…");
      await buildFromApiOnly(j);
    }

    setNow();
    renderXLabels();
    renderSpark();
    renderDays();
    setStatus("Готово ✅");
  }catch(e){
    console.error(e);
    setStatus("Помилка: " + (e?.message || e));
  }
}

main();
