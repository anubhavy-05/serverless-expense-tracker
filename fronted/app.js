// ════════════════════════════════════════════════════════════
// API CONFIG — replace with your actual API Gateway URL
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

// Category → emoji + CSS class mapping
const CAT_META = {
    Food:          { icon: '🍕', cls: 'cat-food',          badgeCls: 'badge-food',          color: '#ff6b6b' },
    Transport:     { icon: '🚖', cls: 'cat-transport',     badgeCls: 'badge-transport',     color: '#4ecdc4' },
    Shopping:      { icon: '🛒', cls: 'cat-shopping',      badgeCls: 'badge-shopping',      color: '#f7b731' },
    Rent:          { icon: '🏠', cls: 'cat-rent',          badgeCls: 'badge-rent',          color: '#45b7d1' },
    Entertainment: { icon: '🎬', cls: 'cat-entertainment', badgeCls: 'badge-entertainment', color: '#a29bfe' },
    Bills:         { icon: '💡', cls: 'cat-bills',         badgeCls: 'badge-bills',         color: '#fd9644' },
    Health:        { icon: '🏥', cls: 'cat-health',        badgeCls: 'badge-health',        color: '#26de81' },
    Other:         { icon: '📦', cls: 'cat-other',         badgeCls: 'badge-other',         color: '#778ca3' },
    General:       { icon: '💼', cls: 'cat-general',       badgeCls: '',                    color: '#6c757d' },
};

function getCatMeta(cat) { return CAT_META[cat] || CAT_META['General']; }

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════
window.onload = () => {
    loadDarkModePreference();
    setupModals();
    loadExpenses();
};

// ══ MOBILE SIDEBAR DRAWER ══════════════════════════════════
function toggleSidebar() {
    const sidebar  = document.querySelector('.sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    const isOpen   = sidebar.classList.toggle('open');
    overlay.classList.toggle('active', isOpen);
    document.getElementById('hamburgerBtn').textContent = isOpen ? '✕' : '☰';
    // Prevent body scroll when sidebar open on mobile
    document.body.style.overflow = isOpen ? 'hidden' : '';
}

function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    const btn = document.getElementById('hamburgerBtn');
    if (btn) btn.textContent = '☰';
    document.body.style.overflow = '';
}

// ══ Close sidebar on nav link click (mobile) ══
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) closeSidebar();
        });
    });
});

function toggleDarkMode() {
    const html   = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');

    // Sidebar toggle labels
    document.getElementById('themeIcon').textContent  = isDark ? '🌙' : '☀️';
    document.getElementById('themeLabel').textContent = isDark ? 'Dark Mode' : 'Light Mode';

    // Mobile topbar toggle (synced)
    const mIcon  = document.getElementById('mobileThemeIcon');
    const mLabel = document.getElementById('mobileThemeLabel');
    if (mIcon)  mIcon.textContent  = isDark ? '🌙' : '☀️';
    if (mLabel) mLabel.textContent = isDark ? 'Dark' : 'Light';

    localStorage.setItem('theme', isDark ? 'light' : 'dark');
    if (allExpenses.length) renderCharts(allExpenses);
}

function loadDarkModePreference() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);

    // Sidebar
    document.getElementById('themeIcon').textContent  = saved === 'dark' ? '☀️' : '🌙';
    document.getElementById('themeLabel').textContent = saved === 'dark' ? 'Light Mode' : 'Dark Mode';

    // Mobile
    const mIcon  = document.getElementById('mobileThemeIcon');
    const mLabel = document.getElementById('mobileThemeLabel');
    if (mIcon)  mIcon.textContent  = saved === 'dark' ? '☀️' : '🌙';
    if (mLabel) mLabel.textContent = saved === 'dark' ? 'Light' : 'Dark';
}

