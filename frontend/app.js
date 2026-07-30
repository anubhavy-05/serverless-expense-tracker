// ════════════════════════════════════════════════════════════
// Main application logic – depends on config.js, auth.js, charts.js
// ════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
    "'": '&#39;' }[m]));
}

function formatINR(amount) {
  return '₹ ' + Number(amount).toFixed(2);
}

const CAT_META = {
  Food: { icon: 'utensils', color: '#f87171' },
  Transport: { icon: 'car', color: '#22d3ee' },
  Shopping: { icon: 'shopping-bag', color: '#eab308' },
  Rent: { icon: 'home', color: '#38bdf8' },
  Entertainment: { icon: 'film', color: '#a78bfa' },
  Bills: { icon: 'zap', color: '#fb923c' },
  Health: { icon: 'heart-pulse', color: '#34d399' },
  Other: { icon: 'package', color: '#94a3b8' },
  General: { icon: 'circle', color: '#64748b' },
};

function getCatMeta(cat) { return CAT_META[cat] || CAT_META['General']; }

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 3200);
}

// ── Theme ────────────────────────────────────────────────────
function applyThemeUI(theme) {
  const isDark = theme === 'dark';
  const iconName = isDark ? 'moon' : 'sun';
  const label = isDark ? 'Dark mode' : 'Light mode';
  document.documentElement.setAttribute('data-theme', theme);
  const ti = document.getElementById('themeIcon');
  if (ti) ti.outerHTML = `<i id="themeIcon" data-lucide="${iconName}"></i>`;
  const tl = document.getElementById('themeLabel');
  if (tl) tl.textContent = label;
  const mti = document.getElementById('mobileThemeIcon');
  if (mti) mti.outerHTML = `<i id="mobileThemeIcon" data-lucide="${iconName}"></i>`;
  const mtl = document.getElementById('mobileThemeLabel');
  if (mtl) mtl.textContent = isDark ? 'Dark' : 'Light';
  refreshIcons();
  localStorage.setItem('et_theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyThemeUI(next);
}

function loadTheme() {
  const saved = localStorage.getItem('et_theme') || 'dark';
  applyThemeUI(saved);
}

// ── Sidebar ──────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const isOpen = sidebar.classList.toggle('open');
  overlay.classList.toggle('active', isOpen);
  const btn = document.getElementById('hamburgerBtn');
  btn.innerHTML = `<i data-lucide="${isOpen ? 'x' : 'menu'}"></i>`;
  refreshIcons();
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

function closeSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
  const btn = document.getElementById('hamburgerBtn');
  if (btn) { btn.innerHTML = `<i data-lucide="menu"></i>`; refreshIcons(); }
  document.body.style.overflow = '';
}

// ── Navigation ──────────────────────────────────────────────
let activeSection = 'dashboard';

function showSection(name, linkEl) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const section = document.getElementById(`section-${name}`);
  if (section) section.classList.add('active');
  if (linkEl) linkEl.classList.add('active');
  activeSection = name;

  if (name === 'history') renderHistoryList();
  if (name === 'analytics') renderAnalyticsCharts();
  if (window.innerWidth <= 768) closeSidebar();
  return false;
}

// ── Panel ────────────────────────────────────────────────────
function openAddPanel() {
  document.getElementById('addPanel').classList.add('open');
  document.getElementById('panelOverlay').classList.add('active');
}

function closeAddPanel() {
  document.getElementById('addPanel').classList.remove('open');
  document.getElementById('panelOverlay').classList.remove('active');
}

// ── Modal ────────────────────────────────────────────────────
let editingId = null;
let deletingId = null;

function openModal(id) { document.getElementById(id).classList.add('active'); }

function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ── Expense CRUD ─────────────────────────────────────────────
let allExpenses = [];

async function loadExpenses() {
  const status = document.getElementById('status');
  status.textContent = 'Loading...';
  try {
    const res = await apiFetch('/expenses');
    const data = await res.json();
    allExpenses = Array.isArray(data) ? data : data.items || [];
    status.textContent = '';
    updateUI();
  } catch (err) {
    status.textContent = err.message;
    showToast('Failed to load expenses', 'error');
  }
}

function updateUI() {
  updateSummary(allExpenses);
  renderList(allExpenses);
  loadKpis(allExpenses);
  loadAnomalies();
  updateSidebarBalance(allExpenses);
}

