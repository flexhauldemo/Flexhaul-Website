// ============================================================
// FLEXHAUL & DEMOLITION — sofa & furniture pickup schedule
//
// Sofa & furniture pickup currently runs on a limited every-other-
// Saturday cadence while the crew scales up capacity. This file is
// the ONE place that schedule lives — every page pulls from here,
// so updating it in one spot updates the whole site.
//
// TO UPDATE WHEN AVAILABILITY CHANGES:
//   - Moving to every Saturday?      change CYCLE_DAYS to 7
//   - Moving to full same-week?      remove the schedule callouts
//                                     from the pages (ask your dev)
//   - Just need a new starting date? change ANCHOR_DATE below
//
// ANCHOR_DATE must be a Saturday — the first confirmed pickup date.
// Every CYCLE_DAYS after that is another pickup Saturday.
// ============================================================

var FlexSchedule = (function () {
  "use strict";

  var ANCHOR_DATE = new Date(2026, 6, 18); // July 18, 2026 (month is 0-indexed: 6 = July)
  var CYCLE_DAYS = 14; // every other Saturday

  var WINDOWS = [
    { start: "9:00 AM", end: "11:00 AM" },
    { start: "10:00 AM", end: "12:00 PM" },
    { start: "11:00 AM", end: "1:00 PM" },
    { start: "12:00 PM", end: "2:00 PM" },
    { start: "1:00 PM", end: "3:00 PM" },
    { start: "2:00 PM", end: "4:00 PM" },
    { start: "3:00 PM", end: "5:00 PM" },
    { start: "4:00 PM", end: "6:00 PM" },
  ];

  function startOfDay(d) {
    var x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  // Returns the next available pickup Saturday on or after "now".
  function getNextPickupDate(now) {
    var today = startOfDay(now || new Date());
    var anchor = startOfDay(ANCHOR_DATE);
    if (today <= anchor) return anchor;
    var diffDays = Math.round((today - anchor) / 86400000);
    var cyclesPassed = Math.ceil(diffDays / CYCLE_DAYS);
    var next = new Date(anchor.getTime());
    next.setDate(anchor.getDate() + cyclesPassed * CYCLE_DAYS);
    return next;
  }

  function formatDate(d) {
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatDateShort(d) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function getWindows() {
    return WINDOWS.slice();
  }

  return {
    getNextPickupDate: getNextPickupDate,
    formatDate: formatDate,
    formatDateShort: formatDateShort,
    getWindows: getWindows,
    ANCHOR_DATE: ANCHOR_DATE,
    CYCLE_DAYS: CYCLE_DAYS,
  };
})();

// Auto-populate any matching elements on the page. Safe to include
// on every page — it simply does nothing if none of these are present.
document.addEventListener("DOMContentLoaded", function () {
  var nextDate = FlexSchedule.getNextPickupDate();
  var windows = FlexSchedule.getWindows();

  document.querySelectorAll("[data-next-pickup-date]").forEach(function (el) {
    el.textContent = FlexSchedule.formatDate(nextDate);
  });

  document.querySelectorAll("[data-pickup-window]").forEach(function (el) {
    var idx = parseInt(el.getAttribute("data-pickup-window"), 10);
    var w = windows[idx];
    if (w) el.textContent = w.start + " – " + w.end;
  });

  document.querySelectorAll("[data-pickup-window-select]").forEach(function (select) {
    var dateStr = FlexSchedule.formatDate(nextDate);
    windows.forEach(function (w, i) {
      var opt = document.createElement("option");
      opt.value = dateStr + ", " + w.start + "–" + w.end;
      opt.textContent = w.start + " – " + w.end;
      select.appendChild(opt);
    });
  });
});
