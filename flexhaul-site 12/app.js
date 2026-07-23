// admin/app.js
//
// App shell: handles login/logout, top-level navigation between views,
// and a shared toast/notification helper. Each screen's actual content
// lives in admin/views/*.js, each of which exposes a render(container)
// function on a global object (window.Views.dashboard, etc.) — kept
// as plain globals rather than ES modules so this can be dropped into
// a no-build-step static site with plain <script> tags.

(function () {
  "use strict";

  const loginScreen = document.getElementById("loginScreen");
  const app = document.getElementById("app");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const loginBtn = document.getElementById("loginBtn");
  const topbarUser = document.getElementById("topbarUser");
  const mainContent = document.getElementById("mainContent");
  const toast = document.getElementById("toast");

  let currentView = "dashboard";
  let toastTimer = null;

  function showToast(message, isError) {
    toast.textContent = message;
    toast.classList.toggle("is-error", !!isError);
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }
  window.showToast = showToast;

  function showApp() {
    loginScreen.style.display = "none";
    app.classList.add("is-active");
    const user = Auth.getUser();
    if (user) topbarUser.textContent = `${user.name} \u00b7 ${user.role}`;
    navigateTo(currentView);
  }

  function showLogin() {
    app.classList.remove("is-active");
    loginScreen.style.display = "flex";
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.classList.remove("is-visible");
    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in\u2026";

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    try {
      const data = await Api.login(email, password);
      Auth.setSession(data.token, data.user);
      showApp();
    } catch (err) {
      loginError.textContent = err.message || "Login failed";
      loginError.classList.add("is-visible");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Log In";
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    Auth.clear();
    showLogin();
  });

  function setActiveNav(view) {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === view);
    });
  }

  async function navigateTo(view) {
    currentView = view;
    setActiveNav(view);
    mainContent.innerHTML = '<div class="loading">Loading\u2026</div>';

    const renderer = window.Views && window.Views[view];
    if (!renderer) {
      mainContent.innerHTML = `<div class="empty-state">Unknown view: ${view}</div>`;
      return;
    }
    try {
      await renderer(mainContent);
    } catch (err) {
      console.error(err);
      mainContent.innerHTML = `<div class="empty-state">Something went wrong loading this screen.<br><span class="small-note">${err.message || ""}</span></div>`;
    }
  }
  window.navigateTo = navigateTo;

  document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.view));
  });

  // ---- boot ----
  if (Auth.isLoggedIn()) {
    showApp();
  } else {
    showLogin();
  }
})();