function updateSummary(expenses) {
  const total = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const now = new Date();
  const monthTotal = expenses
    .filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const avg = expenses.length ? total / expenses.length : 0;

  document.getElementById('kpiTotal').textContent = formatINR(total);
  document.getElementById('kpiMonth').textContent = formatINR(monthTotal);
  document.getElementById('kpiAvg').textContent = formatINR(avg);
  document.getElementById('kpiCount').textContent = expenses.length;
}

function updateSidebarBalance(expenses) {
  const total = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  document.getElementById('sidebarBalance').textContent = formatINR(total);
  const wc = document.getElementById('walletChange');
  const now = new Date();
  const monthTotal = expenses
    .filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  wc.className = 'wallet-change ' + (monthTotal > 0 ? 'positive' : 'neutral');
  wc.innerHTML = `<span class="change-dot"></span> ${formatINR(monthTotal)} this month`;
}

function buildExpenseItemHTML(exp) {
  const meta = getCatMeta(exp.category || 'General');
  const dateStr = exp.date ?
    new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) :
    '—';
  const amt = formatINR(exp.amount);
  const cat = escapeHtml(exp.category || 'General');
  const desc = escapeHtml(exp.description || exp.title || '');
  const id = escapeHtml(exp.expenseId || exp.id || '');
  const hasReceipt = exp.receiptKey ? true : false;

  return `
    <div class="expense-cat-icon" style="color:${meta.color}">
      <i data-lucide="${meta.icon}"></i>
    </div>
    <div class="expense-details">
      <span class="expense-desc-text">${desc}</span>
      <div class="expense-meta">
        <span class="expense-cat-badge">${cat}</span>
        <span class="expense-date-text">${dateStr}</span>
      </div>
    </div>
    <span class="expense-amount-text num">${amt}</span>
    <div class="expense-item-actions">
      ${hasReceipt ? `<button class="icon-btn icon-btn--receipt" onclick="openReceipt('${id}')" aria-label="View receipt"><i data-lucide="file-text"></i></button>` : ''}
      <button class="icon-btn icon-btn--edit" onclick="openEditModal('${id}')" aria-label="Edit expense"><i data-lucide="pencil"></i></button>
      <button class="icon-btn icon-btn--delete" onclick="confirmDelete('${id}')" aria-label="Delete expense"><i data-lucide="trash-2"></i></button>
    </div>`;
}

function renderList(expenses) {
  const ul = document.getElementById('expenseList');
  if (!ul) return;
  if (!expenses.length) {
    ul.innerHTML = `<li>
      <div class="empty-state">
        <span class="empty-icon"><i data-lucide="inbox"></i></span>
        <p>No expenses yet</p>
        <small>Hit "Add expense" to get started.</small>
      </div>
    </li>`;
    refreshIcons();
    return;
  }
  ul.innerHTML = '';
  expenses.slice(0, 20).forEach((exp, i) => {
    const li = document.createElement('li');
    li.className = 'expense-item';
    li.style.animationDelay = `${i * 30}ms`;
    li.innerHTML = buildExpenseItemHTML(exp);
    ul.appendChild(li);
  });
  refreshIcons();
}

function renderHistoryList() {
  const ul = document.getElementById('historyList2');
  if (!ul) return;
  if (!allExpenses.length) {
    ul.innerHTML = `<li>
      <div class="empty-state">
        <span class="empty-icon"><i data-lucide="history"></i></span>
        <p>No history yet</p>
        <small>Your expenses will appear here.</small>
      </div>
    </li>`;
    refreshIcons();
    return;
  }
  ul.innerHTML = '';
  const sorted = [...allExpenses].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  sorted.forEach((exp, i) => {
    const li = document.createElement('li');
    li.className = 'expense-item';
    li.style.animationDelay = `${i * 30}ms`;
    li.innerHTML = buildExpenseItemHTML(exp);
    ul.appendChild(li);
  });
  refreshIcons();
}

// ── Submit expense ──────────────────────────────────────────
async function submitExpense() {
  const desc = document.getElementById('desc').value.trim();
  const amount = document.getElementById('amount').value;
  const category = document.getElementById('category').value || 'General';
  const date = document.getElementById('date').value;
  const file = document.getElementById('receipt').files[0];

  if (!desc || !amount) {
    showToast('Description and amount are required.', 'error');
    return;
  }

  const status = document.getElementById('status');
  status.textContent = 'Saving...';
  try {
    const res = await apiFetch('/expenses', {
      method: 'POST',
      body: JSON.stringify({ description: desc, amount: parseFloat(amount), category, date }),
    });
    if (!res.ok) throw new Error((await res.text()) || 'Save failed');
    const { id } = await res.json();

    if (file) {
      status.textContent = 'Uploading receipt...';
      await uploadReceipt(id, file);
    }

    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('category').value = '';
    document.getElementById('date').value = '';
    document.getElementById('receipt').value = '';
    closeAddPanel();
    showToast('Expense added.', 'success');
    status.textContent = '';
    await loadExpenses();
  } catch (err) {
    status.textContent = err.message;
    showToast('Failed to add expense: ' + err.message, 'error');
  }
}

