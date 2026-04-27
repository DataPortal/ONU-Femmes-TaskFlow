(function () {
  const AppState = {
    currentUser: null,
    users: [],
    pillars: [],
    mainActivities: [],
    tasks: []
  };

  const STATUS = {
    ON_TRACK: "En bonne voie",
    DUE_SOON: "Échéance imminente",
    LATE: "En retard",
    DONE: "Achevé"
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function normalizeRole(value) {
    const role = String(value || "staff").trim().toLowerCase();

    if (role === "admin") return "admin";
    if (role === "supervisor") return "supervisor";
    if (role === "management") return "management";
    return "staff";
  }

  function getCurrentUser() {
    return AppState.currentUser || null;
  }

  function getSb() {
    return window.sb || null;
  }

  function getUserRole(user = null) {
    const safeUser = user || getCurrentUser();
    return normalizeRole(safeUser?.role || safeUser?.user_type);
  }

  function isAdmin(user = null) {
    return getUserRole(user) === "admin";
  }

  function isSupervisor(user = null) {
    return getUserRole(user) === "supervisor";
  }

  function isStaff(user = null) {
    return getUserRole(user) === "staff";
  }

  function isManagement(user = null) {
    return getUserRole(user) === "management";
  }

  function clamp(value, min, max) {
    const n = Number(value);
    if (Number.isNaN(n)) return min;
    return Math.min(Math.max(n, min), max);
  }

  function scoreToPercent(score) {
    return clamp(Number(score) * 10, 0, 100);
  }

  function appendComment(existing, author, text) {
    const safeText = String(text || "").trim();
    if (!safeText) return existing || "";

    const safeAuthor = String(author || "").trim();
    const prefix = safeAuthor ? `[${safeAuthor}] ` : "";
    return [existing || "", `${prefix}${safeText}`].filter(Boolean).join("\n");
  }

  function getPillarNameByIdFromArray(pillarId, pillars = []) {
    const match = (pillars || []).find(p => String(p.id) === String(pillarId));
    return match ? match.name || match.full_name || "Sans pilier" : "Sans pilier";
  }

  function getActivitiesForPillar(pillarId) {
    return (AppState.mainActivities || []).filter(activity =>
      String(activity.pillar_id) === String(pillarId) && activity.is_active !== false
    );
  }

  function getTodayString() {
    return new Date().toISOString().slice(0, 10);
  }

  function daysBetween(dateA, dateB) {
    if (!dateA || !dateB) return null;

    const a = new Date(dateA);
    const b = new Date(dateB);

    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;

    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);

    return Math.floor((a.getTime() - b.getTime()) / 86400000);
  }

  function normalizeStatusToDatabase(status) {
    const safeStatus = String(status || "").trim();

    if (safeStatus === STATUS.ON_TRACK) return STATUS.ON_TRACK;
    if (safeStatus === STATUS.DUE_SOON) return STATUS.DUE_SOON;
    if (safeStatus === STATUS.LATE) return STATUS.LATE;
    if (safeStatus === STATUS.DONE) return STATUS.DONE;

    return STATUS.ON_TRACK;
  }

  function computeAutomaticStatus(task = {}) {
    const progress = clamp(task.progress ?? scoreToPercent(task.progress_score ?? 0), 0, 100);

    if (progress >= 100) {
      return STATUS.DONE;
    }

    const dueDate = task.due_date || null;
    if (!dueDate) {
      return STATUS.ON_TRACK;
    }

    const diff = daysBetween(dueDate, getTodayString());

    if (diff !== null && diff < 0) {
      return STATUS.LATE;
    }

    if (diff !== null && diff <= 3) {
      return STATUS.DUE_SOON;
    }

    return STATUS.ON_TRACK;
  }

  function hydrateTaskStatus(task = {}) {
    return {
      ...task,
      status: normalizeStatusToDatabase(computeAutomaticStatus(task))
    };
  }

  function isLate(task = {}) {
    return normalizeStatusToDatabase(computeAutomaticStatus(task)) === STATUS.LATE;
  }

  function isDueSoon(task = {}) {
    return normalizeStatusToDatabase(computeAutomaticStatus(task)) === STATUS.DUE_SOON;
  }

  function canViewManagementDashboard(user = null) {
    const role = getUserRole(user);
    return role === "admin" || role === "supervisor" || role === "management";
  }

  function canAccessRegisterPage(user = null) {
    const role = getUserRole(user);
    return role === "admin" || role === "supervisor";
  }

  function canManageMembers(user = null) {
    const role = getUserRole(user);
    return role === "admin" || role === "supervisor";
  }

  function canManageActivities(user = null) {
    const role = getUserRole(user);
    return role === "admin" || role === "supervisor";
  }

  function canCreatePillar(user = null) {
    return getUserRole(user) === "admin";
  }

  function canCreateTask(user = null) {
    const role = getUserRole(user);
    return role === "admin" || role === "supervisor" || role === "staff";
  }

  function canExportDashboard(user = null) {
    const role = getUserRole(user);
    return role === "admin" || role === "supervisor" || role === "management" || role === "staff";
  }

  function canViewTeamPage(user = null) {
    const role = getUserRole(user);
    return role === "admin" || role === "supervisor";
  }

  function canViewTask(task = {}, user = null) {
    const currentUser = user || getCurrentUser();
    if (!currentUser || !task) return false;

    const role = getUserRole(currentUser);

    if (role === "admin") return true;
    if (role === "management") return true;

    if (role === "supervisor") {
      return String(task.pillar_id) === String(currentUser.pillar_id);
    }

    if (role === "staff") {
      return (
        String(task.assigned_to_id) === String(currentUser.id) ||
        String(task.pillar_id) === String(currentUser.pillar_id)
      );
    }

    return false;
  }

  function canEditTask(task = {}, user = null) {
    const currentUser = user || getCurrentUser();
    if (!currentUser || !task) return false;

    const role = getUserRole(currentUser);

    if (role === "admin") return true;
    if (role === "management") return false;

    if (role === "supervisor") {
      return String(task.pillar_id) === String(currentUser.pillar_id);
    }

    if (role === "staff") {
      return String(task.assigned_to_id) === String(currentUser.id);
    }

    return false;
  }

  function canDeleteTask(task = {}, user = null) {
    const currentUser = user || getCurrentUser();
    if (!currentUser || !task) return false;

    const role = getUserRole(currentUser);

    if (role === "admin") return true;
    if (role === "management") return false;
    if (role === "staff") return false;

    if (role === "supervisor") {
      return String(task.pillar_id) === String(currentUser.pillar_id);
    }

    return false;
  }

  function getVisibleTasks(user = null) {
    const currentUser = user || getCurrentUser();
    const role = getUserRole(currentUser);
    const tasks = AppState.tasks || [];

    if (!currentUser) return [];

    if (role === "admin") return tasks;
    if (role === "management") return tasks;

    if (role === "supervisor") {
      return tasks.filter(task =>
        String(task.pillar_id) === String(currentUser.pillar_id)
      );
    }

    if (role === "staff") {
      return tasks.filter(task =>
        String(task.assigned_to_id) === String(currentUser.id) ||
        String(task.pillar_id) === String(currentUser.pillar_id)
      );
    }

    return [];
  }

  function applyTaskFilters(tasks = [], filters = {}) {
    const search = String(filters.search || "").trim().toLowerCase();
    const pillar = String(filters.pillar || "").trim();
    const supervisorId = String(filters.supervisorId || "").trim();
    const assignedToId = String(filters.assignedToId || "").trim();
    const activityId = String(filters.activityId || "").trim();
    const status = String(filters.status || "").trim();
    const startDate = String(filters.startDate || "").trim();
    const endDate = String(filters.endDate || "").trim();

    return (tasks || []).filter(task => {
      const computedStatus = normalizeStatusToDatabase(computeAutomaticStatus(task));

      const haystack = [
        task.title,
        task.pillar,
        task.activity_name,
        task.assigned_to_name,
        task.supervisor_name,
        task.description,
        task.staff_comment,
        task.supervisor_comment
      ]
        .join(" ")
        .toLowerCase();

      if (search && !haystack.includes(search)) return false;
      if (pillar && String(task.pillar || "") !== pillar) return false;
      if (supervisorId && String(task.supervisor_id || "") !== supervisorId) return false;
      if (assignedToId && String(task.assigned_to_id || "") !== assignedToId) return false;
      if (activityId && String(task.activity_id || "") !== activityId) return false;
      if (status && computedStatus !== status) return false;

      const dueDate = String(task.due_date || "").trim();

      if (startDate) {
        if (!dueDate || dueDate < startDate) return false;
      }

      if (endDate) {
        if (!dueDate || dueDate > endDate) return false;
      }

      return true;
    });
  }

  window.AppCore = {
    AppState,
    STATUS,
    appendComment,
    applyTaskFilters,
    byId,
    canAccessRegisterPage,
    canCreatePillar,
    canCreateTask,
    canDeleteTask,
    canEditTask,
    canExportDashboard,
    canManageActivities,
    canManageMembers,
    canViewManagementDashboard,
    canViewTask,
    canViewTeamPage,
    clamp,
    computeAutomaticStatus,
    getActivitiesForPillar,
    getCurrentUser,
    getPillarNameByIdFromArray,
    getSb,
    getUserRole,
    getVisibleTasks,
    hydrateTaskStatus,
    isAdmin,
    isDueSoon,
    isLate,
    isManagement,
    isStaff,
    isSupervisor,
    normalizeRole,
    normalizeStatusToDatabase,
    scoreToPercent
  };
})();
