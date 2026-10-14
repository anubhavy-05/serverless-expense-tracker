// ════════════════════════════════════════════════════════════
// Main application logic – depends on config.js, auth.js, charts.js
// ════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
    "'": '&#39;' }[m]));
}

function formatINR(amount, decimals = 2) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Whole rupees for headline numbers, paise only when they matter
function formatINRShort(amount) {
  const n = Number(amount || 0);
  return formatINR(n, Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2);
}

const CAT_META = {
  Food: { icon: 'utensils', color: '#f87171' },
  Transport: { icon: 'car', color: '#22d3ee' },
  Shopping: { icon: 'shopping-bag', color: '#facc15' },
  Rent: { icon: 'home', color: '#60a5fa' },
  Entertainment: { icon: 'film', color: '#c084fc' },
  Bills: { icon: 'zap', color: '#fb923c' },
  Health: { icon: 'heart-pulse', color: '#34d399' },
  Other: { icon: 'package', color: '#94a3b8' },
  General: { icon: 'circle', color: '#64748b' },
};
const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Rent', 'Entertainment', 'Bills', 'Health', 'Other'];

function getCatMeta(cat) { return CAT_META[cat] || CAT_META.General; }

function amountOf(e) {
  const n = parseFloat(e.amount);
  return Number.isFinite(n) ? n : 0;
}

// ── Local-time date helpers ──────────────────────────────────
// Dates are stored as 'YYYY-MM-DD'. `new Date('YYYY-MM-DD')` parses as
// UTC and `toISOString()` converts to UTC, both of which shift the day
// for users east/west of Greenwich – so always work in local time.
function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayISO() { return toISODate(new Date()); }

function parseISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

function daysInMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }

// Accepts YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY, DD/MM/YYYY (and DD.MM.YYYY)
function normalizeDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; } else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3];
  }
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return toISODate(dt);
}

function formatDisplayDate(iso) {
  const d = parseISODate(iso);
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

let toastTimer = null;
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  const icon = { success: 'check-circle-2', error: 'alert-circle', info: 'info' }[type] || 'info';
  t.innerHTML = `<i data-lucide="${icon}"></i><span></span>`;
  t.querySelector('span').textContent = msg;
  t.className = 'toast ' + type + ' show';
  refreshIcons();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
}

function setHidden(el, hidden) {
  const node = typeof el === 'string' ? document.getElementById(el) : el;
  if (node) node.classList.toggle('hidden', hidden);
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${label || 'Saving…'}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    refreshIcons();
  }
}

// ── Theme ────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('et_theme', theme); } catch { /* storage unavailable */ }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
  // Charts are drawn on canvas with resolved colours – redraw them
  renderVisibleCharts();
}

// ── Sidebar ──────────────────────────────────────────────────
function setSidebar(open) {
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('sidebarOverlay').classList.toggle('active', open);
  const btn = document.getElementById('hamburgerBtn');
  btn.innerHTML = `<i data-lucide="${open ? 'x' : 'menu'}"></i>`;
  btn.setAttribute('aria-expanded', String(open));
  refreshIcons();
  document.body.style.overflow = open ? 'hidden' : '';
}

function toggleSidebar() { setSidebar(!document.getElementById('sidebar').classList.contains('open')); }

function closeSidebar() { setSidebar(false); }

// ── Navigation ──────────────────────────────────────────────
let activeSection = 'dashboard';

function showSection(name) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.toggle('active', s.id === `section-${name}`));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.section === name));
  activeSection = name;
  window.scrollTo({ top: 0 });

  if (name === 'history') renderHistoryList();
  renderVisibleCharts();
  if (window.innerWidth <= 768) closeSidebar();
}

// ── Add panel ────────────────────────────────────────────────
function openAddPanel() {
  const date = document.getElementById('date');
  if (!date.value) date.value = todayISO();
  date.max = todayISO();
  document.getElementById('addPanel').classList.add('open');
  document.getElementById('addPanel').setAttribute('aria-hidden', 'false');
  document.getElementById('panelOverlay').classList.add('active');
  setTimeout(() => document.getElementById('amount').focus(), 150);
}

function closeAddPanel() {
  document.getElementById('addPanel').classList.remove('open');
  document.getElementById('addPanel').setAttribute('aria-hidden', 'true');
  document.getElementById('panelOverlay').classList.remove('active');
}

// ── Category picker (chips) ──────────────────────────────────
function buildCategoryPicker(container) {
  const target = document.getElementById(container.dataset.target);
  container.innerHTML = CATEGORIES.map(cat => {
    const meta = getCatMeta(cat);
    return `<button type="button" class="cat-chip" data-cat="${cat}" style="--chip:${meta.color}">
      <i data-lucide="${meta.icon}"></i><span>${cat}</span></button>`;
  }).join('');
  container.addEventListener('click', (ev) => {
    const chip = ev.target.closest('.cat-chip');
    if (!chip) return;
    setPickerValue(container, chip.dataset.cat === target.value ? '' : chip.dataset.cat);
  });
}

