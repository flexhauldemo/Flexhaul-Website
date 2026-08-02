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
  // Same avatar-initials treatment as the Pipeline row redesign — small
  // local copy, no shared module since this project has no build step.
  function initials(name) {
    if (!name) return "?";
    const parts = String(name).trim().split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
  }
  // Colors mirror the badge-* classes in styles.css, so a stage or
  // status means the same thing here as it does everywhere else in the
  // app (Pipeline's dots use the same palette).
  const STAGE_DOT_COLOR = {
    new_lead: "var(--steel)", quoted: "var(--rust)", won: "var(--good)",
    scheduled: "var(--info)", complete: "var(--good)", invoiced: "#8a5c00", lost: "var(--rust)",
  };
  const JOB_STATUS_COLOR = {
    scheduled: "var(--info)", in_progress: "#8a5c00", complete: "var(--good)", canceled: "var(--rust)",
  };
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }

  async function render(container) {
    const data = await Api.dashboard();

    const stageLabels = {
      new_lead: "New Lead", quoted: "Quoted", won: "Won", scheduled: "Scheduled",
      complete: "Complete", invoiced: "Invoiced", lost: "Lost",
    };
    const serviceLabels = {
      junk_removal: "Junk Removal / Hauling", furniture_pickup: "Furniture Pickup",
      light_demolition: "Demolition", other: "Other", unspecified: "Unspecified",
    };

    const alerts = data.compliance_alerts || [];
    const revByService = (data.revenue_by_service || []).filter((s) => s.total > 0);
    const leadConversion = data.lead_source_conversion || [];
    const reviewsDue = data.review_requests_due || [];
    const jobCosting = data.job_costing || { jobs_costed: 0, margin: 0 };
    const maxServiceTotal = Math.max(1, ...revByService.map((s) => s.total));

    container.innerHTML = `
      <div class="main-header"><h1>Dashboard</h1></div>

      ${alerts.length === 0 ? "" : `
        <div class="compliance-banner">
          <div class="head"><svg><use href="#icon-alert"/></svg> ${alerts.length} document${alerts.length === 1 ? "" : "s"} need${alerts.length === 1 ? "s" : ""} attention</div>
          ${alerts.map((a) => {
            const d = daysUntil(a.expires_at);
            const isExpired = d !== null && d < 0;
            const when = isExpired ? `Expired ${Math.abs(d)}d ago` : d === 0 ? "Expires today" : `Expires in ${d}d`;
            return `
              <div class="compliance-item">
                <span class="who">${esc((a.type || "document").replace("_", " "))} \u2014 ${esc(a.customer_name)}${a.job_address ? " \u00b7 " + esc(a.job_address) : ""}</span>
                <span class="when ${isExpired ? "is-expired" : ""}">${when}</span>
              </div>
            `;
          }).join("")}
        </div>
      `}

      <div class="grid stat-grid" style="grid-template-columns:repeat(4,1fr); margin-bottom:18px;">
        <div class="stat-card">
          <div class="stat-card-icon" style="background:var(--good-bg); color:var(--good);"><svg><use href="#icon-dollar"/></svg></div>
          <div class="num" style="color:var(--good);">${money(data.total_revenue)}</div>
          <div class="lbl">Total Revenue</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:var(--good-bg); color:var(--good);"><svg><use href="#icon-dollar"/></svg></div>
          <div class="num" style="color:var(--good);">${money(data.revenue_this_month)}</div>
          <div class="lbl">Revenue This Month</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(245,163,0,0.16); color:#8a5c00;"><svg><use href="#icon-clipboard"/></svg></div>
          <div class="num">${money(data.pipeline_value)}</div>
          <div class="lbl">Open Pipeline Value</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:${jobCosting.jobs_costed > 0 ? "var(--good-bg)" : "rgba(111,106,94,0.14)"}; color:${jobCosting.jobs_costed > 0 ? "var(--good)" : "var(--steel)"};"><svg><use href="#icon-truck"/></svg></div>
          <div class="num" style="${jobCosting.jobs_costed > 0 ? "" : "color:var(--steel); font-size:1.1rem;"}">${jobCosting.jobs_costed > 0 ? money(jobCosting.margin) : "No cost data yet"}</div>
          <div class="lbl">${jobCosting.jobs_costed > 0 ? `Margin (${jobCosting.jobs_costed} job${jobCosting.jobs_costed === 1 ? "" : "s"} costed)` : "Margin"}</div>
        </div>
      </div>

      <div class="grid stat-grid">
        <div class="stat-card"><div class="num">${data.open_deals}</div><div class="lbl">Open Deals</div></div>
        <div class="stat-card"><div class="num">${data.jobs_this_week}</div><div class="lbl">Jobs This Week</div></div>
        <div class="stat-card">
          <div class="num" style="${data.overdue_invoices.count > 0 ? "color:var(--rust);" : ""}">${data.overdue_invoices.count}</div>
          <div class="lbl">Overdue Invoices${data.overdue_invoices.count > 0 ? " \u00b7 " + money(data.overdue_invoices.total) : ""}</div>
        </div>
        <div class="stat-card"><div class="num">${reviewsDue.length}</div><div class="lbl">Reviews to Request</div></div>
      </div>

      <div class="grid" style="grid-template-columns:1.3fr 1fr; align-items:start;">
        <div class="card">
          <h3 style="margin-bottom:6px; font-size:1rem;">Upcoming Jobs</h3>
          ${
            data.upcoming_jobs.length === 0
              ? '<p class="text-dim">No jobs scheduled yet.</p>'
              : `<div id="upcomingJobsList">${data.upcoming_jobs.map((j) => {
                  const color = JOB_STATUS_COLOR[j.status] || "var(--steel)";
                  return `
                    <div class="job-row" data-job-id="${j.id}">
                      <div class="deal-avatar" style="background:color-mix(in srgb, ${color} 16%, white); color:${color};">${esc(initials(j.customer_name))}</div>
                      <div class="job-row-main">
                        <div class="name">${esc(j.customer_name)}</div>
                        <div class="addr">${esc(j.address || "\u2014")}</div>
                      </div>
                      <span class="badge badge-${j.status}">${esc(j.status.replace("_", " "))}</span>
                      <div class="job-row-when">${fmtDate(j.scheduled_date)}${j.scheduled_time_slot ? " \u00b7 " + esc(fmtTimeSlot(j.scheduled_time_slot)) : ""}</div>
                    </div>
                  `;
                }).join("")}</div>`
          }
        </div>

        <div class="card">
          <h3 style="margin-bottom:14px; font-size:1rem;">Pipeline Snapshot</h3>
          ${
            data.pipeline_by_stage.length === 0
              ? '<p class="text-dim">No deals yet.</p>'
              : data.pipeline_by_stage.map((s) => `
                <div class="flex items-center" style="justify-content:space-between; padding:9px 0; border-bottom:1px solid rgba(28,24,18,0.06);">
                  <span class="flex items-center gap-8"><span class="stage-dot" style="background:${STAGE_DOT_COLOR[s.stage] || "var(--steel)"};"></span><span class="badge badge-${s.stage}">${esc(stageLabels[s.stage] || s.stage)}</span></span>
                  <span style="font-family:var(--font-mono); font-size:0.85rem;">${s.n} \u00b7 ${money(s.value)}</span>
                </div>
              `).join("")
          }

          <h3 style="margin:22px 0 14px; font-size:1rem;">Recent Activity</h3>
          ${
            data.recent_activity.length === 0
              ? '<p class="text-dim">No activity yet.</p>'
              : `<div style="display:flex; flex-direction:column; gap:10px;">
                  ${data.recent_activity.slice(0, 8).map((a) => `
                    <div style="font-size:0.85rem;">
                      <div>${esc(a.note)}</div>
                      <div class="small-note">${fmtDateTime(a.created_at)}${a.created_by ? " \u00b7 " + esc(a.created_by) : ""}</div>
                    </div>
                  `).join("")}
                </div>`
          }
        </div>
      </div>

      <div class="grid" style="grid-template-columns:1fr 1fr; align-items:start; margin-top:16px;">
        <div class="card">
          <h3 style="margin-bottom:14px; font-size:1rem;">Revenue by Service</h3>
          ${
            revByService.length === 0
              ? '<p class="text-dim">No paid invoices yet.</p>'
              : revByService.map((s) => `
                <div class="bar-row">
                  <span class="bar-label">${esc(serviceLabels[s.service_type] || s.service_type)}</span>
                  <span class="bar-track"><span class="bar-fill" style="width:${Math.round((s.total / maxServiceTotal) * 100)}%;"></span></span>
                  <span class="bar-value">${money(s.total)}</span>
                </div>
              `).join("")
          }
        </div>

        <div class="card">
          <h3 style="margin-bottom:14px; font-size:1rem;">Lead Source Conversion</h3>
          ${
            leadConversion.length === 0
              ? '<p class="text-dim">No leads yet.</p>'
              : leadConversion.map((s) => {
                  const rate = s.total_leads > 0 ? Math.round((s.converted / s.total_leads) * 100) : 0;
                  return `
                    <div class="bar-row">
                      <span class="bar-label">${esc((s.source || "unspecified").replace("_", " "))}</span>
                      <span class="bar-track"><span class="bar-fill" style="width:${rate}%; background:var(--info);"></span></span>
                      <span class="bar-value">${rate}% \u00b7 ${s.total_leads}</span>
                    </div>
                  `;
                }).join("")
          }
        </div>
      </div>
    `;

    container.querySelectorAll("#upcomingJobsList .job-row").forEach((row) => {
      row.addEventListener("click", () => {
        window.__openJobId = row.dataset.jobId;
        navigateTo("jobs");
      });
    });
  }

  window.Views = window.Views || {};
  window.Views.dashboard = render;
})();