// ── Receipts ────────────────────────────────────────────────
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

async function uploadReceipt(expenseId, file) {
  if (!ALLOWED.includes(file.type)) throw new Error('Only JPG, PNG, WEBP or PDF allowed');
  if (file.size > MAX_BYTES) throw new Error('File must be under 5 MB');

  const res = await apiFetch(`/expenses/${encodeURIComponent(expenseId)}/receipt-url`, {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });
  if (!res.ok) throw new Error((await res.text()) || 'Could not get upload URL');
  const { uploadUrl } = await res.json();

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!put.ok) throw new Error('Upload to S3 failed (' + put.status + ')');
}

async function openReceipt(expenseId) {
  try {
    const res = await apiFetch(`/expenses/${encodeURIComponent(expenseId)}/receipt-url`);
    if (!res.ok) throw new Error((await res.text()) || 'No receipt');
    const { downloadUrl } = await res.json();
    window.open(downloadUrl, '_blank', 'noopener');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Edit ─────────────────────────────────────────────────────
function openEditModal(id) {
  const exp = allExpenses.find(e => (e.expenseId || e.id) === id);
  if (!exp) return;
  editingId = id;
  document.getElementById('editExpenseId').value = id;
  document.getElementById('editDesc').value = exp.description || exp.title || '';
  document.getElementById('editAmount').value = exp.amount || '';
  document.getElementById('editCategory').value = exp.category || '';
  document.getElementById('editDate').value = exp.date || '';
  openModal('editModal');
}

async function updateExpense() {
  const id = document.getElementById('editExpenseId').value;
  const desc = document.getElementById('editDesc').value.trim();
  const amount = document.getElementById('editAmount').value;
  const category = document.getElementById('editCategory').value;
  const date = document.getElementById('editDate').value;

  if (!desc || !amount) { showToast('Description and amount are required.', 'error'); return; }

  try {
    const res = await apiFetch(`/expenses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ description: desc, amount: parseFloat(amount), category, date }),
    });
    if (!res.ok) throw new Error();
    closeModal('editModal');
    editingId = null;
    showToast('Expense updated.', 'success');
    await loadExpenses();
  } catch {
    showToast('Failed to update expense.', 'error');
  }
}

// ── Delete ──────────────────────────────────────────────────
function confirmDelete(id) {
  deletingId = id;
  openModal('deleteModal');
}

async function performDelete() {
  if (!deletingId) return;
  closeModal('deleteModal');
  const id = deletingId;
  deletingId = null;
  try {
    const res = await apiFetch(`/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    showToast('Expense deleted.', 'info');
    await loadExpenses();
  } catch {
    showToast('Failed to delete expense.', 'error');
  }
}

// ── Filters ──────────────────────────────────────────────────
function applyFilters() {
  const search = document.getElementById('searchInput')?.value?.trim().toLowerCase() || '';
  const cat = document.getElementById('filterCategory')?.value || '';
  const dateRange = document.getElementById('filterDateRange')?.value || 'all';
  const sortBy = document.getElementById('sortBy')?.value || 'date_desc';
  const now = new Date();

  let list = allExpenses.filter(e => {
    const desc = (e.description || e.title || '').toLowerCase();
    if (search && !desc.includes(search)) return false;
    if (cat && e.category !== cat) return false;
    if (dateRange !== 'all' && e.date) {
      const d = new Date(e.date);
      if (dateRange === 'this_month') {
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
      } else if (dateRange === 'last_month') {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (d.getMonth() !== lm.getMonth() || d.getFullYear() !== lm.getFullYear()) return false;
      }
    }
    return true;
  });

  list.sort((a, b) => {
    if (sortBy === 'date_desc') return new Date(b.date || 0) - new Date(a.date || 0);
    if (sortBy === 'date_asc') return new Date(a.date || 0) - new Date(b.date || 0);
    if (sortBy === 'amount_desc') return parseFloat(b.amount) - parseFloat(a.amount);
    if (sortBy === 'amount_asc') return parseFloat(a.amount) - parseFloat(b.amount);
    return 0;
  });

  renderList(list);
}

// ── KPI (already handled in updateUI) ──────────────────────
async function loadKpis(expenses) { /* no-op */ }

// ── Anomalies ────────────────────────────────────────────────
async function loadAnomalies() {
  try {
    const res = await apiFetch('/alert/anomalies');
    if (!res.ok) return;
    const { anomalies } = await res.json();
    const banner = document.getElementById('anomalyBanner');
    const text = document.getElementById('anomalyText');
    if (!anomalies || anomalies.length === 0) {
      banner.classList.add('hidden');
      return;
    }
    const top = anomalies[0];
    text.textContent =
      `${top.category} is ${top.percentAbove}% above your typical week (₹${top.currentWeek} vs ₹${top.typicalWeek} usual). Consider cutting back.`;
    banner.classList.remove('hidden');
    refreshIcons();
  } catch (err) {
    console.warn('Anomaly load failed:', err.message);
  }
}

// ── Budget ──────────────────────────────────────────────────
async function loadSettings() {
  try {
    const res = await apiFetch('/settings');
    if (!res.ok) return;
    const data = await res.json();
    const budget = data.monthlyBudget;
    document.getElementById('budgetInput').value = budget !== undefined && budget !== null ? budget : '';
  } catch (err) { /* ignore */ }
}

async function saveBudget() {
  const val = parseFloat(document.getElementById('budgetInput').value);
  if (isNaN(val) || val < 0) {
    document.getElementById('budgetStatus').textContent = 'Please enter a valid non-negative number.';
    return;
  }
  document.getElementById('budgetStatus').textContent = 'Saving...';
  try {
    const res = await apiFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify({ monthlyBudget: val }),
    });
    if (!res.ok) throw new Error(await res.text());
    document.getElementById('budgetStatus').textContent = 'Saved!';
    setTimeout(() => document.getElementById('budgetStatus').textContent = '', 3000);
    showToast('Budget saved.', 'success');
  } catch (err) {
    document.getElementById('budgetStatus').textContent = 'Error: ' + err.message;
    showToast('Failed to save budget.', 'error');
  }
}

// ── Analytics helpers ─────────────────────────────────────────
function buildCatData(expenses) {
  const map = {};
  expenses.forEach(e => {
    const c = e.category || 'General';
    map[c] = (map[c] || 0) + parseFloat(e.amount || 0);
  });
  return map;
}

function buildMonthData(expenses) {
  const now = new Date();
  const months = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months[d.toLocaleString('en-IN', { month: 'short', year: '2-digit' })] = 0;
  }
  expenses.forEach(e => {
    if (!e.date) return;
    const key = new Date(e.date).toLocaleString('en-IN', { month: 'short', year: '2-digit' });
    if (key in months) months[key] += parseFloat(e.amount || 0);
  });
  return months;
}

