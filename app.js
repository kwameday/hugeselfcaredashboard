const LS_KEYS = {
  categories: "hugeSelfcare.repo.categories.v1",
  users: "hugeSelfcare.repo.users.v1"
};

const DEFAULT_DATA_FALLBACK = {
  title: "Huge Selfcare Performance Dashboard",
  period: "30th October to 30th November 2025",
  currency: "ZAR",
  currencySymbol: "ZAR"
};

let charts = {};
let currentData = null;

const el = {
  title: document.getElementById("dashTitle"),
  period: document.getElementById("dashPeriod"),
  currency: document.getElementById("dashCurrency"),
  updated: document.getElementById("lastUpdated"),
  kpis: document.getElementById("kpiGrid"),
  json: document.getElementById("dataJson"),

  reloadBtn: document.getElementById("reloadBtn"),
  applyBtn: document.getElementById("applyBtn"),
  copyJsonBtn: document.getElementById("copyJsonBtn"),
  resetBtn: document.getElementById("resetBtn"),

  categoriesTable: document.getElementById("categoriesTable"),
  usersTable: document.getElementById("usersTable"),
  saveTablesBtn: document.getElementById("saveTablesBtn"),
  resetTablesBtn: document.getElementById("resetTablesBtn"),

  catsCsvInput: document.getElementById("catsCsvInput"),
  usersCsvInput: document.getElementById("usersCsvInput"),
  exportCatsCsvBtn: document.getElementById("exportCatsCsvBtn"),
  exportUsersCsvBtn: document.getElementById("exportUsersCsvBtn"),
};

function fmtInt(n){ return Number(n ?? 0).toLocaleString(); }
function fmtMoney(n, data=currentData){
  const sym = data?.currencySymbol || data?.currency || "";
  const num = Number(n ?? 0);
  return `${sym} ${num.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`;
}
function toNum(v){
  const n = Number(String(v ?? "").replace(/,/g,"").trim());
  return Number.isFinite(n) ? n : 0;
}
function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function getSaved(key, fallback){
  try{
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : structuredClone(fallback);
  }catch{
    return structuredClone(fallback);
  }
}

function setJsonEditor(data){
  el.json.value = JSON.stringify(data, null, 2);
}

function renderKpis(data){
  const s = data.transactionStats || {};
  const successRate = s.totalOrders ? (s.successOrders / s.totalOrders) * 100 : 0;
  const failureRate = s.totalOrders ? (s.failureOrders / s.totalOrders) * 100 : 0;

  const kpis = [
    { label:"Total Orders", value: fmtInt(s.totalOrders), note:"All attempts", tag:"Volume" },
    { label:"Total Order Value", value: fmtMoney(s.totalValueOrders, data), note:"Gross value", tag:"GMV" },
    { label:"Successful Orders", value: fmtInt(s.successOrders), note:`Success rate: ${successRate.toFixed(1)}%`, tag:"Success" },
    { label:"Successful Value", value: fmtMoney(s.successValue, data), note:"Value of successful orders", tag:"Revenue" },
    { label:"Avg Successful Order", value: fmtMoney(s.avgSuccessValue, data), note:"Average ticket", tag:"AOV" },
    { label:"Max Order Value", value: `${data.currencySymbol} ${fmtInt(s.maxOrderValue)}`, note:"Highest single order", tag:"Peak" },
    { label:"Min Order Value", value: `${data.currencySymbol} ${fmtInt(s.minOrderValue)}`, note:"Lowest single order", tag:"Low" },
    { label:"Failure Orders", value: fmtInt(s.failureOrders), note:`Failure rate: ${failureRate.toFixed(1)}%`, tag:"Risk" },
  ];

  el.kpis.innerHTML = kpis.map(k=>`
    <div class="kpi">
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
      <div class="note">${k.note}</div>
      <div class="tag">${k.tag}</div>
    </div>
  `).join("");
}

function objToChartData(obj){
  const labels = Object.keys(obj || {});
  const values = labels.map(k => Number(obj[k] ?? 0));
  return { labels, values };
}

function normalizeFailureReasons(fr){
  if (Array.isArray(fr)) return fr.map(x => ({ reason: x.reason ?? "", count: Number(x.count ?? 0) }));
  if (fr && typeof fr === "object"){
    return Object.entries(fr).map(([reason,count]) => ({ reason, count:Number(count ?? 0) }));
  }
  return [];
}

