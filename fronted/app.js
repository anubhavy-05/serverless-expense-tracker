// 🔴 REPLACE THIS WITH YOUR ACTUAL API GATEWAY URL
const API_URL = 'https://757w5cziii.execute-api.us-east-1.amazonaws.com/prod/expenses';

// ── State ──────────────────────────────────────────────────────────────────
let allExpenses = [];   // master list from API
let editingId   = null; // id of expense being edited
let deletingId  = null; // id of expense pending delete confirmation

// Chart instances (kept to allow destroy/re-draw)
let pieChartInstance = null;
let barChartInstance = null;

// ── Init ───────────────────────────────────────────────────────────────────
window.onload = () => {
    loadDarkModePreference(); // 13. restore saved theme
    loadExpenses();
    setupModals();
};

// ══════════════════════════════════════════════════════════════════════════
// 13. Dark Mode Toggle
// ══════════════════════════════════════════════════════════════════════════
function toggleDarkMode() {
    const html = document.documentElement;
    const btn  = document.getElementById('darkToggleBtn');
    const isDark = html.getAttribute('data-theme') === 'dark';

    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    btn.textContent = isDark ? '🌙' : '☀️';
    localStorage.setItem('theme', isDark ? 'light' : 'dark');

    // Redraw charts so colours match the new theme
    if (allExpenses.length > 0) renderCharts(allExpenses);
}

function loadDarkModePreference() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    document.getElementById('darkToggleBtn').textContent = saved === 'dark' ? '☀️' : '🌙';
}

// ══════════════════════════════════════════════════════════════════════════
// 3. Toast Notification (replaces alert)
// ══════════════════════════════════════════════════════════════════════════
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ══════════════════════════════════════════════════════════════════════════
// 9. Custom Modals
// ══════════════════════════════════════════════════════════════════════════
function setupModals() {
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
        closeModal('deleteModal');
        deletingId = null;
    });

    document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
        if (deletingId) {
            closeModal('deleteModal');
            await performDelete(deletingId);
            deletingId = null;
        }
    });

    document.getElementById('cancelEditBtn').addEventListener('click', () => {
        closeModal('editModal');
        editingId = null;
    });

    document.getElementById('confirmEditBtn').addEventListener('click', updateExpense);
}

function openModal(id)  { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ══════════════════════════════════════════════════════════════════════════
// 📋 Load all expenses from API
// ══════════════════════════════════════════════════════════════════════════
async function loadExpenses() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Failed to fetch expenses');

        allExpenses = await response.json();
        updateSummary(allExpenses);
        renderCharts(allExpenses);   // 14. charts
        renderList(allExpenses);
    } catch (error) {
        console.error('Error loading expenses:', error);
        showToast('Failed to load expenses. Check console for details.', 'error');
    }
}