// ════════════════════════════════════════════════════════════
// SECTION NAVIGATION
// ════════════════════════════════════════════════════════════
function showSection(name, linkEl) {
    // hide all sections
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    document.getElementById(`section-${name}`).classList.add('active');
    linkEl.classList.add('active');
    activeSection = name;

    // populate history list on switch
    if (name === 'history') renderHistoryList(allExpenses);
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

    const fmt = v => `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    document.getElementById('totalSpent').textContent  = fmt(total);
    document.getElementById('thisMonth').textContent   = fmt(monthTotal);
    document.getElementById('totalItems').textContent  = expenses.length;
    document.getElementById('avgAmount').textContent   = fmt(avg);

    // Sidebar wallet balance = total spent
    document.getElementById('sidebarBalance').textContent = fmt(total);
    const wc = document.getElementById('walletChange');
    wc.className = 'wallet-change ' + (monthTotal > 0 ? 'positive' : 'neutral');
    wc.innerHTML = `<span class="change-dot"></span> ₹${monthTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} this month`;
}

// ════════════════════════════════════════════════════════════
// CHARTS
// ════════════════════════════════════════════════════════════
function chartTextColor() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? '#a8b3cc' : '#475569';
}
function chartGridColor() {
    return document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
}

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

    // Find top category for donut center
    const topCat = Object.entries(catData).sort((a,b)=>b[1]-a[1])[0];
    const topPct = topCat && expenses.length
        ? Math.round((topCat[1] / Object.values(catData).reduce((a,b)=>a+b,0)) * 100)
        : 0;

    // ── Pie (dashboard) ──
    if (pieChart1) pieChart1.destroy();
    const pieCtx = document.getElementById('pieChart');
    if (pieCtx) {
        pieChart1 = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(catData),
                datasets: [{
                    data: Object.values(catData),
                    backgroundColor: Object.keys(catData).map(k => CAT_COLORS[k] || '#6c757d'),
                    borderWidth: 3,
                    borderColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#111827' : '#fff',
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
                    tooltip: {
                        callbacks: { label: c => ` ₹${c.parsed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
                    },
                },
            },
        });
        document.getElementById('donutPct').textContent = `${topPct}%`;
    }

    // ── Bar (dashboard) ──
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
                    backgroundColor: 'rgba(124,58,237,0.7)',
                    borderRadius: 7,
                    borderSkipped: false,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: c => ` ₹${c.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` } },
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
                    backgroundColor: Object.keys(catData).map(k => CAT_COLORS[k] || '#6c757d'),
                    borderWidth: 3,
                    borderColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#111827' : '#fff',
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '68%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: tColor, font: { family: 'Inter', size: 11 }, padding: 10, boxWidth: 10 } },
                    tooltip: { callbacks: { label: c => ` ₹${c.parsed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` } },
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
                    backgroundColor: Object.keys(monthData).map((_, i) => `hsl(${240 + i*15},70%,60%)`),
                    borderRadius: 7, borderSkipped: false,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ₹${c.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` } } },
                scales: {
                    x: { ticks: { color: tColor, font: { family: 'Inter', size: 11 } }, grid: { color: gColor } },
                    y: { ticks: { color: tColor, font: { family: 'Inter', size: 11 }, callback: v => `₹${v.toLocaleString('en-IN')}` }, grid: { color: gColor }, beginAtZero: true },
                },
            },
        });
    }

    // Horizontal progress bars per category
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
                <span class="cat-row-label">${meta.icon} ${cat}</span>
                <div class="cat-row-bar-track">
                    <div class="cat-row-bar-fill" style="width:${pct.toFixed(1)}%; background:${meta.color};"></div>
                </div>
                <span class="cat-row-amount">₹${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>`;
            breakdown.appendChild(row);
        });
    }
}

// Chart tab switch (Income / Outcome placeholder)
function switchChartTab(btn, type) {
    document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    // For now both tabs show same data (no income API); extend later
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
        if (search && !e.description.toLowerCase().includes(search)) return false;
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
// RENDER LIST (Dashboard)
// ════════════════════════════════════════════════════════════
function buildExpenseItemHTML(exp) {
    const meta     = getCatMeta(exp.category || 'General');
    const dateStr  = exp.date
        ? new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—';
    const amt      = `₹${parseFloat(exp.amount).toFixed(2)}`;
    const badgeCls = meta.badgeCls;

    return `
        <div class="expense-cat-icon ${meta.cls}">${meta.icon}</div>
        <div class="expense-details">
            <span class="expense-desc-text">${exp.description}</span>
            <div class="expense-meta">
                <span class="expense-cat-badge ${badgeCls}">${exp.category || 'General'}</span>
                <span class="expense-date-text">${dateStr}</span>
            </div>
        </div>
        <span class="expense-amount-text">${amt}</span>
        <div class="expense-item-actions">
            <button class="icon-btn icon-btn--edit"   onclick="openEditModal('${exp.expenseId}')" title="Edit">✏️</button>
            <button class="icon-btn icon-btn--delete" onclick="confirmDelete('${exp.expenseId}')" title="Delete">🗑</button>
        </div>`;
}

function renderList(expenses) {
    const ul = document.getElementById('expenseList');
    if (!ul) return;
    if (!expenses.length) {
        ul.innerHTML = `<li><div class="empty-state"><span class="empty-icon">🌸</span><p>No expenses yet!</p><small>Hit "Add Expense" to get started.</small></div></li>`;
        return;
    }
    ul.innerHTML = '';
    expenses.forEach((exp, i) => {
        const li = document.createElement('li');
        li.className = 'expense-item';
        li.style.animationDelay = `${i * 35}ms`;
        li.innerHTML = buildExpenseItemHTML(exp);
        ul.appendChild(li);
    });
}

function renderHistoryList(expenses) {
    const ul = document.getElementById('historyList');
    if (!ul) return;
    if (!expenses.length) {
        ul.innerHTML = `<li><div class="empty-state"><span class="empty-icon">📭</span><p>No history yet!</p><small>Your expenses will appear here.</small></div></li>`;
        return;
    }
    ul.innerHTML = '';
    const sorted = [...expenses].sort((a,b) => new Date(b.date||0) - new Date(a.date||0));
    sorted.forEach((exp, i) => {
        const li = document.createElement('li');
        li.className = 'expense-item';
        li.style.animationDelay = `${i * 35}ms`;
        li.innerHTML = buildExpenseItemHTML(exp);
        ul.appendChild(li);
    });
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
        showToast('Description and Amount are required.', 'error');
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
        showToast('Expense added! 🎉', 'success');
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

    if (!desc || !amount) { showToast('Description and Amount are required.', 'error'); return; }

    try {
        const res = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: desc, amount: parseFloat(amount), category, date }),
        });
        if (!res.ok) throw new Error();
        closeModal('editModal');
        editingId = null;
        showToast('Expense updated! ✅', 'success');
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
    // Animate out
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

    const headers = ['Description', 'Amount (₹)', 'Category', 'Date'];
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
    showToast('CSV downloaded! 📄', 'success');
}
