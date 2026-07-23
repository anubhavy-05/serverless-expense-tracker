const API_URL = 'YOUR_API_URL/prod/expenses'; // e.g. https://123.execute-api.us-east-1.amazonaws.com/prod/expenses

// Load expenses on page load
window.onload = loadExpenses;

async function loadExpenses() {
    const res = await fetch(API_URL);
    const expenses = await res.json();
    const list = document.getElementById('expenseList');
    list.innerHTML = '';
    expenses.forEach(exp => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${exp.description} - $${exp.amount} (${exp.category})</span>
            <button class="delete-btn" onclick="deleteExpense('${exp.expenseId}')">Delete</button>
        `;
        list.appendChild(li);
    });
}

async function addExpense() {
    const desc = document.getElementById('desc').value;
    const amount = document.getElementById('amount').value;
    const category = document.getElementById('category').value;
    const date = document.getElementById('date').value;

    await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, amount, category, date })
    });
    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('category').value = '';
    document.getElementById('date').value = '';
    loadExpenses(); // Refresh list
}

async function deleteExpense(id) {
    await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    loadExpenses();
}
