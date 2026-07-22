// netlify/functions/submit-quote.js
//
// Receives a quote request from contact.html, stores it in Netlify Blobs
// (a simple built-in key-value store — no separate database needed), and
// sends an instant SMS confirmation via Twilio if the customer opted in.
//
// ENVIRONMENT VARIABLES REQUIRED (set in Netlify: Site settings > Environment variables):
//   TWILIO_ACCOUNT_SID   - starts with "AC..."
//   TWILIO_AUTH_TOKEN    - from your Twilio Console
//   TWILIO_FROM_NUMBER   - your registered Twilio number, e.g. "+17650000000"
//
// npm packages required (see package.json): twilio, @netlify/blobs

const twilio = require("twilio");
const { getLeadsStore } = require("./_blobStore");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let lead;
  try {
    lead = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  // Basic required-field check — mirrors the validation already in contact.html
  if (!lead.name || !lead.phone || !lead.email || !lead.id) {
    return { statusCode: 400, body: "Missing required fields" };
  }

  // --- 1. Save the lead so the admin dashboard and the reminder job can see it ---
  const store = getLeadsStore();
  await store.setJSON(lead.id, lead);

  // --- 2. Send the instant SMS confirmation, only if the customer opted in ---
  let smsResult = "not requested";
  if (lead.smsOptIn && lead.phone) {
    try {
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      const bodyLines = [
        `FlexHaul & Demolition: Your request ${lead.id} is confirmed!`,
      ];
      if (lead.pickupWindow) {
        bodyLines.push(`Pickup window requested: ${lead.pickupWindow}.`);
      }
      bodyLines.push("We'll follow up same-day to lock in the details. Reply STOP to opt out.");

      await client.messages.create({
        body: bodyLines.join(" "),
        from: process.env.TWILIO_FROM_NUMBER,
        to: normalizePhone(lead.phone),
      });
      smsResult = "sent";
    } catch (err) {
      // Don't fail the whole submission just because the text didn't go out —
      // the lead is already saved, and email/phone follow-up still works.
      console.error("Twilio send failed:", err.message);
      smsResult = "failed: " + err.message;
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, id: lead.id, sms: smsResult }),
  };
};

// Very light phone normalization — assumes US numbers. Strips everything
// but digits, then adds +1. Swap this out if you ever serve non-US customers.
function normalizePhone(raw) {
  var digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits[0] === "1") return "+" + digits;
  return raw; // fall back to whatever was typed, Twilio will reject if invalid
}
