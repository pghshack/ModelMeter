/* Model Meter — Chart Logic */

Chart.register(ChartDataLabels);

// Quadrant thresholds: models above/left of these lines are "best value"
const QUAD_INTEL = 35;   // intelligence index threshold
const QUAD_COST  = 5;    // cost per 1M tokens threshold ($)

let allModels = [];
let chart = null;
let activeFilter = "all";
let activeProviders = new Set();
let selectedModel = null;

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadData() {
  document.getElementById("loading").style.display = "flex";
  try {
    const res = await fetch("/api/models");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    allModels = json.models;
    document.getElementById("modelCount").innerHTML =
      `<span>${allModels.length}</span> models`;
    buildProviderFilters();
    renderChart();
  } catch (err) {
    document.getElementById("loading").innerHTML =
      `<div class="error-msg">Failed to load models: ${err.message}<br><button onclick="loadData()" style="margin-top:10px;padding:6px 14px;cursor:pointer;">Retry</button></div>`;
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

// ── Provider filter chips ─────────────────────────────────────────────────────

function buildProviderFilters() {
  const providers = [...new Set(allModels.map(m => m.developer))].sort();
  const container = document.getElementById("providerFilters");
  container.innerHTML = "";

  providers.forEach(p => {
    const color = allModels.find(m => m.developer === p)?.color || "#888";
    const chip = document.createElement("button");
    chip.className = "filter-chip";
    chip.dataset.provider = p;
    chip.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:5px;vertical-align:middle"></span>${p}`;
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

// ── Legend ───────────────────────────────────────────────────────────────────

function buildLegend(models) {
  const providers = [...new Set(models.map(m => m.developer))].sort();
  const legend = document.getElementById("legend");
  legend.innerHTML = "";

  providers.forEach(p => {
    const color = models.find(m => m.developer === p)?.color || "#888";
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

// ── Chart rendering ───────────────────────────────────────────────────────────

function renderChart() {
  const models = getVisibleModels();
  document.getElementById("loading").style.display = "none";
  document.getElementById("modelCount").innerHTML =
    `<span>${models.length}</span> of ${allModels.length} models`;

  buildLegend(models);

  // Group by provider so Chart.js can render each as a separate dataset
  // (needed for per-provider color)
  const byProvider = {};
  models.forEach(m => {
    if (!byProvider[m.developer]) byProvider[m.developer] = [];
    byProvider[m.developer].push(m);
  });

  const datasets = Object.entries(byProvider).map(([provider, pModels]) => ({
    label: provider,
    data: pModels.map(m => ({ x: m.cost_per_1m, y: m.intelligence, model: m })),
    backgroundColor: pModels[0].color,
    borderColor: "rgba(255,255,255,0.7)",
    borderWidth: 1.5,
    pointRadius: 7,
    pointHoverRadius: 10,
  }));

  // Quadrant background plugin
  const quadrantPlugin = {
    id: "quadrant",
    beforeDraw(chart) {
      const { ctx, scales: { x, y } } = chart;
      const xPx = x.getPixelForValue(QUAD_COST);
      const yPx = y.getPixelForValue(QUAD_INTEL);
      const { left, top } = chart.chartArea;

      ctx.save();
      ctx.fillStyle = "rgba(187, 247, 208, 0.32)";
      ctx.strokeStyle = "rgba(34, 197, 94, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);

      // Fill the best-value quadrant (top-left)
      ctx.fillRect(left, top, xPx - left, yPx - top);
      ctx.strokeRect(left, top, xPx - left, yPx - top);

      // Label inside quadrant
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(22, 101, 52, 0.45)";
      ctx.font = "500 11px -apple-system, system-ui, sans-serif";
      ctx.fillText("Most attractive quadrant", left + 10, top + 18);

      ctx.restore();
    },
  };

  if (chart) {
    chart.destroy();
    chart = null;
  }

  const canvas = document.getElementById("chart");
  chart = new Chart(canvas, {
    type: "scatter",
    plugins: [quadrantPlugin, ChartDataLabels],
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      layout: { padding: { top: 10, right: 80, bottom: 10, left: 10 } },

      scales: {
        x: {
          type: "logarithmic",
          title: {
            display: true,
            text: "Cost to Run (USD per 1M tokens, log scale)",
            font: { size: 12, weight: "500" },
            color: "#6b7280",
            padding: { top: 8 },
          },
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            color: "#9ca3af",
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
            font: { size: 12, weight: "500" },
            color: "#6b7280",
            padding: { bottom: 8 },
          },
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            color: "#9ca3af",
            font: { size: 11 },
          },
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
                `  Cost/1M tokens: $${m.cost_per_1m.toFixed(3)}`,
                m.speed_tps ? `  Speed: ${Math.round(m.speed_tps)} tok/s` : null,
              ].filter(Boolean);
            },
          },
          backgroundColor: "rgba(17,24,39,0.92)",
          titleFont: { size: 13, weight: "600" },
          bodyFont: { size: 12 },
          padding: 12,
          cornerRadius: 8,
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
        },
        datalabels: {
          align: "right",
          anchor: "end",
          offset: 4,
          font: { size: 10.5, family: "-apple-system, system-ui, sans-serif" },
          color: "#374151",
          formatter: (value) => value.model.name,
          // Only show labels for models with intel > 20 to reduce clutter
          display: (ctx) => ctx.dataset.data[ctx.dataIndex].model.intelligence >= 20,
          clamp: true,
        },
      },

      onClick(event, elements) {
        if (!elements.length) {
          clearPanel();
          return;
        }
        const el = elements[0];
        const model = datasets[el.datasetIndex].data[el.index].model;
        showPanel(model);
        selectedModel = model;
      },

      onHover(event, elements) {
        event.native.target.style.cursor = elements.length ? "pointer" : "default";
      },
    },
  });
}

// ── Side panel ────────────────────────────────────────────────────────────────

function clearPanel() {
  selectedModel = null;
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
    <div class="detail-name" style="color:${m.color}">${m.name}</div>
    <div class="detail-provider">${m.developer}</div>

    ${m.vision ? `<span class="detail-badge badge-vision">Vision</span>` : ""}
    ${inQuadrant ? `<span class="detail-badge badge-quadrant">Best Value</span>` : ""}

    <div class="detail-metrics">
      ${metricRow("Intelligence", m.intelligence, 70, "#2563eb")}
      ${m.coding_index != null ? metricRow("Coding Index", m.coding_index, 70, "#7c3aed") : ""}
      ${m.speed_tps != null ? metricRow("Speed (tok/s)", Math.round(m.speed_tps), 500, "#059669") : ""}
      ${m.ttft != null ? `
        <div class="metric-row">
          <span class="metric-label">Time to first token</span>
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
      <div class="detail-section-label">Hatz.AI model ID</div>
      <code style="font-size:11px;color:#6b7280;word-break:break-all">${m.id}</code>
    </div>

    <div class="aa-link">
      Data via <a href="https://artificialanalysis.ai" target="_blank" rel="noopener">Artificial Analysis</a>
      · <em style="font-size:10.5px">${m.aa_name}</em>
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

// ── Filter chip wiring ────────────────────────────────────────────────────────

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