function setPickerValue(container, value) {
  document.getElementById(container.dataset.target).value = value || '';
  container.querySelectorAll('.cat-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === value));
}

function populateCategorySelects() {
  ['filterCategory', 'historyCategory'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.insertAdjacentHTML('beforeend', [...CATEGORIES, 'General'].map(c => `<option value="${c}">${c}</option>`).join(''));
  });
}

// ── Modal ────────────────────────────────────────────────────
let deletingId = null;

function openModal(id) { document.getElementById(id).classList.add('active'); }

function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ── Data ─────────────────────────────────────────────────────
let allExpenses = [];
let monthlyBudget = null;
let currentRange = '30';

async function loadExpenses() {
  const status = document.getElementById('status');
  if (!allExpenses.length) {
    document.getElementById('expenseList').innerHTML = skeletonRows(4);
  }
  try {
    const res = await apiFetch('/expenses');
    if (!res.ok) throw new Error(`Could not load expenses (HTTP ${res.status})`);
    const data = await res.json();
    allExpenses = Array.isArray(data) ? data : data.items || [];
    status.textContent = '';
    updateUI();
  } catch (err) {
    status.textContent = err.message;
    document.getElementById('expenseList').innerHTML = '';
    showToast('Failed to load expenses', 'error');
  }
}

function skeletonRows(n) {
  return Array.from({ length: n }, () => `<li class="expense-item skeleton-row">
    <div class="skeleton skeleton-icon"></div>
    <div class="expense-details"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div>
  </li>`).join('');
}

// Refresh everything that depends on the expense list
function updateUI() {
  updateSummary(allExpenses);
  updateSidebarBalance(allExpenses);
  updateBudgetCard();
  applyFilters();
  if (activeSection === 'history') renderHistoryList();
  renderVisibleCharts();
  loadAnomalies();
}

function sumWhere(expenses, pred) {
  return expenses.reduce((s, e) => (pred(e) ? s + amountOf(e) : s), 0);
}

function monthTotals(expenses) {
  const now = new Date();
  const thisKey = monthKey(now);
  const lastKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return {
    thisMonth: sumWhere(expenses, e => (e.date || '').startsWith(thisKey)),
    lastMonth: sumWhere(expenses, e => (e.date || '').startsWith(lastKey)),
    thisKey,
  };
}

function deltaHTML(current, previous, suffix) {
  if (!previous) return `<span class="muted">No data for ${suffix}</span>`;
  const pct = ((current - previous) / previous) * 100;
  const up = pct > 0;
  const cls = Math.abs(pct) < 0.5 ? 'flat' : up ? 'up' : 'down';
  const icon = cls === 'flat' ? 'minus' : up ? 'trending-up' : 'trending-down';
  return `<span class="delta delta--${cls}"><i data-lucide="${icon}"></i>${Math.abs(pct).toFixed(0)}%</span> <span class="muted">vs ${suffix}</span>`;
}

function updateSummary(expenses) {
  const total = sumWhere(expenses, () => true);
  const { thisMonth, lastMonth, thisKey } = monthTotals(expenses);
  const now = new Date();
  const monthExpenses = expenses.filter(e => (e.date || '').startsWith(thisKey));

  document.getElementById('kpiTotal').textContent = formatINRShort(total);
  document.getElementById('kpiCount').textContent = `${expenses.length} expense${expenses.length === 1 ? '' : 's'}`;
  document.getElementById('kpiMonth').textContent = formatINRShort(thisMonth);
  document.getElementById('kpiMonthDelta').innerHTML = deltaHTML(thisMonth, lastMonth, 'last month');

  // Average per calendar day elapsed this month (not per expense)
  const avg = thisMonth / now.getDate();
  document.getElementById('kpiAvg').textContent = formatINR(avg, 0);
  document.getElementById('kpiAvgSub').textContent = `over ${now.getDate()} day${now.getDate() === 1 ? '' : 's'} this month`;

  const cats = buildCatData(monthExpenses);
  renderCategoryBreakdown(cats, 'monthTopCats', 3);
  const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  const topEl = document.getElementById('kpiTopCat');
  if (top) {
    const meta = getCatMeta(top[0]);
    topEl.innerHTML = `<span class="dot" style="background:${meta.color}"></span>${escapeHtml(top[0])}`;
    document.getElementById('kpiTopCatSub').textContent =
      `${formatINRShort(top[1])} · ${Math.round((top[1] / thisMonth) * 100)}% of this month`;
  } else {
    topEl.textContent = '—';
    document.getElementById('kpiTopCatSub').textContent = 'No spending this month yet';
  }
  refreshIcons();
}

function updateSidebarBalance(expenses) {
  const { thisMonth, lastMonth } = monthTotals(expenses);
  document.getElementById('sidebarBalance').textContent = formatINRShort(thisMonth);
  const wc = document.getElementById('walletChange');
  if (!lastMonth) {
    wc.className = 'wallet-change neutral';
    wc.innerHTML = `<span class="change-dot"></span> ${allExpenses.length} expenses tracked`;
    return;
  }
  const diff = thisMonth - lastMonth;
  wc.className = 'wallet-change ' + (diff > 0 ? 'negative' : 'positive');
  wc.innerHTML = `<span class="change-dot"></span> ${formatINRShort(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than last month`;
}

