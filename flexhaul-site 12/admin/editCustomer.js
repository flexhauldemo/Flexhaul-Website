// admin/editCustomer.js
//
// One shared "Edit Customer" modal, opened the same way from Pipeline,
// Jobs, and the Customers tab. It always edits the customer's existing
// record by id — there is no path here that creates a new customer, so
// a correction here can never orphan the lead, estimate, or job it's
// already attached to.
//
// This overlay deliberately does NOT reuse a view's own buildModal/
// closeModal (each view file has its own, scoped to a shared
// "activeModal" element id) — doing so would close whatever deal/job/
// customer modal the person opened this from underneath it. Instead
// this stacks as its own independent overlay on top, and only ever
// removes itself.
(function () {
  "use strict";

  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const TYPE_OPTIONS = [
    { value: "homeowner", label: "Homeowner" },
    { value: "gc", label: "General Contractor" },
    { value: "property_manager", label: "Property Manager" },
    { value: "other", label: "Other" },
  ];

  let overlayEl = null;
  function closeEditCustomerModal() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  // customerId: which customer to edit.
  // onSaved(updatedCustomer): called once the save actually succeeds, so
  // whichever screen opened this (Pipeline, Jobs, Customers) can refresh
  // itself with the corrected info in place, without a full reload.
  window.openEditCustomerModal = async function (customerId, onSaved) {
    closeEditCustomerModal();

    let customer;
    try {
      const result = await Api.getCustomer(customerId);
      customer = result.customer;
    } catch (err) {
      showToast("Could not load this customer's info.", true);
      return;
    }

    overlayEl = document.createElement("div");
    overlayEl.className = "modal-overlay is-open";
    overlayEl.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h2 style="font-size:1.15rem;">Edit Customer</h2><button class="modal-close">\u2715</button></div>
        <div class="modal-body">
          <div class="field"><label>Name</label><input type="text" id="ecName" value="${esc(customer.name)}"></div>
          <div class="field">
            <label>Type</label>
            <select id="ecType">
              ${TYPE_OPTIONS.map((t) => `<option value="${t.value}" ${t.value === customer.type ? "selected" : ""}>${esc(t.label)}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Phone</label><input type="tel" id="ecPhone" value="${esc(customer.phone)}"></div>
          <div class="field"><label>Email</label><input type="email" id="ecEmail" value="${esc(customer.email)}"></div>
          <div class="field"><label>Address</label><input type="text" id="ecAddress" value="${esc(customer.address)}" placeholder="Not given yet"></div>
          <div class="field"><label>Notes</label><textarea id="ecNotes" placeholder="Optional">${esc(customer.notes)}</textarea></div>
          <div id="ecCollisionWarning"></div>
          <button class="btn btn-primary" id="ecSaveBtn" style="width:100%; margin-top:8px;">Save Changes</button>
        </div>
      </div>
    `;
    overlayEl.querySelector(".modal-close").addEventListener("click", closeEditCustomerModal);
    overlayEl.addEventListener("click", (e) => {
      if (e.target === overlayEl) closeEditCustomerModal();
    });
    document.body.appendChild(overlayEl);

    async function attemptSave(confirmCollision) {
      const payload = {
        name: overlayEl.querySelector("#ecName").value.trim(),
        type: overlayEl.querySelector("#ecType").value,
        phone: overlayEl.querySelector("#ecPhone").value.trim(),
        email: overlayEl.querySelector("#ecEmail").value.trim(),
        address: overlayEl.querySelector("#ecAddress").value.trim(),
        notes: overlayEl.querySelector("#ecNotes").value.trim(),
      };
      if (confirmCollision) payload.confirm_collision = true;

      const saveBtn = overlayEl.querySelector("#ecSaveBtn");
      const originalLabel = saveBtn.textContent;
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving\u2026";

      try {
        const result = await Api.updateCustomer(customerId, payload);
        showToast("Customer info updated");
        closeEditCustomerModal();
        if (typeof onSaved === "function") onSaved(result.customer);
      } catch (err) {
        if (err.status === 409 && err.body && err.body.conflictingCustomer) {
          const conflicting = err.body.conflictingCustomer;
          const fieldLabel = err.body.field === "email" ? "email address" : "phone number";
          overlayEl.querySelector("#ecCollisionWarning").innerHTML = `
            <div class="card" style="padding:12px; margin:4px 0 16px; background:rgba(201,89,13,0.08); border-color:rgba(201,89,13,0.35);">
              <p style="font-size:0.85rem; margin:0 0 10px;">\u26A0\uFE0F This ${fieldLabel} is already on file for <strong>${esc(conflicting.name)}</strong>.</p>
              <button type="button" class="btn btn-danger btn-sm" id="ecSaveAnywayBtn" style="width:100%;">Save Anyway</button>
            </div>
          `;
          overlayEl.querySelector("#ecSaveAnywayBtn").addEventListener("click", () => attemptSave(true));
          saveBtn.disabled = false;
          saveBtn.textContent = originalLabel;
        } else {
          showToast(err.message, true);
          saveBtn.disabled = false;
          saveBtn.textContent = originalLabel;
        }
      }
    }

    overlayEl.querySelector("#ecSaveBtn").addEventListener("click", () => attemptSave(false));
  };
})();
