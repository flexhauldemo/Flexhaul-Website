// admin/views/pipeline.js
(function () {
  "use strict";

  const STAGES = [
    { key: "new_lead", label: "New Lead" },
    { key: "quoted", label: "Quoted" },
    { key: "won", label: "Won" },
    { key: "scheduled", label: "Scheduled" },
    { key: "complete", label: "Complete" },
    { key: "invoiced", label: "Invoiced" },
  ];

  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function money(n) { return "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }

  async function render(container) {
    container.innerHTML = `
      <div class="main-header">
        <h1>Pipeline</h1>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" id="resyncValuesBtn" title="Fixes any deal still showing $0 despite having a real estimate attached">Fix Values</button>
          <button class="btn btn-primary" id="newDealBtn"><svg><use href="#icon-plus"/></svg> New Deal</button>
        </div>
      </div>
      <div class="pipeline-board" id="pipelineBoard"></div>
    `;

    document.getElementById("newDealBtn").addEventListener("click", () => openNewDealModal());
    document.getElementById("resyncValuesBtn").addEventListener("click", async () => {
      try {
        const result = await Api.resyncDealValues();
        showToast(
          result.dealsUpdated > 0
            ? `Fixed ${result.dealsUpdated} deal${result.dealsUpdated === 1 ? "" : "s"} that had the wrong value shown.`
            : "Everything already matched — nothing needed fixing."
        );
        await loadBoard();
      } catch (err) {
        showToast(err.message, true);
      }
    });

    await loadBoard();
  }

  async function loadBoard() {
    const board = document.getElementById("pipelineBoard");
    const { deals } = await Api.listDeals();

    board.innerHTML = STAGES.map((stage) => {
      const stageDeals = deals.filter((d) => d.stage === stage.key);
      return `
        <div class="pipeline-col">
          <div class="pipeline-col-head">
            <h3>${stage.label}</h3>
            <span class="count">${stageDeals.length}</span>
          </div>
          ${stageDeals.map((d) => `
            <div class="deal-card" data-deal-id="${d.id}">
              <div class="name">${esc(d.customer_name)}</div>
              <div class="meta">${esc(d.customer_phone || "")}</div>
              <div class="value">${money(d.estimated_value)}</div>
              <select data-deal-id="${d.id}" class="stage-select">
                ${STAGES.concat([{ key: "lost", label: "Lost" }]).map(
                  (s) => `<option value="${s.key}" ${s.key === d.stage ? "selected" : ""}>${s.label}</option>`
                ).join("")}
              </select>
            </div>
          `).join("")}
        </div>
      `;
    }).join("");

    board.querySelectorAll(".deal-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.tagName === "SELECT") return;
        openDealDetail(card.dataset.dealId);
      });
    });

    board.querySelectorAll(".stage-select").forEach((sel) => {
      sel.addEventListener("click", (e) => e.stopPropagation());
      sel.addEventListener("change", async (e) => {
        e.stopPropagation();
        try {
          const result = await Api.updateDeal(sel.dataset.dealId, { stage: sel.value });
          if (result.auto_created) {
            showToast("Deal won \u2014 a job and an unpaid invoice were created automatically. Just add a date on the Jobs tab.");
          } else {
            showToast("Deal moved to " + sel.options[sel.selectedIndex].text);
          }
          await loadBoard();
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });
  }

  function openNewDealModal() {
    const overlay = buildModal("New Deal", `
      <div class="field">
        <label>Customer</label>
        <select id="dealCustomerSelect"><option value="">Loading customers\u2026</option></select>
      </div>
      <div class="field">
        <label>Or create a new customer</label>
        <input type="text" id="newCustomerName" placeholder="Customer name">
      </div>
      <div class="form-row">
        <div class="field">
          <label>Source</label>
          <select id="dealSource">
            <option value="website">Website</option>
            <option value="phone">Phone</option>
            <option value="referral">Referral</option>
            <option value="furniture_store">Furniture Store</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="field">
          <label>Estimated Value ($)</label>
          <input type="number" id="dealValue" min="0" step="1" value="0">
        </div>
      </div>
      <button class="btn btn-primary" id="createDealBtn" style="width:100%;">Create Deal</button>
    `);

    Api.listCustomers().then(({ customers }) => {
      const sel = overlay.querySelector("#dealCustomerSelect");
      sel.innerHTML = '<option value="">\u2014 Select existing customer \u2014</option>' +
        customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    });

    overlay.querySelector("#createDealBtn").addEventListener("click", async () => {
      const customerId = overlay.querySelector("#dealCustomerSelect").value;
      const newName = overlay.querySelector("#newCustomerName").value.trim();
      const source = overlay.querySelector("#dealSource").value;
      const value = Number(overlay.querySelector("#dealValue").value) || 0;

      try {
        let finalCustomerId = customerId;
        if (!finalCustomerId && newName) {
          const { customer } = await Api.createCustomer({ name: newName });
          finalCustomerId = customer.id;
        }
        if (!finalCustomerId) {
          showToast("Pick an existing customer or enter a new customer name", true);
          return;
        }
        await Api.createDeal({ customer_id: finalCustomerId, source, estimated_value: value });
        closeModal();
        showToast("Deal created");
        await loadBoard();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  async function openDealDetail(dealId) {
    const { deal, estimates, jobs, activity } = await Api.getDeal(dealId);

    const overlay = buildModal(esc(deal.customer_name), `
      <p class="small-note" style="margin-bottom:16px;">${esc(deal.customer_phone || "")} ${deal.customer_email ? " \u00b7 " + esc(deal.customer_email) : ""}</p>

      ${deal.notes ? `
        <div class="card" style="padding:14px; margin-bottom:20px; background:rgba(245,163,0,0.08); border-color:rgba(245,163,0,0.3);">
          <div style="font-family:var(--font-display); font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em; color:var(--rust); margin-bottom:6px;">What they asked for</div>
          <div style="font-size:0.92rem;">${esc(deal.notes)}</div>
        </div>
      ` : ""}

      <h3 style="font-size:0.85rem; margin-bottom:10px;">Estimates</h3>
      ${estimates.length === 0 ? '<p class="text-dim" style="margin-bottom:16px;">No estimates yet.</p>' :
        estimates.map(e => `
          <div class="card" style="padding:12px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <span>Total: <strong>${money(e.total)}</strong></span>
            ${e.accepted
              ? '<span class="badge badge-won">\u2713 Accepted</span>'
              : `<button class="btn btn-primary btn-sm accept-estimate-btn" data-estimate-id="${e.id}">Accept \u2192 Job &amp; Invoice</button>`
            }
          </div>
        `).join("")
      }
      <button class="btn btn-ghost btn-sm" id="newEstimateBtn" style="margin-bottom:20px;"><svg><use href="#icon-plus"/></svg> New Estimate</button>

      <h3 style="font-size:0.85rem; margin-bottom:10px;">Jobs</h3>
      ${jobs.length === 0 ? '<p class="text-dim" style="margin-bottom:16px;">No jobs yet.</p>' :
        jobs.map(j => `<div class="card" style="padding:12px; margin-bottom:8px;">${esc(j.scheduled_date || "unscheduled")} \u2014 <span class="badge badge-${j.status}">${esc(j.status)}</span></div>`).join("")
      }
      ${deal.stage === "won" || jobs.length > 0 ? '<button class="btn btn-ghost btn-sm" id="newJobBtn" style="margin-bottom:20px;"><svg><use href="#icon-plus"/></svg> New Job</button>' : ""}

      <h3 style="font-size:0.85rem; margin-bottom:10px;">Activity</h3>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${activity.map(a => `<div class="small-note">${esc(a.note)}</div>`).join("") || '<p class="text-dim">No activity yet.</p>'}
      </div>
    `);

    const estBtn = overlay.querySelector("#newEstimateBtn");
    if (estBtn) estBtn.addEventListener("click", () => openEstimateModal(dealId));

    overlay.querySelectorAll(".accept-estimate-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Accept this estimate? This automatically creates a job and an invoice.")) return;
        btn.disabled = true;
        btn.textContent = "Working\u2026";
        try {
          const result = await Api.acceptEstimate(btn.dataset.estimateId);
          showToast(`Accepted \u2014 Job #${result.job.id} and Invoice #${result.invoice.id} created automatically.`);
          closeModal();
          await loadBoard();
        } catch (err) {
          showToast(err.message, true);
          btn.disabled = false;
          btn.textContent = "Accept \u2192 Job & Invoice";
        }
      });
    });

    const jobBtn = overlay.querySelector("#newJobBtn");
    if (jobBtn) jobBtn.addEventListener("click", () => {
      closeModal();
      window.__prefillDealId = dealId;
      navigateTo("jobs");
    });
  }

  async function openEstimateModal(dealId) {
    const overlay = buildModal("New Estimate", `
      <div class="field" style="margin-bottom:18px;">
        <label>Add From Price List</label>
        <div style="display:flex; gap:8px;">
          <select id="catalogPicker" style="flex:1;"><option value="">Loading price list\u2026</option></select>
          <button type="button" class="btn btn-ghost btn-sm" id="addFromCatalogBtn" style="flex-shrink:0;">Add</button>
        </div>
      </div>
      <div class="line-items" id="lineItemsWrap"></div>
      <button class="btn btn-ghost btn-sm" id="addLineItemBtn" style="margin-bottom:16px;"><svg><use href="#icon-plus"/></svg> Add Custom Line Item</button>
      <div class="estimate-total"><span>Total</span><span class="amt" id="estTotalDisplay">$0</span></div>
      <button class="btn btn-primary" id="saveEstimateBtn" style="width:100%; margin-top:16px;">Save Estimate</button>
    `);

    const wrap = overlay.querySelector("#lineItemsWrap");

    function addRow(item) {
      item = item || { type: "labor", label: "", qty: 1, rate: 0 };
      const row = document.createElement("div");
      row.className = "line-item-row";
      row.innerHTML = `
        <input type="text" placeholder="Description" class="li-label" value="${esc(item.label)}">
        <input type="number" placeholder="Qty" class="li-qty" min="0" step="0.1" value="${item.qty}">
        <select class="li-type">
          ${["labor","equipment","disposal","tonnage","cubic_yards","other"].map(t =>
            `<option value="${t}" ${t===item.type?"selected":""}>${t.replace("_"," ")}</option>`).join("")}
        </select>
        <input type="number" placeholder="Rate $" class="li-rate" min="0" step="0.01" value="${item.rate}">
        <button type="button" class="line-item-remove">\u2715</button>
      `;
      row.querySelectorAll(".li-qty, .li-rate").forEach((el) => el.addEventListener("input", recalc));
      row.querySelector(".line-item-remove").addEventListener("click", () => { row.remove(); recalc(); });
      wrap.appendChild(row);
      recalc();
    }

    function recalc() {
      let total = 0;
      wrap.querySelectorAll(".line-item-row").forEach((row) => {
        const qty = Number(row.querySelector(".li-qty").value) || 0;
        const rate = Number(row.querySelector(".li-rate").value) || 0;
        total += qty * rate;
      });
      overlay.querySelector("#estTotalDisplay").textContent = money(total);
    }

    // Load the price catalog and group it by category so it's a
    // scannable dropdown instead of 100 items in a flat list.
    let catalogItems = [];
    try {
      const { items } = await Api.listPriceCatalog();
      catalogItems = items;
      const picker = overlay.querySelector("#catalogPicker");
      const byCategory = {};
      items.forEach((it) => { (byCategory[it.category] = byCategory[it.category] || []).push(it); });
      picker.innerHTML = '<option value="">\u2014 Choose an item \u2014</option>' +
        Object.keys(byCategory).map((cat) => `
          <optgroup label="${esc(cat)}">
            ${byCategory[cat].map((it) => `<option value="${it.id}">${esc(it.label)} \u2014 $${it.rate}${it.unit && it.unit !== "item" ? "/" + it.unit.replace("_"," ") : ""}</option>`).join("")}
          </optgroup>
        `).join("");
    } catch (err) {
      overlay.querySelector("#catalogPicker").innerHTML = '<option value="">Could not load price list</option>';
    }

    overlay.querySelector("#addFromCatalogBtn").addEventListener("click", () => {
      const picker = overlay.querySelector("#catalogPicker");
      const selected = catalogItems.find((it) => String(it.id) === picker.value);
      if (!selected) return;
      addRow({ type: selected.type, label: selected.label, qty: 1, rate: selected.rate });
      picker.value = "";
    });

    overlay.querySelector("#addLineItemBtn").addEventListener("click", () => addRow());
    addRow({ type: "labor", label: "Crew labor", qty: 1, rate: 0 });

    overlay.querySelector("#saveEstimateBtn").addEventListener("click", async () => {
      const items = Array.from(wrap.querySelectorAll(".line-item-row")).map((row) => ({
        type: row.querySelector(".li-type").value,
        label: row.querySelector(".li-label").value,
        qty: Number(row.querySelector(".li-qty").value) || 0,
        rate: Number(row.querySelector(".li-rate").value) || 0,
      }));
      try {
        await Api.createEstimate({ deal_id: dealId, line_items: items });
        closeModal();
        showToast("Estimate saved");
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  // ---- shared modal helper ----
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
  window.closeModal = closeModal;

  window.Views = window.Views || {};
  window.Views.pipeline = render;
})();