// ── Budget card ──────────────────────────────────────────────
function updateBudgetCard() {
  const now = new Date();
  const { thisMonth } = monthTotals(allExpenses);
  const daysLeft = daysInMonth(now) - now.getDate() + 1; // including today
  document.getElementById('budgetMonthLabel').textContent =
    now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  document.getElementById('budgetSpent').textContent = formatINRShort(thisMonth);
  document.getElementById('budgetDaysLeft').textContent = daysLeft;

  const bar = document.getElementById('budgetBar');
  const note = document.getElementById('budgetNote');
  const editLabel = document.querySelector('#editBudgetBtn span');

  if (!(monthlyBudget > 0)) {
    document.getElementById('budgetLimit').textContent = 'no budget set';
    document.getElementById('budgetRemaining').textContent = '—';
    document.getElementById('budgetPerDay').textContent = '—';
    bar.style.width = '0%';
    bar.className = 'progress-fill';
    note.textContent = 'Set a monthly budget to track how much you can still spend.';
    note.className = 'budget-note';
    if (editLabel) editLabel.textContent = 'Set budget';
    return;
  }

  if (editLabel) editLabel.textContent = 'Edit';
  const pct = (thisMonth / monthlyBudget) * 100;
  const remaining = monthlyBudget - thisMonth;
  document.getElementById('budgetLimit').textContent = formatINRShort(monthlyBudget);
  document.getElementById('budgetRemaining').textContent = remaining >= 0 ? formatINRShort(remaining) : '−' + formatINRShort(-remaining);
  document.getElementById('budgetPerDay').textContent = remaining > 0 ? formatINRShort(remaining / daysLeft) : '₹0';
  bar.style.width = Math.min(pct, 100).toFixed(1) + '%';

  const level = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'ok';
  bar.className = 'progress-fill progress-fill--' + level;
  note.className = 'budget-note budget-note--' + level;
  note.textContent = level === 'danger' ?
    `You're ${formatINRShort(-remaining)} over budget this month.` :
    level === 'warning' ?
    `Heads up — ${pct.toFixed(0)}% of your budget is used.` :
    `${pct.toFixed(0)}% used. You're on track.`;
}

function toggleBudgetForm(show) {
  setHidden('budgetForm', !show);
  setHidden('budgetView', show);
  setHidden('editBudgetBtn', show);
  if (show) {
    const input = document.getElementById('budgetInput');
    input.value = monthlyBudget > 0 ? monthlyBudget : '';
    document.getElementById('budgetStatus').textContent = '';
    input.focus();
  }
}

async function loadSettings() {
  try {
    const res = await apiFetch('/settings');
    if (!res.ok) return;
    const data = await res.json();
    monthlyBudget = typeof data.monthlyBudget === 'number' ? data.monthlyBudget : null;
    updateBudgetCard();
    if (activeSection === 'analytics') renderAnalyticsCharts();
  } catch (err) {
    console.warn('Settings load failed:', err.message);
  }
}

async function saveBudget(ev) {
  ev?.preventDefault();
  const statusEl = document.getElementById('budgetStatus');
  const val = parseFloat(document.getElementById('budgetInput').value);
  if (!Number.isFinite(val) || val < 0) {
    statusEl.textContent = 'Please enter a valid non-negative number.';
    return;
  }
  const btn = document.getElementById('saveBudgetBtn');
  setBusy(btn, true, 'Saving…');
  try {
    const res = await apiFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify({ monthlyBudget: val }),
    });
    if (!res.ok) throw new Error(await errorText(res));
    monthlyBudget = val;
    toggleBudgetForm(false);
    updateBudgetCard();
    renderVisibleCharts();
    showToast('Budget saved.', 'success');
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
    showToast('Failed to save budget.', 'error');
  } finally {
    setBusy(btn, false);
  }
}

async function errorText(res) {
  const text = await res.text();
  try { return JSON.parse(text).error || text; } catch { return text || `HTTP ${res.status}`; }
}

// ── Expense list rendering ──────────────────────────────────
function buildExpenseItemHTML(exp) {
  const meta = getCatMeta(exp.category || 'General');
  const cat = escapeHtml(exp.category || 'General');
  const desc = escapeHtml(exp.description || exp.title || '');
  const id = escapeHtml(exp.expenseId || exp.id || '');

  return `
    <div class="expense-cat-icon" style="--chip:${meta.color}">
      <i data-lucide="${meta.icon}"></i>
    </div>
    <div class="expense-details">
      <span class="expense-desc-text">${desc}</span>
      <div class="expense-meta">
        <span class="expense-cat-badge" style="--chip:${meta.color}">${cat}</span>
        <span class="expense-date-text">${formatDisplayDate(exp.date)}</span>
        ${exp.receiptKey ? '<span class="expense-receipt-flag" title="Has receipt"><i data-lucide="paperclip"></i></span>' : ''}
      </div>
    </div>
    <span class="expense-amount-text num">−${formatINR(amountOf(exp))}</span>
    <div class="expense-item-actions">
      ${exp.receiptKey ? `<button type="button" class="icon-btn icon-btn--receipt" data-action="receipt" data-id="${id}" aria-label="View receipt" title="View receipt"><i data-lucide="file-text"></i></button>` : ''}
      <button type="button" class="icon-btn icon-btn--edit" data-action="edit" data-id="${id}" aria-label="Edit expense" title="Edit"><i data-lucide="pencil"></i></button>
      <button type="button" class="icon-btn icon-btn--delete" data-action="delete" data-id="${id}" aria-label="Delete expense" title="Delete"><i data-lucide="trash-2"></i></button>
    </div>`;
}

