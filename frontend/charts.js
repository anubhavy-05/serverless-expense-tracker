// ════════════════════════════════════════════════════════════
// Chart rendering helpers – depends on Chart.js + chartjs-chart-sankey
// Colours are read from CSS custom properties so every chart follows
// the active light/dark theme.
// ════════════════════════════════════════════════════════════

// One chart instance per canvas ID
const chartInstances = {};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function themeColors() {
  return {
    text: cssVar('--text-2'),
    muted: cssVar('--text-3'),
    strong: cssVar('--text-1'),
    grid: cssVar('--chart-grid'),
    surface: cssVar('--surface-2'),
    accent: cssVar('--accent'),
    accent2: cssVar('--accent-2'),
    danger: cssVar('--danger'),
    tooltipBg: cssVar('--tooltip-bg'),
    tooltipFg: cssVar('--tooltip-fg'),
  };
}

// Convert "#rrggbb" to "rgba(r,g,b,a)"
function withAlpha(hex, alpha) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function inr(value, decimals = 0) {
  return '₹' + Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Compact axis labels: ₹1.2K, ₹3.4L
function inrCompact(value) {
  const v = Math.abs(value);
  if (v >= 1e7) return '₹' + (value / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
  if (v >= 1e5) return '₹' + (value / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
  if (v >= 1e3) return '₹' + (value / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return '₹' + Math.round(value);
}

function baseTooltip(c) {
  return {
    backgroundColor: c.tooltipBg,
    titleColor: c.tooltipFg,
    bodyColor: c.tooltipFg,
    borderColor: c.grid,
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    displayColors: false,
    titleFont: { family: 'Inter', weight: '600', size: 12 },
    bodyFont: { family: 'Inter', size: 12 },
  };
}

function destroyChart(canvasId) {
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
    delete chartInstances[canvasId];
  }
}

// Shows/hides the "no data" overlay that sits next to each canvas
function setChartEmpty(canvas, isEmpty) {
  const overlay = canvas.parentElement && canvas.parentElement.querySelector('.chart-empty');
  if (overlay) overlay.classList.toggle('hidden', !isEmpty);
  canvas.classList.toggle('is-empty', isEmpty);
}

// Prepare a canvas: returns null (and shows the empty state) when there is nothing to draw
function prepareCanvas(canvasId, hasData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  destroyChart(canvasId);
  setChartEmpty(canvas, !hasData);
  return hasData ? canvas : null;
}

if (window.Chart) {
  Chart.defaults.font.family = "'Inter', system-ui, -apple-system, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.animation.duration = 600;
}

// ── Line: daily trend ────────────────────────────────────────
// series: [{ date: 'YYYY-MM-DD', amount: Number }] – one point per day
function renderTrendChart(canvasId, series) {
  const hasData = Array.isArray(series) && series.some(p => p.amount > 0);
  const canvas = prepareCanvas(canvasId, hasData);
  if (!canvas) return;

  const c = themeColors();
  const labels = series.map(p => {
    const [y, m, d] = p.date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  });

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Spent',
        data: series.map(p => p.amount),
        borderColor: c.accent,
        borderWidth: 2.5,
        backgroundColor: (ctx) => {
          const area = ctx.chart.chartArea;
          if (!area) return withAlpha(c.accent, 0.15);
          const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          g.addColorStop(0, withAlpha(c.accent, 0.35));
          g.addColorStop(1, withAlpha(c.accent, 0));
          return g;
        },
        fill: true,
        tension: 0.35,
        cubicInterpolationMode: 'monotone',
        pointRadius: series.length > 45 ? 0 : 2.5,
        pointBackgroundColor: c.accent,
        pointBorderColor: c.surface,
        pointHoverRadius: 6,
        pointHoverBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...baseTooltip(c),
          callbacks: { label: (ctx) => inr(ctx.parsed.y, 2) },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: c.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        },
        y: {
          beginAtZero: true,
          grid: { color: c.grid },
          border: { display: false },
          ticks: { color: c.muted, maxTicksLimit: 5, callback: inrCompact },
        },
      },
    },
  });
}

// ── Doughnut: category distribution ──────────────────────────
// Draws the period total in the middle of the ring
const donutCenterText = {
  id: 'donutCenterText',
  afterDraw(chart, _args, opts) {
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data.length) return;
    const { x, y } = meta.data[0];
    const ctx = chart.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = opts.color;
    ctx.font = `700 ${opts.size || 18}px Inter, system-ui, sans-serif`;
    ctx.fillText(opts.value || '', x, y - 8);
    ctx.fillStyle = opts.subColor;
    ctx.font = '600 10px Inter, system-ui, sans-serif';
    ctx.fillText((opts.label || '').toUpperCase(), x, y + 12);
    ctx.restore();
  },
};

