/* Model Meter — Chart Logic */

Chart.register(ChartDataLabels);

const QUAD_INTEL = 35;
const QUAD_COST  = 5;

let allModels = [];
let chart = null;
let activeFilter = "all";
let activeProviders = new Set();

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// In dark mode, lighten provider colors whose luminance is too low to see
// against the dark chart background (e.g. OpenAI #18181b ≈ black).
function toVisibleColor(hex, isDark) {
  if (!isDark || !hex || !hex.startsWith("#") || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.18) return hex; // already bright enough
  const t = 0.75;
  const nr = Math.round(r + (180 - r) * t);
  const ng = Math.round(g + (180 - g) * t);
  const nb = Math.round(b + (188 - b) * t);
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadData() {
  document.getElementById("loading").style.display = "flex";
  try {
    const res = await fetch("/api/models");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    allModels = json.models;
    buildProviderFilters();
    renderChart();
  } catch (err) {
    document.getElementById("loading").innerHTML =
      `<p style="color:var(--muted)">Failed to load: ${err.message}</p>
       <button onclick="loadData()" style="margin-top:10px;padding:6px 14px;cursor:pointer;font-family:inherit;border:1px solid var(--border);border-radius:6px;background:var(--surface-alt);color:var(--text)">Retry</button>`;
  }
}

async function refreshData() {
  await fetch("/api/refresh", { method: "POST" });
  allModels = [];
  if (chart) { chart.destroy(); chart = null; }
  await loadData();
}

// ── Filtering ─────────────────────────────────────────────────────────────────

function getVisibleModels() {
  return allModels.filter(m => {
    if (activeFilter === "vision" && !m.vision) return false;
    if (activeProviders.size > 0 && !activeProviders.has(m.developer)) return false;
    return true;
  });
}

// ── Provider chips ─────────────────────────────────────────────────────────────

function buildProviderFilters() {
  const providers = [...new Set(allModels.map(m => m.developer))].sort();
  const container = document.getElementById("providerFilters");
  container.innerHTML = "";
  providers.forEach(p => {
    const rawColor = allModels.find(m => m.developer === p)?.color || "#888";
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const color = toVisibleColor(rawColor, isDark);
    const chip = document.createElement("button");
    chip.className = "filter-chip";
    chip.dataset.provider = p;
    chip.innerHTML = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:5px;vertical-align:middle"></span>${p}`;
    chip.addEventListener("click", () => toggleProvider(p, chip));
    container.appendChild(chip);
  });
}

function toggleProvider(provider, chip) {
  if (activeProviders.has(provider)) {
    activeProviders.delete(provider);
    chip.classList.remove("active");
  } else {
    activeProviders.add(provider);
    chip.classList.add("active");
  }
  renderChart();
}

// ── Legend ────────────────────────────────────────────────────────────────────

function buildLegend(models) {
  const providers = [...new Set(models.map(m => m.developer))].sort();
  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  providers.forEach(p => {
    const rawColor = models.find(m => m.developer === p)?.color || "#888";
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const color = toVisibleColor(rawColor, isDark);
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<div class="legend-dot" style="background:${color}"></div>${p}`;
    item.addEventListener("click", () => {
      const chip = document.querySelector(`[data-provider="${p}"]`);
      if (chip) toggleProvider(p, chip);
    });
    legend.appendChild(item);
  });
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function renderChart() {
  const models = getVisibleModels();
  document.getElementById("loading").style.display = "none";
  document.getElementById("modelCount").innerHTML =
    `<span>${models.length}</span> of ${allModels.length} models`;

  buildLegend(models);

  const gridColor   = cssVar("--chart-grid");
  const labelColor  = cssVar("--chart-label");
  const tickColor   = cssVar("--chart-tick");
  const accentDark  = cssVar("--accent-dark");
  const accentLight = cssVar("--accent-light");
  const isDark      = document.documentElement.getAttribute("data-theme") === "dark";

  const byProvider = {};
  models.forEach(m => {
    if (!byProvider[m.developer]) byProvider[m.developer] = [];
    byProvider[m.developer].push(m);
  });

  const datasets = Object.entries(byProvider).map(([provider, pModels]) => ({
    label: provider,
    data: pModels.map(m => ({ x: m.cost_per_1m, y: m.intelligence, model: m })),
    backgroundColor: toVisibleColor(pModels[0].color, isDark),
    borderColor: isDark ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.6)",
    borderWidth: isDark ? 2 : 1.5,
    pointRadius: 7,
    pointHoverRadius: 10,
  }));

  // Quadrant background plugin — uses PGH green
  const quadrantPlugin = {
    id: "quadrant",
    beforeDraw(ch) {
      const { ctx, scales: { x, y } } = ch;
      const xPx = x.getPixelForValue(QUAD_COST);
      const yPx = y.getPixelForValue(QUAD_INTEL);
      const { left, top } = ch.chartArea;

      ctx.save();
      ctx.fillStyle = accentLight;
      ctx.strokeStyle = isDark ? "rgba(90,222,140,0.25)" : "rgba(45,184,90,0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.fillRect(left, top, xPx - left, yPx - top);
      ctx.strokeRect(left, top, xPx - left, yPx - top);

      ctx.setLineDash([]);
      ctx.fillStyle = isDark ? "rgba(90,222,140,0.45)" : "rgba(45,184,90,0.55)";
      ctx.font = `500 11px "DM Sans", system-ui, sans-serif`;
      ctx.fillText("Most attractive quadrant", left + 10, top + 18);
      ctx.restore();
    },
  };

  if (chart) { chart.destroy(); chart = null; }

  chart = new Chart(document.getElementById("chart"), {
    type: "scatter",
    plugins: [quadrantPlugin, ChartDataLabels],
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      layout: { padding: { top: 10, right: 90, bottom: 10, left: 10 } },

      scales: {
        x: {
          type: "logarithmic",
          title: {
            display: true,
            text: "Cost to Run (USD per 1M tokens, log scale)",
            font: { size: 11.5, weight: "500", family: '"DM Sans", system-ui, sans-serif' },
            color: tickColor,
            padding: { top: 8 },
          },
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            font: { size: 11 },
            callback: val => val >= 1 ? `$${val}` : `$${val.toFixed(2)}`,
            maxTicksLimit: 8,
          },
          min: 0.04,
          max: 60,
        },
        y: {
          title: {
            display: true,
            text: "Intelligence Index (Artificial Analysis)",
            font: { size: 11.5, weight: "500", family: '"DM Sans", system-ui, sans-serif' },
            color: tickColor,
            padding: { bottom: 8 },
          },
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { size: 11 } },
          min: 0,
          max: 70,
        },
      },

      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => items[0]?.raw?.model?.name || "",
            label: item => {
              const m = item.raw.model;
              return [
                `  Provider: ${m.developer}`,
                `  Intelligence: ${m.intelligence}`,
                `  Cost/1M: $${m.cost_per_1m.toFixed(3)}`,
                m.speed_tps ? `  Speed: ${Math.round(m.speed_tps)} tok/s` : null,
              ].filter(Boolean);
            },
          },
          backgroundColor: isDark ? "rgba(26,35,50,0.97)" : "rgba(2,38,79,0.95)",
          titleFont: { size: 13, weight: "600", family: '"Barlow Condensed", sans-serif' },
          bodyFont: { size: 12, family: '"DM Sans", system-ui, sans-serif' },
          padding: 12,
          cornerRadius: 8,
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.2)",
          borderWidth: 1,
          titleColor: "#ffffff",
          bodyColor: "rgba(255,255,255,0.8)",
        },
        datalabels: {
          align: "right",
          anchor: "end",
          offset: 4,
          font: { size: 10.5, family: '"DM Sans", system-ui, sans-serif' },
          color: labelColor,
          formatter: value => value.model.name,
          display: ctx => ctx.dataset.data[ctx.dataIndex].model.intelligence >= 20,
          clamp: true,
        },
      },

      onClick(event, elements) {
        if (!elements.length) { clearPanel(); return; }
        const el = elements[0];
        showPanel(datasets[el.datasetIndex].data[el.index].model);
      },

      onHover(event, elements) {
        event.native.target.style.cursor = elements.length ? "pointer" : "default";
      },
    },
  });
}

// ── Side panel ────────────────────────────────────────────────────────────────

function clearPanel() {
  document.getElementById("panelPlaceholder").style.display = "flex";
  document.getElementById("modelDetail").classList.remove("visible");
}

function showPanel(m) {
  document.getElementById("panelPlaceholder").style.display = "none";
  const detail = document.getElementById("modelDetail");
  detail.classList.add("visible");

  const inQuadrant = m.intelligence >= QUAD_INTEL && m.cost_per_1m <= QUAD_COST;
  const ctx = Math.round(m.max_tokens / 1000);

  detail.innerHTML = `
    <div class="detail-name" style="color:${toVisibleColor(m.color, document.documentElement.getAttribute('data-theme') === 'dark')}">${m.name}</div>
    <div class="detail-provider">${m.developer}</div>

    ${m.vision ? `<span class="detail-badge badge-vision">Vision</span>` : ""}
    ${inQuadrant ? `<span class="detail-badge badge-quadrant">Best Value</span>` : ""}

    <div class="detail-metrics" style="margin-top:12px">
      ${metricRow("Intelligence", m.intelligence, 70, "var(--blue)")}
      ${m.coding_index != null ? metricRow("Coding", m.coding_index, 70, "var(--accent-dark)") : ""}
      ${m.speed_tps != null ? metricRow("Speed (tok/s)", Math.round(m.speed_tps), 500, "var(--accent)") : ""}
      ${m.ttft != null ? `
        <div class="metric-row">
          <span class="metric-label">First token</span>
          <span class="metric-value">${m.ttft.toFixed(2)}s</span>
        </div>` : ""}
      <div class="metric-row">
        <span class="metric-label">Context window</span>
        <span class="metric-value">${ctx}K tokens</span>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-label">Pricing per 1M tokens</div>
      <div class="cost-grid">
        <div class="cost-card">
          <div class="cost-card-label">Input</div>
          <div class="cost-card-value">$${m.cost_input != null ? m.cost_input.toFixed(3) : "—"}</div>
        </div>
        <div class="cost-card">
          <div class="cost-card-label">Output</div>
          <div class="cost-card-value">$${m.cost_output != null ? m.cost_output.toFixed(3) : "—"}</div>
        </div>
        <div class="cost-card" style="grid-column:1/-1">
          <div class="cost-card-label">Blended (3:1 ratio)</div>
          <div class="cost-card-value">$${m.cost_per_1m.toFixed(3)}</div>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-label">Hatz.AI Model ID</div>
      <div class="model-id-block"><code>${m.id}</code></div>
    </div>

    <div class="aa-link">
      Data via <a href="https://artificialanalysis.ai" target="_blank" rel="noopener">Artificial Analysis</a>
      · <em style="font-size:10px">${m.aa_name}</em>
    </div>
  `;
}

function metricRow(label, value, max, color) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return `
    <div class="metric-row">
      <span class="metric-label">${label}</span>
      <span class="metric-value">${value}</span>
    </div>
    <div class="metric-bar-wrap">
      <div class="metric-bar" style="width:${pct}%;background:${color}"></div>
    </div>
  `;
}

// ── Filter wiring ─────────────────────────────────────────────────────────────

document.querySelectorAll("[data-filter]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    renderChart();
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

loadData();
