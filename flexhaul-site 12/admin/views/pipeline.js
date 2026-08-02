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

  // Which of the 5 progress dots a stage fills up to, and what color to
  // use for that stage's avatar/dots — reusing the exact same colors as
  // the badge-* classes elsewhere in the app, so a customer's status
  // means the same thing everywhere you see it, not just here.
  const STAGE_META = {
    new_lead:  { dot: 1, color: "var(--steel)" },
    quoted:    { dot: 2, color: "var(--rust)" },
    won:       { dot: 3, color: "var(--good)" },
    scheduled: { dot: 4, color: "var(--info)" },
    complete:  { dot: 5, color: "var(--good)" },
    invoiced:  { dot: 5, color: "#8a5c00" },
    lost:      { dot: 0, color: "var(--rust)" },
  };
  const OPEN_STAGES = ["new_lead", "quoted", "won", "scheduled"];

  function initials(name) {
    if (!name) return "?";
    const parts = String(name).trim().split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
  }

  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function money(n) { return "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }

  // Builds the public link (same origin as this admin page, since
  // admin.html and estimate.html/invoice.html are deployed together)
  // and copies it to the clipboard. Falls back to a prompt() showing
  // the raw link if the Clipboard API isn't available — e.g. an older
  // browser, or a non-HTTPS context where clipboard access is blocked.
  function copyShareLink(btn, page, token) {
    const url = `${window.location.origin}/${page}?token=${token}`;
    const originalHtml = btn.innerHTML;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        btn.textContent = "Copied!";
        showToast("Link copied \u2014 paste it into a text or email to the customer.");
        setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
      }).catch(() => {
        window.prompt("Copy this link:", url);
      });
    } else {
      window.prompt("Copy this link:", url);
    }
  }

  async function render(container) {
    container.innerHTML = `
      <div class="main-header">
        <h1>Pipeline</h1>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" id="resyncValuesBtn" title="Fixes any deal still showing $0 despite having a real estimate attached">Fix Values</button>
          <button class="btn btn-ghost btn-sm" id="reloadCatalogBtn" title="Reloads the item picker in the estimate builder with the latest official pricing">Reload Price List</button>
          <button class="btn btn-primary" id="newDealBtn"><svg><use href="#icon-plus"/></svg> New Deal</button>
        </div>
      </div>
      <div class="pipeline-list" id="pipelineBoard"></div>
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

    document.getElementById("reloadCatalogBtn").addEventListener("click", async () => {
      if (!confirm("Reload the price list from the latest official pricing? This replaces every item in the estimate picker \u2014 any items you'd added or edited by hand will be gone.")) return;
      try {
        const result = await Api.reloadPriceCatalog();
        showToast(`Price list reloaded \u2014 ${result.itemsLoaded} items loaded.`);
      } catch (err) {
        showToast(err.message, true);
      }
    });

    await loadBoard();
  }

  let collapsedGroups = {}; // persists across re-renders within a session, e.g. after a stage change

  function dealRow(d) {
    const meta = STAGE_META[d.stage] || STAGE_META.new_lead;
    const isLost = d.stage === "lost";
    const progressHtml = isLost
      ? `<span class="lost-label">Lost</span>`
      : [1, 2, 3, 4, 5].map((i) => {
          const filled = i <= meta.dot;
          if (i === 5) return `<span class="dot ${filled ? "filled" : ""}" style="--dot-color:${meta.color}"></span>`;
          return `<span class="dot ${filled ? "filled" : ""}" style="--dot-color:${meta.color}"></span><span class="bar ${filled && i < meta.dot ? "filled" : ""}" style="--dot-color:${meta.color}"></span>`;
        }).join("");

    return `
      <div class="deal-row" data-deal-id="${d.id}">
        <div class="deal-avatar" style="background:color-mix(in srgb, ${meta.color} 16%, white); color:${meta.color};">${esc(initials(d.customer_name))}</div>
        <div class="deal-row-main">
          <div class="name">${esc(d.customer_name)}</div>
          <div class="meta">${esc(d.customer_phone || "\u2014")}</div>
        </div>
        <div class="deal-progress">${progressHtml}</div>
        <div class="deal-row-value">${money(d.estimated_value)}</div>
        <select data-deal-id="${d.id}" class="deal-row-stage">
          ${STAGES.concat([{ key: "lost", label: "Lost" }]).map(
            (s) => `<option value="${s.key}" ${s.key === d.stage ? "selected" : ""}>${s.label}</option>`
          ).join("")}
        </select>
      </div>
    `;
  }

  async function loadBoard() {
    const board = document.getElementById("pipelineBoard");
    const { deals } = await Api.listDeals();

    const openDeals = deals.filter((d) => OPEN_STAGES.includes(d.stage));
    const closedDeals = deals.filter((d) => !OPEN_STAGES.includes(d.stage));
    const totalValue = deals.reduce((sum, d) => sum + (Number(d.estimated_value) || 0), 0);

    const groups = [
      { key: "open", label: "Open deals", items: openDeals, defaultOpen: true },
      { key: "closed", label: "Closed", items: closedDeals, defaultOpen: false },
    ];

    board.innerHTML = `
      <div class="pipeline-toolbar">
        <span class="total">${money(totalValue)} across ${deals.length} deal${deals.length === 1 ? "" : "s"}</span>
      </div>
      ${groups.map((g) => {
        const isCollapsed = collapsedGroups[g.key] !== undefined ? collapsedGroups[g.key] : !g.defaultOpen;
        return `
          <div class="pipeline-group-head ${isCollapsed ? "collapsed" : ""}" data-group="${g.key}">
            <span class="chev">\u25be</span>
            <h3>${g.label}</h3>
            <span class="count">${g.items.length}</span>
          </div>
          <div class="pipeline-group-body ${isCollapsed ? "collapsed" : ""}" data-group-body="${g.key}">
            ${g.items.length === 0 ? '<p class="text-dim" style="padding:8px 10px; font-size:0.82rem;">Nothing here.</p>' : g.items.map(dealRow).join("")}
          </div>
        `;
      }).join("")}
    `;

    board.querySelectorAll(".pipeline-group-head").forEach((head) => {
      head.addEventListener("click", () => {
        const key = head.dataset.group;
        collapsedGroups[key] = !head.classList.contains("collapsed");
        head.classList.toggle("collapsed");
        board.querySelector(`[data-group-body="${key}"]`).classList.toggle("collapsed");
      });
    });

    board.querySelectorAll(".deal-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.tagName === "SELECT") return;
        openDealDetail(row.dataset.dealId);
      });
    });

    board.querySelectorAll(".deal-row-stage").forEach((sel) => {
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

  // Small status-badge helper for job/invoice statuses inside this modal.
  function statusBadge(status) {
    return `<span class="badge badge-${status}">${esc(String(status).replace("_", " "))}</span>`;
  }

  async function openDealDetail(dealId) {
    const [dealData, crewsData, slotsData] = await Promise.all([
      Api.getDeal(dealId),
      Api.listCrews().catch(() => ({ crews: [] })),
      Api.listTimeSlots().catch(() => ({ timeSlots: [] })),
    ]);
    const { deal, estimates, jobs, invoices } = dealData;
    const activity = dealData.activity;
    const crews = crewsData.crews || [];
    const timeSlots = slotsData.timeSlots || [];

    const overlay = buildModal(esc(deal.customer_name), `
      <p class="small-note" style="margin-bottom:16px;">${esc(deal.customer_phone || "")} ${deal.customer_email ? " \u00b7 " + esc(deal.customer_email) : ""}</p>

      ${deal.notes ? `
        <div class="card" style="padding:14px; margin-bottom:20px; background:rgba(245,163,0,0.08); border-color:rgba(245,163,0,0.3);">
          <div style="font-family:var(--font-display); font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em; color:var(--rust); margin-bottom:6px;">What they asked for</div>
          <div style="font-size:0.92rem;">${esc(deal.notes)}</div>
        </div>
      ` : ""}

      <div style="display:flex; align-items:center; gap:8px; margin-bottom:18px;">
        <span class="small-note" style="text-transform:uppercase; letter-spacing:0.04em; font-weight:700;">Stage</span>
        ${statusBadge(deal.stage)}
        <span class="small-note" style="color:var(--steel-light);">\u00b7 advances automatically as you work \u2014 accept an estimate, schedule a job, or create an invoice below</span>
      </div>

      <h3 style="font-size:0.85rem; margin-bottom:10px;">Estimates</h3>
      <div id="estimatesWrap">${estimates.length === 0 ? '<p class="text-dim" style="margin-bottom:16px;">No estimates yet.</p>' :
        estimates.map(e => `
          <div class="card" style="padding:12px; margin-bottom:8px;">
            <div class="flex items-center" style="justify-content:space-between; gap:12px;">
              <span>Total: <strong>${money(e.total)}</strong></span>
              ${e.accepted
                ? '<span class="badge badge-won">\u2713 Accepted</span>'
                : `<button class="btn btn-primary btn-sm accept-estimate-btn" data-estimate-id="${e.id}">Accept \u2192 Won</button>`
              }
            </div>
            ${!e.accepted ? `<button class="btn btn-ghost btn-sm copy-estimate-link-btn" data-token="${e.share_token}" style="margin-top:10px; width:100%;"><svg><use href="#icon-download"/></svg> Copy Customer Approval Link</button>` : ""}
          </div>
        `).join("")
      }</div>
      <button class="btn btn-ghost btn-sm" id="newEstimateBtn" style="margin-bottom:20px;"><svg><use href="#icon-plus"/></svg> New Estimate</button>

      <h3 style="font-size:0.85rem; margin-bottom:10px;">Jobs &amp; Scheduling</h3>
      <div id="jobsWrap">${jobs.length === 0 ? '<p class="text-dim" style="margin-bottom:16px;">No jobs yet.</p>' :
        jobs.map(j => jobEditCard(j, crews, timeSlots)).join("")
      }</div>
      <button class="btn btn-ghost btn-sm" id="newJobBtn" style="margin-bottom:20px;"><svg><use href="#icon-plus"/></svg> New Job</button>

      <h3 style="font-size:0.85rem; margin-bottom:10px;">Invoices</h3>
      <div id="invoicesWrap">${invoices.length === 0 ? '<p class="text-dim" style="margin-bottom:16px;">No invoices yet.</p>' :
        invoices.map(inv => invoiceCard(inv)).join("")
      }</div>
      ${jobs.length > 0 ? `<button class="btn btn-ghost btn-sm" id="newInvoiceBtn" style="margin-bottom:20px;"><svg><use href="#icon-plus"/></svg> New Invoice</button>`
        : `<p class="small-note" style="margin-bottom:20px;">Add a job first \u2014 invoices are tied to a specific job.</p>`}

      <h3 style="font-size:0.85rem; margin-bottom:10px;">Activity</h3>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${activity.map(a => `<div class="small-note">${esc(a.note)}</div>`).join("") || '<p class="text-dim">No activity yet.</p>'}
      </div>
    `);

    wireDealDetailEvents(overlay, dealId, jobs, estimates, crews, timeSlots);
  }

  // Rebuilds the modal in place after any action (saving a job, creating
  // an invoice, etc.) so the whole screen stays open and current instead
  // of closing after every single step — that's the point of doing
  // estimates, scheduling, and invoicing from one screen.
  async function refreshDealDetail(dealId) {
    await openDealDetail(dealId);
    await loadBoard();
  }

  function jobEditCard(j, crews, timeSlots) {
    return `
      <div class="card" style="padding:14px; margin-bottom:8px;" data-job-id="${j.id}">
        <div class="flex items-center" style="justify-content:space-between; margin-bottom:10px;">
          <span class="small-note" style="font-weight:700;">Job #${j.id}</span>
          ${statusBadge(j.status)}
        </div>
        <div class="form-row">
          <div class="field">
            <label>Date</label>
            <input type="date" class="job-date-input" value="${j.scheduled_date || ""}">
          </div>
          <div class="field">
            <label>Time Window</label>
            <select class="job-slot-select">
              <option value="">\u2014 No specific window \u2014</option>
              ${timeSlots.map((s) => `<option value="${s.key}" ${s.key === j.scheduled_time_slot ? "selected" : ""}>${esc(s.label)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label>Crew</label>
            <select class="job-crew-select">
              <option value="">\u2014 Unassigned \u2014</option>
              ${crews.map((c) => `<option value="${c.id}" ${String(c.id) === String(j.crew_id) ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Status</label>
            <select class="job-status-select">
              ${["scheduled", "in_progress", "complete", "canceled"].map((s) => `<option value="${s}" ${s === j.status ? "selected" : ""}>${s.replace("_"," ")}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="field" style="margin-bottom:10px;">
          <label>Address</label>
          <input type="text" class="job-address-input" value="${esc(j.address || "")}">
        </div>
        <button class="btn btn-primary btn-sm save-job-btn" data-job-id="${j.id}" style="width:100%;">Save Job</button>
      </div>
    `;
  }

  function invoiceCard(inv) {
    return `
      <div class="card" style="padding:12px; margin-bottom:8px;" data-invoice-id="${inv.id}">
        <div class="flex items-center" style="justify-content:space-between; gap:12px; margin-bottom:8px;">
          <span>Invoice #${inv.id}: <strong>${money(inv.amount)}</strong></span>
          ${statusBadge(inv.status)}
        </div>
        <div class="flex gap-8" style="flex-wrap:wrap;">
          ${inv.status !== "paid"
            ? `<button class="btn btn-ghost btn-sm mark-invoice-paid-btn" data-invoice-id="${inv.id}">Mark Paid</button>`
            : `<button class="btn btn-ghost btn-sm mark-invoice-unpaid-btn" data-invoice-id="${inv.id}">Mark Unpaid</button>`
          }
          <button class="btn btn-ghost btn-sm download-invoice-pdf-btn" data-invoice-id="${inv.id}">PDF</button>
          ${inv.status !== "paid" ? `<button class="btn btn-ghost btn-sm copy-invoice-link-btn" data-token="${inv.share_token}">Copy Pay Link</button>` : ""}
        </div>
      </div>
    `;
  }

  function wireDealDetailEvents(overlay, dealId, jobs, estimates, crews, timeSlots) {
    const estBtn = overlay.querySelector("#newEstimateBtn");
    if (estBtn) estBtn.addEventListener("click", () => openEstimateModal(dealId));

    overlay.querySelectorAll(".accept-estimate-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Accept this estimate? This moves the deal to Won and creates a job, ready to schedule.")) return;
        btn.disabled = true;
        btn.textContent = "Working\u2026";
        try {
          const result = await Api.acceptEstimate(btn.dataset.estimateId);
          showToast(`Accepted \u2014 job #${result.job.id} created. Schedule it below when ready.`);
          await refreshDealDetail(dealId);
        } catch (err) {
          showToast(err.message, true);
          btn.disabled = false;
          btn.textContent = "Accept \u2192 Won";
        }
      });
    });

    overlay.querySelectorAll(".copy-estimate-link-btn").forEach((btn) => {
      btn.addEventListener("click", () => copyShareLink(btn, "estimate.html", btn.dataset.token));
    });

    overlay.querySelectorAll(".copy-invoice-link-btn").forEach((btn) => {
      btn.addEventListener("click", () => copyShareLink(btn, "invoice.html", btn.dataset.token));
    });

    overlay.querySelectorAll(".save-job-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".card");
        const payload = {
          scheduled_date: card.querySelector(".job-date-input").value || null,
          scheduled_time_slot: card.querySelector(".job-slot-select").value || null,
          crew_id: card.querySelector(".job-crew-select").value || null,
          status: card.querySelector(".job-status-select").value,
          address: card.querySelector(".job-address-input").value.trim(),
        };
        btn.disabled = true;
        btn.textContent = "Saving\u2026";
        try {
          await Api.updateJob(btn.dataset.jobId, payload);
          showToast(payload.scheduled_date ? "Job updated \u2014 deal moved to Scheduled." : "Job updated.");
          await refreshDealDetail(dealId);
        } catch (err) {
          showToast(err.message, true);
          btn.disabled = false;
          btn.textContent = "Save Job";
        }
      });
    });

    const jobBtn = overlay.querySelector("#newJobBtn");
    if (jobBtn) jobBtn.addEventListener("click", () => openNewJobInlineModal(dealId));

    overlay.querySelectorAll(".mark-invoice-paid-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await Api.updateInvoice(btn.dataset.invoiceId, { status: "paid" });
          showToast("Marked paid");
          await refreshDealDetail(dealId);
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });
    overlay.querySelectorAll(".mark-invoice-unpaid-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await Api.updateInvoice(btn.dataset.invoiceId, { status: "unpaid" });
          showToast("Marked unpaid");
          await refreshDealDetail(dealId);
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });
    overlay.querySelectorAll(".download-invoice-pdf-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await Api.downloadInvoicePdf(btn.dataset.invoiceId);
        } catch (err) {
          showToast(err.message, true);
        } finally {
          btn.disabled = false;
        }
      });
    });

    const newInvBtn = overlay.querySelector("#newInvoiceBtn");
    if (newInvBtn) newInvBtn.addEventListener("click", () => openNewInvoiceInlineModal(dealId, jobs, estimates));
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
        showToast("Estimate saved");
        await refreshDealDetail(dealId);
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  async function openNewJobInlineModal(dealId) {
    const [crewsData, slotsData] = await Promise.all([
      Api.listCrews().catch(() => ({ crews: [] })),
      Api.listTimeSlots().catch(() => ({ timeSlots: [] })),
    ]);
    const crews = crewsData.crews || [];
    const timeSlots = slotsData.timeSlots || [];

    const overlay = buildModal("New Job", `
      <div class="form-row">
        <div class="field"><label>Date</label><input type="date" id="njDate"></div>
        <div class="field">
          <label>Time Window</label>
          <select id="njSlot"><option value="">\u2014 No specific window \u2014</option>${timeSlots.map((s) => `<option value="${s.key}">${esc(s.label)}</option>`).join("")}</select>
        </div>
      </div>
      <div class="field">
        <label>Crew</label>
        <select id="njCrew"><option value="">\u2014 Unassigned \u2014</option>${crews.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Address</label><input type="text" id="njAddress"></div>
      <button class="btn btn-primary" id="saveNewJobBtn" style="width:100%; margin-top:8px;">Create Job</button>
    `);

    overlay.querySelector("#saveNewJobBtn").addEventListener("click", async () => {
      const payload = {
        deal_id: dealId,
        scheduled_date: overlay.querySelector("#njDate").value || null,
        scheduled_time_slot: overlay.querySelector("#njSlot").value || null,
        crew_id: overlay.querySelector("#njCrew").value || null,
        address: overlay.querySelector("#njAddress").value.trim(),
      };
      try {
        await Api.createJob(payload);
        showToast(payload.scheduled_date ? "Job created \u2014 deal moved to Scheduled." : "Job created.");
        await refreshDealDetail(dealId);
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  async function openNewInvoiceInlineModal(dealId, jobs, estimates) {
    const overlay = buildModal("New Invoice", `
      <div class="field">
        <label>Job</label>
        <select id="niJob">${jobs.map((j) => `<option value="${j.id}">Job #${j.id} \u2014 ${esc(j.address || "no address")}</option>`).join("")}</select>
      </div>
      <div class="field">
        <label>Amount ($) <span class="small-note">(leave blank to use the latest estimate)</span></label>
        <input type="number" id="niAmount" min="0" step="0.01">
      </div>
      <div class="field"><label>Due Date</label><input type="date" id="niDueDate"></div>
      <button class="btn btn-primary" id="saveNewInvoiceBtn" style="width:100%; margin-top:8px;">Create Invoice</button>
    `);

    overlay.querySelector("#saveNewInvoiceBtn").addEventListener("click", async () => {
      const jobId = overlay.querySelector("#niJob").value;
      const amountRaw = overlay.querySelector("#niAmount").value;
      const dueDate = overlay.querySelector("#niDueDate").value;
      const payload = { job_id: jobId, due_date: dueDate || null };
      if (amountRaw) {
        payload.amount = Number(amountRaw);
      } else if (estimates.length > 0) {
        payload.estimate_id = estimates[0].id;
      } else {
        showToast("No estimate on file \u2014 enter an amount manually", true);
        return;
      }
      try {
        await Api.createInvoice(payload);
        showToast("Invoice created \u2014 deal moved to Invoiced.");
        await refreshDealDetail(dealId);
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
