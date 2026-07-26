// ════════════════════════════════════════════════════════════
// API CONFIG
// ════════════════════════════════════════════════════════════
const API_URL = 'https://757w5cziii.execute-api.us-east-1.amazonaws.com/prod/expenses';

// ── State ────────────────────────────────────────────────────
let allExpenses    = [];
let editingId      = null;
let deletingId     = null;
let pieChart1      = null;
let barChart1      = null;
let pieChart2      = null;
let barChart2      = null;
let activeSection  = 'dashboard';

// Category → Lucide icon name + color token
// (color kept in sync with --cat-* tokens in style.css)
const CAT_META = {
    Food:          { icon: 'utensils',    color: '#f87171' },
    Transport:     { icon: 'car',         color: '#22d3ee' },
    Shopping:      { icon: 'shopping-bag',color: '#eab308' },
    Rent:          { icon: 'home',        color: '#38bdf8' },
    Entertainment: { icon: 'film',        color: '#a78bfa' },
    Bills:         { icon: 'zap',         color: '#fb923c' },
    Health:        { icon: 'heart-pulse', color: '#34d399' },
    Other:         { icon: 'package',     color: '#94a3b8' },
    General:       { icon: 'circle',      color: '#64748b' },
};

function getCatMeta(cat) { return CAT_META[cat] || CAT_META['General']; }

