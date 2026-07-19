// netlify/functions/_customerStore.js
//
// Shared helper for the customer-profile Blobs store, kept separate from
// flexhaul-leads. A "lead" (see _blobStore.js) is one job/request; a
// "customer" is the person or company behind it, with a profile that
// persists — notes, tags, and a running list of every job they've had —
// across however many jobs they eventually book.
//
// Same Netlify Blobs config quirk as _blobStore.js applies here, so this
// mirrors it exactly (explicit siteID/token, falling back to auto-detect).

const { getStore } = require("@netlify/blobs");

function getCustomersStore() {
  if (process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN) {
    return getStore({
      name: "flexhaul-customers",
      siteID: process.env.BLOBS_SITE_ID,
      token: process.env.BLOBS_TOKEN,
    });
  }
  return getStore("flexhaul-customers");
}

// Customers are matched by phone number — the one field every job reliably
// has, whether it came through the website form or was logged by staff off
// a phone call. Name and email vary too much (typos, nicknames, a personal
// vs. a business address) to key off of.
function normalizePhone(raw) {
  var digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") digits = digits.slice(1);
  return digits; // bare 10-digit US number, used only as a lookup key
}

// Finds the existing customer whose phone matches this job, or creates a
// new profile if nobody matches. Either way, links jobInfo.jobId into that
// customer's job history. Returns the customer record.
//
// jobInfo: { jobId, name, phone, email, address, propertyType, leadSource }
async function findOrCreateCustomer(store, jobInfo) {
  const phoneKey = normalizePhone(jobInfo.phone);

  if (phoneKey) {
    const { blobs } = await store.list();
    for (const blob of blobs) {
      const cust = await store.get(blob.key, { type: "json" });
      if (cust && normalizePhone(cust.phone) === phoneKey) {
        if (jobInfo.jobId && cust.jobIds.indexOf(jobInfo.jobId) === -1) {
          cust.jobIds.push(jobInfo.jobId);
          cust.updatedAt = new Date().toISOString();
          await store.setJSON(cust.id, cust);
        }
        return cust;
      }
    }
  }

  const id = "CUST-" + Date.now().toString(36).toUpperCase();
  const customer = {
    id: id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: jobInfo.name || "",
    phone: jobInfo.phone || "",
    email: jobInfo.email || "",
    address: jobInfo.address || "",
    customerType: jobInfo.propertyType || "Residential",
    leadSource: jobInfo.leadSource || "Website",
    tags: [],
    notes: "",
    jobIds: jobInfo.jobId ? [jobInfo.jobId] : [],
  };
  await store.setJSON(id, customer);
  return customer;
}

module.exports = { getCustomersStore, findOrCreateCustomer, normalizePhone };
