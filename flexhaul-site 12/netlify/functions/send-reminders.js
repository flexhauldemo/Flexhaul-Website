// netlify/functions/send-reminders.js
//
// Runs automatically once a day (see the schedule config below). Scans
// every saved lead, and for anyone whose requested pickup date is
// TOMORROW and who opted into texts, sends a reminder SMS.
//
// This only matters for leads that have a pickupWindow value (sofa &
// furniture pickups) — general junk removal/demo jobs aren't on the
// fixed Saturday schedule, so there's no fixed date to remind about yet.
//
// Same environment variables as submit-quote.js:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

const twilio = require("twilio");
const { getLeadsStore } = require("./_blobStore");

exports.handler = async function () {
  const store = getLeadsStore();
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const { blobs } = await store.list();
  let remindersSent = 0;
  let errors = [];

  for (const blob of blobs) {
    const lead = await store.get(blob.key, { type: "json" });
    if (!lead) continue;

    // Only remind people who opted in, gave a pickup window, and whose
    // window's date matches tomorrow, and who haven't already been reminded.
    if (
      lead.smsOptIn &&
      lead.pickupWindow &&
      lead.pickupWindow.indexOf(tomorrowStr) === 0 &&
      !lead.reminderSent
    ) {
      try {
        await client.messages.create({
          body:
            `FlexHaul & Demolition reminder: your sofa/furniture pickup (${lead.id}) ` +
            `is tomorrow — ${lead.pickupWindow}. Reply STOP to opt out.`,
          from: process.env.TWILIO_FROM_NUMBER,
          to: normalizePhone(lead.phone),
        });
        lead.reminderSent = true;
        await store.setJSON(blob.key, lead);
        remindersSent++;
      } catch (err) {
        errors.push({ id: lead.id, error: err.message });
      }
    }
  }

  console.log(`Reminder run complete. Sent: ${remindersSent}. Errors: ${errors.length}`);
  return {
    statusCode: 200,
    body: JSON.stringify({ remindersSent, errors }),
  };
};

function normalizePhone(raw) {
  var digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits[0] === "1") return "+" + digits;
  return raw;
}

// Runs every day at 2pm UTC (~9-10am Eastern depending on DST) — well
// within business hours, comfortably ahead of the next day's pickup.
// Edit the cron expression below to change the time. Format reference:
// https://docs.netlify.com/build/functions/scheduled-functions/
exports.config = {
  schedule: "0 14 * * *",
};