// Refresh all Lucide icons (call after any innerHTML injection)
function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// Format currency once, reuse
const fmtCurrency = v =>
    `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
    refreshIcons();
    loadDarkModePreference();
    setupModals();
    loadExpenses();

    // Close sidebar on nav link click (mobile)
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) closeSidebar();
        });
    });
});

// ══ MOBILE SIDEBAR DRAWER ══════════════════════════════════
function toggleSidebar() {
    const sidebar  = document.querySelector('.sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    const isOpen   = sidebar.classList.toggle('open');
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

// ══ THEME ══════════════════════════════════════════════════
function applyThemeUI(theme) {
    // Sidebar toggle: shows the OPPOSITE of the current theme
    const nextIsDark = theme === 'light'; // clicking will go to dark
    const iconName   = nextIsDark ? 'moon' : 'sun';
    const label      = nextIsDark ? 'Dark mode' : 'Light mode';

    const themeIcon  = document.getElementById('themeIcon');
    const themeLabel = document.getElementById('themeLabel');
    if (themeIcon)  themeIcon.outerHTML = `<i id="themeIcon" data-lucide="${iconName}"></i>`;
    if (themeLabel) themeLabel.textContent = label;

    const mIcon  = document.getElementById('mobileThemeIcon');
    const mLabel = document.getElementById('mobileThemeLabel');
    if (mIcon)  mIcon.outerHTML  = `<i id="mobileThemeIcon" data-lucide="${iconName}"></i>`;
    if (mLabel) mLabel.textContent = nextIsDark ? 'Dark' : 'Light';

    refreshIcons();
}

function toggleDarkMode() {
    const html    = document.documentElement;
    const isDark  = html.getAttribute('data-theme') === 'dark';
    const next    = isDark ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    applyThemeUI(next);
    if (allExpenses.length) renderCharts(allExpenses);
}

function loadDarkModePreference() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    applyThemeUI(saved);
}

// ════════════════════════════════════════════════════════════
// SECTION NAVIGATION
// ════════════════════════════════════════════════════════════
function showSection(name, linkEl) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    document.getElementById(`section-${name}`).classList.add('active');
    linkEl.classList.add('active');
    activeSection = name;

    if (name === 'history')   renderHistoryList(allExpenses);
    if (name === 'analytics') renderAnalyticsCharts(allExpenses);
    return false;
}

// ════════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════════
function showToast(msg, type = 'info') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3200);
}

// ════════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════════
function setupModals() {
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
        closeModal('deleteModal'); deletingId = null;
    });
    document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
        if (!deletingId) return;
        closeModal('deleteModal');
        await performDelete(deletingId);
        deletingId = null;
    });
    document.getElementById('cancelEditBtn').addEventListener('click', () => {
        closeModal('editModal'); editingId = null;
    });
    document.getElementById('confirmEditBtn').addEventListener('click', updateExpense);
}

function openModal(id)  { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ════════════════════════════════════════════════════════════
// ADD EXPENSE SIDE PANEL
// ════════════════════════════════════════════════════════════
function openAddPanel() {
    document.getElementById('addPanel').classList.add('open');
    document.getElementById('panelOverlay').classList.add('active');
}
function closeAddPanel() {
    document.getElementById('addPanel').classList.remove('open');
    document.getElementById('panelOverlay').classList.remove('active');
}

// ════════════════════════════════════════════════════════════
// LOAD EXPENSES
// ════════════════════════════════════════════════════════════
async function loadExpenses() {
    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error();
        allExpenses = await res.json();
        updateSummary(allExpenses);
        renderCharts(allExpenses);
        renderList(allExpenses);
    } catch {
        showToast('Failed to load expenses. Check your API URL.', 'error');
    }
}

// ════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════
function updateSummary(expenses) {
    const total = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    const now   = new Date();
    const monthTotal = expenses
        .filter(e => {
            if (!e.date) return false;
            const d = new Date(e.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        })
        .reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    const avg = expenses.length ? total / expenses.length : 0;

    document.getElementById('totalSpent').textContent = fmtCurrency(total);
    document.getElementById('thisMonth').textContent  = fmtCurrency(monthTotal);
    document.getElementById('totalItems').textContent = expenses.length;
    document.getElementById('avgAmount').textContent  = fmtCurrency(avg);

    document.getElementById('sidebarBalance').textContent = fmtCurrency(total);
    const wc = document.getElementById('walletChange');
    wc.className = 'wallet-change ' + (monthTotal > 0 ? 'positive' : 'neutral');
    wc.innerHTML = `<span class="change-dot"></span> ${fmtCurrency(monthTotal)} this month`;
}

// ════════════════════════════════════════════════════════════
// CHARTS
// ════════════════════════════════════════════════════════════
function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function chartTextColor() { return cssVar('--text-2') || '#94a3b8'; }
function chartGridColor() {
    return document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.06)';
}
function chartBorderColor() { return cssVar('--surface-2'); }
function chartAccent()      { return cssVar('--accent') || '#6366f1'; }

const CAT_COLORS = Object.fromEntries(Object.entries(CAT_META).map(([k, v]) => [k, v.color]));

function buildCatData(expenses) {
    const map = {};
    expenses.forEach(e => {
        const c = e.category || 'General';
        map[c] = (map[c] || 0) + parseFloat(e.amount || 0);
    });
    return map;
}

function buildMonthData(expenses) {
    const now    = new Date();
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

function renderCharts(expenses) {
    const catData   = buildCatData(expenses);
    const monthData = buildMonthData(expenses);
    const tColor    = chartTextColor();
    const gColor    = chartGridColor();
    const bColor    = chartBorderColor();

    const topCat = Object.entries(catData).sort((a,b)=>b[1]-a[1])[0];
    const topPct = topCat && expenses.length
        ? Math.round((topCat[1] / Object.values(catData).reduce((a,b)=>a+b,0)) * 100)
        : 0;

    if (pieChart1) pieChart1.destroy();
    const pieCtx = document.getElementById('pieChart');
    if (pieCtx) {
        pieChart1 = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(catData),
                datasets: [{
                    data: Object.values(catData),
                    backgroundColor: Object.keys(catData).map(k => CAT_COLORS[k] || '#64748b'),
                    borderWidth: 3,
                    borderColor: bColor,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: tColor, font: { family: 'Inter', size: 11 }, padding: 10, boxWidth: 10 },
                    },
                    tooltip: { callbacks: { label: c => ` ${fmtCurrency(c.parsed)}` } },
                },
            },
        });
        document.getElementById('donutPct').textContent = `${topPct}%`;
    }

    if (barChart1) barChart1.destroy();
    const barCtx = document.getElementById('barChart');
    if (barCtx) {
        barChart1 = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(monthData),
                datasets: [{
                    label: 'Spent (₹)',
                    data: Object.values(monthData),
                    backgroundColor: chartAccent(),
                    borderRadius: 6,
                    borderSkipped: false,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: c => ` ${fmtCurrency(c.parsed.y)}` } },
                },
                scales: {
                    x: { ticks: { color: tColor, font: { family: 'Inter', size: 11 } }, grid: { color: gColor } },
                    y: {
                        ticks: { color: tColor, font: { family: 'Inter', size: 11 }, callback: v => `₹${v.toLocaleString('en-IN')}` },
                        grid: { color: gColor },
                        beginAtZero: true,
                    },
                },
            },
        });
    }
}

function renderAnalyticsCharts(expenses) {
    const catData   = buildCatData(expenses);
    const monthData = buildMonthData(expenses);
    const tColor    = chartTextColor();
    const gColor    = chartGridColor();
    const bColor    = chartBorderColor();
    const accent    = chartAccent();
    const totalAmt  = Object.values(catData).reduce((a,b)=>a+b,0);
    const topPct2   = totalAmt
        ? Math.round((Math.max(...Object.values(catData)) / totalAmt) * 100)
        : 0;

    if (pieChart2) pieChart2.destroy();
    const pc2 = document.getElementById('pieChart2');
    if (pc2) {
        pieChart2 = new Chart(pc2, {
            type: 'doughnut',
            data: {
                labels: Object.keys(catData),
                datasets: [{
                    data: Object.values(catData),
                    backgroundColor: Object.keys(catData).map(k => CAT_COLORS[k] || '#64748b'),
                    borderWidth: 3,
                    borderColor: bColor,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '68%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: tColor, font: { family: 'Inter', size: 11 }, padding: 10, boxWidth: 10 } },
                    tooltip: { callbacks: { label: c => ` ${fmtCurrency(c.parsed)}` } },
                },
            },
        });
        document.getElementById('donutPct2').textContent = `${topPct2}%`;
    }

    if (barChart2) barChart2.destroy();
    const bc2 = document.getElementById('barChart2');
    if (bc2) {
        barChart2 = new Chart(bc2, {
            type: 'bar',
            data: {
                labels: Object.keys(monthData),
                datasets: [{
                    label: 'Spent (₹)',
                    data: Object.values(monthData),
                    backgroundColor: accent,
                    borderRadius: 6, borderSkipped: false,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmtCurrency(c.parsed.y)}` } } },
                scales: {
                    x: { ticks: { color: tColor, font: { family: 'Inter', size: 11 } }, grid: { color: gColor } },
                    y: { ticks: { color: tColor, font: { family: 'Inter', size: 11 }, callback: v => `₹${v.toLocaleString('en-IN')}` }, grid: { color: gColor }, beginAtZero: true },
                },
            },
        });
    }

    // Category breakdown bars
    const breakdown = document.getElementById('categoryBreakdown');
    if (breakdown) {
        breakdown.innerHTML = '';
        const sorted = Object.entries(catData).sort((a,b) => b[1]-a[1]);
        sorted.forEach(([cat, amt]) => {
            const pct  = totalAmt ? (amt / totalAmt) * 100 : 0;
            const meta = getCatMeta(cat);
            const row  = document.createElement('div');
            row.className = 'cat-row';
            row.innerHTML = `
                <span class="cat-row-label">
                    <i data-lucide="${meta.icon}" style="color:${meta.color}"></i>
                    ${cat}
                </span>
                <div class="cat-row-bar-track">
                    <div class="cat-row-bar-fill" style="width:${pct.toFixed(1)}%; background:${meta.color};"></div>
                </div>
                <span class="cat-row-amount num">${fmtCurrency(amt)}</span>`;
            breakdown.appendChild(row);
        });
        refreshIcons();
    }
}

