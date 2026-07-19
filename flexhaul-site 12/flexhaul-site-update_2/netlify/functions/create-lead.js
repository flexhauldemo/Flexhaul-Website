// netlify/functions/create-lead.js
//
// Lets staff log a job directly from the Dispatch Board — for the jobs
// that never touch the website at all: a realtor texting about a cleanout,
// a landscaper calling about a debris run, a walk-in. submit-quote.js
// covers the website form; this covers everything else.
//
// Same admin-key protection as the other management endpoints. Reuses the
// same flexhaul-leads store and customer-linking logic as submit-quote.js,
// so a phone-in job shows up identically to a web one everywhere else in
// the system.
//
// Request body (JSON): { name, phone, email, service, categories,
//   propertyType, description, contactMethod, leadSource, quotedPrice,
//   address }
//   Only name and phone are required — everything else is optional since
//   a quick phone note may not have all the details yet.

const { getLeadsStore } = require("./_blobStore");
const { getCustomersStore, findOrCreateCustomer } = require("./_customerStore");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const providedKey = event.headers["x-admin-key"];
  if (!process.env.ADMIN_API_KEY || providedKey !== process.env.ADMIN_API_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let input;
  try {
    input = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  if (!input.name || !input.phone) {
    return { statusCode: 400, body: "Name and phone are required" };
  }

  const id = "FH-" + Date.now().toString(36).toUpperCase();

  const lead = {
    id: id,
    createdAt: new Date().toISOString(),
    status: input.status || "new",
    service: input.service || "Not Sure / Need Advice",
    categories: input.categories || [],
    name: input.name,
    phone: input.phone,
    email: input.email || "",
    address: input.address || "",
    propertyType: input.propertyType || "Residential",
    description: input.description || "",
    contactMethod: input.contactMethod || "Phone",
    leadSource: input.leadSource || "Other",
    quotedPrice: typeof input.quotedPrice === "number" ? input.quotedPrice : null,
    finalPrice: null,
    completedAt: null,
    smsOptIn: false,
    enteredByStaff: true, // distinguishes this from a website submission
  };

  const leadsStore = getLeadsStore();
  await leadsStore.setJSON(id, lead);

  const custStore = getCustomersStore();
  const customer = await findOrCreateCustomer(custStore, {
    jobId: id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    address: lead.address,
    propertyType: lead.propertyType,
    leadSource: lead.leadSource,
  });
  lead.customerId = customer.id;
  await leadsStore.setJSON(id, lead);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, lead: lead, customer: customer }),
  };
};
