const AppState = {
  pillars: [],
  users: [],
  tasks: [],
  currentUser: null,
  pillarActivitiesById: {},
  taskActivitiesById: {}
};

const STATUS = {
  ON_TRACK: "En bonne voie",
  DUE_SOON: "Échéance imminente",
  LATE: "En retard",
  DONE: "Achevé"
};

const IMMINENT_DAYS_THRESHOLD = 2;
const PILLAR_ACTIVITIES_STORAGE_KEY = "unw_pillar_activities";
const TASK_ACTIVITIES_STORAGE_KEY = "unw_task_activities";

/* =========================
   UTILITAIRES GÉNÉRAUX
========================= */

function getSb() {
  return window.sb || null;
}

function byId(id) {
  return document.getElementById(id);
}

function safeParseJson(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function showGlobalError(message) {
  const debugBox = byId("pageDebugMessage");
  if (debugBox) {
    debugBox.innerHTML = `<div class="error-box">${escapeHtml(message)}</div>`;
    return;
  }
  alert(message);
}

function setMessage(targetId, text, type = "info") {
  const el = byId(targetId);
  if (!el) return;

  let className = "info-box";
  if (type === "error") className = "error-box";
  if (type === "success") className = "success-box";

  el.innerHTML = `<div class="${className}">${escapeHtml(text)}</div>`;
}

function clearMessage(targetId) {
  const el = byId(targetId);
  if (el) el.innerHTML = "";
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

/* =========================
   LOCAL STORAGE
========================= */

function loadLocalActivityMaps() {
  AppState.pillarActivitiesById = safeParseJson(localStorage.getItem(PILLAR_ACTIVITIES_STORAGE_KEY), {});
  AppState.taskActivitiesById = safeParseJson(localStorage.getItem(TASK_ACTIVITIES_STORAGE_KEY), {});
}

function persistPillarActivities() {
  localStorage.setItem(PILLAR_ACTIVITIES_STORAGE_KEY, JSON.stringify(AppState.pillarActivitiesById || {}));
}

function persistTaskActivities() {
  localStorage.setItem(TASK_ACTIVITIES_STORAGE_KEY, JSON.stringify(AppState.taskActivitiesById || {}));
}

function persistTaskActivitiesFromTasks() {
  AppState.tasks.forEach(task => {
    if (task?.id && task.activity_name) {
      AppState.taskActivitiesById[String(task.id)] = task.activity_name;
    }
  });
  persistTaskActivities();
}

/* =========================
   DATE / STATUT
========================= */

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

/* =========================
   ACTIVITÉS / PILIERS
========================= */

function normalizeActivitiesList(value) {
  if (Array.isArray(value)) {
    return value.map(v => String(v || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/\r?\n|,/).map(v => v.trim()).filter(Boolean);
  }
  return [];
}

function extractPillarActivitiesFromDb(pillars) {
  const mapped = {};
  (pillars || []).forEach(pillar => {
    const list = normalizeActivitiesList(pillar?.main_activities || pillar?.activities || []);
    if (list.length) mapped[String(pillar.id)] = list;
  });
  return mapped;
}

function extractActivityFromDescription(description) {
  const text = String(description || "");
  const match = text.match(/^\[Activité:\s*(.+?)\]/m);
  return match ? match[1].trim() : "";
}

function stripActivityFromDescription(description) {
  return String(description || "").replace(/^\[Activité:\s*.+?\]\s*/m, "").trim();
}

function getActivitiesForPillar(pillarId) {
  return AppState.pillarActivitiesById[String(pillarId)] || [];
}

function getPillarNameByIdFromArray(pillarId, pillarsArray) {
  const pillar = pillarsArray.find(p => String(p.id) === String(pillarId));
  return pillar ? pillar.name : "";
}

function getPillarNameById(pillarId) {
  return getPillarNameByIdFromArray(pillarId, AppState.pillars);
}

/* =========================
   SESSION / CHARGEMENT
========================= */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await waitForSupabaseClient();
    await bootstrapApp();
  } catch (error) {
    console.error("Erreur au démarrage :", error);
    showGlobalError(`Une erreur empêche le chargement : ${error.message || error}`);
  }
});

