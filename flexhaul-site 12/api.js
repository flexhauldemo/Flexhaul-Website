// admin/api.js
//
// Small fetch wrapper: attaches the auth token to every request, and
// centralizes the API base URL.
//
// IMPORTANT: change API_BASE to your deployed backend's URL before
// going live. The backend is a separate service (see api/README or the
// project README) — it does not live on the same static host as this
// page. Example once deployed: "https://flexhaul-crm-api.onrender.com/api"

const API_BASE = window.FLEXHAUL_API_BASE || "http://localhost:4000/api";

const TOKEN_KEY = "flexhaul_crm_token";
const USER_KEY = "flexhaul_crm_user";

const Auth = {
  getToken() { return localStorage.getItem(TOKEN_KEY); },
  setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isLoggedIn() { return !!this.getToken(); },
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body, opts = {}) {
  const headers = {};
  const token = Auth.getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let fetchBody = undefined;
  if (body instanceof FormData) {
    fetchBody = body; // let the browser set multipart headers
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchBody = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: fetchBody });
  } catch (networkErr) {
    throw new ApiError(
      "Could not reach the server. Check your connection, or the API may not be deployed yet.",
      0
    );
  }

  if (res.status === 401 && !opts.skipAuthRedirect) {
    Auth.clear();
    window.location.reload();
    throw new ApiError("Session expired", 401);
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch (e) { /* non-JSON response */ }
  }

  if (!res.ok) {
    throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  }
  return data;
}

const Api = {
  login: (email, password) => request("POST", "/auth/login", { email, password }, { skipAuthRedirect: true }),
  me: () => request("GET", "/auth/me"),
  createUser: (payload) => request("POST", "/auth/users", payload),
  listUsers: () => request("GET", "/auth/users"),

  dashboard: () => request("GET", "/dashboard"),

  listCustomers: (q) => request("GET", `/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getCustomer: (id) => request("GET", `/customers/${id}`),
  createCustomer: (payload) => request("POST", "/customers", payload),
  updateCustomer: (id, payload) => request("PATCH", `/customers/${id}`, payload),

  listDeals: (stage) => request("GET", `/deals${stage ? `?stage=${encodeURIComponent(stage)}` : ""}`),
  getDeal: (id) => request("GET", `/deals/${id}`),
  createDeal: (payload) => request("POST", "/deals", payload),
  updateDeal: (id, payload) => request("PATCH", `/deals/${id}`, payload),

  createEstimate: (payload) => request("POST", "/estimates", payload),
  updateEstimate: (id, payload) => request("PATCH", `/estimates/${id}`, payload),

  listJobs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request("GET", `/jobs${qs ? `?${qs}` : ""}`);
  },
  getJob: (id) => request("GET", `/jobs/${id}`),
  createJob: (payload) => request("POST", "/jobs", payload),
  updateJob: (id, payload) => request("PATCH", `/jobs/${id}`, payload),

  listCrews: () => request("GET", "/crews"),
  createCrew: (payload) => request("POST", "/crews", payload),

  listEquipment: () => request("GET", "/equipment"),
  createEquipment: (payload) => request("POST", "/equipment", payload),
  updateEquipment: (id, payload) => request("PATCH", `/equipment/${id}`, payload),

  uploadDocument: (formData) => request("POST", "/documents", formData),
  deleteDocument: (id) => request("DELETE", `/documents/${id}`),

  listInvoices: (status) => request("GET", `/invoices${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  createInvoice: (payload) => request("POST", "/invoices", payload),
  updateInvoice: (id, payload) => request("PATCH", `/invoices/${id}`, payload),

  listTimeSlots: () => request("GET", "/time-slots"),
};

window.Auth = Auth;
window.Api = Api;
window.ApiError = ApiError;
window.API_BASE = API_BASE;
