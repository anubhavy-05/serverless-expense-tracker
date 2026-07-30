// ── Chart rendering helpers ──────────────────────────────────
// Store chart instances per canvas ID to avoid overwriting
let trendCharts = {};
let sankeyCharts = {};
let pieCharts = {};
let barCharts = {};

function renderTrendChart(canvasId, series) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (!series || series.length === 0) {
    if (trendCharts[canvasId]) {
      trendCharts[canvasId].destroy();
      delete trendCharts[canvasId];
    }
    return;
  }

  const labels = series.map(p => p.date);
  const data = series.map(p => p.amount);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.06)';

  if (trendCharts[canvasId]) trendCharts[canvasId].destroy();

  trendCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Daily spend (₹)',
        data,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
      },
    },
  });
}

function renderSankeyChart(canvasId, links) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (!links || links.length === 0) {
    if (sankeyCharts[canvasId]) {
      sankeyCharts[canvasId].destroy();
      delete sankeyCharts[canvasId];
    }
    return;
  }

  if (sankeyCharts[canvasId]) sankeyCharts[canvasId].destroy();

  const mappedData = links.map((l) => ({
    from: l.source,
    to: l.target,
    flow: l.value,
  }));

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const labelColor = isDark ? '#f1f5f9' : '#0f172a';

  sankeyCharts[canvasId] = new Chart(ctx, {
    type: 'sankey',
    data: {
      datasets: [{
        label: 'Money flow',
        data: mappedData,
        colorFrom: () => '#6366f1',
        colorTo: () => '#8b5cf6',
        colorMode: 'gradient',
        labels: {},
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        labels: {
          font: {
            size: 10,
            family: 'Inter, system-ui, sans-serif',
            weight: '500',
          },
          padding: 8,
          color: labelColor,
          formatter: (label) => {
            if (label.length > 12) return label.slice(0, 10) + '…';
            return label;
          },
        },
      },
      layout: {
        padding: {
          top: 20,
          bottom: 20,
          left: 20,
          right: 20,
        },
      },
      sankey: {
        nodeWidth: 18,
        nodePadding: 16,
        linkColor: 'gradient',
        colorMode: 'gradient',
        nodeAlignment: 'justify',
      },
    },
  });
}

// ── New: Pie/Doughnut chart ──
function renderPieChart(canvasId, data, topPct = 0) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const labels = Object.keys(data);
  const values = Object.values(data);
  const colors = labels.map(cat => CAT_META[cat]?.color || '#64748b');

  if (pieCharts[canvasId]) pieCharts[canvasId].destroy();

  pieCharts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 3,
        borderColor: '#111827',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#f1f5f9' : '#0f172a',
            font: { family: 'Inter', size: 11 },
            padding: 10,
            boxWidth: 10,
          },
        },
        tooltip: {
          callbacks: {
            label: (c) => ` ₹${c.parsed.toFixed(2)}`,
          },
        },
      },
    },
  });

  // Update center percentage if element exists
  const pctEl = document.getElementById('donutPctAnalytics');
  if (pctEl) pctEl.textContent = `${topPct}%`;
}

// ── New: Bar chart ──
function renderBarChart(canvasId, data) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const labels = Object.keys(data);
  const values = Object.values(data);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.06)';

  if (barCharts[canvasId]) barCharts[canvasId].destroy();

  barCharts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Spent (₹)',
        data: values,
        backgroundColor: '#6366f1',
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => ` ₹${c.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10 } },
          grid: { color: gridColor },
        },
        y: {
          ticks: {
            color: textColor,
            font: { size: 10 },
            callback: (v) => `₹${v.toLocaleString('en-IN')}`,
          },
          grid: { color: gridColor },
          beginAtZero: true,
        },
      },
    },
  });
}

// Expose for use in app.js
window.renderTrendChart = renderTrendChart;
window.renderSankeyChart = renderSankeyChart;
window.renderPieChart = renderPieChart;
window.renderBarChart = renderBarChart;