function destroyChart(key){
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

function buildCharts(data){
  destroyChart("paymentChart");
  const p = objToChartData(data.paymentStatus);
  charts.paymentChart = new Chart(document.getElementById("paymentChart"), {
    type: "doughnut",
    data: { labels: p.labels, datasets: [{ data: p.values }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom" } } }
  });

  destroyChart("txnChart");
  const t = objToChartData(data.transactionStatus);
  charts.txnChart = new Chart(document.getElementById("txnChart"), {
    type: "bar",
    data: { labels: t.labels, datasets: [{ label:"Orders", data: t.values }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } } }
  });

  destroyChart("failChart");
  const fr = normalizeFailureReasons(data.failureReasons).sort((a,b)=>b.count-a.count);
  charts.failChart = new Chart(document.getElementById("failChart"), {
    type: "bar",
    data: { labels: fr.map(x=>x.reason), datasets: [{ label:"Count", data: fr.map(x=>x.count) }] },
    options: {
      indexAxis:"y",
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ title:(items)=>items[0]?.label?.slice(0,120) ?? "" } } },
      scales:{ x:{ beginAtZero:true, ticks:{ precision:0 } } }
    }
  });

  destroyChart("catChart");
  const cats = (data.categories || []).slice().sort((a,b)=>toNum(b.totalOrders)-toNum(a.totalOrders)).slice(0,10);
  charts.catChart = new Chart(document.getElementById("catChart"), {
    type:"bar",
    data:{ labels: cats.map(x=>x.product), datasets:[{ label:"Total Orders", data: cats.map(x=>toNum(x.totalOrders)) }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } } }
  });

  destroyChart("usersChart");
  const users = (data.users?.attempts || []).slice().sort((a,b)=>toNum(b.attempts)-toNum(a.attempts)).slice(0,10);
  charts.usersChart = new Chart(document.getElementById("usersChart"), {
    type:"bar",
    data:{ labels: users.map(x=>x.user), datasets:[{ label:"Attempts", data: users.map(x=>toNum(x.attempts)) }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } } }
  });
}