function emptyStateHTML(icon, title, hint, withButton) {
  return `<div class="empty-state">
      <span class="empty-icon"><i data-lucide="${icon}"></i></span>
      <p>${title}</p>
      <small>${hint}</small>
      ${withButton ? '<button type="button" class="btn-primary btn-sm" data-action="open-panel"><i data-lucide="plus"></i> Add expense</button>' : ''}
    </div>`;
}

const RECENT_LIMIT = 10;

function renderList(expenses, filtered) {
  const ul = document.getElementById('expenseList');
  if (!ul) return;
  if (!expenses.length) {
    ul.innerHTML = `<li>${filtered ?
      emptyStateHTML('search-x', 'No matching expenses', 'Try a different search or filter.') :
      emptyStateHTML('inbox', 'No expenses yet', 'Add your first expense to get started.', true)}</li>`;
    setHidden('recentFooter', true);
    refreshIcons();
    return;
  }
  ul.innerHTML = '';
  expenses.slice(0, RECENT_LIMIT).forEach((exp, i) => {
    const li = document.createElement('li');
    li.className = 'expense-item';
    li.style.animationDelay = `${i * 25}ms`;
    li.innerHTML = buildExpenseItemHTML(exp);
    ul.appendChild(li);
  });
  setHidden('recentFooter', expenses.length <= RECENT_LIMIT);
  refreshIcons();
}

function byDateDesc(a, b) {
  return (b.date || '').localeCompare(a.date || '');
}

function renderHistoryList() {
  const container = document.getElementById('historyList2');
  if (!container) return;
  const search = document.getElementById('historySearch').value.trim().toLowerCase();
  const cat = document.getElementById('historyCategory').value;
  const list = allExpenses
    .filter(e => (!search || (e.description || e.title || '').toLowerCase().includes(search)) &&
      (!cat || (e.category || 'General') === cat))
    .sort(byDateDesc);

  const total = list.reduce((s, e) => s + amountOf(e), 0);
  document.getElementById('historyCount').innerHTML =
    `${list.length} expense${list.length === 1 ? '' : 's'} <span class="muted num">· ${formatINR(total)}</span>`;

  if (!list.length) {
    container.innerHTML = (search || cat) ?
      emptyStateHTML('search-x', 'No matching expenses', 'Try a different search or filter.') :
      emptyStateHTML('history', 'No history yet', 'Your expenses will appear here.', true);
    refreshIcons();
    return;
  }

  // Group by month
  const groups = new Map();
  list.forEach(e => {
    const d = parseISODate(e.date);
    const key = d ? monthKey(d) : 'undated';
    if (!groups.has(key)) groups.set(key, { label: d ? d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : 'No date', items: [] });
    groups.get(key).items.push(e);
  });

  container.innerHTML = '';
  groups.forEach(group => {
    const sum = group.items.reduce((s, e) => s + amountOf(e), 0);
    const section = document.createElement('div');
    section.className = 'history-group';
    section.innerHTML = `<div class="history-group-header">
        <span>${group.label}</span>
        <span class="num">${formatINR(sum)}</span>
      </div>`;
    const ul = document.createElement('ul');
    ul.className = 'expense-list';
    group.items.forEach(exp => {
      const li = document.createElement('li');
      li.className = 'expense-item';
      li.innerHTML = buildExpenseItemHTML(exp);
      ul.appendChild(li);
    });
    section.appendChild(ul);
    container.appendChild(section);
  });
  refreshIcons();
}

// ── Submit expense ──────────────────────────────────────────
function validateExpenseFields(desc, amount, date) {
  if (!desc) return 'Please enter a description.';
  if (!Number.isFinite(amount) || amount <= 0) return 'Please enter an amount greater than 0.';
  if (!date || !parseISODate(date)) return 'Please pick a valid date.';
  return null;
}

async function submitExpense(ev) {
  ev?.preventDefault();
  const desc = document.getElementById('desc').value.trim();
  const amount = parseFloat(document.getElementById('amount').value);
  const category = document.getElementById('category').value || 'General';
  const date = document.getElementById('date').value || todayISO();
  const file = document.getElementById('receipt').files[0];

  const problem = validateExpenseFields(desc, amount, date);
  if (problem) { showToast(problem, 'error'); return; }
  if (file) {
    const fileProblem = receiptProblem(file);
    if (fileProblem) { showToast(fileProblem, 'error'); return; }
  }

  const btn = document.getElementById('submitBtn');
  setBusy(btn, true, 'Saving…');
  try {
    const res = await apiFetch('/expenses', {
      method: 'POST',
      body: JSON.stringify({ description: desc, amount, category, date }),
    });
    if (!res.ok) throw new Error(await errorText(res));
    const { id } = await res.json();

    if (file) {
      btn.innerHTML = '<span class="spinner"></span> Uploading receipt…';
      try {
        await uploadReceipt(id, file);
      } catch (err) {
        showToast('Expense saved, but the receipt upload failed: ' + err.message, 'error');
      }
    }

    document.getElementById('addForm').reset();
    setPickerValue(document.getElementById('categoryPicker'), '');
    document.getElementById('receiptName').textContent = 'Attach a receipt';
    closeAddPanel();
    if (!file) showToast('Expense added.', 'success');
    await loadExpenses();
  } catch (err) {
    showToast('Failed to add expense: ' + err.message, 'error');
  } finally {
    setBusy(btn, false);
  }
}