// ══════════════════════════════════════════════════════════════════════════
// 5. Dashboard Summary
// ══════════════════════════════════════════════════════════════════════════
function updateSummary(expenses) {
    const total = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);

    const now = new Date();
    const thisMonthTotal = expenses
        .filter(e => {
            if (!e.date) return false;
            const d = new Date(e.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        })
        .reduce((s, e) => s + parseFloat(e.amount || 0), 0);

    document.getElementById('totalSpent').textContent = `₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('thisMonth').textContent  = `₹${thisMonthTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('totalItems').textContent = `${expenses.length} expense${expenses.length !== 1 ? 's' : ''}`;
}

// ══════════════════════════════════════════════════════════════════════════
// 14. Expense Charts (Pie by category + Bar by month)
// ══════════════════════════════════════════════════════════════════════════
const CATEGORY_COLORS = {
    Food:          '#ff6b6b',
    Transport:     '#4ecdc4',
    Shopping:      '#f7b731',
    Rent:          '#45b7d1',
    Entertainment: '#a29bfe',
    Bills:         '#fd9644',
    Health:        '#26de81',
    Other:         '#778ca3',
    General:       '#6c757d',
};

function renderCharts(expenses) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#e8eaf0' : '#1a1a2e';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';

    // ── Pie Chart: spending by category ────────────────────────────────────
    const catMap = {};
    expenses.forEach(e => {
        const cat = e.category || 'General';
        catMap[cat] = (catMap[cat] || 0) + parseFloat(e.amount || 0);
    });

    const pieLabels = Object.keys(catMap);
    const pieData   = Object.values(catMap);
    const pieColors = pieLabels.map(l => CATEGORY_COLORS[l] || '#6c757d');

    if (pieChartInstance) pieChartInstance.destroy();
    pieChartInstance = new Chart(document.getElementById('pieChart'), {
        type: 'doughnut',
        data: {
            labels: pieLabels,
            datasets: [{
                data: pieData,
                backgroundColor: pieColors,
                borderWidth: 2,
                borderColor: isDark ? '#1a1a2e' : '#ffffff',
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: textColor, font: { family: 'Inter', size: 11 }, padding: 10 },
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ₹${ctx.parsed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                    },
                },
            },
        },
    });

    // ── Bar Chart: spending by month (last 6 months) ───────────────────────
    const monthMap = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
        monthMap[key] = 0;
    }

    expenses.forEach(e => {
        if (!e.date) return;
        const d   = new Date(e.date);
        const key = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
        if (key in monthMap) monthMap[key] += parseFloat(e.amount || 0);
    });

    if (barChartInstance) barChartInstance.destroy();
    barChartInstance = new Chart(document.getElementById('barChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(monthMap),
            datasets: [{
                label: 'Spent (₹)',
                data: Object.values(monthMap),
                backgroundColor: 'rgba(77, 142, 255, 0.75)',
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
                        label: ctx => ` ₹${ctx.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                    },
                },
            },
            scales: {
                x: {
                    ticks: { color: textColor, font: { family: 'Inter', size: 11 } },
                    grid:  { color: gridColor },
                },
                y: {
                    ticks: {
                        color: textColor,
                        font: { family: 'Inter', size: 11 },
                        callback: v => `₹${v.toLocaleString('en-IN')}`,
                    },
                    grid:  { color: gridColor },
                    beginAtZero: true,
                },
            },
        },
    });
}

// ══════════════════════════════════════════════════════════════════════════
// 11 & 12. Filter, Search, Sort → re-render
// ══════════════════════════════════════════════════════════════════════════
function applyFilters() {
    const search    = document.getElementById('searchInput').value.trim().toLowerCase();
    const catFilter = document.getElementById('filterCategory').value;
    const dateRange = document.getElementById('filterDateRange').value;
    const sortBy    = document.getElementById('sortBy').value;
    const now       = new Date();

    let filtered = allExpenses.filter(exp => {
        if (search && !exp.description.toLowerCase().includes(search)) return false;
        if (catFilter && exp.category !== catFilter) return false;
        if (dateRange !== 'all' && exp.date) {
            const d = new Date(exp.date);
            if (dateRange === 'this_month') {
                if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
            } else if (dateRange === 'last_month') {
                const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                if (d.getMonth() !== lm.getMonth() || d.getFullYear() !== lm.getFullYear()) return false;
            }
        }
        return true;
    });

    filtered.sort((a, b) => {
        if (sortBy === 'date_desc')   return new Date(b.date || 0) - new Date(a.date || 0);
        if (sortBy === 'date_asc')    return new Date(a.date || 0) - new Date(b.date || 0);
        if (sortBy === 'amount_desc') return parseFloat(b.amount) - parseFloat(a.amount);
        if (sortBy === 'amount_asc')  return parseFloat(a.amount) - parseFloat(b.amount);
        return 0;
    });

    renderList(filtered);
}

// ══════════════════════════════════════════════════════════════════════════
// Render expense list (with fade-in animation)
// ══════════════════════════════════════════════════════════════════════════
function renderList(expenses) {
    const list = document.getElementById('expenseList');

    if (expenses.length === 0) {
        list.innerHTML = `
            <li style="list-style:none; border:none !important; background:transparent !important; border-left:none !important;">
                <div class="empty-state">
                    <span class="empty-icon">🌸</span>
                    <p>No expenses yet!</p>
                    <small>Add your first expense above.</small>
                </div>
            </li>`;
        return;
    }

    list.innerHTML = '';
    expenses.forEach((exp, index) => {
        const li = document.createElement('li');

        // 8. Better date display
        const dateStr = exp.date
            ? new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : '';

        // 1. ₹ instead of $
        const amountStr = `₹${parseFloat(exp.amount).toFixed(2)}`;

        // 7. Category badge class
        const catClass = exp.category ? `category-${exp.category.toLowerCase()}` : '';

        // Staggered fade-in delay
        li.style.animationDelay = `${index * 40}ms`;

        li.innerHTML = `
            <div class="expense-info">
                <span class="expense-desc">${exp.description}</span>
                <span class="expense-amount">${amountStr}</span>
                <span class="expense-category ${catClass}">${exp.category || 'General'}</span>
                <span class="expense-date">${dateStr}</span>
            </div>
            <div class="expense-actions">
                <button class="edit-btn"   onclick="openEditModal('${exp.expenseId}')">✏️ Edit</button>
                <button class="delete-btn" onclick="confirmDelete('${exp.expenseId}', this)">✕ Delete</button>
            </div>`;
        list.appendChild(li);
    });
}

// ══════════════════════════════════════════════════════════════════════════
// ➕ Add expense
// ══════════════════════════════════════════════════════════════════════════
async function submitExpense() {
    const desc     = document.getElementById('desc').value.trim();
    const amount   = document.getElementById('amount').value;
    const category = document.getElementById('category').value;
    const date     = document.getElementById('date').value;

    if (!desc || !amount) {
        showToast('Please enter at least a Description and Amount.', 'error');
        return;
    }

    const expense = { description: desc, amount: parseFloat(amount), category, date };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expense),
        });

        if (!response.ok) throw new Error('Failed to add expense');

        document.getElementById('desc').value     = '';
        document.getElementById('amount').value   = '';
        document.getElementById('category').value = '';
        document.getElementById('date').value     = '';

        showToast('Expense added successfully! 🎉', 'success');
        await loadExpenses();
    } catch (error) {
        console.error('Error adding expense:', error);
        showToast('Failed to add expense. Check console for details.', 'error');
    }
}

// ══════════════════════════════════════════════════════════════════════════
// 6. Edit Expense
// ══════════════════════════════════════════════════════════════════════════
function openEditModal(id) {
    const exp = allExpenses.find(e => e.expenseId === id);
    if (!exp) return;

    editingId = id;
    document.getElementById('editExpenseId').value = id;
    document.getElementById('editDesc').value      = exp.description || '';
    document.getElementById('editAmount').value    = exp.amount      || '';
    document.getElementById('editCategory').value  = exp.category    || '';
    document.getElementById('editDate').value      = exp.date        || '';
    openModal('editModal');
}

async function updateExpense() {
    const id       = document.getElementById('editExpenseId').value;
    const desc     = document.getElementById('editDesc').value.trim();
    const amount   = document.getElementById('editAmount').value;
    const category = document.getElementById('editCategory').value;
    const date     = document.getElementById('editDate').value;

    if (!desc || !amount) {
        showToast('Description and Amount are required.', 'error');
        return;
    }

    const expense = { description: desc, amount: parseFloat(amount), category, date };

    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expense),
        });

        if (!response.ok) throw new Error('Failed to update expense');

        closeModal('editModal');
        editingId = null;
        showToast('Expense updated! ✅', 'success');
        await loadExpenses();
    } catch (error) {
        console.error('Error updating expense:', error);
        showToast('Failed to update expense. Check console for details.', 'error');
    }
}

// ══════════════════════════════════════════════════════════════════════════
// 🗑 Delete with slide-out animation + custom modal
// ══════════════════════════════════════════════════════════════════════════
function confirmDelete(id, btn) {
    deletingId = id;
    openModal('deleteModal');
}

async function performDelete(id) {
    // Find the list item and animate it out
    const listItems = document.querySelectorAll('#expenseList li');
    listItems.forEach(li => {
        if (li.innerHTML.includes(id)) li.classList.add('deleting');
    });

    await new Promise(r => setTimeout(r, 300)); // wait for slide-out

    try {
        const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete expense');

        showToast('Expense deleted.', 'info');
        await loadExpenses();
    } catch (error) {
        console.error('Error deleting expense:', error);
        showToast('Failed to delete expense. Check console for details.', 'error');
    }
}

// ══════════════════════════════════════════════════════════════════════════
// 15. Export to CSV
// ══════════════════════════════════════════════════════════════════════════
function exportCSV() {
    if (allExpenses.length === 0) {
        showToast('No expenses to export.', 'info');
        return;
    }

    const headers = ['Description', 'Amount (₹)', 'Category', 'Date'];
    const rows = allExpenses.map(e => [
        `"${(e.description || '').replace(/"/g, '""')}"`,
        parseFloat(e.amount || 0).toFixed(2),
        e.category || 'General',
        e.date
            ? new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : '',
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href     = url;
    link.download = `expenses_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('CSV downloaded! 📄', 'success');
}