async function waitForSupabaseClient(maxWaitMs = 5000) {
  const start = Date.now();
  while (!window.sb) {
    if (Date.now() - start > maxWaitMs) {
      throw new Error("Client Supabase indisponible.");
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function bootstrapApp() {
  const sb = getSb();
  if (!sb) throw new Error("Client Supabase indisponible.");

  const page = document.body.dataset.page || "";

  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError) throw new Error(`Erreur session: ${sessionError.message}`);

  if (!sessionData?.session) {
    window.location.replace("login.html");
    return;
  }

  await loadCurrentUser();
  loadLocalActivityMaps();
  await loadReferenceData();

  initUserHeader();
  initLogout();
  initModalSystem();
  initGlobalActions();
  initTaskCreation();
  initPillarCreation();
  initRegisterPage();
  initExportAndPrint();
  initMyTasksFilters();

  if (page === "dashboard") renderDashboardPage();
  if (page === "my-tasks") renderMyTasksPage();
  if (page === "my-team") renderMyTeamPage();
  if (page === "register") renderRegisterPage();
}

async function loadCurrentUser() {
  const sb = getSb();

  const {
    data: { user },
    error: userError
  } = await sb.auth.getUser();

  if (userError || !user) throw new Error("Utilisateur non connecté ou introuvable.");

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("id, full_name, email, role, pillar_id, supervisor_id, office, is_active")
    .eq("id", user.id)
    .single();

  if (profileError) throw new Error(`Lecture du profil impossible: ${profileError.message}`);
  if (!profile) throw new Error("Aucun profil trouvé dans profiles.");
  if (!profile.is_active) throw new Error("Compte désactivé.");

  AppState.currentUser = profile;
}

async function loadReferenceData() {
  const sb = getSb();

  const [pillarsRes, usersRes] = await Promise.all([
    sb.from("pillars").select("*").order("name", { ascending: true }),
    sb.from("profiles")
      .select("id, full_name, email, role, pillar_id, supervisor_id, office, is_active")
      .eq("is_active", true)
      .order("full_name", { ascending: true })
  ]);

  if (pillarsRes.error) throw new Error(`Lecture pillars impossible: ${pillarsRes.error.message}`);
  if (usersRes.error) throw new Error(`Lecture profiles impossible: ${usersRes.error.message}`);

  AppState.pillars = pillarsRes.data || [];
  AppState.pillarActivitiesById = {
    ...AppState.pillarActivitiesById,
    ...extractPillarActivitiesFromDb(AppState.pillars)
  };
  persistPillarActivities();

  AppState.users = (usersRes.data || []).map(u => ({
    ...u,
    name: u.full_name,
    user_type: u.role,
    pillar: getPillarNameByIdFromArray(u.pillar_id, AppState.pillars)
  }));

  const tasksViewRes = await sb.from("tasks_enriched").select("*").order("id", { ascending: true });

  if (!tasksViewRes.error) {
    AppState.tasks = (tasksViewRes.data || [])
      .map(t => ({
        id: t.id,
        title: t.title,
        pillar_id: t.pillar_id,
        pillar: t.pillar_name || "",
        assigned_to_id: t.assigned_to_id,
        assigned_to_name: t.assigned_to_name || "Non défini",
        assigned_to_role: t.assigned_to_role || "",
        supervisor_id: t.supervisor_id,
        supervisor_name: t.supervisor_name || "Non défini",
        supervisor_role: t.supervisor_role || "",
        priority: t.priority,
        status: t.status,
        progress_score: t.progress_score,
        progress: t.progress,
        staff_comment: t.staff_comment || "",
        supervisor_score: t.supervisor_score,
        supervisor_progress: t.supervisor_progress,
        supervisor_status: t.supervisor_status,
        supervisor_comment: t.supervisor_comment || "",
        due_date: t.due_date,
        description: stripActivityFromDescription(t.description),
        created_by: t.created_by,
        created_at: t.created_at,
        activity_name: t.activity_name || AppState.taskActivitiesById[String(t.id)] || extractActivityFromDescription(t.description)
      }))
      .map(hydrateTaskStatus);

    persistTaskActivitiesFromTasks();
    return;
  }

  const tasksRes = await sb.from("tasks").select("*").order("id", { ascending: true });
  if (tasksRes.error) throw new Error(`Lecture tasks impossible: ${tasksRes.error.message}`);

  AppState.tasks = (tasksRes.data || [])
    .map(t => {
      const assigned = AppState.users.find(u => String(u.id) === String(t.assigned_to_id));
      const supervisor = assigned ? AppState.users.find(u => String(u.id) === String(assigned.supervisor_id)) : null;
      const pillar = AppState.pillars.find(p => String(p.id) === String(t.pillar_id));

      return {
        id: t.id,
        title: t.title,
        pillar_id: t.pillar_id,
        pillar: pillar ? pillar.name : "",
        assigned_to_id: t.assigned_to_id,
        assigned_to_name: assigned ? assigned.name : "Non défini",
        assigned_to_role: assigned ? assigned.user_type : "",
        supervisor_id: supervisor ? supervisor.id : null,
        supervisor_name: supervisor ? supervisor.name : "Non défini",
        supervisor_role: supervisor ? supervisor.user_type : "",
        priority: t.priority,
        status: t.status,
        progress_score: t.progress_score,
        progress: t.progress,
        staff_comment: t.staff_comment || "",
        supervisor_score: t.supervisor_score,
        supervisor_progress: t.supervisor_progress,
        supervisor_status: t.supervisor_status,
        supervisor_comment: t.supervisor_comment || "",
        due_date: t.due_date,
        description: stripActivityFromDescription(t.description),
        created_by: t.created_by,
        created_at: t.created_at,
        activity_name: t.activity_name || AppState.taskActivitiesById[String(t.id)] || extractActivityFromDescription(t.description)
      };
    })
    .map(hydrateTaskStatus);

  persistTaskActivitiesFromTasks();
}

/* =========================
   UTILISATEUR / DROITS
========================= */

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

  return AppState.tasks.filter(t => String(t.pillar_id) === String(currentUser.pillar_id));
}

function canViewTask(task) {
  const currentUser = getCurrentUser();
  if (!currentUser || !task) return false;

  if (currentUser.user_type === "admin") return true;
  return String(task.pillar_id) === String(currentUser.pillar_id);
}

function canExportDashboard() {
  const currentUser = getCurrentUser();
  if (!currentUser) return false;
  return ["admin", "supervisor"].includes(currentUser.user_type);
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

function canDeleteTask(task) {
  const currentUser = getCurrentUser();
  if (!currentUser || !task) return false;

  if (currentUser.user_type === "admin") return true;
  if (currentUser.user_type === "supervisor") {
    return String(task.pillar_id) === String(currentUser.pillar_id);
  }
  return false;
}

/* =========================
   HEADER / LOGOUT
========================= */

function initUserHeader() {
  const selector = byId("currentUserSelect");
  const label = byId("currentUserLabel");
  const currentUser = getCurrentUser();

  if (selector && currentUser) {
    selector.innerHTML = `<option value="${escapeHtml(currentUser.id)}">${escapeHtml(currentUser.name)} — ${escapeHtml(currentUser.user_type)}</option>`;
    selector.disabled = true;
  }

  if (label && currentUser) {
    const supervisor = AppState.users.find(u => String(u.id) === String(currentUser.supervisor_id));
    label.innerHTML = `
      <strong>${escapeHtml(currentUser.name)}</strong><br>
      <span class="muted">${escapeHtml(currentUser.user_type)} | ${escapeHtml(currentUser.pillar || "Sans pilier")}</span><br>
      <span class="muted">Superviseur : ${escapeHtml(supervisor ? supervisor.name : "Aucun")}</span>
    `;
  }
}

function initLogout() {
  const sb = getSb();
  const logoutBtn = byId("logoutBtn");
  if (!sb || !logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.replace("login.html");
  });
}

/* =========================
   MODALS
========================= */

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

/* =========================
   FILTRES
========================= */

function applyTaskFilters(tasks, filters = {}) {
  const {
    search = "",
    pillar = "",
    supervisorId = "",
    assignedToId = "",
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
      String(task.pillar || "").toLowerCase().includes(normalizedSearch);

    const matchPillar = !pillar || task.pillar === pillar;
    const matchSupervisor = !supervisorId || String(task.supervisor_id) === String(supervisorId);
    const matchAssignedTo = !assignedToId || String(task.assigned_to_id) === String(assignedToId);
    const matchStatus = !status || task.status === status;
    const matchDateRange = isTaskWithinDateRange(task, startDate, endDate);

    return matchSearch && matchPillar && matchSupervisor && matchAssignedTo && matchStatus && matchDateRange;
  });
}

