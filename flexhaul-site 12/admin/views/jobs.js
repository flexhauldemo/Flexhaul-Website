// admin/views/jobs.js
(function () {
  "use strict";

  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtDate(d) {
    if (!d) return "Unscheduled";
    try { return new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); }
    catch (e) { return d; }
  }
  // Formats a stored time-slot key ("08:00-10:00") into a human label
  // ("8:00 AM – 10:00 AM") without needing another API round-trip — the
  // key format is stable (see api/constants/timeSlots.js).
  function fmtTimeSlot(key) {
    if (!key) return null;
    const [start, end] = key.split("-");
    const fmt = (t) => {
      let [h, m] = t.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
    };
    return `${fmt(start)} \u2013 ${fmt(end)}`;
  }

  async function render(container) {
    container.innerHTML = `
      <div class="main-header">
        <h1>Jobs</h1>
        <button class="btn btn-primary" id="newJobBtn"><svg><use href="#icon-plus"/></svg> New Job</button>
      </div>
      <div class="table-wrap" id="jobsTableWrap"></div>
    `;

    document.getElementById("newJobBtn").addEventListener("click", () => openNewJobModal());
    await loadList();

    if (window.__openJobId) {
      const id = window.__openJobId;
      window.__openJobId = null;
      openJobDetail(id);
    }
    if (window.__prefillDealId) {
      const dealId = window.__prefillDealId;
      window.__prefillDealId = null;
      openNewJobModal(dealId);
    }
  }

  async function loadList() {
    const wrap = document.getElementById("jobsTableWrap");
    const { jobs } = await Api.listJobs();

    if (jobs.length === 0) {
      wrap.innerHTML = '<div class="empty-state">No jobs yet.</div>';
      return;
    }

    wrap.innerHTML = `
      <table class="data">
        <thead><tr><th>Date</th><th>Time Window</th><th>Customer</th><th>Address</th><th>Crew</th><th>Status</th></tr></thead>
        <tbody>
          ${jobs.map((j) => `
            <tr data-id="${j.id}">
              <td>${fmtDate(j.scheduled_date)}</td>
              <td>${esc(fmtTimeSlot(j.scheduled_time_slot) || "\u2014")}</td>
              <td>${esc(j.customer_name)}</td>
              <td>${esc(j.address || "\u2014")}</td>
              <td>${esc(j.crew_name || "\u2014")}</td>
              <td><span class="badge badge-${j.status}">${esc(j.status.replace("_"," "))}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    wrap.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.addEventListener("click", () => openJobDetail(tr.dataset.id));
    });
  }

  async function openNewJobModal(prefillDealId) {
    const overlay = buildModal("New Job", `
      <div class="field">
        <label>Deal (must be a won deal)</label>
        <select id="jDeal"><option value="">Loading\u2026</option></select>
      </div>
      <div class="form-row">
        <div class="field"><label>Scheduled Date</label><input type="date" id="jDate"></div>
        <div class="field">
          <label>Time Window</label>
          <select id="jTimeSlot"><option value="">\u2014 No specific window \u2014</option></select>
        </div>
      </div>
      <div class="field">
        <label>Crew</label>
        <select id="jCrew"><option value="">\u2014 Unassigned \u2014</option></select>
      </div>
      <div class="field"><label>Address</label><input type="text" id="jAddress"></div>
      <div class="field"><label>Notes</label><textarea id="jNotes"></textarea></div>
      <button class="btn btn-primary" id="saveJobBtn" style="width:100%;">Create Job</button>
    `);

    const [{ deals }, { crews }, { timeSlots }] = await Promise.all([Api.listDeals(), Api.listCrews(), Api.listTimeSlots()]);
    const wonDeals = deals.filter((d) => ["won", "scheduled", "complete"].includes(d.stage));
    overlay.querySelector("#jDeal").innerHTML = wonDeals.map(
      (d) => `<option value="${d.id}" ${String(d.id) === String(prefillDealId) ? "selected" : ""}>${esc(d.customer_name)} \u2014 ${esc(d.stage)}</option>`
    ).join("") || '<option value="">No won deals yet</option>';
    overlay.querySelector("#jCrew").innerHTML += crews.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    overlay.querySelector("#jTimeSlot").innerHTML += timeSlots.map((s) => `<option value="${s.key}">${esc(s.label)}</option>`).join("");

    overlay.querySelector("#saveJobBtn").addEventListener("click", async () => {
      const dealId = overlay.querySelector("#jDeal").value;
      if (!dealId) { showToast("Select a deal first", true); return; }
      try {
        await Api.createJob({
          deal_id: dealId,
          scheduled_date: overlay.querySelector("#jDate").value || null,
          scheduled_time_slot: overlay.querySelector("#jTimeSlot").value || null,
          crew_id: overlay.querySelector("#jCrew").value || null,
          address: overlay.querySelector("#jAddress").value.trim(),
          notes: overlay.querySelector("#jNotes").value.trim(),
        });
        closeModal();
        showToast("Job created");
        await loadList();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  async function openJobDetail(id) {
    const [{ job, documents, invoices }, { timeSlots }] = await Promise.all([Api.getJob(id), Api.listTimeSlots()]);

    const overlay = buildModal(esc(job.customer_name), `
      <div class="form-row">
        <div class="field">
          <label>Status</label>
          <select id="jobStatusSelect">
            ${["scheduled","in_progress","complete","canceled"].map(s =>
              `<option value="${s}" ${s===job.status?"selected":""}>${s.replace("_"," ")}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Scheduled Date</label><input type="date" id="jobDateInput" value="${job.scheduled_date || ""}"></div>
      </div>
      <div class="field">
        <label>Time Window</label>
        <select id="jobTimeSlotSelect">
          <option value="">\u2014 No specific window \u2014</option>
          ${timeSlots.map((s) => `<option value="${s.key}" ${s.key === job.scheduled_time_slot ? "selected" : ""}>${esc(s.label)}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Address</label><input type="text" id="jobAddressInput" value="${esc(job.address || "")}"></div>
      <div class="field"><label>Notes</label><textarea id="jobNotesInput">${esc(job.notes || "")}</textarea></div>
      <button class="btn btn-ghost btn-sm" id="saveJobDetailBtn" style="margin-bottom:20px;">Save Changes</button>

      <h3 style="font-size:0.85rem; margin-bottom:10px;">Photos &amp; Documents</h3>
      <div id="docsWrap">${renderDocs(documents)}</div>
      <div class="field" style="margin-top:10px;">
        <label>Upload Photo or Document</label>
        <input type="file" id="docFileInput" accept="image/*,application/pdf">
        <select id="docTypeSelect" style="margin-top:8px;">
          <option value="photo">Photo</option>
          <option value="permit">Permit</option>
          <option value="environmental_survey">Environmental Survey</option>
          <option value="coi">Certificate of Insurance</option>
          <option value="other">Other</option>
        </select>
        <button class="btn btn-ghost btn-sm" id="uploadDocBtn" style="margin-top:8px;"><svg><use href="#icon-upload"/></svg> Upload</button>
      </div>

      <h3 style="font-size:0.85rem; margin:20px 0 10px;">Invoices</h3>
      ${invoices.length === 0 ? '<p class="text-dim" style="margin-bottom:12px;">No invoices yet.</p>' :
        invoices.map(inv => `<div class="card" style="padding:12px; margin-bottom:8px; display:flex; justify-content:space-between;">
          <span class="badge badge-${inv.status}">${esc(inv.status)}</span>
          <span style="font-family:var(--font-mono);">$${Number(inv.amount).toLocaleString()}</span>
        </div>`).join("")
      }
      <button class="btn btn-ghost btn-sm" id="goInvoicesBtn">Manage Invoices \u2192</button>
    `);

    overlay.querySelector("#saveJobDetailBtn").addEventListener("click", async () => {
      try {
        await Api.updateJob(id, {
          status: overlay.querySelector("#jobStatusSelect").value,
          scheduled_date: overlay.querySelector("#jobDateInput").value || null,
          scheduled_time_slot: overlay.querySelector("#jobTimeSlotSelect").value || null,
          address: overlay.querySelector("#jobAddressInput").value.trim(),
          notes: overlay.querySelector("#jobNotesInput").value.trim(),
        });
        showToast("Job updated");
        await loadList();
      } catch (err) {
        showToast(err.message, true);
      }
    });

    overlay.querySelector("#uploadDocBtn").addEventListener("click", async () => {
      const fileInput = overlay.querySelector("#docFileInput");
      if (!fileInput.files[0]) { showToast("Choose a file first", true); return; }
      const fd = new FormData();
      fd.append("file", fileInput.files[0]);
      fd.append("job_id", id);
      fd.append("type", overlay.querySelector("#docTypeSelect").value);
      try {
        await Api.uploadDocument(fd);
        const { documents: freshDocs } = await Api.getJob(id).then(r => r);
        overlay.querySelector("#docsWrap").innerHTML = renderDocs(freshDocs);
        wireDocDeletes(overlay, id);
        showToast("Document uploaded");
      } catch (err) {
        showToast(err.message, true);
      }
    });

    overlay.querySelector("#goInvoicesBtn").addEventListener("click", () => {
      closeModal();
      navigateTo("invoices");
    });

    wireDocDeletes(overlay, id);
  }

  function renderDocs(documents) {
    if (documents.length === 0) return '<p class="text-dim">No documents yet.</p>';
    return documents.map((d) => `
      <div class="doc-thumb" data-doc-id="${d.id}">
        <div style="flex:1;">
          <div style="font-size:0.85rem; font-weight:600;">${esc(d.original_name || d.file_url)}</div>
          <div class="small-note">${esc(d.type)}</div>
        </div>
        <button class="btn btn-danger btn-sm doc-delete-btn" data-doc-id="${d.id}"><svg><use href="#icon-trash"/></svg></button>
      </div>
    `).join("");
  }

  function wireDocDeletes(overlay, jobId) {
    overlay.querySelectorAll(".doc-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this document?")) return;
        try {
          await Api.deleteDocument(btn.dataset.docId);
          const { documents } = await Api.getJob(jobId);
          overlay.querySelector("#docsWrap").innerHTML = renderDocs(documents);
          wireDocDeletes(overlay, jobId);
          showToast("Document deleted");
        } catch (err) {
          showToast(err.message, true);
        }
      });
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
  window.Views.jobs = render;
})();