function renderCategoriesTable(data){
  const rows = getSaved(LS_KEYS.categories, data.categories || []);
  el.categoriesTable.innerHTML = `
    <thead>
      <tr>
        <th>Product Description</th><th>Total Orders</th><th>Success</th><th>Initiated</th><th>Purchase Initiated</th><th>Failure</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((r,idx)=>`
        <tr data-row="${idx}">
          <td contenteditable="true" data-field="product">${escapeHtml(r.product ?? "")}</td>
          <td contenteditable="true" data-field="totalOrders">${escapeHtml(String(r.totalOrders ?? 0))}</td>
          <td contenteditable="true" data-field="success">${escapeHtml(String(r.success ?? 0))}</td>
          <td contenteditable="true" data-field="initiated">${escapeHtml(String(r.initiated ?? 0))}</td>
          <td contenteditable="true" data-field="purchaseInitiated">${escapeHtml(String(r.purchaseInitiated ?? 0))}</td>
          <td contenteditable="true" data-field="failure">${escapeHtml(String(r.failure ?? 0))}</td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

function renderUsersTable(data){
  const rows = getSaved(LS_KEYS.users, data.users?.attempts || []);
  el.usersTable.innerHTML = `
    <thead>
      <tr><th>User</th><th>Transaction Attempts</th></tr>
    </thead>
    <tbody>
      ${rows.map((r,idx)=>`
        <tr data-row="${idx}">
          <td contenteditable="true" data-field="user">${escapeHtml(r.user ?? "")}</td>
          <td contenteditable="true" data-field="attempts">${escapeHtml(String(r.attempts ?? 0))}</td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

function readEditableTable(tableEl){
  const rows = [...tableEl.querySelectorAll("tbody tr")];
  return rows.map(tr => {
    const obj = {};
    [...tr.querySelectorAll("td")].forEach(td => {
      obj[td.getAttribute("data-field")] = td.textContent.trim();
    });
    return obj;
  });
}

function coerceCategoryRows(rows){
  return rows.map(r => ({
    product: r.product ?? "",
    totalOrders: toNum(r.totalOrders),
    success: toNum(r.success),
    initiated: toNum(r.initiated),
    purchaseInitiated: toNum(r.purchaseInitiated),
    failure: toNum(r.failure)
  }));
}
function coerceUserRows(rows){
  return rows.map(r => ({
    user: r.user ?? "",
    attempts: toNum(r.attempts)
  }));
}

function applySavedTablesToData(base){
  const merged = structuredClone(base);
  merged.categories = getSaved(LS_KEYS.categories, base.categories || []);
  merged.users = merged.users || {};
  merged.users.attempts = getSaved(LS_KEYS.users, base.users?.attempts || []);
  return merged;
}

function renderAll(data){
  const merged = applySavedTablesToData(data);
  el.title.textContent = merged.title ?? DEFAULT_DATA_FALLBACK.title;
  el.period.textContent = merged.period ?? DEFAULT_DATA_FALLBACK.period;
  el.currency.textContent = merged.currency ?? DEFAULT_DATA_FALLBACK.currency;
  el.updated.textContent = new Date().toLocaleString();

  renderKpis(merged);
  renderCategoriesTable(merged);
  renderUsersTable(merged);
  buildCharts(merged);
}

async function loadFromDataJson(){
  const res = await fetch("./data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load data.json");
  return await res.json();
}

// CSV helpers
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };

  const splitLine = (line) => {
    const out = [];
    let cur = "", inQuotes = false;
    for (let i=0;i<line.length;i++){
      const ch = line[i];
      if (ch === '"' && line[i+1] === '"'){ cur += '"'; i++; continue; }
      if (ch === '"'){ inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes){ out.push(cur); cur=""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const cols = splitLine(l);
    const obj = {};
    headers.forEach((h,idx)=> obj[h] = cols[idx] ?? "");
    return obj;
  });
  return { headers, rows };
}

function toCSV(headers, rows){
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[,"\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
    return s;
  };
  const head = headers.map(esc).join(",");
  const body = rows.map(r => headers.map(h => esc(r[h])).join(",")).join("\n");
  return `${head}\n${body}\n`;
}

function downloadText(filename, text){
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Events
el.reloadBtn.addEventListener("click", async () => {
  try{
    currentData = await loadFromDataJson();
    setJsonEditor(currentData);
    renderAll(currentData);
  }catch(e){
    alert("Could not reload data.json. Check file path and hosting.");
  }
});

el.applyBtn.addEventListener("click", () => {
  try{
    currentData = JSON.parse(el.json.value);
    renderAll(currentData);
  }catch{
    alert("Invalid JSON. Fix formatting and try again.");
  }
});

el.copyJsonBtn.addEventListener("click", async () => {
  try{
    await navigator.clipboard.writeText(el.json.value);
    alert("JSON copied.");
  }catch{
    alert("Could not copy automatically. Please copy manually.");
  }
});

el.resetBtn.addEventListener("click", () => {
  localStorage.removeItem(LS_KEYS.categories);
  localStorage.removeItem(LS_KEYS.users);
  loadFromDataJson().then(d => {
    currentData = d;
    setJsonEditor(currentData);
    renderAll(currentData);
  }).catch(() => {
    currentData = structuredClone(DEFAULT_DATA_FALLBACK);
    setJsonEditor(currentData);
    renderAll(currentData);
  });
});

el.saveTablesBtn.addEventListener("click", () => {
  const cats = coerceCategoryRows(readEditableTable(el.categoriesTable));
  const users = coerceUserRows(readEditableTable(el.usersTable));
  localStorage.setItem(LS_KEYS.categories, JSON.stringify(cats, null, 2));
  localStorage.setItem(LS_KEYS.users, JSON.stringify(users, null, 2));
  renderAll(currentData);
  alert("Saved table edits locally (this browser).");
});

el.resetTablesBtn.addEventListener("click", () => {
  localStorage.removeItem(LS_KEYS.categories);
  localStorage.removeItem(LS_KEYS.users);
  renderAll(currentData);
  alert("Cleared saved table edits.");
});

// CSV import/export
el.catsCsvInput.addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = parseCSV(text);

  const rows = parsed.rows.map(r => ({
    product: r.product ?? r.Product ?? r["Product Description"] ?? "",
    totalOrders: toNum(r.totalOrders ?? r["Total Orders"]),
    success: toNum(r.success ?? r.Success),
    initiated: toNum(r.initiated ?? r.Initiated),
    purchaseInitiated: toNum(r.purchaseInitiated ?? r["Purchase Initiated"]),
    failure: toNum(r.failure ?? r.Failure)
  }));

  localStorage.setItem(LS_KEYS.categories, JSON.stringify(rows, null, 2));
  renderAll(currentData);
  ev.target.value = "";
});

el.usersCsvInput.addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = parseCSV(text);

  const rows = parsed.rows.map(r => ({
    user: r.user ?? r.User ?? "",
    attempts: toNum(r.attempts ?? r.Attempts ?? r["Transaction Attempts"])
  }));

  localStorage.setItem(LS_KEYS.users, JSON.stringify(rows, null, 2));
  renderAll(currentData);
  ev.target.value = "";
});

el.exportCatsCsvBtn.addEventListener("click", () => {
  const cats = getSaved(LS_KEYS.categories, currentData?.categories || []);
  const headers = ["product","totalOrders","success","initiated","purchaseInitiated","failure"];
  const csv = toCSV(headers, cats);
  downloadText("categories.csv", csv);
});

el.exportUsersCsvBtn.addEventListener("click", () => {
  const users = getSaved(LS_KEYS.users, currentData?.users?.attempts || []);
  const headers = ["user","attempts"];
  const csv = toCSV(headers, users);
  downloadText("users.csv", csv);
});

// Init
(async function init(){
  try{
    currentData = await loadFromDataJson();
  }catch{
    currentData = structuredClone(DEFAULT_DATA_FALLBACK);
  }
  setJsonEditor(currentData);
  renderAll(currentData);
})();
