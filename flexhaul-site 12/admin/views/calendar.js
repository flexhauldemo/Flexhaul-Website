// admin/views/calendar.js
(function () {
  "use strict";

  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // See the matching helper in jobs.js — same key format, kept as a
  // small local copy rather than a shared import since this project has
  // no build step to wire modules together.
  function fmtTimeSlot(key) {
    if (!key) return null;
    const [start] = key.split("-");
    let [h, m] = start.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  let viewDate = new Date();

  async function render(container) {
    container.innerHTML = `
      <div class="main-header">
        <h1>Calendar</h1>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" id="prevMonthBtn">\u2190</button>
          <span id="monthLabel" style="font-family:var(--font-display); font-weight:700; text-transform:uppercase; align-self:center; padding:0 8px;"></span>
          <button class="btn btn-ghost btn-sm" id="nextMonthBtn">\u2192</button>
        </div>
      </div>
      <div class="cal-day-labels" style="display:grid; grid-template-columns:repeat(7,1fr); gap:6px; margin-bottom:4px;">
        ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => `<div class="cal-day-label">${d}</div>`).join("")}
      </div>
      <div class="cal-grid" id="calGrid"></div>
    `;

    document.getElementById("prevMonthBtn").addEventListener("click", () => { viewDate.setMonth(viewDate.getMonth() - 1); renderMonth(); });
    document.getElementById("nextMonthBtn").addEventListener("click", () => { viewDate.setMonth(viewDate.getMonth() + 1); renderMonth(); });

    await renderMonth();
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

  async function renderMonth() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    document.getElementById("monthLabel").textContent = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const gridStart = new Date(year, month, 1 - startWeekday);
    const gridEnd = new Date(year, month, daysInMonth + (6 - new Date(year, month, daysInMonth).getDay()));

    const { jobs } = await Api.listJobs({ from: toISODate(gridStart), to: toISODate(gridEnd) });
    const jobsByDate = {};
    jobs.forEach((j) => {
      if (!j.scheduled_date) return;
      (jobsByDate[j.scheduled_date] = jobsByDate[j.scheduled_date] || []).push(j);
    });

    const grid = document.getElementById("calGrid");
    const cells = [];
    let cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      const iso = toISODate(cursor);
      const isOtherMonth = cursor.getMonth() !== month;
      const dayJobs = jobsByDate[iso] || [];
      cells.push(`
        <div class="cal-cell ${isOtherMonth ? "is-other-month" : ""}">
          <div class="date-num">${cursor.getDate()}</div>
          ${dayJobs.map((j) => `<div class="cal-job" data-job-id="${j.id}" title="${esc(j.customer_name)}${j.scheduled_time_slot ? ' \u2014 ' + esc(fmtTimeSlot(j.scheduled_time_slot)) : ''}">${j.scheduled_time_slot ? `<strong>${esc(fmtTimeSlot(j.scheduled_time_slot))}</strong> ` : ''}${esc(j.customer_name)}</div>`).join("")}
        </div>
      `);
      cursor.setDate(cursor.getDate() + 1);
    }
    grid.innerHTML = cells.join("");

    grid.querySelectorAll(".cal-job").forEach((el) => {
      el.addEventListener("click", () => {
        window.__openJobId = el.dataset.jobId;
        navigateTo("jobs");
      });
    });
  }

  window.Views = window.Views || {};
  window.Views.calendar = render;
})();
