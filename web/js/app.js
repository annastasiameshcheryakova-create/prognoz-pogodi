// Демодані (потім заміниш на дані з моделі / API)
const data = {
  now: { c: 3, precip: 25, humidity: 86, windKmh: 8, summary: "Облачно", dayName: "понеділок" },
  hours: [
    { t: "12:00", c: 1, precip: 15, wind: 6 },
    { t: "15:00", c: 2, precip: 20, wind: 7 },
    { t: "18:00", c: 2, precip: 22, wind: 8 },
    { t: "21:00", c: 2, precip: 24, wind: 9 },
    { t: "00:00", c: 3, precip: 25, wind: 8 },
    { t: "03:00", c: 3, precip: 28, wind: 7 },
    { t: "06:00", c: 2, precip: 24, wind: 6 },
    { t: "09:00", c: 2, precip: 20, wind: 6 },
  ],
  days: [
    { name:"ПН", icon:"☁️", hi:3, lo:-1, today:true },
    { name:"ВТ", icon:"☁️", hi:5, lo:2 },
    { name:"СР", icon:"☁️", hi:4, lo:2 },
    { name:"ЧТ", icon:"🌤️", hi:8, lo:2 },
    { name:"ПТ", icon:"🌥️", hi:4, lo:1 },
    { name:"СБ", icon:"🌥️", hi:2, lo:0 },
    { name:"ВС", icon:"🌥️", hi:2, lo:0 },
    { name:"ПН", icon:"🌥️", hi:3, lo:0 },
  ]
};

let unit = "C";
let tab = "temp";

const $ = (s) => document.querySelector(s);

function cToF(c){ return Math.round((c * 9/5) + 32); }

function setNow(){
  const tempNow = unit === "C" ? data.now.c : cToF(data.now.c);
  $("#tempNow").textContent = tempNow;
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

function seriesByTab(){
  if (tab === "temp") {
    return data.hours.map(h => unit === "C" ? h.c : cToF(h.c));
  }
  if (tab === "precip") return data.hours.map(h => h.precip);
  return data.hours.map(h => h.wind);
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

function renderSpark(){
  const svgW = 700, svgH = 140, padX = 18, padY = 18;
  const values = seriesByTab();

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = (max - min) || 1;

  const n = values.length;
  const xStep = (svgW - padX*2) / (n - 1);

  const pts = values.map((v, i) => {
    const x = padX + i * xStep;
    const y = padY + (svgH - padY*2) * (1 - (v - min)/span);
    return {x, y, v};
  });

  // line path
  const dLine = pts.map((p,i)=> `${i===0?"M":"L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  $("#line").setAttribute("d", dLine);

  // area path
  const dArea = `${dLine} L ${(padX + (n-1)*xStep).toFixed(2)} ${(svgH-padY).toFixed(2)} L ${padX.toFixed(2)} ${(svgH-padY).toFixed(2)} Z`;
  $("#area").setAttribute("d", dArea);

  // dots
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

function setActiveButtons(){
  document.querySelectorAll(".unit").forEach(b=>{
    b.classList.toggle("is-active", b.dataset.unit === unit);
  });
  document.querySelectorAll(".tab").forEach(b=>{
    b.classList.toggle("is-active", b.dataset.tab === tab);
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

// init
setNow();
renderDays();
renderXLabels();
renderSpark();
setActiveButtons();
wire();