function renderCategoryBreakdown(catData) {
  const container = document.getElementById('categoryBreakdown');
  if (!container) return;
  const total = Object.values(catData).reduce((a, b) => a + b, 0);
  container.innerHTML = '';
  const sorted = Object.entries(catData).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([cat, amt]) => {
    const pct = total ? (amt / total) * 100 : 0;
    const meta = getCatMeta(cat);
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <span class="cat-row-label">
        <i data-lucide="${meta.icon}" style="color:${meta.color}"></i>
        ${cat}
      </span>
      <div class="cat-row-bar-track">
        <div class="cat-row-bar-fill" style="width:${pct.toFixed(1)}%; background:${meta.color};"></div>
      </div>
      <span class="cat-row-amount num">${formatINR(amt)}</span>`;
    container.appendChild(row);
  });
  refreshIcons();
}

function renderHistoryListAnalytics(expenses) {
  const ul = document.getElementById('historyListAnalytics');
  if (!ul) return;
  if (!expenses.length) {
    ul.innerHTML = `<li><div class="empty-state"><span class="empty-icon"><i data-lucide="history"></i></span><p>No history yet</p><small>Your expenses will appear here.</small></div></li>`;
    refreshIcons();
    return;
  }
  ul.innerHTML = '';
  const sorted = [...expenses].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  sorted.forEach((exp, i) => {
    const li = document.createElement('li');
    li.className = 'expense-item';
    li.style.animationDelay = `${i * 30}ms`;
    li.innerHTML = buildExpenseItemHTML(exp);
    ul.appendChild(li);
  });
  refreshIcons();
}

// ── Charts ──────────────────────────────────────────────────
function computeRange(range) {
  const now = new Date();
  let start;
  if (range === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    const days = Number(range);
    start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }
  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  };
}

async function loadTrendChartData(range) {
  const { start, end } = computeRange(range);
  try {
    const res = await apiFetch(`/chart/trend?start=${start}&end=${end}`);
    if (!res.ok) return;
    const { series } = await res.json();
    renderTrendChart('trendChart', series);
    renderTrendChart('trendChart2', series);
  } catch (err) {
    console.warn('Trend chart failed:', err.message);
  }
}

async function loadSankeyChartData(range) {
  const { start, end } = computeRange(range);
  try {
    const res = await apiFetch(`/chart/sankey?start=${start}&end=${end}`);
    if (!res.ok) return;
    const { links } = await res.json();
    renderSankeyChart('sankeyChart', links);
    renderSankeyChart('sankeyChart2', links);
  } catch (err) {
    console.warn('Sankey chart failed:', err.message);
  }
}

// ── Analytics rendering (all charts) ──────────────────────
function renderAnalyticsCharts() {
  const activePill = document.querySelector('.date-pill.active');
  const range = activePill ? activePill.getAttribute('data-range') : '30';

  // 1. Trend & Sankey (from API)
  loadTrendChartData(range);
  loadSankeyChartData(range);

  // 2. Category pie chart & monthly bar chart (computed locally)
  const catData = buildCatData(allExpenses);
  const monthData = buildMonthData(allExpenses);
  const total = Object.values(catData).reduce((a, b) => a + b, 0);
  const topPct = total ? Math.round((Math.max(...Object.values(catData)) / total) * 100) : 0;

  renderPieChart('pieChartAnalytics', catData, topPct);
  renderBarChart('barChartAnalytics', monthData);

  // 3. Category breakdown list
  renderCategoryBreakdown(catData);

  // 4. Transactions list in analytics
  renderHistoryListAnalytics(allExpenses);
}

function applyDateRange(range) {
  document.querySelectorAll('.date-pill').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-range') === range);
  });
  // Update dashboard charts
  loadTrendChartData(range);
  loadSankeyChartData(range);
  // Also update analytics if it's the active section
  if (activeSection === 'analytics') {
    renderAnalyticsCharts();
  }
}

// ── CSV Export ──────────────────────────────────────────────
function toCsvValue(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function exportCsv() {
  const status = document.getElementById('status');
  status.textContent = 'Preparing export...';
  try {
    const res = await apiFetch('/expenses');
    if (!res.ok) throw new Error('Could not fetch expenses');
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.items || [];

    const headers = ['description', 'amount', 'category', 'date'];
    const rows = [headers.join(',')];
    for (const e of items) {
      rows.push(headers.map(h => toCsvValue(e[h] ?? (h === 'description' ? e.title : ''))).join(','));
    }
    const csv = rows.join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    status.textContent = '';
    showToast('CSV exported.', 'success');
  } catch (err) {
    status.textContent = err.message;
    showToast('Export failed: ' + err.message, 'error');
  }
}

// ── CSV Import ──────────────────────────────────────────────
function parseCsvLine(line) {
  const out = [];
  let cur = '',
    inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"';
        i++; } else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { out.push(cur);
        cur = ''; } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function importCsv(file) {
  const status = document.getElementById('status');
  status.textContent = 'Reading file...';
  try {
    const text = await file.text();
    // Remove UTF-8 BOM if present
    const cleanText = text.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) throw new Error('CSV has no data rows');

    // Parse headers: trim and lowercase
    const headerRow = lines[0];
    const headers = parseCsvLine(headerRow).map(h => h.trim().toLowerCase());
    const descIdx = headers.indexOf('description');
    const amountIdx = headers.indexOf('amount');
    const categoryIdx = headers.indexOf('category');
    const dateIdx = headers.indexOf('date');
    if (descIdx === -1 || amountIdx === -1) {
      throw new Error('CSV must have "description" and "amount" columns');
    }

    let success = 0,
      failed = 0;
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      // Trim all columns
      const trimmedCols = cols.map(c => c.trim());
      // Ensure we have enough columns
      if (trimmedCols.length <= Math.max(descIdx, amountIdx, categoryIdx, dateIdx)) {
        failed++;
        errors.push(`Row ${i}: not enough columns`);
        continue;
      }
      const description = (trimmedCols[descIdx] || '').trim();
      // Remove ₹ symbol, commas, and extra whitespace
      let amountStr = (trimmedCols[amountIdx] || '').replace(/[₹,]/g, '').trim();
      const amount = parseFloat(amountStr);
      if (!description || isNaN(amount) || amount <= 0) {
        failed++;
        errors.push(`Row ${i}: invalid description or amount (${description}, ${amountStr})`);
        continue;
      }

      status.textContent = `Importing row ${i} of ${lines.length - 1}...`;
      try {
        const res = await apiFetch('/expenses', {
          method: 'POST',
          body: JSON.stringify({
            description,
            amount,
            category: (trimmedCols[categoryIdx] || 'General').trim() || 'General',
            date: (trimmedCols[dateIdx] || '').trim(),
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }
        success++;
      } catch (err) {
        failed++;
        errors.push(`Row ${i}: ${err.message}`);
        console.warn(`Row ${i+1} failed:`, err.message);
      }
    }

    // Show import summary
    status.textContent = `Import done: ${success} added, ${failed} failed.`;
    if (errors.length > 0) {
      console.warn('Import errors:', errors);
      const errorSummary = errors.slice(0, 3).join('; ');
      showToast(`Imported ${success} expenses, ${failed} failed. Check console.`, 'info');
    } else {
      showToast(`Successfully imported ${success} expenses.`, 'success');
    }

    // Refresh data and charts
    await loadExpenses();
    // Force chart refresh by applying the current date range
    const activePill = document.querySelector('.date-pill.active');
    const range = activePill ? activePill.getAttribute('data-range') : '30';
    applyDateRange(range);
    // Also refresh analytics if visible
    if (activeSection === 'analytics') renderAnalyticsCharts();

  } catch (err) {
    status.textContent = 'Import failed: ' + err.message;
    showToast('Import failed: ' + err.message, 'error');
  }
}

// ── Auth UI state ──────────────────────────────────────────
function showSignedIn(email) {
  document.getElementById('signedOut').style.display = 'none';
  document.getElementById('signedIn').style.display = 'block';
  document.getElementById('analyticsSignedOut').style.display = 'none';
  document.getElementById('analyticsSignedIn').style.display = 'block';
  document.getElementById('historySignedOut').style.display = 'none';
  document.getElementById('historySignedIn').style.display = 'block';
  document.getElementById('sidebarUserName').textContent = email || 'User';
  document.getElementById('logoutBtn').classList.remove('hidden');
}

function showSignedOut() {
  document.getElementById('signedOut').style.display = 'block';
  document.getElementById('signedIn').style.display = 'none';
  document.getElementById('analyticsSignedOut').style.display = 'block';
  document.getElementById('analyticsSignedIn').style.display = 'none';
  document.getElementById('historySignedOut').style.display = 'block';
  document.getElementById('historySignedIn').style.display = 'none';
  document.getElementById('sidebarUserName').textContent = '—';
  document.getElementById('logoutBtn').classList.add('hidden');
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  refreshIcons();

  // Setup modals
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
    closeModal('deleteModal');
    deletingId = null;
  });
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);
  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    closeModal('editModal');
    editingId = null;
  });
  document.getElementById('confirmEditBtn').addEventListener('click', updateExpense);

  // Budget save
  document.getElementById('saveBudgetBtn').addEventListener('click', saveBudget);

  // Import
  document.getElementById('importInput').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    await importCsv(file);
    ev.target.value = '';
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => Auth.logout());

  // Date range pills
  document.querySelectorAll('.date-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      applyDateRange(btn.getAttribute('data-range'));
    });
  });

  // Search
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  // Check auth
  try {
    const signedIn = await Auth.init();
    if (signedIn) {
      const email = Auth.getUserEmail();
      showSignedIn(email);
      await loadExpenses();
      await loadSettings();
      applyDateRange('30');
      renderHistoryList();
    } else {
      showSignedOut();
    }
  } catch (err) {
    showSignedOut();
    console.error('Auth init error:', err);
  }

  // Close sidebar on nav click (mobile)
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  // Close panel on overlay click
  document.getElementById('panelOverlay').addEventListener('click', closeAddPanel);

  setTimeout(refreshIcons, 500);
});

// Make functions globally accessible for inline onclick
window.openAddPanel = openAddPanel;
window.closeAddPanel = closeAddPanel;
window.submitExpense = submitExpense;
window.openEditModal = openEditModal;
window.confirmDelete = confirmDelete;
window.exportCsv = exportCsv;
window.toggleTheme = toggleTheme;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.showSection = showSection;
window.applyFilters = applyFilters;
window.openReceipt = openReceipt;
window.Auth = Auth;