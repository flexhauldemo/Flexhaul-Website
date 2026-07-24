// admin/views/invoices.js
(function () {
  "use strict";

  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function money(n) { return "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }); }
  function fmtDate(d) {
    if (!d) return "\u2014";
    try { return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch (e) { return d; }
  }

  async function render(container) {
    container.innerHTML = `
      <div class="main-header">
        <h1>Invoices</h1>
        <button class="btn btn-primary" id="newInvoiceBtn"><svg><use href="#icon-plus"/></svg> New Invoice</button>
      </div>
      <div class="table-wrap" id="invoicesTableWrap"></div>
    `;

    document.getElementById("newInvoiceBtn").addEventListener("click", openNewInvoiceModal);
    await loadList();
  }

  async function loadList() {
    const wrap = document.getElementById("invoicesTableWrap");
    const { invoices } = await Api.listInvoices();

    if (invoices.length === 0) {
      wrap.innerHTML = '<div class="empty-state">No invoices yet.</div>';
      return;
    }

    wrap.innerHTML = `
      <table class="data">
        <thead><tr><th>Customer</th><th>Job Address</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${invoices.map((inv) => `
            <tr data-id="${inv.id}">
              <td>${esc(inv.customer_name)}</td>
              <td>${esc(inv.job_address || "\u2014")}</td>
              <td style="font-family:var(--font-mono);">${money(inv.amount)}</td>
              <td>${fmtDate(inv.due_date)}</td>
              <td><span class="badge badge-${inv.status}">${esc(inv.status)}</span></td>
              <td>
                ${inv.status !== "paid"
                  ? `<button class="btn btn-ghost btn-sm mark-paid-btn" data-id="${inv.id}">Mark Paid</button>`
                  : `<button class="btn btn-ghost btn-sm mark-unpaid-btn" data-id="${inv.id}">Mark Unpaid</button>`
                }
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    wrap.querySelectorAll(".mark-paid-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await Api.updateInvoice(btn.dataset.id, { status: "paid" });
          showToast("Marked paid");
          await loadList();
        } catch (err) { showToast(err.message, true); }
      });
    });
    wrap.querySelectorAll(".mark-unpaid-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await Api.updateInvoice(btn.dataset.id, { status: "unpaid" });
          showToast("Marked unpaid");
          await loadList();
        } catch (err) { showToast(err.message, true); }
      });
    });
  }

  async function openNewInvoiceModal() {
    const overlay = buildModal("New Invoice", `
      <div class="field">
        <label>Job</label>
        <select id="invJob"><option value="">Loading\u2026</option></select>
      </div>
      <div class="field">
        <label>Amount ($) <span class="small-note">(leave blank to use the job's latest estimate)</span></label>
        <input type="number" id="invAmount" min="0" step="0.01">
      </div>
      <div class="field"><label>Due Date</label><input type="date" id="invDueDate"></div>
      <button class="btn btn-primary" id="createInvoiceBtn" style="width:100%;">Create Invoice</button>
    `);

    const { jobs } = await Api.listJobs();
    overlay.querySelector("#invJob").innerHTML = jobs.map(
      (j) => `<option value="${j.id}">${esc(j.customer_name)} \u2014 ${esc(j.address || "no address")}</option>`
    ).join("") || '<option value="">No jobs yet</option>';

    overlay.querySelector("#createInvoiceBtn").addEventListener("click", async () => {
      const jobId = overlay.querySelector("#invJob").value;
      if (!jobId) { showToast("Select a job first", true); return; }
      const amountRaw = overlay.querySelector("#invAmount").value;
      const dueDate = overlay.querySelector("#invDueDate").value;

      try {
        const payload = { job_id: jobId, due_date: dueDate || null };
        if (amountRaw) {
          payload.amount = Number(amountRaw);
        } else {
          const { job } = await Api.getJob(jobId);
          // fall back: try to find an estimate on the job's deal
          const { estimates } = await Api.getDeal(job.deal_id);
          if (estimates && estimates.length > 0) {
            payload.estimate_id = estimates[0].id;
          } else {
            showToast("This job has no estimate yet \u2014 enter an amount manually", true);
            return;
          }
        }
        await Api.createInvoice(payload);
        closeModal();
        showToast("Invoice created");
        await loadList();
      } catch (err) {
        showToast(err.message, true);
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
  window.Views.invoices = render;
})();
