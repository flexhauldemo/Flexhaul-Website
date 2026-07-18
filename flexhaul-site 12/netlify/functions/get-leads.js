// netlify/functions/get-leads.js
//
// Returns every lead saved in Netlify Blobs — this is what makes the
// Dispatch Board (admin.html) show real bookings from every device,
// instead of only the browser it's opened in.
//
// PROTECTED by a shared admin key so random visitors can't pull your
// customer list just by finding this URL. See ADMIN_API_KEY below.
//
// ENVIRONMENT VARIABLE REQUIRED:
//   ADMIN_API_KEY   - a password you make up. Set it in Netlify:
//                     Site settings > Environment variables.
//                     The admin dashboard will ask for this once per
//                     browser session and send it with every request.

const { getLeadsStore } = require("./_blobStore");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const providedKey = event.headers["x-admin-key"];
  if (!process.env.ADMIN_API_KEY || providedKey !== process.env.ADMIN_API_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const store = getLeadsStore();
    const { blobs } = await store.list();

    const leads = [];
    for (const blob of blobs) {
      const lead = await store.get(blob.key, { type: "json" });
      if (lead) leads.push(lead);
    }

    // newest first
    leads.sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads: leads }),
    };
  } catch (err) {
    console.error("get-leads failed:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
