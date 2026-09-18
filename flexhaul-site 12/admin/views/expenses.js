// admin/views/expenses.js
(function () {
  "use strict";

  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function money(n) { return "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtDate(d) {
    if (!d) return "\u2014";
    try { return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch (e) { return d; }
  }

  let categories = [];
  let allJobs = [];
  let currentFilters = {};

  async function render(container) {
    container.innerHTML = `
      <div class="main-header">
        <h1>Expenses</h1>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" id="downloadExpensesBtn"><svg><use href="#icon-download"/></svg> Download CSV</button>
          <button class="btn btn-primary" id="newExpenseBtn"><svg><use href="#icon-plus"/></svg> New Expense</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <div class="form-row" style="grid-template-columns:1fr 1fr 1fr 1fr;">
          <div class="field" style="margin-bottom:0;"><label>From</label><input type="date" id="filterFrom"></div>
          <div class="field" style="margin-bottom:0;"><label>To</label><input type="date" id="filterTo"></div>
          <div class="field" style="margin-bottom:0;">
            <label>Category</label>
            <select id="filterCategory"><option value="">All categories</option></select>
          </div>
          <div class="field" style="margin-bottom:0;"><label>Vendor</label><input type="text" id="filterVendor" placeholder="Search vendor\u2026"></div>
        </div>
      </div>

      <div class="stat-card" style="margin-bottom:20px; display:inline-block; padding:16px 24px;">
        <div class="num" id="filteredTotal" style="font-size:1.6rem;">$0.00</div>
        <div class="lbl" id="filteredCount">0 expenses</div>
      </div>

      <div class="table-wrap" id="expensesTableWrap"></div>
    `;

    const { categories: cats } = await Api.listExpenseCategories();
    categories = cats;
    document.getElementById("filterCategory").innerHTML += categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");

    const { jobs } = await Api.listJobs();
    allJobs = jobs;

    document.getElementById("newExpenseBtn").addEventListener("click", () => openExpenseModal());
    document.getElementById("downloadExpensesBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Downloading\u2026";
      try {
        await Api.downloadExpensesCsv(currentFilters);
      } catch (err) {
        showToast(err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });

    ["filterFrom", "filterTo", "filterCategory"].forEach((id) => {
      document.getElementById(id).addEventListener("change", applyFilters);
    });
    let debounceTimer;
    document.getElementById("filterVendor").addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(applyFilters, 300);
    });

    await loadList();
  }

  function applyFilters() {
    currentFilters = {
      from: document.getElementById("filterFrom").value,
      to: document.getElementById("filterTo").value,
      category: document.getElementById("filterCategory").value,
      vendor: document.getElementById("filterVendor").value,
    };
    loadList();
  }

  async function loadList() {
    const wrap = document.getElementById("expensesTableWrap");
    const { expenses, total } = await Api.listExpenses(currentFilters);

    document.getElementById("filteredTotal").textContent = money(total);
    document.getElementById("filteredCount").textContent = `${expenses.length} expense${expenses.length === 1 ? "" : "s"}`;

    if (expenses.length === 0) {
      wrap.innerHTML = '<div class="empty-state">No expenses logged yet \u2014 click "New Expense" to add your first one.</div>';
      return;
    }

    wrap.innerHTML = `
      <table class="data">
        <thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Job</th><th>Amount</th><th>Receipt</th><th></th></tr></thead>
        <tbody>
          ${expenses.map((e) => `
            <tr data-id="${e.id}">
              <td>${fmtDate(e.expense_date)}</td>
              <td>${esc(e.category)}</td>
              <td>${esc(e.vendor || "\u2014")}</td>
              <td>${e.customer_name ? esc(e.customer_name) + (e.job_address ? `<div class="small-note">${esc(e.job_address)}</div>` : "") : '<span class="text-dim">\u2014</span>'}</td>
              <td style="font-family:var(--font-mono);">${money(e.amount)}</td>
              <td>${e.receipt_file_url ? '<svg style="width:16px;height:16px;color:var(--good);"><use href="#icon-download"/></svg>' : '<span class="text-dim">\u2014</span>'}</td>
              <td><button class="btn btn-danger btn-sm delete-expense-btn" data-id="${e.id}"><svg><use href="#icon-trash"/></svg></button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    wrap.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        if (e.target.closest(".delete-expense-btn")) return;
        const expense = expenses.find((x) => String(x.id) === tr.dataset.id);
        if (expense) openExpenseModal(expense);
      });
    });
    wrap.querySelectorAll(".delete-expense-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Delete this expense? This can't be undone.")) return;
        try {
          await Api.deleteExpense(btn.dataset.id);
          showToast("Expense deleted");
          await loadList();
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });
  }

  function openExpenseModal(existing) {
    const isEdit = !!existing;
    const overlay = buildModal(isEdit ? "Edit Expense" : "New Expense", `
      <div class="form-row">
        <div class="field"><label>Amount</label><input type="number" id="expAmount" min="0" step="0.01" value="${existing ? existing.amount : ""}"></div>
        <div class="field"><label>Date</label><input type="date" id="expDate" value="${existing ? existing.expense_date : new Date().toISOString().slice(0, 10)}"></div>
      </div>
      <div class="field">
        <label>Category</label>
        <select id="expCategory">
          ${categories.map((c) => `<option value="${esc(c)}" ${existing && existing.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
        </select>
      </div>
      <div class="form-row">
        <div class="field"><label>Vendor</label><input type="text" id="expVendor" value="${esc(existing ? existing.vendor : "")}"></div>
        <div class="field"><label>Payment Method</label><input type="text" id="expPayment" placeholder="Card, cash, etc." value="${esc(existing ? existing.payment_method : "")}"></div>
      </div>
      <div class="field">
        <label>Job (optional)</label>
        <input type="search" id="jobSearch" placeholder="Search by customer or address\u2026" value="${existing && existing.customer_name ? esc(existing.customer_name) : ""}">
        <div id="jobResults" style="max-height:160px; overflow-y:auto; margin-top:6px;"></div>
        <input type="hidden" id="expJobId" value="${existing && existing.job_id ? existing.job_id : ""}">
      </div>
      <div class="field"><label>Notes</label><textarea id="expNotes">${esc(existing ? existing.notes : "")}</textarea></div>
      <div class="field">
        <label>Receipt Photo ${isEdit && existing.receipt_file_url ? "(replaces current one)" : "(optional)"}</label>
        <input type="file" id="expReceipt" accept="image/*,application/pdf">
      </div>
      <button class="btn btn-primary" id="saveExpenseBtn" style="width:100%;">${isEdit ? "Save Changes" : "Save Expense"}</button>
    `);

    const jobResults = overlay.querySelector("#jobResults");
    const jobSearch = overlay.querySelector("#jobSearch");
    const jobIdInput = overlay.querySelector("#expJobId");

    function renderJobResults(query) {
      if (!query || query.trim().length < 1) { jobResults.innerHTML = ""; return; }
      const q = query.trim().toLowerCase();
      const matches = allJobs.filter((j) =>
        (j.customer_name || "").toLowerCase().includes(q) || (j.address || "").toLowerCase().includes(q)
      ).slice(0, 8);
      jobResults.innerHTML = matches.map((j) => `
        <div class="card" style="padding:8px 10px; margin-bottom:4px; cursor:pointer;" data-job-id="${j.id}">
          <strong>${esc(j.customer_name)}</strong>
          <div class="small-note">${esc(j.address || "No address")}</div>
        </div>
      `).join("");
      jobResults.querySelectorAll("[data-job-id]").forEach((card) => {
        card.addEventListener("click", () => {
          jobIdInput.value = card.dataset.jobId;
          jobSearch.value = card.querySelector("strong").textContent;
          jobResults.innerHTML = "";
        });
      });
    }
    jobSearch.addEventListener("input", () => renderJobResults(jobSearch.value));
    jobSearch.addEventListener("focus", () => { if (jobSearch.value) renderJobResults(jobSearch.value); });

    overlay.querySelector("#saveExpenseBtn").addEventListener("click", async () => {
      const amount = overlay.querySelector("#expAmount").value;
      if (!amount || Number(amount) <= 0) { showToast("Enter a valid amount", true); return; }

      const formData = new FormData();
      formData.append("amount", amount);
      formData.append("expense_date", overlay.querySelector("#expDate").value);
      formData.append("category", overlay.querySelector("#expCategory").value);
      formData.append("vendor", overlay.querySelector("#expVendor").value);
      formData.append("payment_method", overlay.querySelector("#expPayment").value);
      formData.append("notes", overlay.querySelector("#expNotes").value);
      formData.append("job_id", jobIdInput.value || "");
      const fileInput = overlay.querySelector("#expReceipt");
      if (fileInput.files[0]) formData.append("receipt", fileInput.files[0]);

      const saveBtn = overlay.querySelector("#saveExpenseBtn");
      saveBtn.disabled = true;
      try {
        if (isEdit) {
          await Api.updateExpense(existing.id, formData);
          showToast("Expense updated");
        } else {
          await Api.createExpense(formData);
          showToast("Expense saved");
        }
        closeModal();
        await loadList();
      } catch (err) {
        showToast(err.message, true);
        saveBtn.disabled = false;
      }
    });
  }

  function buildModal(title, bodyHtml) {
    closeModal();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay is-open";
    overlay.id = "activeModal";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h2 style="font-size:1.15rem;">${title}</h2><button class="modal-close">\u2715</button></div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    `;
    overlay.querySelector(".modal-close").addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
    return overlay;
  }
  function closeModal() {
    const existing = document.getElementById("activeModal");
    if (existing) existing.remove();
  }

  window.Views = window.Views || {};
  window.Views.expenses = render;
})();