// ── Receipts ────────────────────────────────────────────────
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function receiptProblem(file) {
  if (!ALLOWED.includes(file.type)) return 'Receipts must be JPG, PNG, WEBP or PDF.';
  if (file.size > MAX_BYTES) return 'Receipt must be under 5 MB.';
  return null;
}

async function uploadReceipt(expenseId, file) {
  const problem = receiptProblem(file);
  if (problem) throw new Error(problem);

  const res = await apiFetch(`/expenses/${encodeURIComponent(expenseId)}/receipt-url`, {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });
  if (!res.ok) throw new Error(await errorText(res));
  const { uploadUrl } = await res.json();

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!put.ok) throw new Error('Upload to S3 failed (' + put.status + ')');
  showToast('Expense and receipt saved.', 'success');
}

async function openReceipt(expenseId) {
  // Open the tab synchronously so popup blockers allow it, then point it at the URL
  const win = window.open('', '_blank');
  try {
    const res = await apiFetch(`/expenses/${encodeURIComponent(expenseId)}/receipt-url`);
    if (!res.ok) throw new Error(await errorText(res));
    const { downloadUrl } = await res.json();
    if (win) { win.opener = null; win.location.href = downloadUrl; } else window.open(downloadUrl, '_blank', 'noopener');
  } catch (err) {
    if (win) win.close();
    showToast(err.message, 'error');
  }
}

// ── Edit ─────────────────────────────────────────────────────
function findExpense(id) { return allExpenses.find(e => (e.expenseId || e.id) === id); }

function openEditModal(id) {
  const exp = findExpense(id);
  if (!exp) return;
  document.getElementById('editExpenseId').value = id;
  document.getElementById('editDesc').value = exp.description || exp.title || '';
  document.getElementById('editAmount').value = amountOf(exp) || '';
  document.getElementById('editDate').value = parseISODate(exp.date) ? exp.date.slice(0, 10) : todayISO();
  setPickerValue(document.getElementById('editCategoryPicker'), CATEGORIES.includes(exp.category) ? exp.category : '');
  openModal('editModal');
  setTimeout(() => document.getElementById('editDesc').focus(), 100);
}

