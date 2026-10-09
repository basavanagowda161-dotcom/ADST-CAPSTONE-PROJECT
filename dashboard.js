const $ = id => document.getElementById(id);
let sourceRows = [];
let headers = [];
let charts = {};

const palette = [
  "#4964e8", "#f07845", "#21a88a", "#9b62d0",
  "#e2aa38", "#35a7cf", "#e35c79", "#6c7d91"
];

function fieldName(...names) {
  return headers.find(h =>
    names.some(n => h.toLowerCase().replace(/[^a-z0-9]/g, "")
      === n.toLowerCase().replace(/[^a-z0-9]/g, ""))
  ) || headers.find(h =>
    names.some(n => h.toLowerCase().includes(n.toLowerCase()))
  );
}

function number(row, field) {
  if (!field) return 0;
  return Number(String(row[field] || "").replace(/[$, ]/g, "")) || 0;
}

function text(row, field) {
  return field ? String(row[field] || "").trim() || "(Blank)" : "(Missing field)";
}

function parseCSV(csv) {
  const rows = [];
  let row = [], cell = "", quoted = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"' && csv[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some(v => v.trim())) rows.push(row);
      row = []; cell = "";
    } else cell += ch;
  }
  row.push(cell.replace(/\r$/, ""));
  if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

function readData(csv) {
  const parsed = parseCSV(csv);
  headers = (parsed.shift() || []).map((h, i) => h.trim() || `Column ${i + 1}`);
  sourceRows = parsed.map(values =>
    Object.fromEntries(headers.map((h, i) => [h, values[i] || ""]))
  );
}

function activeRows() {
  const region = $("regionFilter").value;
  const channel = $("channelFilter").value;
  const query = $("search").value.toLowerCase();
  const regionField = fieldName("Region");
  const channelField = fieldName("Sales_Channel", "Channel");

  return sourceRows.filter(row =>
    (!region || text(row, regionField) === region) &&
    (!channel || text(row, channelField) === channel) &&
    (!query || headers.some(h => String(row[h]).toLowerCase().includes(query)))
  );
}

function total(rows, field) {
  return rows.reduce((sum, row) => sum + number(row, field), 0);
}

function groupSum(rows, categoryField, valueField) {
  const result = {};
  rows.forEach(row => {
    const key = text(row, categoryField);
    result[key] = (result[key] || 0) + number(row, valueField);
  });
  return result;
}

function groupCountBy(rows, categoryField, seriesField) {
  const groups = [...new Set(rows.map(r => text(r, categoryField)))];
  const series = [...new Set(rows.map(r => text(r, seriesField)))];
  return { groups, series, values: series.map(s =>
    groups.map(g => rows.filter(r =>
      text(r, categoryField) === g && text(r, seriesField) === s
    ).length)
  ) };
}

function makeChart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), config);
}

function commonOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom", labels: { boxWidth: 9, font: { size: 9 } } } }
  };
}

function drawCharts(rows) {
  const region = fieldName("Region");
  const year = fieldName("Year");
  const revenue = fieldName("Revenue_USD", "Revenue");
  const profit = fieldName("Profit_USD", "Profit");
  const channel = fieldName("Sales_Channel", "Channel");
  const vehicle = fieldName("Vehicle_Type", "Vehicle");
  const units = fieldName("Units_Sold", "Units");

  const regionRevenue = groupSum(rows, region, revenue);
  makeChart("regionChart", {
    type: "pie",
    data: { labels: Object.keys(regionRevenue), datasets: [{ data: Object.values(regionRevenue), backgroundColor: palette }] },
    options: commonOptions()
  });

  const yearRevenue = groupSum(rows, year, revenue);
  makeChart("revenueYearChart", {
    type: "line",
    data: { labels: Object.keys(yearRevenue).sort(), datasets: [{
      label: "Revenue", data: Object.keys(yearRevenue).sort().map(y => yearRevenue[y]),
      borderColor: palette[0], backgroundColor: "#4964e844", fill: true, tension: .35
    }] },
    options: commonOptions()
  });

  const yearProfit = groupSum(rows, year, profit);
  makeChart("profitYearChart", {
    type: "line",
    data: { labels: Object.keys(yearProfit).sort(), datasets: [{
      label: "Profit", data: Object.keys(yearProfit).sort().map(y => yearProfit[y]),
      borderColor: palette[2], backgroundColor: "#21a88a22", tension: .3
    }] },
    options: commonOptions()
  });

  const channelProfit = groupSum(rows, channel, profit);
  makeChart("channelChart", {
    type: "doughnut",
    data: { labels: Object.keys(channelProfit), datasets: [{ data: Object.values(channelProfit), backgroundColor: palette }] },
    options: commonOptions()
  });

  const regionChannel = groupCountBy(rows, region, channel);
  makeChart("regionChannelChart", {
    type: "bar",
    data: {
      labels: regionChannel.groups,
      datasets: regionChannel.series.map((s, i) => ({
        label: s, data: regionChannel.values[i], backgroundColor: palette[i % palette.length]
      }))
    },
    options: { ...commonOptions(), indexAxis: "y", scales: { x: { stacked: true }, y: { stacked: true } } }
  });

  const vehicleChannel = groupCountBy(rows, vehicle, channel);
  const vehicleData = vehicleChannel.groups.map((_, i) =>
    vehicleChannel.series.reduce((sum, s, j) =>
      sum + vehicleChannel.values[j][i], 0)
  );
  makeChart("vehicleChart", {
    type: "bar",
    data: {
      labels: vehicleChannel.groups,
      datasets: vehicleChannel.series.map((s, i) => ({
        label: s,
        data: vehicleChannel.values[i].map((v, j) =>
          units ? v ? total(rows.filter(r =>
            text(r, vehicle) === vehicleChannel.groups[j] &&
            text(r, channel) === s
          ), units) : 0 : v
        ),
        backgroundColor: palette[i % palette.length]
      }))
    },
    options: { ...commonOptions(), scales: { x: { stacked: true }, y: { stacked: true } } }
  });
}

