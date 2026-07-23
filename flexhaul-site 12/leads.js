// ============================================================
// FLEXHAUL & DEMOLITION — leads data layer
//
// NOTE FOR THE BUSINESS OWNER / DEVELOPER:
// This site has no server, so there is nowhere for a submitted
// form to "live" other than the browser that submitted it. To make
// the quote form actually useful right now, every submission does
// TWO things:
//   1) Saves a copy to this browser's localStorage, so the
//      /admin.html Dispatch Board has something to show in a demo.
//   2) Opens the visitor's email app with a pre-filled message to
//      your inbox, so you actually receive real requests today.
//
// Before taking this live, replace saveLeadEverywhere() with a real
// submission to a form backend (Formspree, Netlify Forms, a Google
// Sheet via Zapier, or a small database) so every device — not just
// the visitor's own browser — shows up on the Dispatch Board.
// ============================================================

var FlexLeads = (function () {
  "use strict";

  var STORAGE_KEY = "flexhaul_leads_v1";

  function pad(n, len) {
    n = String(n);
    while (n.length < len) n = "0" + n;
    return n;
  }

  function generateTicketId() {
    var d = new Date();
    var datePart =
      d.getFullYear() + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2);
    var existing = getLeads().filter(function (l) {
      return l.id.indexOf("FH-" + datePart) === 0;
    });
    var seq = pad(existing.length + 1, 3);
    // Random 2-char suffix reduces the chance of two different customers,
    // in two different browsers, landing on the same ticket number for
    // the same day — since each browser's local count starts from zero.
    var rand = Math.random().toString(36).slice(2, 4).toUpperCase();
    return "FH-" + datePart + "-" + seq + rand;
  }

  function getLeads() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveLeads(list) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function addLead(lead) {
    var list = getLeads();
    list.unshift(lead);
    saveLeads(list);
    return lead;
  }

  function updateStatus(id, status) {
    var list = getLeads().map(function (l) {
      if (l.id === id) l.status = status;
      return l;
    });
    saveLeads(list);
  }

  function deleteLead(id) {
    var list = getLeads().filter(function (l) {
      return l.id !== id;
    });
    saveLeads(list);
  }

  function clearAll() {
    saveLeads([]);
  }

  function toCSV(list) {
    var cols = [
      "id","createdAt","status","service","name","phone","email",
      "propertyType","categories","contactMethod","description",
      "pickupWindow","smsOptIn"
    ];
    var rows = [cols.join(",")];
    list.forEach(function (l) {
      var row = cols.map(function (c) {
        var v = l[c];
        if (Array.isArray(v)) v = v.join(" | ");
        v = (v === undefined || v === null) ? "" : String(v);
        v = v.replace(/"/g, '""');
        return '"' + v + '"';
      });
      rows.push(row.join(","));
    });
    return rows.join("\r\n");
  }

  function downloadCSV(filename, list) {
    var csv = toCSV(list);
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Builds a mailto: link so real quote requests reach an inbox
  // even though this static site has no backend of its own.
  function buildMailto(toAddress, lead) {
    var subject = "New quote request " + lead.id + " — " + (lead.service || "").toUpperCase();
    var lines = [
      "New request from the FlexHaul & Demolition website:",
      "",
      "Ticket: " + lead.id,
      "Service: " + lead.service,
      "Name: " + lead.name,
      "Phone: " + lead.phone,
      "Email: " + lead.email,
      "Property type: " + (lead.propertyType || "—"),
      "Categories: " + ((lead.categories || []).join(", ") || "—"),
      "Preferred contact: " + lead.contactMethod,
    ];
    if (lead.pickupWindow) {
      lines.push("Requested sofa/furniture pickup window: " + lead.pickupWindow);
    }
    if (lead.smsOptIn) {
      lines.push("Text confirmation & reminder: customer opted IN — text this number when booking, and again the day before the appointment.");
    }
    lines = lines.concat([
      "",
      "Description:",
      lead.description || "—",
      "",
      "Note: photo attachments (if any) were selected in the visitor's browser.",
      "Static sites can't upload files without a backend — ask the",
      "customer to reply to this email with photos attached, or",
      "connect a form backend that accepts file uploads.",
    ]);
    var body = lines.join("\n");
    return (
      "mailto:" + encodeURIComponent(toAddress) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body)
    );
  }

  return {
    generateTicketId: generateTicketId,
    getLeads: getLeads,
    addLead: addLead,
    updateStatus: updateStatus,
    deleteLead: deleteLead,
    clearAll: clearAll,
    downloadCSV: downloadCSV,
    buildMailto: buildMailto,
  };
})();
