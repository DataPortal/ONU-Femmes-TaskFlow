(function () {
  const AppState = {
    pillars: [],
    users: [],
    tasks: [],
    mainActivities: [],
    currentUser: null
  };

  const STATUS = {
    ON_TRACK: "En bonne voie",
    DUE_SOON: "Échéance imminente",
    LATE: "En retard",
    DONE: "Achevé"
  };

  const IMMINENT_DAYS_THRESHOLD = 2;

  function getSb() {
    return window.sb || null;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function clamp(value, min, max) {
    const n = Number(value);
    if (Number.isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function scoreToPercent(score) {
    return clamp(score, 0, 10) * 10;
  }

  function normalizeStatus(status) {
    return String(status || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function getStatusCandidates(status) {
    const normalized = normalizeStatus(status);
    if (!status || normalized === status) return [status];
    return [status, normalized];
  }

  function isStatusConstraintError(error) {
    if (!error) return false;
    const raw = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
    return raw.includes("tasks_status_check") || raw.includes("violates check constraint");
  }

  function toLocalDateOnly(dateValue) {
    const date = new Date(dateValue);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function getProgressPercent(task) {
    if (typeof task.progress === "number") return clamp(task.progress, 0, 100);

    if (task.progress !== undefined && task.progress !== null && task.progress !== "") {
      return clamp(Number(task.progress), 0, 100);
    }

    if (task.progress_score !== undefined && task.progress_score !== null && task.progress_score !== "") {
      return scoreToPercent(task.progress_score);
    }

    return 0;
  }

  function computeAutomaticStatus(task) {
    const progressPercent = getProgressPercent(task);
    if (progressPercent >= 100) return STATUS.DONE;
    if (!task.due_date) return STATUS.ON_TRACK;

    const today = toLocalDateOnly(new Date());
    const dueDate = toLocalDateOnly(task.due_date);
    const diffMs = dueDate.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) return STATUS.LATE;
    if (daysRemaining <= IMMINENT_DAYS_THRESHOLD) return STATUS.DUE_SOON;
    return STATUS.ON_TRACK;
  }

  function hydrateTaskStatus(task) {
    return {
      ...task,
      status: computeAutomaticStatus(task)
    };
  }

  function isLate(task) {
    return computeAutomaticStatus(task) === STATUS.LATE;
  }

  function isDueSoon(task) {
    return computeAutomaticStatus(task) === STATUS.DUE_SOON;
  }

  function isTaskWithinDateRange(task, startDate, endDate) {
    if (!startDate && !endDate) return true;
    if (!task.due_date) return false;

    const dueDate = new Date(task.due_date);
    dueDate.setHours(0, 0, 0, 0);

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (dueDate < start) return false;
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(0, 0, 0, 0);
      if (dueDate > end) return false;
    }

    return true;
  }

  function normalizeActivitiesList(value) {
    if (Array.isArray(value)) {
      return value.map(v => String(v || "").trim()).filter(Boolean);
    }

    if (typeof value === "string") {
      return value
        .split(/\r?\n|,/)
        .map(v => v.trim())
        .filter(Boolean);
    }

    return [];
  }

  function getPillarNameByIdFromArray(pillarId, pillarsArray) {
    const pillar = (pillarsArray || []).find(p => String(p.id) === String(pillarId));
    return pillar ? pillar.name : "";
  }

  function getPillarNameById(pillarId) {
    return getPillarNameByIdFromArray(pillarId, AppState.pillars);
  }

  function getActivitiesForPillar(pillarId) {
    return AppState.mainActivities.filter(activity =>
      String(activity.pillar_id) === String(pillarId) &&
      activity.is_active !== false
    );
  }

  function getActivityNameById(activityId) {
    const activity = AppState.mainActivities.find(a => String(a.id) === String(activityId));
    return activity ? activity.name : "";
  }

  function appendComment(existingText, authorName, newText) {
    const clean = String(newText || "").trim();
    if (!clean) return existingText || "";

    const now = new Date();
    const stamp =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ` +
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const entry = `[${stamp}] ${authorName} : ${clean}`;
    return existingText ? `${existingText}\n${entry}` : entry;
  }

  function getCurrentUser() {
    if (!AppState.currentUser) return null;

    return {
      ...AppState.currentUser,
      name: AppState.currentUser.full_name,
      user_type: AppState.currentUser.role,
      pillar: getPillarNameById(AppState.currentUser.pillar_id)
    };
  }

  function isAdmin() {
    const u = getCurrentUser();
    return !!u && u.user_type === "admin";
  }

  function isSupervisor() {
    const u = getCurrentUser();
    return !!u && u.user_type === "supervisor";
  }

  function isSupervisorOrAdmin() {
    return isSupervisor() || isAdmin();
  }

  function getVisibleTasks() {
    const currentUser = getCurrentUser();
    if (!currentUser) return [];

    if (currentUser.user_type === "admin") return AppState.tasks;

    return AppState.tasks.filter(t =>
      String(t.pillar_id) === String(currentUser.pillar_id)
    );
  }

  function canViewTask(task) {
    const currentUser = getCurrentUser();
    if (!currentUser || !task) return false;

    if (currentUser.user_type === "admin") return true;

    return String(task.pillar_id) === String(currentUser.pillar_id);
  }

  function canCreateTask() {
    return isSupervisorOrAdmin();
  }

  function canCreatePillar() {
    return isSupervisorOrAdmin();
  }

  function canManageMembers() {
    return isSupervisorOrAdmin();
  }

  function canManageActivities() {
    return isSupervisorOrAdmin();
  }

  function canExportDashboard() {
    const currentUser = getCurrentUser();
    if (!currentUser) return false;
    return ["admin", "supervisor"].includes(currentUser.user_type);
  }

  function canDeleteTask(task) {
    const currentUser = getCurrentUser();
    if (!currentUser || !task) return false;

    if (currentUser.user_type === "admin") return true;

    if (currentUser.user_type === "supervisor") {
      return String(task.pillar_id) === String(currentUser.pillar_id);
    }

    return false;
  }

  function applyTaskFilters(tasks, filters = {}) {
    const {
      search = "",
      pillar = "",
      supervisorId = "",
      assignedToId = "",
      activityId = "",
      activityName = "",
      status = "",
      startDate = "",
      endDate = ""
    } = filters;

    const normalizedSearch = String(search || "").toLowerCase().trim();

    return tasks.filter(task => {
      const matchSearch =
        !normalizedSearch ||
        String(task.title || "").toLowerCase().includes(normalizedSearch) ||
        String(task.description || "").toLowerCase().includes(normalizedSearch) ||
        String(task.assigned_to_name || "").toLowerCase().includes(normalizedSearch) ||
        String(task.supervisor_name || "").toLowerCase().includes(normalizedSearch) ||
        String(task.pillar || "").toLowerCase().includes(normalizedSearch) ||
        String(task.activity_name || "").toLowerCase().includes(normalizedSearch);

      const matchPillar = !pillar || task.pillar === pillar;
      const matchSupervisor = !supervisorId || String(task.supervisor_id) === String(supervisorId);
      const matchAssignedTo = !assignedToId || String(task.assigned_to_id) === String(assignedToId);
      const matchActivityId = !activityId || String(task.activity_id) === String(activityId);
      const matchActivityName = !activityName || String(task.activity_name || "") === String(activityName);
      const matchStatus = !status || task.status === status;
      const matchDateRange = isTaskWithinDateRange(task, startDate, endDate);

      return (
        matchSearch &&
        matchPillar &&
        matchSupervisor &&
        matchAssignedTo &&
        matchActivityId &&
        matchActivityName &&
        matchStatus &&
        matchDateRange
      );
    });
  }

  window.AppCore = {
    AppState,
    STATUS,
    IMMINENT_DAYS_THRESHOLD,

    appendComment,
    applyTaskFilters,
    byId,
    canCreatePillar,
    canCreateTask,
    canDeleteTask,
    canExportDashboard,
    canManageActivities,
    canManageMembers,
    canViewTask,
    clamp,
    computeAutomaticStatus,
    getActivitiesForPillar,
    getActivityNameById,
    getCurrentUser,
    getPillarNameById,
    getPillarNameByIdFromArray,
    getProgressPercent,
    getSb,
    getStatusCandidates,
    getVisibleTasks,
    hydrateTaskStatus,
    isAdmin,
    isDueSoon,
    isLate,
    isStatusConstraintError,
    isSupervisor,
    isSupervisorOrAdmin,
    isTaskWithinDateRange,
    normalizeActivitiesList,
    scoreToPercent
  };
})();
