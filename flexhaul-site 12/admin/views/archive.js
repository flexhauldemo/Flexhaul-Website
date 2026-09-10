// admin/views/archive.js
(function () {
  "use strict";

  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function money(n) { return "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
  function fmtDate(d) {
    if (!d) return "\u2014";
    try { return new Date(d.replace(" ", "T")).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch (e) { return d; }
  }
  function fmtJobDate(d) {
    if (!d) return "unscheduled";
    try { return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
    catch (e) { return d; }
  }

  let allData = { lost: [], completed: [], stats: {}, winBackCandidates: [] };

  async function render(container) {
    container.innerHTML = `
      <div class="main-header">
        <h1>Archive</h1>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" id="downloadLostBtn"><svg><use href="#icon-download"/></svg> Lost (CSV)</button>
          <button class="btn btn-ghost btn-sm" id="downloadCompletedBtn"><svg><use href="#icon-download"/></svg> Completed (CSV)</button>
        </div>
      </div>
      <div class="grid stat-grid" id="archiveStats"></div>
      <div class="field" style="max-width:360px; margin-bottom:20px;">
        <input type="search" id="archiveSearch" placeholder="Search name, phone, email\u2026">
      </div>
      <div id="archiveBody"><div class="loading">Loading\u2026</div></div>
    `;

    document.getElementById("downloadLostBtn").addEventListener("click", async (e) => {
      await runDownload(e.currentTarget, () => Api.downloadArchiveCsv("lost.csv"));
    });
    document.getElementById("downloadCompletedBtn").addEventListener("click", async (e) => {
      await runDownload(e.currentTarget, () => Api.downloadArchiveCsv("completed.csv"));
    });
    document.getElementById("archiveSearch").addEventListener("input", (e) => renderBody(e.target.value));

    await loadData();
  }

  async function runDownload(btn, fn) {
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "Downloading\u2026";
    try {
      await fn();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  async function loadData() {
    allData = await Api.listArchive();
    renderStats();
    renderBody();
  }

  function renderStats() {
    const s = allData.stats;
    document.getElementById("archiveStats").innerHTML = `
      <div class="stat-card"><div class="num">${s.completedCount}</div><div class="lbl">Completed jobs</div></div>
      <div class="stat-card"><div class="num">${money(s.completedRevenue)}</div><div class="lbl">Revenue collected</div></div>
      <div class="stat-card"><div class="num">${s.lostCount}</div><div class="lbl">Lost leads</div></div>
      <div class="stat-card"><div class="num">${s.winRate === null ? "\u2014" : s.winRate + "%"}</div><div class="lbl">Win rate</div></div>
    `;
  }

  function matches(row, q) {
    if (!q) return true;
    const hay = `${row.customer_name || ""} ${row.customer_phone || ""} ${row.customer_email || ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function renderBody(query) {
    const body = document.getElementById("archiveBody");
    const lost = allData.lost.filter((d) => matches(d, query));
    const completed = allData.completed.filter((d) => matches(d, query));
    const winBack = (allData.winBackCandidates || []).filter((d) => matches(d, query));

    const reasonChips = (allData.stats.lostReasonBreakdown || []).map(
      (r) => `<span class="badge badge-new" style="margin-right:6px;">${esc(r.reason)}: ${r.count}</span>`
    ).join("");

    const winBackHtml = winBack.length === 0 ? "" : `
      <h3 style="font-size:0.95rem; margin-bottom:6px;">Win-Back Opportunities <span class="text-dim">(${winBack.length})</span></h3>
      <p class="small-note" style="margin-bottom:12px;">Lost 60+ days ago \u2014 worth a personal "still need this done?" call. Nothing here sends automatically; it's just a reminder list.</p>
      <div class="table-wrap" style="margin-bottom:32px;">
        <table class="data">
          <thead><tr><th>Customer</th><th>Contact</th><th>Reason Lost</th><th>Days Since</th></tr></thead>
          <tbody>
            ${winBack.map((d) => `
              <tr>
                <td><strong>${esc(d.customer_name)}</strong>${d.customer_address ? `<div class="small-note">${esc(d.customer_address)}</div>` : ""}</td>
                <td>${esc(d.customer_phone || "\u2014")}${d.customer_email ? `<div class="small-note">${esc(d.customer_email)}</div>` : ""}</td>
                <td>${esc(d.lost_reason || "\u2014")}</td>
                <td>${d.days_since_lost} days</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    body.innerHTML = `
      ${winBackHtml}
      <h3 style="font-size:0.95rem; margin-bottom:12px;">Completed <span class="text-dim">(${completed.length})</span></h3>
      <div class="table-wrap" style="margin-bottom:32px;">
        ${completed.length === 0 ? '<div class="empty-state">No completed jobs archived yet \u2014 they land here automatically once an invoice is paid in full.</div>' : `
          <table class="data">
            <thead><tr><th>Customer</th><th>Contact</th><th>Service</th><th>Job Date(s)</th><th>Total Paid</th><th>Completed</th></tr></thead>
            <tbody>
              ${completed.map((d) => `
                <tr>
                  <td><strong>${esc(d.customer_name)}</strong>${d.customer_address ? `<div class="small-note">${esc(d.customer_address)}</div>` : ""}</td>
                  <td>${esc(d.customer_phone || "\u2014")}</td>
                  <td>${esc(d.service_type || "\u2014")}</td>
                  <td>${d.jobs.map((j) => fmtJobDate(j.scheduled_date)).join(", ") || "\u2014"}</td>
                  <td>${money(d.total_paid)}</td>
                  <td>${fmtDate(d.archived_at)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `}
      </div>

      <h3 style="font-size:0.95rem; margin-bottom:12px;">Lost <span class="text-dim">(${lost.length})</span></h3>
      ${reasonChips ? `<div style="margin-bottom:12px;">${reasonChips}</div>` : ""}
      <div class="table-wrap">
        ${lost.length === 0 ? '<div class="empty-state">No lost leads archived yet.</div>' : `
          <table class="data">
            <thead><tr><th>Customer</th><th>Contact</th><th>Reason</th><th>Marked Lost</th></tr></thead>
            <tbody>
              ${lost.map((d) => `
                <tr>
                  <td><strong>${esc(d.customer_name)}</strong>${d.customer_address ? `<div class="small-note">${esc(d.customer_address)}</div>` : ""}</td>
                  <td>${esc(d.customer_phone || "\u2014")}${d.customer_email ? `<div class="small-note">${esc(d.customer_email)}</div>` : ""}</td>
                  <td>${esc(d.lost_reason || "\u2014")}</td>
                  <td>${fmtDate(d.archived_at)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `}
      </div>
    `;
  }

  window.Views = window.Views || {};
  window.Views.archive = render;
})();