/* =========================
   BADGES
========================= */

function getStatusBadge(status) {
  if (status === STATUS.DONE) return `<span class="badge badge-green">${escapeHtml(status)}</span>`;
  if (status === STATUS.DUE_SOON) return `<span class="badge badge-orange">${escapeHtml(status)}</span>`;
  if (status === STATUS.LATE) return `<span class="badge badge-red">${escapeHtml(status)}</span>`;
  if (status === STATUS.ON_TRACK) return `<span class="badge badge-blue">${escapeHtml(status)}</span>`;
  return `<span class="badge badge-grey">${escapeHtml(status)}</span>`;
}

function getPriorityBadge(priority) {
  if (priority === "Critique") return `<span class="badge badge-red">${escapeHtml(priority)}</span>`;
  if (priority === "Haute") return `<span class="badge badge-yellow">${escapeHtml(priority)}</span>`;
  if (priority === "Moyenne") return `<span class="badge badge-blue">${escapeHtml(priority)}</span>`;
  return `<span class="badge badge-grey">${escapeHtml(priority)}</span>`;
}

function getSupervisorBadge(status) {
  if (status === "Très satisfaisant") return `<span class="badge badge-green">${escapeHtml(status)}</span>`;
  if (status === "Acceptable") return `<span class="badge badge-yellow">${escapeHtml(status)}</span>`;
  if (status === "À améliorer" || status === "Critique") return `<span class="badge badge-red">${escapeHtml(status)}</span>`;
  return `<span class="badge badge-grey">${escapeHtml(status)}</span>`;
}

/* =========================
   REGISTER / PILIERS
========================= */

function initRegisterPage() {
  const page = document.body.dataset.page;
  if (page !== "register") return;

  populateRegisterDropdowns();

  const createUserBtn = byId("createUserBtn");
  if (createUserBtn) {
    createUserBtn.addEventListener("click", createOrAssignUserFromRegisterPage);
  }
}

function initPillarCreation() {
  const page = document.body.dataset.page;
  if (page !== "register") return;

  const createPillarBtn = byId("createPillarBtn");
  if (createPillarBtn) {
    createPillarBtn.addEventListener("click", createNewPillar);
  }

  const saveActivitiesBtn = byId("savePillarActivitiesBtn");
  const pillarActivitiesPillar = byId("pillarActivitiesPillar");

  if (saveActivitiesBtn) saveActivitiesBtn.addEventListener("click", savePillarActivities);
  if (pillarActivitiesPillar) pillarActivitiesPillar.addEventListener("change", loadActivitiesForSelectedPillar);
}

function populateRegisterDropdowns() {
  const pillarSupervisor = byId("pillarSupervisor");
  const userPillar = byId("userPillar");
  const userSupervisor = byId("userSupervisor");
  const pillarActivitiesPillar = byId("pillarActivitiesPillar");
  const currentUser = getCurrentUser();

  let supervisors = AppState.users.filter(
    u => u.user_type === "supervisor" || u.user_type === "admin"
  );

  let visiblePillars = AppState.pillars;

  if (currentUser && currentUser.user_type !== "admin") {
    supervisors = supervisors.filter(u => String(u.pillar_id) === String(currentUser.pillar_id));
    visiblePillars = AppState.pillars.filter(p => String(p.id) === String(currentUser.pillar_id));
  }

  if (pillarSupervisor) {
    pillarSupervisor.innerHTML =
      `<option value="">Sélectionner un superviseur</option>` +
      supervisors.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`).join("");
  }

  if (userPillar) {
    userPillar.innerHTML =
      `<option value="">Sélectionner un pilier</option>` +
      visiblePillars.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("");
  }

  if (userSupervisor) {
    userSupervisor.innerHTML =
      `<option value="">Sélectionner un superviseur</option>` +
      supervisors.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`).join("");
  }

  if (pillarActivitiesPillar) {
    const currentValue = pillarActivitiesPillar.value || "";
    pillarActivitiesPillar.innerHTML =
      `<option value="">Sélectionner un pilier</option>` +
      visiblePillars.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("");

    pillarActivitiesPillar.value = visiblePillars.some(p => String(p.id) === String(currentValue)) ? currentValue : "";

    if (!pillarActivitiesPillar.value && visiblePillars.length === 1) {
      pillarActivitiesPillar.value = String(visiblePillars[0].id);
    }

    loadActivitiesForSelectedPillar();
  }
}

function loadActivitiesForSelectedPillar() {
  const pillarId = byId("pillarActivitiesPillar")?.value || "";
  const input = byId("pillarActivitiesInput");
  if (!input) return;
  input.value = pillarId ? getActivitiesForPillar(pillarId).join("\n") : "";
}

