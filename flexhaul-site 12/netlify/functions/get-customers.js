// netlify/functions/get-customers.js
//
// Returns every customer profile, each with job count, lifetime revenue,
// and last-job date computed fresh from the linked jobs — so those numbers
// can never drift out of sync with the actual job records the way a cached
// total could. Same admin-key protection as get-leads.js.

const { getCustomersStore } = require("./_customerStore");
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
    const custStore = getCustomersStore();
    const leadsStore = getLeadsStore();

    const { blobs } = await custStore.list();

    const customers = [];
    for (const blob of blobs) {
      const cust = await custStore.get(blob.key, { type: "json" });
      if (!cust) continue;

      let jobCount = 0;
      let lifetimeRevenue = 0;
      let lastJobAt = null;
      const jobs = [];

      for (const jobId of cust.jobIds || []) {
        const job = await leadsStore.get(jobId, { type: "json" });
        if (!job) continue; // job may have been deleted since linking
        jobCount++;
        const value = typeof job.finalPrice === "number" ? job.finalPrice : 0;
        lifetimeRevenue += value;
        if (!lastJobAt || new Date(job.createdAt) > new Date(lastJobAt)) {
          lastJobAt = job.createdAt;
        }
        jobs.push({
          id: job.id,
          createdAt: job.createdAt,
          status: job.status,
          service: job.service,
          quotedPrice: job.quotedPrice || null,
          finalPrice: job.finalPrice || null,
        });
      }

      jobs.sort(function (a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      customers.push({
        id: cust.id,
        createdAt: cust.createdAt,
        name: cust.name,
        phone: cust.phone,
        email: cust.email,
        address: cust.address,
        customerType: cust.customerType,
        leadSource: cust.leadSource,
        tags: cust.tags || [],
        notes: cust.notes || "",
        jobCount: jobCount,
        lifetimeRevenue: lifetimeRevenue,
        lastJobAt: lastJobAt,
        jobs: jobs,
      });
    }

    // Most recent activity first
    customers.sort(function (a, b) {
      return new Date(b.lastJobAt || b.createdAt) - new Date(a.lastJobAt || a.createdAt);
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customers: customers }),
    };
  } catch (err) {
    console.error("get-customers failed:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
