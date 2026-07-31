// ============================================================
// FLEXHAUL & DEMOLITION — sofa & furniture pickup schedule
//
// Sofa & furniture pickup runs every Saturday, in nine 2-hour windows
// (8 AM – 6 PM). This file is the ONE place that schedule lives — every
// page pulls from here, so updating it in one spot updates the whole
// site.
//
// The WINDOWS list below must stay in sync with the backend's own copy
// at constants/timeSlots.js (key strings especially — they're how a
// booking here gets matched against a real job later). If you change
// one, change both.
//
// TO UPDATE WHEN AVAILABILITY CHANGES:
//   - Moving to every OTHER Saturday again?  change CYCLE_DAYS to 14
//   - Just need a new starting date?          change ANCHOR_DATE below
//
// ANCHOR_DATE must be a Saturday — the first confirmed pickup date.
// Every CYCLE_DAYS after that is another pickup Saturday.
// ============================================================

var FlexSchedule = (function () {
  "use strict";

  var ANCHOR_DATE = new Date(2026, 6, 18); // July 18, 2026 (month is 0-indexed: 6 = July)
  var CYCLE_DAYS = 7; // every Saturday

  // Matches constants/timeSlots.js on the backend exactly — 9 windows,
  // 8 AM to 6 PM. `key` is what gets sent to /api/public/availability
  // and is never shown to a customer; `start`/`end` are the display copy.
  var WINDOWS = [
    { key: "08:00-10:00", start: "8:00 AM", end: "10:00 AM" },
    { key: "09:00-11:00", start: "9:00 AM", end: "11:00 AM" },
    { key: "10:00-12:00", start: "10:00 AM", end: "12:00 PM" },
    { key: "11:00-13:00", start: "11:00 AM", end: "1:00 PM" },
    { key: "12:00-14:00", start: "12:00 PM", end: "2:00 PM" },
    { key: "13:00-15:00", start: "1:00 PM", end: "3:00 PM" },
    { key: "14:00-16:00", start: "2:00 PM", end: "4:00 PM" },
    { key: "15:00-17:00", start: "3:00 PM", end: "5:00 PM" },
    { key: "16:00-18:00", start: "4:00 PM", end: "6:00 PM" },
  ];

  var AVAILABILITY_ENDPOINT = "https://flexhaul-crm-backend.onrender.com/api/public/availability";

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

  // YYYY-MM-DD in LOCAL time (not toISOString, which shifts to UTC and
  // can land on the wrong calendar day depending on the visitor's
  // timezone) — this is what the availability endpoint expects.
  function toISODate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function getWindows() {
    return WINDOWS.slice();
  }

  // Fire-and-forget, same pattern as the rest of the site's calls to
  // the CRM (js/leads.js, furniture-pickup.html's submit handler): the
  // Render backend can take ~50 seconds to wake up from a cold start,
  // and the booking page has to stay usable either way. On any failure
  // or timeout, callback gets an empty list — meaning every window
  // just displays as open, which is the safe default (worst case, a
  // double-booking gets caught and rescheduled by a human when staff
  // confirms the pickup, same as it would have before this existed).
  function fetchAvailability(dateObj, callback) {
    var dateStr = toISODate(dateObj);
    var timedOut = false;
    var timer = setTimeout(function () {
      timedOut = true;
      callback([]);
    }, 6000);

    fetch(AVAILABILITY_ENDPOINT + "?date=" + encodeURIComponent(dateStr))
      .then(function (r) {
        return r.ok ? r.json() : { taken: [] };
      })
      .then(function (data) {
        if (timedOut) return;
        clearTimeout(timer);
        callback(Array.isArray(data.taken) ? data.taken : []);
      })
      .catch(function () {
        if (timedOut) return;
        clearTimeout(timer);
        callback([]);
      });
  }

  return {
    getNextPickupDate: getNextPickupDate,
    formatDate: formatDate,
    formatDateShort: formatDateShort,
    getWindows: getWindows,
    toISODate: toISODate,
    fetchAvailability: fetchAvailability,
    ANCHOR_DATE: ANCHOR_DATE,
    CYCLE_DAYS: CYCLE_DAYS,
  };
})();

