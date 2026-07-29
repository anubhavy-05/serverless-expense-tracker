// Wires the login button + expense CRUD + receipt uploads to the API.
const $ = (id) => document.getElementById(id);

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// Format as Indian Rupee (₹) – optional: add thousands separators
function formatINR(amount) {
  return '₹ ' + Number(amount).toFixed(2);
}

function showSignedIn(email) {
  $('loginBtn').classList.add('hidden');
  $('logoutBtn').classList.remove('hidden');
  $('signedOut').classList.add('hidden');
  $('signedIn').classList.remove('hidden');
  $('userEmail').textContent = email || '';
}

function showSignedOut() {
  $('loginBtn').classList.remove('hidden');
  $('logoutBtn').classList.add('hidden');
  $('signedOut').classList.remove('hidden');
  $('signedIn').classList.add('hidden');
  $('userEmail').textContent = '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ── Receipts ────────────────────────────────────────────────
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
  const res = await apiFetch(`/expenses/${encodeURIComponent(expenseId)}/receipt-url`);
  if (!res.ok) throw new Error((await res.text()) || 'No receipt');
  const { downloadUrl } = await res.json();
  window.open(downloadUrl, '_blank', 'noopener');
}

async function loadExpenses() {
  $('status').textContent = 'Loading...';
  try {
    const res = await apiFetch('/expenses');
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.items || [];
    $('list').innerHTML = items.length
      ? items.map((e) => `
        <li class="row">
          <div>
            <strong>${escapeHtml(e.description ?? e.title)}</strong>
            <small class="muted">${escapeHtml(e.category)} ${escapeHtml(e.date)}</small>
          </div>
          <div class="right">
            <span>${formatINR(e.amount ?? 0)}</span>
            ${e.receiptKey
              ? `<button class="btn ghost" data-receipt="${e.expenseId}">Receipt</button>`
              : `<label class="btn ghost file">Attach
                   <input type="file" hidden accept="image/*,application/pdf" data-upload="${e.expenseId}" />
                 </label>`}
            <button class="btn ghost" data-del="${e.expenseId}">Delete</button>
          </div>
        </li>`).join('')
      : '<li class="muted">No expenses yet.</li>';
    $('status').textContent = '';
  } catch (err) {
    $('status').textContent = err.message;
  }
}

// ── Budget Settings ──────────────────────────────────────
async function loadSettings() {
  try {
    const res = await apiFetch('/settings');
    if (!res.ok) return;
    const data = await res.json();
    const budget = data.monthlyBudget;
    $('budgetInput').value = budget !== undefined && budget !== null ? budget : '';
  } catch (err) {
    // ignore
  }
}

async function saveBudget() {
  const val = parseFloat($('budgetInput').value);
  if (isNaN(val) || val < 0) {
    $('budgetStatus').textContent = 'Please enter a valid non-negative number.';
    return;
  }
  $('budgetStatus').textContent = 'Saving...';
  try {
    const res = await apiFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify({ monthlyBudget: val }),
    });
    if (!res.ok) throw new Error(await res.text());
    $('budgetStatus').textContent = 'Saved!';
    setTimeout(() => $('budgetStatus').textContent = '', 3000);
  } catch (err) {
    $('budgetStatus').textContent = 'Error: ' + err.message;
  }
}