async function savePillarActivities() {
  const sb = getSb();
  const currentUser = getCurrentUser();
  if (!sb || !currentUser) return;

  if (!canCreatePillar()) {
    setMessage("pillarActivitiesMessage", "Seuls les superviseurs et admins peuvent enregistrer les activités d’un pilier.", "error");
    return;
  }

  const pillarId = byId("pillarActivitiesPillar")?.value || "";
  const rawActivities = byId("pillarActivitiesInput")?.value || "";
  const activities = normalizeActivitiesList(rawActivities);

  if (!pillarId) {
    setMessage("pillarActivitiesMessage", "Veuillez sélectionner un pilier.", "error");
    return;
  }

  if (currentUser.user_type !== "admin" && String(pillarId) !== String(currentUser.pillar_id)) {
    setMessage("pillarActivitiesMessage", "Vous ne pouvez définir les activités que de votre pilier.", "error");
    return;
  }

  AppState.pillarActivitiesById[String(pillarId)] = activities;
  persistPillarActivities();

  const { error } = await sb.from("pillars").update({ main_activities: activities }).eq("id", pillarId);

  if (error && !`${error.message || ""}`.toLowerCase().includes("main_activities")) {
    setMessage("pillarActivitiesMessage", `Impossible d’enregistrer les activités : ${error.message}`, "error");
    return;
  }

  setMessage("pillarActivitiesMessage", "Activités enregistrées avec succès.", "success");
}

async function createNewPillar() {
  const sb = getSb();
  if (!sb) return;

  if (!canCreatePillar()) {
    setMessage("pillarMessage", "Seuls les superviseurs et admins peuvent créer un pilier.", "error");
    return;
  }

  const name = String(byId("pillarName")?.value || "").trim();
  const supervisorId = byId("pillarSupervisor")?.value || "";

  if (!name || !supervisorId) {
    setMessage("pillarMessage", "Veuillez renseigner le nom du pilier et le superviseur.", "error");
    return;
  }

  const { error } = await sb.from("pillars").insert([{
    name,
    full_name: name,
    supervisor_profile_id: supervisorId
  }]);

  if (error) {
    setMessage("pillarMessage", `Impossible de créer le pilier : ${error.message}`, "error");
    return;
  }

  setMessage("pillarMessage", "Pilier créé avec succès.", "success");
  await reloadAndRerender();
}

async function createOrAssignUserFromRegisterPage() {
  const sb = getSb();
  const currentUser = getCurrentUser();
  if (!sb || !currentUser) return;

  if (!canManageMembers()) {
    setMessage("userMessage", "Seuls les superviseurs et admins peuvent gérer les membres.", "error");
    return;
  }

  const fullName = String(byId("userName")?.value || "").trim();
  const email = String(byId("userEmail")?.value || "").trim().toLowerCase();
  const role = byId("userRole")?.value || "staff";
  const pillarId = byId("userPillar")?.value || "";
  const supervisorId = byId("userSupervisor")?.value || "";

  if (!fullName || !email || !pillarId || !supervisorId) {
    setMessage("userMessage", "Veuillez renseigner le nom, l’email, le pilier et le superviseur.", "error");
    return;
  }

  if (currentUser.user_type !== "admin" && String(pillarId) !== String(currentUser.pillar_id)) {
    setMessage("userMessage", "Vous ne pouvez gérer que des membres de votre pilier.", "error");
    return;
  }

  const existingUser = AppState.users.find(u => (u.email || "").toLowerCase() === email);

  if (!existingUser) {
    setMessage("userMessage", "Créez d’abord le compte utilisateur dans Authentication ou utilisez la page d’auto-inscription.", "error");
    return;
  }

  const { error } = await sb
    .from("profiles")
    .update({
      full_name: fullName,
      role,
      pillar_id: pillarId,
      supervisor_id: supervisorId,
      is_active: true
    })
    .eq("id", existingUser.id);

  if (error) {
    setMessage("userMessage", `Mise à jour du membre impossible : ${error.message}`, "error");
    return;
  }

  setMessage("userMessage", "Membre affecté / mis à jour avec succès.", "success");
  await reloadAndRerender();
}

function renderRegisterPage() {
  populateRegisterDropdowns();

  const pillarsList = byId("pillarsList");
  const membersList = byId("registeredMembersList");
  const currentUser = getCurrentUser();

  if (!pillarsList || !membersList) return;

  let visiblePillars = AppState.pillars;
  let visibleMembers = AppState.users;

  if (currentUser && currentUser.user_type !== "admin") {
    visiblePillars = AppState.pillars.filter(p => String(p.id) === String(currentUser.pillar_id));
    visibleMembers = AppState.users.filter(u => String(u.pillar_id) === String(currentUser.pillar_id));
  }

  if (!visiblePillars.length) {
    pillarsList.innerHTML = `<div class="empty">Aucun pilier disponible.</div>`;
  } else {
    pillarsList.innerHTML = visiblePillars.map(p => {
      const supervisor = AppState.users.find(u => String(u.id) === String(p.supervisor_profile_id));
      const activities = getActivitiesForPillar(p.id);
      return `
        <div class="member-card">
          <h4>${escapeHtml(p.name)}</h4>
          <div class="muted">Superviseur : ${escapeHtml(supervisor ? supervisor.name : "Non défini")}</div>
          <div class="muted">Activités : ${escapeHtml(activities.length ? activities.join(", ") : "Non définies")}</div>
        </div>
      `;
    }).join("");
  }

  membersList.innerHTML = visibleMembers.length
    ? visibleMembers.map(member => `
      <div class="member-card">
        <h4>${escapeHtml(member.name)}</h4>
        <div class="muted">${escapeHtml(member.user_type)} | ${escapeHtml(member.pillar || "Sans pilier")}</div>
        <div class="muted">${escapeHtml(member.email || "")}</div>
      </div>
    `).join("")
    : `<div class="empty">Aucun membre trouvé.</div>`;
}

/* =========================
   CRÉATION DE TÂCHE
========================= */