async function updateExpense(ev) {
  ev?.preventDefault();
  const id = document.getElementById('editExpenseId').value;
  const desc = document.getElementById('editDesc').value.trim();
  const amount = parseFloat(document.getElementById('editAmount').value);
  const category = document.getElementById('editCategory').value || 'General';
  const date = document.getElementById('editDate').value;

  const problem = validateExpenseFields(desc, amount, date);
  if (problem) { showToast(problem, 'error'); return; }

  const btn = document.getElementById('confirmEditBtn');
  setBusy(btn, true, 'Updating…');
  try {
    const res = await apiFetch(`/expenses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ description: desc, amount, category, date }),
    });
    if (!res.ok) throw new Error(await errorText(res));
    closeModal('editModal');
    showToast('Expense updated.', 'success');
    await loadExpenses();
  } catch (err) {
    showToast('Failed to update expense: ' + err.message, 'error');
  } finally {
    setBusy(btn, false);
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
    if (!res.ok) throw new Error(await errorText(res));
    showToast('Expense deleted.', 'info');
    await loadExpenses();
  } catch (err) {
    showToast('Failed to delete expense: ' + err.message, 'error');
  }
}

// ── Filters (dashboard "Recent transactions") ───────────────
function applyFilters() {
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const cat = document.getElementById('filterCategory').value;
  const dateRange = document.getElementById('filterDateRange').value;
  const sortBy = document.getElementById('sortBy').value;
  const now = new Date();
  const thisKey = monthKey(now);
  const lastKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const list = allExpenses.filter(e => {
    const desc = (e.description || e.title || '').toLowerCase();
    if (search && !desc.includes(search)) return false;
    if (cat && (e.category || 'General') !== cat) return false;
    if (dateRange === 'this_month' && !(e.date || '').startsWith(thisKey)) return false;
    if (dateRange === 'last_month' && !(e.date || '').startsWith(lastKey)) return false;
    return true;
  });

  list.sort((a, b) => {
    if (sortBy === 'date_asc') return (a.date || '').localeCompare(b.date || '');
    if (sortBy === 'amount_desc') return amountOf(b) - amountOf(a);
    if (sortBy === 'amount_asc') return amountOf(a) - amountOf(b);
    return byDateDesc(a, b);
  });

  renderList(list, Boolean(search || cat || dateRange !== 'all'));
}

// ── Anomalies ────────────────────────────────────────────────
async function loadAnomalies() {
  try {
    const res = await apiFetch('/alert/anomalies');
    if (!res.ok) return;
    const { anomalies } = await res.json();
    const banner = document.getElementById('anomalyBanner');
    if (!anomalies || anomalies.length === 0) {
      banner.classList.add('hidden');
      return;
    }
    const top = anomalies[0];
    document.getElementById('anomalyText').innerHTML =
      `<strong>${escapeHtml(top.category)}</strong> spending is ${escapeHtml(top.percentAbove)}% above your typical week ` +
      `(${formatINRShort(top.currentWeek)} vs ${formatINRShort(top.typicalWeek)} usual). Consider cutting back.`;
    banner.classList.remove('hidden');
    refreshIcons();
  } catch (err) {
    console.warn('Anomaly load failed:', err.message);
  }
}

// ── Analytics data builders (all local, from allExpenses) ───
function buildCatData(expenses) {
  const map = {};
  expenses.forEach(e => {
    const c = e.category || 'General';
    map[c] = (map[c] || 0) + amountOf(e);
  });
  return map;
}

function buildMonthData(expenses) {
  const now = new Date();
  const months = new Map();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.set(monthKey(d), { label: d.toLocaleDateString('en-IN', { month: 'short' }), total: 0 });
  }
  expenses.forEach(e => {
    const m = months.get((e.date || '').slice(0, 7));
    if (m) m.total += amountOf(e);
  });
  const out = {};
  months.forEach(m => { out[m.label] = m.total; });
  return out;
}

function buildWeekdayData(expenses) {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const out = Object.fromEntries(names.map(n => [n, 0]));
  expenses.forEach(e => {
    const d = parseISODate(e.date);
    if (d) out[names[(d.getDay() + 6) % 7]] += amountOf(e);
  });
  return out;
}

// One entry per day in [start, end], zero-filled, so the line chart
// shows quiet days instead of drawing straight across them.
function fillDailySeries(series, start, end) {
  const byDate = {};
  (series || []).forEach(p => { if (p && p.date) byDate[p.date.slice(0, 10)] = (byDate[p.date.slice(0, 10)] || 0) + Number(p.amount || 0); });
  const out = [];
  for (let d = parseISODate(start), last = parseISODate(end); d <= last; d = addDays(d, 1)) {
    const key = toISODate(d);
    out.push({ date: key, amount: byDate[key] || 0 });
  }
  return out;
}

function localTrendSeries(start, end) {
  return allExpenses
    .filter(e => e.date && e.date >= start && e.date <= end)
    .map(e => ({ date: e.date, amount: amountOf(e) }));
}

function localSankeyLinks(expenses) {
  return Object.entries(buildCatData(expenses)).map(([cat, value]) => ({ source: 'Income', target: cat, value }));
}

function expensesInRange(start, end) {
  return allExpenses.filter(e => e.date && e.date >= start && e.date <= end);
}

function computeRange(range) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start, prevStart, prevEnd, label;
  if (range === 'month') {
    start = new Date(end.getFullYear(), end.getMonth(), 1);
    prevStart = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    // Same number of days into last month, for a like-for-like comparison
    prevEnd = new Date(end.getFullYear(), end.getMonth() - 1, Math.min(end.getDate(), daysInMonth(prevStart)));
    label = 'This month';
  } else {
    const days = Number(range) || 30;
    start = addDays(end, -(days - 1));
    prevEnd = addDays(start, -1);
    prevStart = addDays(prevEnd, -(days - 1));
    label = `Last ${days} days`;
  }
  return {
    start: toISODate(start),
    end: toISODate(end),
    prevStart: toISODate(prevStart),
    prevEnd: toISODate(prevEnd),
    label,
  };
}

// Fetch a chart endpoint; fall back to computing locally if it fails.
// A sequence number per chart drops responses that arrive out of order.
const chartSeq = {};
async function fetchChart(name, path, extract, fallback) {
  const seq = (chartSeq[name] = (chartSeq[name] || 0) + 1);
  let data;
  try {
    const res = await apiFetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = extract(await res.json());
    if (!Array.isArray(data)) throw new Error('Unexpected response');
  } catch (err) {
    console.warn(`${name} chart: using local data (${err.message})`);
    data = fallback();
  }
  return seq === chartSeq[name] ? data : null;
}

async function renderTrendCharts() {
  const r = computeRange(currentRange);
  const series = await fetchChart('trend', `/chart/trend?start=${r.start}&end=${r.end}`,
    body => body.series, () => localTrendSeries(r.start, r.end));
  if (!series) return; // superseded by a newer request
  const filled = fillDailySeries(series, r.start, r.end);

  const total = filled.reduce((s, p) => s + p.amount, 0);
  const prev = sumWhere(allExpenses, e => e.date && e.date >= r.prevStart && e.date <= r.prevEnd);
  document.getElementById('trendTotal').textContent = formatINRShort(total);
  document.getElementById('trendDelta').innerHTML = `<span class="muted">· ${r.label.toLowerCase()}</span> ` +
    (prev ? deltaHTML(total, prev, 'previous period') : '');
  document.getElementById('rangeLabelTrend').textContent = `${r.label} · ${formatINRShort(total)}`;
  refreshIcons();

  if (activeSection === 'dashboard') renderTrendChart('trendChart', filled);
  if (activeSection === 'analytics') renderTrendChart('trendChart2', filled);
}

async function renderSankey() {
  const r = computeRange(currentRange);
  const links = await fetchChart('sankey', `/chart/sankey?start=${r.start}&end=${r.end}`,
    body => body.links, () => localSankeyLinks(expensesInRange(r.start, r.end)));
  if (links && activeSection === 'analytics') renderSankeyChart('sankeyChartAnalytics', links);
}

function renderCategoryBreakdown(catData, containerId = 'categoryBreakdown', limit = Infinity) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const total = Object.values(catData).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(catData).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (!sorted.length) {
    container.innerHTML = '<p class="muted small">No expenses in this period.</p>';
    return;
  }
  container.innerHTML = sorted.map(([cat, amt]) => {
    const pct = total ? (amt / total) * 100 : 0;
    const meta = getCatMeta(cat);
    return `<div class="cat-row">
        <span class="cat-row-icon" style="--chip:${meta.color}"><i data-lucide="${meta.icon}"></i></span>
        <div class="cat-row-main">
          <div class="cat-row-top">
            <span class="cat-row-label">${escapeHtml(cat)}</span>
            <span class="cat-row-amount num">${formatINRShort(amt)} <span class="muted">${pct.toFixed(0)}%</span></span>
          </div>
          <div class="cat-row-bar-track"><div class="cat-row-bar-fill" style="width:${pct.toFixed(1)}%; background:${meta.color};"></div></div>
        </div>
      </div>`;
  }).join('');
  refreshIcons();
}

function renderAnalyticsCharts() {
  const r = computeRange(currentRange);
  const inRange = expensesInRange(r.start, r.end);
  const catData = buildCatData(inRange);

  document.getElementById('rangeLabelCat').textContent = r.label;
  document.getElementById('rangeLabelWeekday').textContent = r.label;
  setHidden('barBudgetLegend', !(monthlyBudget > 0));

  renderPieChart('pieChartAnalytics', catData);
  renderCategoryBreakdown(catData);
  renderBarChart('barChartAnalytics', buildMonthData(allExpenses), monthlyBudget);
  renderWeekdayChart('weekdayChart', buildWeekdayData(inRange));
  renderSankey();
}

// Only draw charts that are on screen: Chart.js measures its container,
// and a container inside a display:none section has zero size.
function renderVisibleCharts() {
  if (!allExpenses || !document.body.classList.contains('signed-in')) return;
  if (activeSection === 'dashboard' || activeSection === 'analytics') renderTrendCharts();
  if (activeSection === 'analytics') renderAnalyticsCharts();
}

function applyDateRange(range) {
  currentRange = range;
  document.querySelectorAll('.date-pill').forEach(btn => {
    const on = btn.dataset.range === range;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  renderVisibleCharts();
}

// ── CSV Export ──────────────────────────────────────────────
function toCsvValue(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function exportCsv() {
  try {
    const res = await apiFetch('/expenses');
    if (!res.ok) throw new Error(await errorText(res));
    const data = await res.json();
    const items = (Array.isArray(data) ? data : data.items || []).sort(byDateDesc);
    if (!items.length) { showToast('Nothing to export yet.', 'info'); return; }

    const headers = ['description', 'amount', 'category', 'date'];
    const rows = [headers.join(',')];
    for (const e of items) {
      rows.push(headers.map(h => toCsvValue(e[h] ?? (h === 'description' ? e.title : ''))).join(','));
    }
    // BOM so Excel opens the ₹/UTF-8 text correctly
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${items.length} expenses.`, 'success');
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  }
}

