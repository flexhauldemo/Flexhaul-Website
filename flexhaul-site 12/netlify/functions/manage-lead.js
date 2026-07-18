// netlify/functions/manage-lead.js
//
// Updates a lead's status, or deletes it, in the shared Netlify Blobs
// store. Called by admin.html when staff change a status dropdown or
// click the trash icon — this is what makes those actions apply for
// everyone looking at the dashboard, not just the browser that clicked.
//
// Same protection as get-leads.js — requires the ADMIN_API_KEY header.
//
// Request body (JSON): { "id": "FH-...", "status": "scheduled" }
//   - Include "status" to update it. Setting status to "completed" also
//     auto-stamps completedAt, if it isn't already set.
//   - Also accepts "leadSource", "quotedPrice", "finalPrice" for editing
//     those fields — pass any subset, only what's present gets changed.
//   - Method DELETE (with just "id" in the body) removes the lead entirely.

const { getLeadsStore } = require("./_blobStore");

exports.handler = async function (event) {
  const providedKey = event.headers["x-admin-key"];
  if (!process.env.ADMIN_API_KEY || providedKey !== process.env.ADMIN_API_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  if (event.httpMethod !== "PATCH" && event.httpMethod !== "DELETE") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  if (!payload.id) {
    return { statusCode: 400, body: "Missing lead id" };
  }

  const store = getLeadsStore();

  if (event.httpMethod === "DELETE") {
    await store.delete(payload.id);
    return { statusCode: 200, body: JSON.stringify({ ok: true, deleted: payload.id }) };
  }

  // PATCH — update status on the existing lead
  const existing = await store.get(payload.id, { type: "json" });
  if (!existing) {
    return { statusCode: 404, body: JSON.stringify({ error: "Lead not found" }) };
  }
  if (payload.status) {
    existing.status = payload.status;
    if (payload.status === "completed" && !existing.completedAt) {
      existing.completedAt = new Date().toISOString();
    }
  }
  if (typeof payload.leadSource === "string") {
    existing.leadSource = payload.leadSource;
  }
  if (typeof payload.quotedPrice === "number" || payload.quotedPrice === null) {
    existing.quotedPrice = payload.quotedPrice;
  }
  if (typeof payload.finalPrice === "number" || payload.finalPrice === null) {
    existing.finalPrice = payload.finalPrice;
  }
  await store.setJSON(payload.id, existing);

  return { statusCode: 200, body: JSON.stringify({ ok: true, lead: existing }) };
};