function initTaskCreation() {
  const page = document.body.dataset.page;
  if (page !== "dashboard") return;

  populateTaskCreationDropdowns();

  const openBtn = byId("openCreateTaskModalBtn");
  const closeTopBtn = byId("closeCreateTaskModalBtn");
  const closeBottomBtn = byId("closeCreateTaskModalBtnFooter");
  const createBtn = byId("createTaskBtn");
  const dueDateInput = byId("taskDueDate");
  const pillarInput = byId("taskPillar");

  if (openBtn) {
    if (canCreateTask()) {
      openBtn.addEventListener("click", openCreateTaskModal);
      openBtn.style.display = "";
    } else {
      openBtn.style.display = "none";
    }
  }

  if (closeTopBtn) closeTopBtn.addEventListener("click", closeCreateTaskModal);
  if (closeBottomBtn) closeBottomBtn.addEventListener("click", closeCreateTaskModal);
  if (createBtn) createBtn.addEventListener("click", createNewTask);
  if (dueDateInput) dueDateInput.addEventListener("change", updateCreateTaskAutoStatus);
  if (pillarInput) pillarInput.addEventListener("change", populateTaskActivityOptions);
}

function populateTaskCreationDropdowns() {
  const taskPillar = byId("taskPillar");
  const taskAssignedTo = byId("taskAssignedTo");
  const currentUser = getCurrentUser();

  let visiblePillars = AppState.pillars;
  let eligibleUsers = AppState.users;

  if (currentUser && currentUser.user_type !== "admin") {
    visiblePillars = AppState.pillars.filter(p => String(p.id) === String(currentUser.pillar_id));
    eligibleUsers = AppState.users.filter(u => String(u.pillar_id) === String(currentUser.pillar_id));
  }

  if (taskPillar) {
    taskPillar.innerHTML =
      `<option value="">Sélectionner un pilier</option>` +
      visiblePillars.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("");
  }

  if (taskAssignedTo) {
    taskAssignedTo.innerHTML =
      `<option value="">Sélectionner un membre</option>` +
      eligibleUsers.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} — ${escapeHtml(u.pillar || "Sans pilier")}</option>`).join("");
  }

  populateTaskActivityOptions();
}

function populateTaskActivityOptions() {
  const activitySelect = byId("taskActivity");
  const taskPillar = byId("taskPillar");
  if (!activitySelect || !taskPillar) return;

  const pillarId = taskPillar.value || "";
  const activities = pillarId ? getActivitiesForPillar(pillarId) : [];
  const previousValue = activitySelect.value || "";

  activitySelect.innerHTML =
    `<option value="">${activities.length ? "Sélectionner une activité" : "Aucune activité définie pour ce pilier"}</option>` +
    activities.map(activity => `<option value="${escapeHtml(activity)}">${escapeHtml(activity)}</option>`).join("");

  activitySelect.value = activities.includes(previousValue) ? previousValue : "";
}

function updateCreateTaskAutoStatus() {
  const dueDateInput = byId("taskDueDate");
  const autoStatusInput = byId("taskAutoStatus");
  if (!autoStatusInput) return;

  autoStatusInput.value = computeAutomaticStatus({
    due_date: dueDateInput?.value || null,
    progress: 0
  });
}

function openCreateTaskModal() {
  if (!canCreateTask()) {
    setMessage("taskCreateMessage", "Seuls les superviseurs et admins peuvent créer une tâche.", "error");
    return;
  }

  populateTaskCreationDropdowns();

  const planningDateInput = byId("taskPlanningDate");
  const autoStatusInput = byId("taskAutoStatus");
  const dueDateInput = byId("taskDueDate");
  const titleInput = byId("taskTitle");
  const descriptionInput = byId("taskDescription");
  const activityInput = byId("taskActivity");

  if (planningDateInput) planningDateInput.value = new Date().toISOString().slice(0, 10);
  if (autoStatusInput) autoStatusInput.value = STATUS.ON_TRACK;
  if (dueDateInput) dueDateInput.value = "";
  if (titleInput) titleInput.value = "";
  if (descriptionInput) descriptionInput.value = "";
  if (activityInput) activityInput.value = "";

  clearMessage("taskCreateMessage");
  updateCreateTaskAutoStatus();
  openModal("createTaskModal");
}

function closeCreateTaskModal() {
  closeModal("createTaskModal");
}

async function createNewTask() {
  const sb = getSb();
  const currentUser = getCurrentUser();
  if (!sb || !currentUser) return;

  if (!canCreateTask()) {
    setMessage("taskCreateMessage", "Seuls les superviseurs et admins peuvent créer une tâche.", "error");
    return;
  }

  const title = String(byId("taskTitle")?.value || "").trim();
  const pillarId = byId("taskPillar")?.value || "";
  const assignedToId = byId("taskAssignedTo")?.value || "";
  const priority = byId("taskPriority")?.value || "Moyenne";
  const dueDate = byId("taskDueDate")?.value || null;
  const activityName = String(byId("taskActivity")?.value || "").trim();
  const description = String(byId("taskDescription")?.value || "").trim();

  if (!title || !pillarId || !assignedToId || !dueDate) {
    setMessage("taskCreateMessage", "Veuillez renseigner le titre, le pilier, le membre assigné et l’échéance.", "error");
    return;
  }

  if (currentUser.user_type !== "admin" && String(pillarId) !== String(currentUser.pillar_id)) {
    setMessage("taskCreateMessage", "Vous ne pouvez créer une tâche que dans votre pilier.", "error");
    return;
  }

  const basePayload = {
    title,
    pillar_id: pillarId,
    assigned_to_id: assignedToId,
    priority,
    status: computeAutomaticStatus({ due_date: dueDate, progress: 0 }),
    progress_score: 0,
    progress: 0,
    staff_comment: "",
    supervisor_score: 0,
    supervisor_progress: 0,
    supervisor_status: "Non évalué",
    supervisor_comment: "",
    due_date: dueDate,
    description: activityName ? `[Activité: ${activityName}]\n${description}`.trim() : description,
    created_by: currentUser.id
  };

  const statusCandidates = getStatusCandidates(basePayload.status);
  let insertError = null;

  for (const candidate of statusCandidates) {
    const payload = { ...basePayload, status: candidate };
    const { error } = await sb.from("tasks").insert([payload]);
    if (!error) {
      insertError = null;
      break;
    }

    insertError = error;
    if (!isStatusConstraintError(error)) break;
  }

  if (insertError) {
    setMessage("taskCreateMessage", `Création impossible : ${insertError.message}`, "error");
    return;
  }

  if (activityName) {
    const createdTaskRes = await sb
      .from("tasks")
      .select("id")
      .eq("created_by", currentUser.id)
      .eq("title", title)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!createdTaskRes.error && createdTaskRes.data?.id) {
      AppState.taskActivitiesById[String(createdTaskRes.data.id)] = activityName;
      persistTaskActivities();
    }
  }

  setMessage("taskCreateMessage", "Tâche créée avec succès.", "success");
  await reloadAndRerender();
  closeCreateTaskModal();
}

/* =========================
   MISE À JOUR TÂCHE
========================= */

function initGlobalActions() {
  const closeTopBtn = byId("closeTaskModalBtn");
  const closeBottomBtn = byId("closeTaskModalBtnFooter");
  const saveBtn = byId("saveTaskBtn");

  if (closeTopBtn) closeTopBtn.addEventListener("click", closeTaskModal);
  if (closeBottomBtn) closeBottomBtn.addEventListener("click", closeTaskModal);
  if (saveBtn) saveBtn.addEventListener("click", saveTaskUpdate);
}

function openTaskModal(taskId) {
  const task = AppState.tasks.find(t => String(t.id) === String(taskId));
  if (!task || !canViewTask(task)) return;

  byId("editTaskId").value = task.id;
  byId("editStatus").value = computeAutomaticStatus(task);
  byId("editProgressScore").value = task.progress_score ?? 0;
  byId("editStaffComment").value = "";
  byId("editSupervisorScore").value = task.supervisor_score ?? 0;
  byId("editSupervisorStatus").value = task.supervisor_status || "Non évalué";
  byId("editSupervisorComment").value = "";

  openModal("taskModal");
}

function closeTaskModal() {
  closeModal("taskModal");
}

async function saveTaskUpdate() {
  const currentUser = getCurrentUser();
  const sb = getSb();
  if (!currentUser || !sb) return;

  const taskId = Number(byId("editTaskId")?.value);
  const task = AppState.tasks.find(t => Number(t.id) === taskId);
  if (!task || !canViewTask(task)) return;

  let progressScore = Number(byId("editProgressScore")?.value);
  let supervisorScore = Number(byId("editSupervisorScore")?.value);

  progressScore = clamp(progressScore, 0, 10);
  supervisorScore = clamp(supervisorScore, 0, 10);

  const isAssignedUser = String(currentUser.id) === String(task.assigned_to_id);
  const isSupervisorOnPillar =
    currentUser.user_type === "supervisor" &&
    String(task.pillar_id) === String(currentUser.pillar_id);
  const isAdminUser = currentUser.user_type === "admin";

  const status = computeAutomaticStatus({
    ...task,
    progress: (isAssignedUser || isAdminUser) ? scoreToPercent(progressScore) : task.progress
  });

  const supervisorStatus = byId("editSupervisorStatus")?.value || "Non évalué";
  const newStaffComment = String(byId("editStaffComment")?.value || "").trim();
  const newSupervisorComment = String(byId("editSupervisorComment")?.value || "").trim();

  const payload = { status };

  if (isAssignedUser || isAdminUser) {
    payload.progress_score = progressScore;
    payload.progress = scoreToPercent(progressScore);
    payload.staff_comment = appendComment(task.staff_comment, currentUser.name, newStaffComment);
  }

  if (isSupervisorOnPillar || isAdminUser) {
    payload.supervisor_score = supervisorScore;
    payload.supervisor_progress = scoreToPercent(supervisorScore);
    payload.supervisor_status = supervisorStatus;
    payload.supervisor_comment = appendComment(task.supervisor_comment, currentUser.name, newSupervisorComment);
  }

  const statusCandidates = getStatusCandidates(payload.status);
  let updateError = null;

  for (const candidate of statusCandidates) {
    const attemptPayload = { ...payload, status: candidate };
    const { error } = await sb.from("tasks").update(attemptPayload).eq("id", taskId);
    if (!error) {
      updateError = null;
      break;
    }
    updateError = error;
    if (!isStatusConstraintError(error)) break;
  }

  if (updateError) {
    showGlobalError(`Erreur mise à jour : ${updateError.message}`);
    return;
  }

  closeTaskModal();
  await reloadAndRerender();
}

/* =========================
   EXPORT / IMPRESSION
========================= */

function initExportAndPrint() {
  const page = document.body.dataset.page;
  if (page !== "dashboard") return;

  const exportBtn = byId("exportXlsxBtn");
  const printBtn = byId("printPageBtn");
  const searchBtn = byId("searchBtn");
  const searchInput = byId("searchInput");
  const pillarFilter = byId("pillarFilter");
  const supervisorFilter = byId("supervisorFilter");
  const assignedToFilter = byId("assignedToFilter");
  const statusFilter = byId("statusFilter");
  const startDateFilter = byId("startDateFilter");
  const endDateFilter = byId("endDateFilter");

  if (exportBtn) {
    if (canExportDashboard()) {
      exportBtn.style.display = "";
      exportBtn.addEventListener("click", exportCurrentViewToXlsx);
    } else {
      exportBtn.style.display = "none";
    }
  }

  if (printBtn) printBtn.addEventListener("click", printCurrentPage);
  if (searchBtn) searchBtn.addEventListener("click", renderDashboardPage);

  if (searchInput) {
    searchInput.addEventListener("keydown", e => {
      if (e.key === "Enter") renderDashboardPage();
    });
  }

  if (pillarFilter) pillarFilter.addEventListener("change", renderDashboardPage);
  if (supervisorFilter) supervisorFilter.addEventListener("change", renderDashboardPage);
  if (assignedToFilter) assignedToFilter.addEventListener("change", renderDashboardPage);
  if (statusFilter) statusFilter.addEventListener("change", renderDashboardPage);
  if (startDateFilter) startDateFilter.addEventListener("change", renderDashboardPage);
  if (endDateFilter) endDateFilter.addEventListener("change", renderDashboardPage);
}

function initMyTasksFilters() {
  const page = document.body.dataset.page;
  if (page !== "my-tasks") return;

  const assignedToFilter = byId("myTasksAssignedToFilter");
  const statusFilter = byId("myTasksStatusFilter");
  const startDateFilter = byId("myTasksStartDateFilter");
  const endDateFilter = byId("myTasksEndDateFilter");

  if (assignedToFilter) assignedToFilter.addEventListener("change", renderMyTasksPage);
  if (statusFilter) statusFilter.addEventListener("change", renderMyTasksPage);
  if (startDateFilter) startDateFilter.addEventListener("change", renderMyTasksPage);
  if (endDateFilter) endDateFilter.addEventListener("change", renderMyTasksPage);
}

function getFilteredDashboardTasks() {
  const visibleTasks = getVisibleTasks();

  return applyTaskFilters(visibleTasks, {
    search: byId("searchInput")?.value || "",
    pillar: byId("pillarFilter")?.value || "",
    supervisorId: byId("supervisorFilter")?.value || "",
    assignedToId: byId("assignedToFilter")?.value || "",
    status: byId("statusFilter")?.value || "",
    startDate: byId("startDateFilter")?.value || "",
    endDate: byId("endDateFilter")?.value || ""
  });
}

function getFilteredMyTasks(tasks) {
  return applyTaskFilters(tasks, {
    assignedToId: byId("myTasksAssignedToFilter")?.value || "",
    status: byId("myTasksStatusFilter")?.value || "",
    startDate: byId("myTasksStartDateFilter")?.value || "",
    endDate: byId("myTasksEndDateFilter")?.value || ""
  });
}

function getCurrentTableDataForExport() {
  return getFilteredDashboardTasks();
}

function exportCurrentViewToXlsx() {
  if (typeof XLSX === "undefined") {
    alert("Librairie XLSX indisponible.");
    return;
  }

  const rows = getCurrentTableDataForExport();

  const exportData = rows.map(task => ({
    ID: task.id,
    Tache: task.title,
    Pilier: task.pillar || "",
    Assigne_a: task.assigned_to_name || "",
    Superviseur: task.supervisor_name || "",
    Priorite: task.priority || "",
    Statut: task.status || "",
    Score_staff: task.progress_score ?? 0,
    Progression_staff_pourcent: task.progress ?? 0,
    Score_superviseur: task.supervisor_score ?? 0,
    Progression_superviseur_pourcent: task.supervisor_progress ?? 0,
    Echeance: task.due_date || ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Taches");
  XLSX.writeFile(workbook, "UNW_TaskManager.xlsx");
}

function printCurrentPage() {
  window.print();
}

/* =========================
   RENDERING
========================= */

function renderTaskRows(tasks, options = {}) {
  const { showDescription = false } = options;

  return tasks.map(task => `
    <tr class="${isLate(task) ? "row-late" : isDueSoon(task) ? "row-due-soon" : ""}">
      <td>${escapeHtml(task.id)}</td>
      <td>
        <strong>${escapeHtml(task.title)}</strong><br>
        <span class="muted">${escapeHtml(task.pillar || "")}</span><br>
        <span class="muted">Activité : ${escapeHtml(task.activity_name || "Non définie")}</span>
      </td>
      ${showDescription ? `<td class="description-cell">${escapeHtml(task.description || "—")}</td>` : ""}
      <td>${escapeHtml(task.assigned_to_name)}<br><span class="muted">${escapeHtml(task.assigned_to_role || "")}</span></td>
      <td>${escapeHtml(task.supervisor_name)}<br><span class="muted">${escapeHtml(task.supervisor_role || "")}</span></td>
      <td>${getPriorityBadge(task.priority)}</td>
      <td>${getStatusBadge(task.status)}</td>
      <td>
        <div class="progress-track">
          <div class="progress-fill" style="width:${clamp(task.progress || 0, 0, 100)}%"></div>
        </div>
        ${clamp(task.progress || 0, 0, 100)}%
      </td>
      <td style="white-space:pre-line;">${escapeHtml(task.staff_comment || "—")}</td>
      <td>
        <div class="progress-track">
          <div class="progress-fill supervisor" style="width:${clamp(task.supervisor_progress || 0, 0, 100)}%"></div>
        </div>
        ${clamp(task.supervisor_progress || 0, 0, 100)}%<br>
        ${getSupervisorBadge(task.supervisor_status)}
      </td>
      <td style="white-space:pre-line;">${escapeHtml(task.supervisor_comment || "—")}</td>
      <td class="${isLate(task) ? "late" : isDueSoon(task) ? "soon" : ""}">${escapeHtml(task.due_date || "")}</td>
      <td class="no-print">
        <div class="table-actions">
          <button class="action-btn" type="button" onclick="openTaskModal(${Number(task.id)})">Mettre à jour</button>
          ${canDeleteTask(task) ? `<button class="action-btn secondary-danger" type="button" onclick="deleteTask(${Number(task.id)})">Supprimer</button>` : ``}
        </div>
      </td>
    </tr>
  `).join("");
}

function renderKPIs(targetId, tasks) {
  const el = byId(targetId);
  if (!el) return;

  const total = tasks.length;
  const onTrack = tasks.filter(t => computeAutomaticStatus(t) === STATUS.ON_TRACK).length;
  const dueSoon = tasks.filter(t => computeAutomaticStatus(t) === STATUS.DUE_SOON).length;
  const completed = tasks.filter(t => computeAutomaticStatus(t) === STATUS.DONE).length;
  const late = tasks.filter(t => computeAutomaticStatus(t) === STATUS.LATE).length;

  el.innerHTML = `
    <div class="card"><h3>Total des tâches</h3><div class="value">${total}</div></div>
    <div class="card"><h3>En bonne voie</h3><div class="value">${onTrack}</div></div>
    <div class="card"><h3>Échéance imminente</h3><div class="value">${dueSoon}</div></div>
    <div class="card"><h3>Achevées</h3><div class="value">${completed}</div></div>
    <div class="card"><h3>En retard</h3><div class="value">${late}</div></div>
  `;
}

function renderDashboardPage() {
  const tbody = byId("tasksTbody");
  if (!tbody) return;

  const currentUser = getCurrentUser();
  const pillarFilter = byId("pillarFilter");
  const supervisorFilter = byId("supervisorFilter");
  const assignedToFilter = byId("assignedToFilter");

  let visiblePillars = AppState.pillars;
  let visibleSupervisors = AppState.users.filter(u => u.user_type === "supervisor" || u.user_type === "admin");
  let visibleAssignees = AppState.users;

  if (currentUser && currentUser.user_type !== "admin") {
    visiblePillars = AppState.pillars.filter(p => String(p.id) === String(currentUser.pillar_id));
    visibleSupervisors = visibleSupervisors.filter(u => String(u.pillar_id) === String(currentUser.pillar_id));
    visibleAssignees = AppState.users.filter(u => String(u.pillar_id) === String(currentUser.pillar_id));
  }

  if (pillarFilter) {
    const currentValue = pillarFilter.value || "";
    pillarFilter.innerHTML =
      `<option value="">Tous les piliers</option>` +
      visiblePillars.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join("");
    pillarFilter.value = visiblePillars.some(p => p.name === currentValue) ? currentValue : "";
  }

  if (supervisorFilter) {
    const currentValue = supervisorFilter.value || "";
    supervisorFilter.innerHTML =
      `<option value="">Tous les superviseurs</option>` +
      visibleSupervisors.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`).join("");
    supervisorFilter.value = visibleSupervisors.some(u => String(u.id) === String(currentValue)) ? currentValue : "";
  }

  if (assignedToFilter) {
    const currentValue = assignedToFilter.value || "";
    assignedToFilter.innerHTML =
      `<option value="">Tous les assignés</option>` +
      visibleAssignees.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`).join("");
    assignedToFilter.value = visibleAssignees.some(u => String(u.id) === String(currentValue)) ? currentValue : "";
  }

  const filteredTasks = getFilteredDashboardTasks();
  renderKPIs("dashboardKpis", filteredTasks);
  tbody.innerHTML = renderTaskRows(filteredTasks, { showDescription: true });
}

function renderMyTasksPage() {
  const currentUser = getCurrentUser();
  const tbody = byId("myTasksTbody");
  const title = byId("myTasksTitle");
  const assignedToFilter = byId("myTasksAssignedToFilter");

  if (!currentUser || !tbody || !title) return;

  const myTasks = getVisibleTasks().filter(t => String(t.assigned_to_id) === String(currentUser.id));

  if (assignedToFilter) {
    const currentValue = assignedToFilter.value || "";
    const assignees = myTasks.length ? [{ id: currentUser.id, name: currentUser.name }] : [];

    assignedToFilter.innerHTML =
      `<option value="">Tous les assignés</option>` +
      assignees.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`).join("");

    assignedToFilter.value = assignees.some(u => String(u.id) === String(currentValue)) ? currentValue : "";
  }

  const filteredTasks = getFilteredMyTasks(myTasks);

  title.textContent = `Mes tâches — ${currentUser.name}`;
  renderKPIs("myTasksKpis", filteredTasks);

  tbody.innerHTML = filteredTasks.length
    ? renderTaskRows(filteredTasks, { showDescription: true })
    : `<tr><td colspan="13"><span class="muted">Aucune tâche correspondant aux filtres.</span></td></tr>`;
}