function switchChartTab(btn) {
    document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderCharts(allExpenses);
}

// ════════════════════════════════════════════════════════════
// FILTER & SORT
// ════════════════════════════════════════════════════════════
function applyFilters() {
    const search    = document.getElementById('searchInput').value.trim().toLowerCase();
    const cat       = document.getElementById('filterCategory').value;
    const dateRange = document.getElementById('filterDateRange').value;
    const sortBy    = document.getElementById('sortBy').value;
    const now       = new Date();

    let list = allExpenses.filter(e => {
        if (search && !(e.description || '').toLowerCase().includes(search)) return false;
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
        if (sortBy === 'date_desc')   return new Date(b.date||0) - new Date(a.date||0);
        if (sortBy === 'date_asc')    return new Date(a.date||0) - new Date(b.date||0);
        if (sortBy === 'amount_desc') return parseFloat(b.amount) - parseFloat(a.amount);
        if (sortBy === 'amount_asc')  return parseFloat(a.amount) - parseFloat(b.amount);
        return 0;
    });

    renderList(list);
}

// ════════════════════════════════════════════════════════════
// RENDER LIST
// ════════════════════════════════════════════════════════════
function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    }[m]));
}

function buildExpenseItemHTML(exp) {
    const meta    = getCatMeta(exp.category || 'General');
    const dateStr = exp.date
        ? new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—';
    const amt     = fmtCurrency(exp.amount);
    const cat     = escapeHtml(exp.category || 'General');
    const desc    = escapeHtml(exp.description);
    const id      = escapeHtml(exp.expenseId);

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
            <button class="icon-btn icon-btn--edit"   onclick="openEditModal('${id}')" aria-label="Edit expense">
                <i data-lucide="pencil"></i>
            </button>
            <button class="icon-btn icon-btn--delete" onclick="confirmDelete('${id}')" aria-label="Delete expense">
                <i data-lucide="trash-2"></i>
            </button>
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
    expenses.forEach((exp, i) => {
        const li = document.createElement('li');
        li.className = 'expense-item';
        li.style.animationDelay = `${i * 30}ms`;
        li.innerHTML = buildExpenseItemHTML(exp);
        ul.appendChild(li);
    });
    refreshIcons();
}