// ── CSV Export ────────────────────────────────────────────
function toCsvValue(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function exportCsv() {
  $('status').textContent = 'Preparing export...';
  try {
    const res = await apiFetch('/expenses');
    if (!res.ok) throw new Error('Could not fetch expenses');
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.items || [];

    const headers = ['description', 'amount', 'category', 'date'];
    const rows = [headers.join(',')];
    for (const e of items) {
      rows.push(headers.map((h) => toCsvValue(e[h] ?? (h === 'description' ? e.title : ''))).join(','));
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

    $('status').textContent = '';
  } catch (err) {
    $('status').textContent = err.message;
  }
}

// ── CSV Import ────────────────────────────────────────────
function parseCsvLine(line) {
  const out = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function importCsv(file) {
  $('status').textContent = 'Reading file...';
  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) throw new Error('CSV has no data rows');

    const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const descIdx = headers.indexOf('description');
    const amountIdx = headers.indexOf('amount');
    const categoryIdx = headers.indexOf('category');
    const dateIdx = headers.indexOf('date');
    if (descIdx === -1 || amountIdx === -1) {
      throw new Error('CSV must have "description" and "amount" columns');
    }

    let success = 0, failed = 0;
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const description = (cols[descIdx] || '').trim();
      const amount = Number(cols[amountIdx]);

      if (!description || isNaN(amount)) {
        failed++;
        errors.push(`Row ${i + 1}: invalid description/amount`);
        continue;
      }

      $('status').textContent = `Importing row ${i} of ${lines.length - 1}...`;
      try {
        const res = await apiFetch('/expenses', {
          method: 'POST',
          body: JSON.stringify({
            description,
            amount,
            category: (cols[categoryIdx] || 'General').trim() || 'General',
            date: (cols[dateIdx] || '').trim(),
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        success++;
      } catch (err) {
        failed++;
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    const summary = `Import done: ${success} added, ${failed} failed.` +
      (errors.length ? ' See console for details.' : '');
    if (errors.length) console.warn('Import errors:', errors);
    await loadExpenses();
    $('status').textContent = summary;
  } catch (err) {
    $('status').textContent = 'Import failed: ' + err.message;
  }
}

// ── Event listeners ──────────────────────────────────────
document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest?.('[data-del], [data-receipt]');
  if (!btn) return;

  const delId = btn.getAttribute('data-del');
  if (delId) {
    $('status').textContent = 'Deleting...';
    try {
      const res = await apiFetch('/expenses/' + encodeURIComponent(delId), { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Delete failed (${res.status}): ${body}`);
      }
      $('status').textContent = '';
    } catch (err) {
      $('status').textContent = err.message;
    }
    loadExpenses();
    return;
  }

  const receiptId = btn.getAttribute('data-receipt');
  if (receiptId) {
    try { await openReceipt(receiptId); }
    catch (err) { $('status').textContent = err.message; }
  }
});

document.addEventListener('change', async (ev) => {
  const expenseId = ev.target.getAttribute?.('data-upload');
  if (!expenseId || !ev.target.files?.length) return;
  $('status').textContent = 'Uploading receipt...';
  try {
    await uploadReceipt(expenseId, ev.target.files[0]);
    $('status').textContent = 'Receipt attached.';
    loadExpenses();
  } catch (err) {
    $('status').textContent = err.message;
  }
});

$('expenseForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('status').textContent = 'Saving...';
  const file = $('receipt').files[0];
  try {
    const res = await apiFetch('/expenses', {
      method: 'POST',
      body: JSON.stringify({
        description: $('title').value,
        amount: Number($('amount').value),
        category: $('category').value || 'General',
        date: $('date').value,
      }),
    });
    if (!res.ok) throw new Error((await res.text()) || 'Save failed');
    const { id } = await res.json();
    if (file) {
      $('status').textContent = 'Uploading receipt...';
      await uploadReceipt(id, file);
    }
    ev.target.reset();
    $('status').textContent = '';
    loadExpenses();
  } catch (err) {
    $('status').textContent = err.message;
    loadExpenses();
  }
});

$('loginBtn').addEventListener('click', () => Auth.login());
$('logoutBtn').addEventListener('click', () => Auth.logout());
$('saveBudgetBtn').addEventListener('click', saveBudget);
$('exportBtn').addEventListener('click', exportCsv);
$('importInput').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  await importCsv(file);
  ev.target.value = '';
});

(async () => {
  try {
    const signedIn = await Auth.init();
    if (signedIn) { 
      showSignedIn(Auth.getUserEmail()); 
      loadExpenses(); 
      loadSettings();
    } else showSignedOut();
  } catch (err) {
    showSignedOut();
    $('status').textContent = err.message;
  }
})();