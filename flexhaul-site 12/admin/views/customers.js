// admin/views/customers.js
(function () {
  "use strict";

  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const TYPE_LABELS = { homeowner: "Homeowner", gc: "General Contractor", property_manager: "Property Manager", other: "Other" };

  async function render(container) {
    container.innerHTML = `
      <div class="main-header">
        <h1>Customers</h1>
        <button class="btn btn-primary" id="newCustomerBtn"><svg><use href="#icon-plus"/></svg> New Customer</button>
      </div>
      <div class="field" style="max-width:360px;">
        <input type="search" id="customerSearch" placeholder="Search name, phone, email\u2026">
      </div>
      <div class="table-wrap" id="customerTableWrap"></div>
    `;

    document.getElementById("newCustomerBtn").addEventListener("click", openNewCustomerModal);
    document.getElementById("customerSearch").addEventListener("input", (e) => loadList(e.target.value));

    await loadList();
  }

  async function loadList(q) {
    const wrap = document.getElementById("customerTableWrap");
    const { customers } = await Api.listCustomers(q);

    if (customers.length === 0) {
      wrap.innerHTML = '<div class="empty-state">No customers found.</div>';
      return;
    }

    wrap.innerHTML = `
      <table class="data">
        <thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>Email</th></tr></thead>
        <tbody>
          ${customers.map((c) => `
            <tr data-id="${c.id}">
              <td><strong>${esc(c.name)}</strong></td>
              <td>${esc(TYPE_LABELS[c.type] || c.type)}</td>
              <td>${esc(c.phone || "\u2014")}</td>
              <td>${esc(c.email || "\u2014")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    wrap.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.addEventListener("click", () => openCustomerDetail(tr.dataset.id));
    });
  }

  function openNewCustomerModal() {
    const overlay = buildModal("New Customer", `
      <div class="field"><label>Name *</label><input type="text" id="cName"></div>
      <div class="form-row">
        <div class="field">
          <label>Type</label>
          <select id="cType">
            <option value="homeowner">Homeowner</option>
            <option value="gc">General Contractor</option>
            <option value="property_manager">Property Manager</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="field"><label>Phone</label><input type="tel" id="cPhone"></div>
      </div>
      <div class="field"><label>Email</label><input type="email" id="cEmail"></div>
      <div class="field"><label>Address</label><input type="text" id="cAddress"></div>
      <div class="field"><label>Notes</label><textarea id="cNotes"></textarea></div>
      <button class="btn btn-primary" id="saveCustomerBtn" style="width:100%;">Save Customer</button>
    `);

    overlay.querySelector("#saveCustomerBtn").addEventListener("click", async () => {
      const name = overlay.querySelector("#cName").value.trim();
      if (!name) { showToast("Name is required", true); return; }
      try {
        await Api.createCustomer({
          name,
          type: overlay.querySelector("#cType").value,
          phone: overlay.querySelector("#cPhone").value.trim(),
          email: overlay.querySelector("#cEmail").value.trim(),
          address: overlay.querySelector("#cAddress").value.trim(),
          notes: overlay.querySelector("#cNotes").value.trim(),
        });
        closeModal();
        showToast("Customer created");
        await loadList();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  function fmtDate(d) {
    if (!d) return "Unscheduled";
    try { return new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }); }
    catch (e) { return d; }
  }
  function fmtTimeSlot(key) {
    if (!key) return null;
    const [start] = key.split("-");
    let [h, m] = start.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
  }
  function jobRow(j) {
    return `<div class="card" style="padding:12px; margin-bottom:8px; cursor:pointer;" data-job-id="${j.id}">
      <div class="flex items-center" style="justify-content:space-between;">
        <strong style="font-size:0.9rem;">${fmtDate(j.scheduled_date)}${j.scheduled_time_slot ? " \u00b7 " + esc(fmtTimeSlot(j.scheduled_time_slot)) : ""}</strong>
        <span class="badge badge-${j.status}">${esc(j.status.replace("_"," "))}</span>
      </div>
      ${j.address ? `<div class="small-note" style="margin-top:4px;">${esc(j.address)}</div>` : ""}
    </div>`;
  }

  async function openCustomerDetail(id) {
    const { customer, deals, upcoming_jobs, past_jobs, activity } = await Api.getCustomer(id);

    const stageLabels = { new_lead: "New Lead", quoted: "Quoted", won: "Won", scheduled: "Scheduled", complete: "Complete", invoiced: "Invoiced", lost: "Lost" };
    // Prefer a 'won' deal (needs scheduling) over 'scheduled' (already
    // has a date, maybe adding another job) over 'complete' (already
    // done, least likely to be what "Schedule Job" means here) — rather
    // than just taking whichever deal happens to sort first, which was
    // ambiguous when a customer has more than one eligible deal.
    const wonDeal =
      deals.find((d) => d.stage === "won") ||
      deals.find((d) => d.stage === "scheduled") ||
      deals.find((d) => d.stage === "complete");

    const overlay = buildModal(esc(customer.name), `
      <p class="small-note">${esc(TYPE_LABELS[customer.type] || customer.type)}</p>
      <div style="margin:14px 0; display:flex; flex-direction:column; gap:6px; font-size:0.92rem;">
        ${customer.phone ? `<div><svg style="width:14px;height:14px;vertical-align:-2px;"><use href="#icon-phone"/></svg> ${esc(customer.phone)}</div>` : ""}
        ${customer.email ? `<div><svg style="width:14px;height:14px;vertical-align:-2px;"><use href="#icon-mail"/></svg> ${esc(customer.email)}</div>` : ""}
        ${customer.address ? `<div><svg style="width:14px;height:14px;vertical-align:-2px;"><use href="#icon-map-pin"/></svg> ${esc(customer.address)}</div>` : ""}
      </div>
      ${customer.notes ? `<div class="card" style="padding:12px; margin-bottom:16px; font-size:0.9rem;">${esc(customer.notes)}</div>` : ""}

      <div class="flex items-center" style="justify-content:space-between; margin-bottom:10px;">
        <h3 style="font-size:0.85rem; margin:0;">Upcoming Work (${upcoming_jobs.length})</h3>
        ${wonDeal ? `<button class="btn btn-ghost btn-sm" id="quickScheduleBtn"><svg><use href="#icon-plus"/></svg> Schedule Job</button>` : ""}
      </div>
      ${upcoming_jobs.length === 0 ? '<p class="text-dim" style="margin-bottom:16px;">Nothing scheduled yet.</p>' : upcoming_jobs.map(jobRow).join("")}

      <h3 style="font-size:0.85rem; margin:20px 0 10px;">Past Work (${past_jobs.length})</h3>
      ${past_jobs.length === 0 ? '<p class="text-dim" style="margin-bottom:16px;">No completed jobs yet.</p>' : past_jobs.map(jobRow).join("")}

      <h3 style="font-size:0.85rem; margin:20px 0 10px;">Deals (${deals.length})</h3>
      ${deals.length === 0 ? '<p class="text-dim" style="margin-bottom:16px;">No deals yet.</p>' :
        deals.map(d => `<div class="card" style="padding:12px; margin-bottom:8px; display:flex; justify-content:space-between;">
          <span class="badge badge-${d.stage}">${esc(stageLabels[d.stage] || d.stage)}</span>
          <span style="font-family:var(--font-mono);">$${Number(d.estimated_value||0).toLocaleString()}</span>
        </div>`).join("")
      }

      <h3 style="font-size:0.85rem; margin:20px 0 10px;">Activity</h3>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${activity.map(a => `<div class="small-note">${esc(a.note)}</div>`).join("") || '<p class="text-dim">No activity yet.</p>'}
      </div>
    `);

    // Clicking any job row jumps straight to its full detail (documents,
    // status editing, invoicing) on the Jobs screen.
    overlay.querySelectorAll("[data-job-id]").forEach((el) => {
      el.addEventListener("click", () => {
        window.__openJobId = el.dataset.jobId;
        closeModal();
        navigateTo("jobs");
      });
    });

    const quickBtn = overlay.querySelector("#quickScheduleBtn");
    if (quickBtn) {
      quickBtn.addEventListener("click", () => {
        closeModal();
        window.__prefillDealId = wonDeal.id;
        navigateTo("jobs");
      });
    }
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
  window.Views.customers = render;
})();