function renderMyTeamPage() {
  const currentUser = getCurrentUser();
  const membersBox = byId("teamMembersList");
  const tbody = byId("teamTasksTbody");
  const title = byId("myTeamTitle");

  if (!currentUser || !membersBox || !tbody || !title) return;

  let teamMembers = [];
  let teamTasks = [];

  if (currentUser.user_type === "admin") {
    teamMembers = AppState.users;
    teamTasks = AppState.tasks;
  } else {
    teamMembers = AppState.users.filter(u => String(u.pillar_id) === String(currentUser.pillar_id));
    teamTasks = getVisibleTasks();
  }

  title.textContent = `Mon équipe — ${currentUser.name}`;
  renderKPIs("myTeamKpis", teamTasks);

  membersBox.innerHTML = teamMembers.length
    ? teamMembers.map(member => `
      <div class="member-card">
        <h4>${escapeHtml(member.name)}</h4>
        <div class="muted">${escapeHtml(member.user_type)} | ${escapeHtml(member.pillar || "Sans pilier")}</div>
      </div>
    `).join("")
    : `<div class="empty">Aucun membre rattaché.</div>`;

  tbody.innerHTML = teamTasks.length
    ? renderTaskRows(teamTasks)
    : `<tr><td colspan="12"><span class="muted">Aucune tâche d'équipe.</span></td></tr>`;
}

/* =========================
   SUPPRESSION
========================= */

async function deleteTask(taskId) {
  const sb = getSb();
  const task = AppState.tasks.find(t => String(t.id) === String(taskId));
  if (!sb || !task) return;

  if (!canDeleteTask(task)) {
    alert("Vous n’êtes pas autorisé à supprimer cette tâche.");
    return;
  }

  const confirmed = confirm(`Supprimer la tâche "${task.title}" ?`);
  if (!confirmed) return;

  const { error } = await sb.from("tasks").delete().eq("id", taskId);
  if (error) {
    alert(`Erreur suppression: ${error.message}`);
    return;
  }

  await reloadAndRerender();
}

/* =========================
   RECHARGEMENT
========================= */

async function reloadAndRerender() {
  await loadReferenceData();

  const page = document.body.dataset.page;
  if (page === "dashboard") renderDashboardPage();
  if (page === "my-tasks") renderMyTasksPage();
  if (page === "my-team") renderMyTeamPage();
  if (page === "register") renderRegisterPage();
}
