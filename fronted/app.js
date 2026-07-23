// 🔴 REPLACE THIS WITH YOUR ACTUAL API GATEWAY URL
const API_URL = 'https://757w5cziii.execute-api.us-east-1.amazonaws.com/prod';

// Load expenses when page opens
window.onload = loadExpenses;

// 📋 Load all expenses
async function loadExpenses() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Failed to fetch expenses');
        
        const expenses = await response.json();
        const list = document.getElementById('expenseList');

        if (expenses.length === 0) {
            list.innerHTML = '<li class="empty-msg">No expenses yet. Add one above! 💸</li>';
            return;
        }

        list.innerHTML = '';
        expenses.forEach(exp => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="expense-info">
                    <span class="expense-desc">${exp.description}</span>
                    <span class="expense-amount">$${parseFloat(exp.amount).toFixed(2)}</span>
                    <span class="expense-category">${exp.category || 'General'}</span>
                    <span class="expense-date">${exp.date || ''}</span>
                </div>
                <button class="delete-btn" onclick="deleteExpense('${exp.expenseId}')">✕ Delete</button>
            `;
            list.appendChild(li);
        });
    } catch (error) {
        console.error('Error loading expenses:', error);
        alert('Failed to load expenses. Check console for details.');
    }
}

// ➕ Add a new expense
async function addExpense() {
    const desc = document.getElementById('desc').value.trim();
    const amount = document.getElementById('amount').value;
    const category = document.getElementById('category').value.trim();
    const date = document.getElementById('date').value;

    if (!desc || !amount) {
        alert('Please enter at least a Description and Amount.');
        return;
    }

    const expense = { description: desc, amount: parseFloat(amount), category, date };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expense)
        });

        if (!response.ok) throw new Error('Failed to add expense');

        // Clear form
        document.getElementById('desc').value = '';
        document.getElementById('amount').value = '';
        document.getElementById('category').value = '';
        document.getElementById('date').value = '';

        // Reload list
        await loadExpenses();
    } catch (error) {
        console.error('Error adding expense:', error);
        alert('Failed to add expense. Check console for details.');
    }
}

// 🗑 Delete an expense
async function deleteExpense(id) {
    if (!confirm('Delete this expense?')) return;

    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete expense');

        await loadExpenses();
    } catch (error) {
        console.error('Error deleting expense:', error);
        alert('Failed to delete expense. Check console for details.');
    }
}