function renderHistoryList(expenses) {
    const ul = document.getElementById('historyList');
    if (!ul) return;
    if (!expenses.length) {
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
    const sorted = [...expenses].sort((a,b) => new Date(b.date||0) - new Date(a.date||0));
    sorted.forEach((exp, i) => {
        const li = document.createElement('li');
        li.className = 'expense-item';
        li.style.animationDelay = `${i * 30}ms`;
        li.innerHTML = buildExpenseItemHTML(exp);
        ul.appendChild(li);
    });
    refreshIcons();
}

// ════════════════════════════════════════════════════════════
// ADD EXPENSE
// ════════════════════════════════════════════════════════════
async function submitExpense() {
    const desc     = document.getElementById('desc').value.trim();
    const amount   = document.getElementById('amount').value;
    const category = document.getElementById('category').value;
    const date     = document.getElementById('date').value;

    if (!desc || !amount) {
        showToast('Description and amount are required.', 'error');
        return;
    }

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: desc, amount: parseFloat(amount), category, date }),
        });
        if (!res.ok) throw new Error();

        ['desc','amount','date'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('category').value = '';
        closeAddPanel();
        showToast('Expense added.', 'success');
        await loadExpenses();
    } catch {
        showToast('Failed to add expense.', 'error');
    }
}

// ════════════════════════════════════════════════════════════
// EDIT EXPENSE
// ════════════════════════════════════════════════════════════
function openEditModal(id) {
    const exp = allExpenses.find(e => e.expenseId === id);
    if (!exp) return;
    editingId = id;
    document.getElementById('editExpenseId').value  = id;
    document.getElementById('editDesc').value       = exp.description || '';
    document.getElementById('editAmount').value     = exp.amount      || '';
    document.getElementById('editCategory').value   = exp.category    || '';
    document.getElementById('editDate').value       = exp.date        || '';
    openModal('editModal');
}

async function updateExpense() {
    const id       = document.getElementById('editExpenseId').value;
    const desc     = document.getElementById('editDesc').value.trim();
    const amount   = document.getElementById('editAmount').value;
    const category = document.getElementById('editCategory').value;
    const date     = document.getElementById('editDate').value;

    if (!desc || !amount) { showToast('Description and amount are required.', 'error'); return; }

    try {
        const res = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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

// ════════════════════════════════════════════════════════════
// DELETE EXPENSE
// ════════════════════════════════════════════════════════════
function confirmDelete(id) {
    deletingId = id;
    openModal('deleteModal');
}

async function performDelete(id) {
    const items = document.querySelectorAll('.expense-item');
    items.forEach(el => { if (el.innerHTML.includes(id)) el.classList.add('deleting'); });
    await new Promise(r => setTimeout(r, 300));

    try {
        const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        showToast('Expense deleted.', 'info');
        await loadExpenses();
    } catch {
        showToast('Failed to delete expense.', 'error');
    }
}

// ════════════════════════════════════════════════════════════
// EXPORT CSV
// ════════════════════════════════════════════════════════════
function exportCSV() {
    if (!allExpenses.length) { showToast('No expenses to export.', 'info'); return; }

    const headers = ['Description', 'Amount (INR)', 'Category', 'Date'];
    const rows    = allExpenses.map(e => [
        `"${(e.description || '').replace(/"/g,'""')}"`,
        parseFloat(e.amount || 0).toFixed(2),
        e.category || 'General',
        e.date
            ? new Date(e.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
            : '',
    ]);

    const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `expenses_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV downloaded.', 'success');
}