// ============================================================
// Auto-populate any matching elements on the page. Safe to include on
// every page — it simply does nothing if none of these are present.
// ============================================================
document.addEventListener("DOMContentLoaded", function () {
  var nextDate = FlexSchedule.getNextPickupDate();
  var windows = FlexSchedule.getWindows();
  var dateStr = FlexSchedule.formatDate(nextDate);

  document.querySelectorAll("[data-next-pickup-date]").forEach(function (el) {
    el.textContent = dateStr;
  });

  // Legacy plain-text slots (data-pickup-window="N") — kept for any page
  // still using the old static-row markup instead of the grid builders
  // below, so nothing breaks if a page hasn't been converted over yet.
  document.querySelectorAll("[data-pickup-window]").forEach(function (el) {
    var idx = parseInt(el.getAttribute("data-pickup-window"), 10);
    var w = windows[idx];
    if (w) el.textContent = w.start + " – " + w.end;
  });

  document.querySelectorAll("[data-pickup-window-select]").forEach(function (select) {
    windows.forEach(function (w) {
      var opt = document.createElement("option");
      opt.value = dateStr + ", " + w.start + "–" + w.end;
      opt.textContent = w.start + " – " + w.end;
      select.appendChild(opt);
    });
  });

  // ---- Read-only display grid (home page schedule teaser) ----
  // Renders all 9 windows as plain rows. Once availability comes back,
  // any taken window gets a "Booked" tag — informational only, nothing
  // to click here; the CTA below it sends the visitor to the real
  // booking page.
  document.querySelectorAll("[data-pickup-window-display]").forEach(function (container) {
    container.innerHTML = windows
      .map(function (w, i) {
        return (
          '<div class="ticket-row" data-window-row="' + w.key + '">' +
          '<span class="label">Window ' + (i + 1) + "</span>" +
          '<span class="value">' + w.start + " – " + w.end + "</span>" +
          "</div>"
        );
      })
      .join("");

    FlexSchedule.fetchAvailability(nextDate, function (taken) {
      taken.forEach(function (key) {
        var row = container.querySelector('[data-window-row="' + key + '"]');
        if (row) {
          row.classList.add("is-booked");
          row.querySelector(".value").innerHTML = '<span class="booked-tag">Booked</span>';
        }
      });
    });
  });

  // ---- Interactive picker (furniture-pickup.html booking form) ----
  // Renders all 9 windows as a radio group styled like clickable cards
  // (same visual language as the "how much are we picking up" tier
  // buttons above it). Once availability comes back, any taken window
  // is disabled and labeled "Booked" so it physically can't be selected
  // — not just visually discouraged.
  document.querySelectorAll("[data-pickup-window-picker]").forEach(function (container) {
    container.innerHTML = windows
      .map(function (w, i) {
        var id = "pw-" + w.key;
        var value = dateStr + ", " + w.start + "–" + w.end;
        return (
          '<input type="radio" name="pickupWindow" id="' + id + '" value="' + value + '" data-window-key="' + w.key + '" required>' +
          '<label for="' + id + '">' +
          '<b>Window ' + (i + 1) + "</b>" +
          "<span>" + w.start + " – " + w.end + "</span>" +
          '<span class="booked-tag" hidden>Booked</span>' +
          "</label>"
        );
      })
      .join("");

    FlexSchedule.fetchAvailability(nextDate, function (taken) {
      taken.forEach(function (key) {
        var input = container.querySelector('[data-window-key="' + key + '"]');
        if (!input) return;
        input.disabled = true;
        var label = container.querySelector('label[for="' + input.id + '"]');
        if (label) {
          label.classList.add("is-booked");
          label.querySelector(".booked-tag").hidden = false;
        }
      });
    });
  });
});