// ── CSV Import ──────────────────────────────────────────────
// Splits CSV text into rows, honouring quoted fields that contain
// commas, escaped quotes ("") or line breaks.
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim().length));
}

function matchCategory(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'General';
  return [...CATEGORIES, 'General'].find(c => c.toLowerCase() === s.toLowerCase()) || s.slice(0, 50);
}

async function importCsv(file) {
  const status = document.getElementById('status');
  try {
    const text = (await file.text()).replace(/^﻿/, '');
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('CSV has no data rows');

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const descIdx = headers.indexOf('description');
    const amountIdx = headers.indexOf('amount');
    const categoryIdx = headers.indexOf('category');
    const dateIdx = headers.indexOf('date');
    if (descIdx === -1 || amountIdx === -1) {
      throw new Error('CSV must have "description" and "amount" columns');
    }

    let success = 0, failed = 0;
    const errors = [];
    const total = rows.length - 1;

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].map(c => c.trim());
      const description = cols[descIdx] || '';
      const amountStr = (cols[amountIdx] || '').replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
      const amount = parseFloat(amountStr);
      const date = dateIdx === -1 ? todayISO() : normalizeDate(cols[dateIdx]);

      if (!description || !Number.isFinite(amount) || amount <= 0) {
        failed++;
        errors.push(`Row ${i + 1}: invalid description or amount`);
        continue;
      }
      if (date === null) {
        failed++;
        errors.push(`Row ${i + 1}: unrecognised date "${cols[dateIdx]}" (use YYYY-MM-DD or DD/MM/YYYY)`);
        continue;
      }

      status.textContent = `Importing ${i} of ${total}…`;
      try {
        const res = await apiFetch('/expenses', {
          method: 'POST',
          body: JSON.stringify({
            description,
            amount,
            category: matchCategory(categoryIdx === -1 ? '' : cols[categoryIdx]),
            date: date || todayISO(),
          }),
        });
        if (!res.ok) throw new Error(await errorText(res));
        success++;
      } catch (err) {
        failed++;
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    status.textContent = '';
    if (errors.length) {
      console.warn('Import errors:', errors);
      showToast(`Imported ${success}, skipped ${failed}. ${errors[0]}${errors.length > 1 ? ' (more in console)' : ''}`, success ? 'info' : 'error');
    } else {
      showToast(`Imported ${success} expenses.`, 'success');
    }
    await loadExpenses();
  } catch (err) {
    status.textContent = '';
    showToast('Import failed: ' + err.message, 'error');
  }
}

