// netlify/functions/manage-customer.js
//
// Updates a customer profile (name, phone, email, address, type, tags,
// notes) or deletes one — mainly for merging accidental duplicates. Called
// by the Customers tab in admin.html. Same admin-key protection as the
// other management endpoints.
//
// Request body (JSON): { "id": "CUST-...", ...fields to change }
//   - Any of: name, phone, email, address, customerType, tags (array),
//     notes (string). Only fields present in the body are changed.
//   - Method DELETE (with just "id") removes the profile. This does NOT
//     delete that customer's past jobs — it only removes the profile
//     linking them together.

const { getCustomersStore } = require("./_customerStore");

const EDITABLE_FIELDS = ["name", "phone", "email", "address", "customerType", "tags", "notes", "leadSource"];

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
    return { statusCode: 400, body: "Missing customer id" };
  }

  const store = getCustomersStore();

  if (event.httpMethod === "DELETE") {
    await store.delete(payload.id);
    return { statusCode: 200, body: JSON.stringify({ ok: true, deleted: payload.id }) };
  }

  const existing = await store.get(payload.id, { type: "json" });
  if (!existing) {
    return { statusCode: 404, body: JSON.stringify({ error: "Customer not found" }) };
  }

  EDITABLE_FIELDS.forEach(function (field) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      existing[field] = payload[field];
    }
  });
  existing.updatedAt = new Date().toISOString();

  await store.setJSON(payload.id, existing);

  return { statusCode: 200, body: JSON.stringify({ ok: true, customer: existing }) };
};
