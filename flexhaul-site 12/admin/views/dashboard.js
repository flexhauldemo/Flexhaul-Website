// admin/views/dashboard.js
(function () {
  "use strict";

  function fmtDate(d) {
    if (!d) return "\u2014";
    try {
      return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch (e) { return d; }
  }
  function fmtDateTime(d) {
    if (!d) return "\u2014";
    try {
      return new Date(d.replace(" ", "T") + "Z").toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch (e) { return d; }
  }
  // See the matching helper in jobs.js — small local copy, no shared
  // module since this project has no build step.
  function fmtTimeSlot(key) {
    if (!key) return null;
    const [start] = key.split("-");
    let [h, m] = start.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
  }
  function money(n) {
    return "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function render(container) {
    const data = await Api.dashboard();

    const stageLabels = {
      new_lead: "New Lead", quoted: "Quoted", won: "Won", scheduled: "Scheduled",
      complete: "Complete", invoiced: "Invoiced", lost: "Lost",
    };

    container.innerHTML = `
      <div class="main-header"><h1>Dashboard</h1></div>

      <div class="grid stat-grid">
        <div class="stat-card"><div class="num">${data.open_deals}</div><div class="lbl">Open Deals</div></div>
        <div class="stat-card"><div class="num">${data.jobs_this_week}</div><div class="lbl">Jobs This Week</div></div>
        <div class="stat-card"><div class="num">${data.overdue_invoices.count}</div><div class="lbl">Overdue Invoices</div></div>
        <div class="stat-card"><div class="num">${money(data.overdue_invoices.total)}</div><div class="lbl">Overdue Amount</div></div>
      </div>

      <div class="grid" style="grid-template-columns:1.3fr 1fr; align-items:start;">
        <div class="card">
          <h3 style="margin-bottom:14px; font-size:1rem;">Upcoming Jobs</h3>
          ${
            data.upcoming_jobs.length === 0
              ? '<p class="text-dim">No jobs scheduled yet.</p>'
              : `<div class="table-wrap" style="border:none;"><table class="data" id="upcomingJobsTable">
                  <thead><tr><th>Date</th><th>Time</th><th>Customer</th><th>Address</th><th>Status</th></tr></thead>
                  <tbody>
                    ${data.upcoming_jobs.map(j => `
                      <tr data-job-id="${j.id}">
                        <td>${fmtDate(j.scheduled_date)}</td>
                        <td>${esc(fmtTimeSlot(j.scheduled_time_slot) || "\u2014")}</td>
                        <td>${esc(j.customer_name)}</td>
                        <td>${esc(j.address || "\u2014")}</td>
                        <td><span class="badge badge-${j.status}">${esc(j.status.replace("_"," "))}</span></td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table></div>`
          }
        </div>

        <div class="card">
          <h3 style="margin-bottom:14px; font-size:1rem;">Pipeline Snapshot</h3>
          ${
            data.pipeline_by_stage.length === 0
              ? '<p class="text-dim">No deals yet.</p>'
              : data.pipeline_by_stage.map(s => `
                <div class="flex items-center" style="justify-content:space-between; padding:9px 0; border-bottom:1px solid rgba(28,24,18,0.06);">
                  <span class="badge badge-${s.stage}">${esc(stageLabels[s.stage] || s.stage)}</span>
                  <span style="font-family:var(--font-mono); font-size:0.85rem;">${s.n} \u00b7 ${money(s.value)}</span>
                </div>
              `).join("")
          }

          <h3 style="margin:22px 0 14px; font-size:1rem;">Recent Activity</h3>
          ${
            data.recent_activity.length === 0
              ? '<p class="text-dim">No activity yet.</p>'
              : `<div style="display:flex; flex-direction:column; gap:10px;">
                  ${data.recent_activity.slice(0, 8).map(a => `
                    <div style="font-size:0.85rem;">
                      <div>${esc(a.note)}</div>
                      <div class="small-note">${fmtDateTime(a.created_at)}${a.created_by ? " \u00b7 " + esc(a.created_by) : ""}</div>
                    </div>
                  `).join("")}
                </div>`
          }
        </div>
      </div>
    `;

    container.querySelectorAll("#upcomingJobsTable tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => {
        window.__openJobId = tr.dataset.jobId;
        navigateTo("jobs");
      });
    });
  }

  window.Views = window.Views || {};
  window.Views.dashboard = render;
})();