// data: { category: amount }
function renderPieChart(canvasId, data) {
  const entries = Object.entries(data || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const canvas = prepareCanvas(canvasId, entries.length > 0);
  if (!canvas) return;

  const c = themeColors();
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const colors = entries.map(([cat]) => (window.getCatMeta ? getCatMeta(cat).color : c.accent));

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: entries.map(([cat]) => cat),
      datasets: [{
        data: entries.map(([, v]) => v),
        backgroundColor: colors,
        hoverBackgroundColor: colors,
        borderWidth: 3,
        borderColor: c.surface,
        hoverBorderColor: c.surface,
        borderRadius: 4,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      layout: { padding: 6 },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...baseTooltip(c),
          displayColors: true,
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${inr(ctx.parsed, 2)} (${total ? ((ctx.parsed / total) * 100).toFixed(1) : 0}%)`,
          },
        },
        donutCenterText: {
          value: inrCompact(total),
          label: 'Total',
          color: c.strong,
          subColor: c.muted,
          size: total >= 1e5 ? 18 : 20,
        },
      },
    },
    plugins: [donutCenterText],
  });
}

// ── Bar: monthly totals, with optional budget line ───────────
const budgetLine = {
  id: 'budgetLine',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts || !(opts.value > 0)) return;
    const y = chart.scales.y.getPixelForValue(opts.value);
    const { left, right, top, bottom } = chart.chartArea;
    if (y < top || y > bottom) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.restore();
  },
};

// data: { label: amount } (ordered), budget: Number|null
function renderBarChart(canvasId, data, budget = null) {
  const labels = Object.keys(data || {});
  const values = Object.values(data || {});
  const canvas = prepareCanvas(canvasId, values.some(v => v > 0));
  if (!canvas) return;

  const c = themeColors();
  const hasBudget = budget > 0;
  const last = values.length - 1;
  const colors = values.map((v, i) => {
    if (hasBudget && v > budget) return c.danger;
    return i === last ? c.accent : withAlpha(c.accent, 0.45);
  });

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Spent',
        data: values,
        backgroundColor: colors,
        hoverBackgroundColor: colors,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 44,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...baseTooltip(c),
          callbacks: {
            label: (ctx) => inr(ctx.parsed.y, 2),
            afterLabel: (ctx) => {
              if (!hasBudget) return '';
              const diff = budget - ctx.parsed.y;
              return diff >= 0 ? `${inr(diff)} under budget` : `${inr(-diff)} over budget`;
            },
          },
        },
        budgetLine: { value: hasBudget ? budget : null, color: c.danger },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: c.muted },
        },
        y: {
          beginAtZero: true,
          suggestedMax: hasBudget ? budget * 1.1 : undefined,
          grid: { color: c.grid },
          border: { display: false },
          ticks: { color: c.muted, maxTicksLimit: 5, callback: inrCompact },
        },
      },
    },
    plugins: [budgetLine],
  });
}

// ── Bar (horizontal-friendly): weekday pattern ───────────────
// data: { Mon: amount, ... } in display order
function renderWeekdayChart(canvasId, data) {
  const labels = Object.keys(data || {});
  const values = Object.values(data || {});
  const canvas = prepareCanvas(canvasId, values.some(v => v > 0));
  if (!canvas) return;

  const c = themeColors();
  const max = Math.max(...values);
  const colors = values.map(v => (v === max ? c.accent2 : withAlpha(c.accent2, 0.4)));

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Spent',
        data: values,
        backgroundColor: colors,
        hoverBackgroundColor: colors,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 36,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...baseTooltip(c), callbacks: { label: (ctx) => inr(ctx.parsed.y, 2) } },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: c.muted } },
        y: {
          beginAtZero: true,
          grid: { color: c.grid },
          border: { display: false },
          ticks: { color: c.muted, maxTicksLimit: 5, callback: inrCompact },
        },
      },
    },
  });
}

// ── Sankey: money flow ───────────────────────────────────────
// links: [{ source, target, value }] as returned by /chart/sankey
function renderSankeyChart(canvasId, links) {
  const clean = (links || []).filter(l => l && l.value > 0);
  const canvas = prepareCanvas(canvasId, clean.length > 0);
  if (!canvas) return;

  const c = themeColors();
  const total = clean.reduce((s, l) => s + l.value, 0);
  const sources = new Set(clean.map(l => l.source));
  const colorFor = (node) => {
    if (sources.has(node)) return c.accent;
    return window.getCatMeta ? getCatMeta(node).color : c.accent2;
  };

  // Node display labels: the source node is the period total, the
  // targets show their share. (The API names the source "Income".)
  const labels = {};
  const byNode = {};
  clean.forEach(l => {
    byNode[l.target] = (byNode[l.target] || 0) + l.value;
    byNode[l.source] = (byNode[l.source] || 0) + l.value;
  });
  Object.entries(byNode).forEach(([node, value]) => {
    const name = sources.has(node) && node === 'Income' ? 'Total spent' : node;
    const pct = total ? Math.round((value / total) * 100) : 0;
    labels[node] = sources.has(node) ? `${name}  ${inr(value)}` : `${name}  ${inr(value)} · ${pct}%`;
  });

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'sankey',
    data: {
      datasets: [{
        label: 'Money flow',
        data: clean.map(l => ({ from: l.source, to: l.target, flow: l.value })),
        colorFrom: (ctx) => colorFor(ctx.dataset.data[ctx.dataIndex]?.from),
        colorTo: (ctx) => colorFor(ctx.dataset.data[ctx.dataIndex]?.to),
        colorMode: 'gradient',
        hoverColorFrom: (ctx) => colorFor(ctx.dataset.data[ctx.dataIndex]?.from),
        hoverColorTo: (ctx) => colorFor(ctx.dataset.data[ctx.dataIndex]?.to),
        labels,
        // Sankey-specific dataset options (these are what the plugin reads)
        color: c.strong,
        font: { family: 'Inter', size: 11, weight: '600' },
        size: 'max',
        nodeWidth: 14,
        nodePadding: 18,
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 8, bottom: 8, left: 4, right: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...baseTooltip(c),
          callbacks: {
            title: () => '',
            label: (ctx) => {
              const item = ctx.dataset.data[ctx.dataIndex];
              const pct = total ? ((item.flow / total) * 100).toFixed(1) : 0;
              return `${item.to}: ${inr(item.flow, 2)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

window.renderTrendChart = renderTrendChart;
window.renderSankeyChart = renderSankeyChart;
window.renderPieChart = renderPieChart;
window.renderBarChart = renderBarChart;
window.renderWeekdayChart = renderWeekdayChart;
window.inrCompact = inrCompact;