// ── Auth UI state ──────────────────────────────────────────
function setSignedIn(signedIn, email) {
  document.body.classList.toggle('signed-in', signedIn);
  setHidden('signedOut', signedIn);
  setHidden('signedIn', !signedIn);
  setHidden('analyticsSignedOut', signedIn);
  setHidden('analyticsSignedIn', !signedIn);
  setHidden('historySignedOut', signedIn);
  setHidden('historySignedIn', !signedIn);
  setHidden('userChip', !signedIn);
  document.querySelectorAll('.auth-only').forEach(el => setHidden(el, !signedIn));
  document.getElementById('sidebarUserName').textContent = signedIn ? (email || 'User') : '—';
  document.getElementById('userAvatar').textContent = (email || 'U').charAt(0).toUpperCase();
}

function setGreeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = part;
  document.getElementById('todayLabel').textContent =
    new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── Event wiring ────────────────────────────────────────────
function handleGlobalClick(ev) {
  const el = ev.target.closest('[data-action], [data-section]');
  if (!el) return;

  if (el.dataset.section && !el.dataset.action) {
    ev.preventDefault();
    showSection(el.dataset.section);
    return;
  }

  const id = el.dataset.id;
  switch (el.dataset.action) {
    case 'open-panel': openAddPanel(); break;
    case 'close-panel': closeAddPanel(); break;
    case 'export-csv': exportCsv(); break;
    case 'toggle-theme': toggleTheme(); break;
    case 'login': Auth.login(); break;
    case 'edit': openEditModal(id); break;
    case 'delete': confirmDelete(id); break;
    case 'receipt': openReceipt(id); break;
    default: return;
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setGreeting();
  populateCategorySelects();
  document.querySelectorAll('.cat-picker').forEach(buildCategoryPicker);
  refreshIcons();

  document.addEventListener('click', handleGlobalClick);

  // Modals
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => { closeModal('deleteModal'); deletingId = null; });
  document.getElementById('confirmDeleteBtn').addEventListener('click', performDelete);
  document.getElementById('cancelEditBtn').addEventListener('click', () => closeModal('editModal'));
  document.getElementById('editForm').addEventListener('submit', updateExpense);
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) closeModal(overlay.id); });
  });

  // Add form
  document.getElementById('addForm').addEventListener('submit', submitExpense);
  document.getElementById('receipt').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    document.getElementById('receiptName').textContent = f ? f.name : 'Attach a receipt';
  });

  // Escape closes whatever is open
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    closeModal('editModal');
    closeModal('deleteModal');
    closeAddPanel();
    closeSidebar();
  });

  // Budget
  document.getElementById('editBudgetBtn').addEventListener('click', () => toggleBudgetForm(true));
  document.getElementById('cancelBudgetBtn').addEventListener('click', () => toggleBudgetForm(false));
  document.getElementById('budgetForm').addEventListener('submit', saveBudget);

  // Import
  document.getElementById('importInput').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    await importCsv(file);
    ev.target.value = '';
  });
  document.querySelector('label.qa-btn').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); document.getElementById('importInput').click(); }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => Auth.logout());

  // Sidebar (mobile)
  document.getElementById('hamburgerBtn').addEventListener('click', toggleSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

  // Date range pills (dashboard + analytics stay in sync)
  document.querySelectorAll('.date-pill').forEach(btn => {
    btn.addEventListener('click', () => applyDateRange(btn.dataset.range));
  });

  // Filters
  document.getElementById('searchInput').addEventListener('input', debounce(applyFilters, 150));
  ['filterCategory', 'filterDateRange', 'sortBy'].forEach(id =>
    document.getElementById(id).addEventListener('change', applyFilters));
  document.getElementById('historySearch').addEventListener('input', debounce(renderHistoryList, 150));
  document.getElementById('historyCategory').addEventListener('change', renderHistoryList);

  // Auth
  try {
    const signedIn = await Auth.init();
    if (signedIn) {
      setSignedIn(true, Auth.getUserEmail());
      updateBudgetCard();
      await Promise.all([loadExpenses(), loadSettings()]);
    } else {
      setSignedIn(false);
    }
  } catch (err) {
    setSignedIn(false);
    console.error('Auth init error:', err);
  }
});

// Globals kept for backwards compatibility with any inline handlers
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
window.getCatMeta = getCatMeta;