function updateAnalysis(rows) {
  const revenueField = fieldName("Revenue_USD", "Revenue");
  const profitField = fieldName("Profit_USD", "Profit");
  const unitsField = fieldName("Units_Sold", "Units");
  const regionField = fieldName("Region");
  const channelField = fieldName("Sales_Channel", "Channel");
  const yearField = fieldName("Year");

  const revenue = total(rows, revenueField);
  const profit = total(rows, profitField);
  const units = total(rows, unitsField);
  const margin = revenue ? profit / revenue * 100 : 0;
  const regions = groupSum(rows, regionField, revenueField);
  const channels = groupSum(rows, channelField, revenueField);
  const years = groupSum(rows, yearField, revenueField);
  const bestRegion = Object.entries(regions).sort((a, b) => b[1] - a[1])[0];
  const bestChannel = Object.entries(channels).sort((a, b) => b[1] - a[1])[0];
  const bestYear = Object.entries(years).sort((a, b) => b[1] - a[1])[0];
  const money = n => new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0
  }).format(n);

  $("revenueKpi").textContent = money(revenue);
  $("profitKpi").textContent = money(profit);
  $("unitsKpi").textContent = units.toLocaleString();
  $("marginKpi").textContent = `${margin.toFixed(1)}%`;
  $("revenueNote").textContent = `${rows.length.toLocaleString()} filtered records`;

  $("analysisText").innerHTML = rows.length
    ? `<strong>Sales snapshot:</strong> Across ${rows.length.toLocaleString()} records, total revenue is
       <strong>${money(revenue)}</strong> and total profit is <strong>${money(profit)}</strong>,
       giving a profit margin of <strong>${margin.toFixed(1)}%</strong>.
       ${unitsField ? `The dataset records <strong>${units.toLocaleString()} units sold</strong>.` : ""}
       <ul class="insight-list">
         <li>${bestRegion ? `<strong>${bestRegion[0]}</strong> leads revenue by region at ${money(bestRegion[1])}.` : "Region revenue is unavailable because the needed columns were not found."}</li>
         <li>${bestChannel ? `<strong>${bestChannel[0]}</strong> is the top sales channel at ${money(bestChannel[1])}.` : "Channel revenue is unavailable because the needed columns were not found."}</li>
         <li>${bestYear ? `<strong>${bestYear[0]}</strong> is the strongest year for revenue at ${money(bestYear[1])}.` : "Yearly revenue is unavailable because the needed columns were not found."}</li>
       </ul>`
    : "No records match the selected filters.";
}

function drawTable(rows) {
  $("tableHead").innerHTML = `<tr>${headers.map(h => `<th>${escapeHTML(h)}</th>`).join("")}</tr>`;
  $("tableBody").innerHTML = rows.slice(0, 100).map((row, index) =>
    `<tr>${headers.map(h =>
      `<td contenteditable="true" data-row="${sourceRows.indexOf(row)}" data-field="${escapeHTML(h)}">${escapeHTML(row[h])}</td>`
    ).join("")}</tr>`
  ).join("") || `<tr><td class="empty" colspan="${headers.length}">No matching rows.</td></tr>`;
  $("rowCount").textContent = `Showing ${Math.min(rows.length, 100)} of ${rows.length.toLocaleString()} rows`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function refresh() {
  const rows = activeRows();
  drawCharts(rows);
  updateAnalysis(rows);
  drawTable(rows);
}

function setOptions(select, values, label) {
  const current = select.value;
  select.innerHTML = `<option value="">All ${label}</option>` +
    values.map(v => `<option>${escapeHTML(v)}</option>`).join("");
  if (values.includes(current)) select.value = current;
}

$("csvFile").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    readData(reader.result);
    $("search").disabled = false;
    $("search").value = "";
    const region = fieldName("Region");
    const channel = fieldName("Sales_Channel", "Channel");
    setOptions($("regionFilter"), [...new Set(sourceRows.map(r => text(r, region)))], "regions");
    setOptions($("channelFilter"), [...new Set(sourceRows.map(r => text(r, channel)))], "channels");
    refresh();
  };
  reader.readAsText(file);
});

$("regionFilter").addEventListener("change", refresh);
$("channelFilter").addEventListener("change", refresh);
$("search").addEventListener("input", refresh);

$("tableBody").addEventListener("input", event => {
  const cell = event.target.closest("[contenteditable]");
  if (!cell) return;
  sourceRows[Number(cell.dataset.row)][cell.dataset.field] = cell.textContent.trim();
  refresh();
});

$("export").addEventListener("click", () => {
  const rows = activeRows();
  const csv = [headers, ...rows.map(row => headers.map(h => row[h]))]
    .map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "adst-sales-filtered.csv";
  link.click();
  URL.revokeObjectURL(link.href);
});