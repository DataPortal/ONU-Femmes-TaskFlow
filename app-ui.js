(function () {
  const AuthUI = window.AuthUI || {};
  const Core = window.AppCore || {};
  const Services = window.AppServices || {};

  function noop() {}

  const escapeHtml = AuthUI.escapeHtml || function (value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const AppState = Core.AppState || {
    users: [],
    pillars: [],
    mainActivities: [],
    tasks: [],
    currentUser: null
  };

  const STATUS = Core.STATUS || {
    ON_TRACK: "En bonne voie",
    DUE_SOON: "Échéance imminente",
    LATE: "En retard",
    DONE: "Achevé"
  };

  const appendComment = Core.appendComment || function (existing, author, text) {
    if (!text) return existing || "";
    const prefix = author ? `[${author}] ` : "";
    return [existing || "", `${prefix}${text}`].filter(Boolean).join("\n");
  };

  const applyTaskFilters = Core.applyTaskFilters || function (tasks) {
    return tasks || [];
  };

  const byId = Core.byId || function (id) {
    return document.getElementById(id);
  };

  const canCreatePillar = Core.canCreatePillar || function () { return false; };
  const canCreateTask = Core.canCreateTask || function () { return false; };
  const canDeleteTask = Core.canDeleteTask || function () { return false; };
  const canExportDashboard = Core.canExportDashboard || function () { return false; };
  const canManageActivities = Core.canManageActivities || function () { return false; };
  const canManageMembers = Core.canManageMembers || function () { return false; };
  const canViewTask = Core.canViewTask || function () { return true; };
  const clamp = Core.clamp || function (value, min, max) {
    const n = Number(value);
    if (Number.isNaN(n)) return min;
    return Math.min(Math.max(n, min), max);
  };
  const computeAutomaticStatus = Core.computeAutomaticStatus || function (task) {
    return task?.status || STATUS.ON_TRACK;
  };
  const getActivitiesForPillar = Core.getActivitiesForPillar || function () { return []; };
  const getCurrentUser = Core.getCurrentUser || function () { return AppState.currentUser; };
  const getSb = Core.getSb || function () { return window.sb || null; };
  const getVisibleTasks = Core.getVisibleTasks || function () { return AppState.tasks || []; };
  const isDueSoon = Core.isDueSoon || function () { return false; };
  const isLate = Core.isLate || function () { return false; };
  const normalizeStatusToDatabase = Core.normalizeStatusToDatabase || function (status) {
    return status || STATUS.ON_TRACK;
  };
  const scoreToPercent = Core.scoreToPercent || function (score) {
    return clamp(Number(score) * 10, 0, 100);
  };

  function getUserRole(user) {
    return String(user?.role || user?.user_type || "staff").trim().toLowerCase();
  }

  function getUserDisplayName(user) {
    return user?.name || user?.full_name || "Utilisateur";
  }

  function getUserPillarLabel(user) {
    return user?.pillar || user?.pillar_name || "Sans pilier";
  }

  function setRoleControlledVisibility(buttonId, isAllowed) {
    const btn = byId(buttonId);
    if (!btn) return;

    if (isAllowed) {
      btn.classList.remove("is-role-hidden");
      btn.hidden = false;
      btn.style.display = "";
    } else {
      btn.classList.add("is-role-hidden");
      btn.hidden = true;
      btn.style.display = "none";
    }
  }

  function showGlobalError(message) {
    const debugBox = byId("pageDebugMessage");

    if (debugBox && AuthUI.showMessage) {
      AuthUI.showMessage(debugBox, message, "error");
      return;
    }

    console.error(message);
  }

  function setMessage(targetId, text, type = "info") {
    if (AuthUI.showMessage) {
      AuthUI.showMessage(targetId, text, type);
      return;
    }

    const el = byId(targetId);
    if (el) el.textContent = text;
  }

  function clearMessage(targetId) {
    const el = byId(targetId);
    if (el) el.innerHTML = "";
  }

  function initUserHeader() {
    const selector = byId("currentUserSelect");
    const label = byId("currentUserLabel");
    const currentUser = getCurrentUser();

    if (selector && currentUser) {
      selector.innerHTML = `
        <option value="${escapeHtml(currentUser.id)}">
          ${escapeHtml(getUserDisplayName(currentUser))} — ${escapeHtml(getUserRole(currentUser))}
        </option>
      `;
      selector.disabled = true;
    }

    if (label && currentUser) {
      const supervisor = (AppState.users || []).find(user =>
        String(user.id) === String(currentUser.supervisor_id)
      );

      label.innerHTML = `
        <strong>${escapeHtml(getUserDisplayName(currentUser))}</strong><br>
        <span class="muted">
          ${escapeHtml(getUserRole(currentUser))} | ${escapeHtml(getUserPillarLabel(currentUser))}
        </span><br>
        <span class="muted">
          Superviseur : ${escapeHtml(supervisor ? getUserDisplayName(supervisor) : "Aucun")}
        </span>
      `;
    }
  }

  function initLogout() {
    const sb = getSb();
    const logoutBtn = byId("logoutBtn");

    if (!sb || !logoutBtn) return;

    if (!logoutBtn.dataset.boundClick) {
      logoutBtn.addEventListener("click", async () => {
        await sb.auth.signOut();
        window.location.replace("login.html");
      });
      logoutBtn.dataset.boundClick = "true";
    }
  }

  function openModal(modalId) {
    const modal = byId(modalId);
    if (!modal) return;

    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(modalId) {
    const modal = byId(modalId);
    if (!modal) return;

    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }

  function initModalSystem() {
    document.addEventListener("click", event => {
      const target = event.target;

      if (target.matches(".modal-overlay")) {
        const modal = target.closest(".modal");
        if (modal?.id) closeModal(modal.id);
      }

      if (target.matches(".modal-close")) {
        const modal = target.closest(".modal");
        if (modal?.id) closeModal(modal.id);
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;

      document.querySelectorAll(".modal").forEach(modal => {
        if (modal.style.display === "block") closeModal(modal.id);
      });
    });
  }

  function initFilterMenus() {
    document.addEventListener("click", event => {
      document.querySelectorAll(".filter-menu[open]").forEach(menu => {
        if (!menu.contains(event.target)) {
          menu.removeAttribute("open");
        }
      });
    });
  }

  function initRoleControlledButtons() {
    const page = document.body.dataset.page;
    if (page !== "dashboard") return;

    setRoleControlledVisibility("openCreateTaskModalBtn", !!canCreateTask());
    setRoleControlledVisibility("exportXlsxBtn", !!canExportDashboard());
  }

  function initTaskCreation() {
    const page = document.body.dataset.page;
    if (page !== "dashboard") return;

    const openBtn = byId("openCreateTaskModalBtn");
    const closeTopBtn = byId("closeCreateTaskModalBtn");
    const closeBottomBtn = byId("closeCreateTaskModalBtnFooter");

    setRoleControlledVisibility("openCreateTaskModalBtn", !!canCreateTask());

    if (openBtn && canCreateTask() && !openBtn.dataset.boundClick) {
      openBtn.addEventListener("click", () => openModal("createTaskModal"));
      openBtn.dataset.boundClick = "true";
    }

    if (closeTopBtn && !closeTopBtn.dataset.boundClick) {
      closeTopBtn.addEventListener("click", () => closeModal("createTaskModal"));
      closeTopBtn.dataset.boundClick = "true";
    }

    if (closeBottomBtn && !closeBottomBtn.dataset.boundClick) {
      closeBottomBtn.addEventListener("click", () => closeModal("createTaskModal"));
      closeBottomBtn.dataset.boundClick = "true";
    }
  }

  function initExportAndPrint() {
    const page = document.body.dataset.page;
    if (page !== "dashboard") return;

    const exportBtn = byId("exportXlsxBtn");
    const printBtn = byId("printPageBtn");

    setRoleControlledVisibility("exportXlsxBtn", !!canExportDashboard());

    if (exportBtn && canExportDashboard() && !exportBtn.dataset.boundClick) {
      exportBtn.addEventListener("click", () => {
        if (typeof window.XLSX === "undefined") {
          alert("Librairie XLSX indisponible.");
          return;
        }
      });
      exportBtn.dataset.boundClick = "true";
    }

    if (printBtn && !printBtn.dataset.boundClick) {
      printBtn.addEventListener("click", () => window.print());
      printBtn.dataset.boundClick = "true";
    }
  }

  function initGlobalActions() {
    noop();
  }

  function initMainActivitiesManagement() {
    noop();
  }

  function initMyTasksFilters() {
    noop();
  }

  function initPillarCreation() {
    noop();
  }

  function initRegisterPage() {
    noop();
  }

  function initTeamFilters() {
    noop();
  }

  function renderMainActivitiesList() {
    noop();
  }

  function renderCurrentPage() {
    const page = document.body.dataset.page;

    if (page === "dashboard") {
      initRoleControlledButtons();
    }
  }

  window.AppUI = {
    initExportAndPrint,
    initFilterMenus,
    initGlobalActions,
    initLogout,
    initMainActivitiesManagement,
    initModalSystem,
    initMyTasksFilters,
    initPillarCreation,
    initRegisterPage,
    initTaskCreation,
    initTeamFilters,
    initUserHeader,
    renderCurrentPage,
    renderMainActivitiesList,
    showGlobalError
  };
})();
