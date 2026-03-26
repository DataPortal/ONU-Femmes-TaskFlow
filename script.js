const AppState = {
  pillars: [],
  users: [],
  tasks: [],
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
  await loadReferenceData();

  initUserHeader();
  initLogout();
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
  AppState.users = (usersRes.data || []).map(u => ({
    ...u,
    name: u.full_name,
    user_type: u.role,
    pillar: getPillarNameByIdFromArray(u.pillar_id, AppState.pillars)
  }));

  const tasksViewRes = await sb.from("tasks_enriched").select("*").order("id", { ascending: true });

  if (!tasksViewRes.error) {
    AppState.tasks = (tasksViewRes.data || []).map(t => ({
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
      description: t.description || "",
      created_by: t.created_by,
      created_at: t.created_at
    })).map(hydrateTaskStatus);
    return;
  }

  const tasksRes = await sb.from("tasks").select("*").order("id", { ascending: true });
  if (tasksRes.error) throw new Error(`Lecture tasks impossible: ${tasksRes.error.message}`);

  AppState.tasks = (tasksRes.data || []).map(t => {
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
      description: t.description || "",
      created_by: t.created_by,
      created_at: t.created_at
    };
  }).map(hydrateTaskStatus);
}

function getPillarNameByIdFromArray(pillarId, pillarsArray) {
  const pillar = pillarsArray.find(p => String(p.id) === String(pillarId));
  return pillar ? pillar.name : "";
}

function getPillarNameById(pillarId) {
  return getPillarNameByIdFromArray(pillarId, AppState.pillars);
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

function initUserHeader() {
  const selector = document.getElementById("currentUserSelect");
  const label = document.getElementById("currentUserLabel");
  const currentUser = getCurrentUser();

  if (selector && currentUser) {
    selector.innerHTML = `<option value="${currentUser.id}">${currentUser.name} — ${currentUser.user_type}</option>`;
    selector.disabled = true;
  }

  if (label && currentUser) {
    const supervisor = AppState.users.find(u => String(u.id) === String(currentUser.supervisor_id));
    label.innerHTML = `
      <strong>${currentUser.name}</strong><br>
      <span class="muted">${currentUser.user_type} | ${currentUser.pillar || "Sans pilier"}</span><br>
      <span class="muted">Superviseur : ${supervisor ? supervisor.name : "Aucun"}</span>
    `;
  }
}

function initLogout() {
  const sb = getSb();
  const logoutBtn = document.getElementById("logoutBtn");
  if (!sb || !logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.replace("login.html");
  });
}

function showGlobalError(message) {
  const debugBox = document.getElementById("pageDebugMessage");
  if (debugBox) {
    debugBox.innerHTML = `<div class="error-box">${message}</div>`;
    return;
  }
  alert(message);
}

function setMessage(targetId, text, type = "info") {
  const el = document.getElementById(targetId);
  if (!el) return;

  let className = "info-box";
  if (type === "error") className = "error-box";
  if (type === "success") className = "success-box";

  el.innerHTML = `<div class="${className}">${text}</div>`;
}

function clamp(v, min, max) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function scoreToPercent(score) {
  return clamp(Number(score), 0, 10) * 10;
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

  const normalizedSearch = (search || "").toLowerCase().trim();

  return tasks.filter(task => {
    const matchSearch =
      !normalizedSearch ||
      task.title.toLowerCase().includes(normalizedSearch) ||
      (task.description || "").toLowerCase().includes(normalizedSearch) ||
      (task.assigned_to_name || "").toLowerCase().includes(normalizedSearch) ||
      (task.supervisor_name || "").toLowerCase().includes(normalizedSearch) ||
      (task.pillar || "").toLowerCase().includes(normalizedSearch);

    const matchPillar = !pillar || task.pillar === pillar;
    const matchSupervisor = !supervisorId || String(task.supervisor_id) === String(supervisorId);
    const matchAssignedTo = !assignedToId || String(task.assigned_to_id) === String(assignedToId);
    const matchStatus = !status || task.status === status;
    const matchDateRange = isTaskWithinDateRange(task, startDate, endDate);

    return matchSearch && matchPillar && matchSupervisor && matchAssignedTo && matchStatus && matchDateRange;
  });
}

function appendComment(existingText, authorName, newText) {
  const clean = (newText || "").trim();
  if (!clean) return existingText || "";

  const now = new Date();
  const stamp =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ` +
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const entry = `[${stamp}] ${authorName} : ${clean}`;
  return existingText ? `${existingText}\n${entry}` : entry;
}

function getStatusBadge(status) {
  if (status === STATUS.DONE) return `<span class="badge badge-green">${status}</span>`;
  if (status === STATUS.DUE_SOON) return `<span class="badge badge-orange">${status}</span>`;
  if (status === STATUS.LATE) return `<span class="badge badge-red">${status}</span>`;
  if (status === STATUS.ON_TRACK) return `<span class="badge badge-blue">${status}</span>`;
  return `<span class="badge badge-grey">${status}</span>`;
}

function getPriorityBadge(priority) {
  if (priority === "Critique") return `<span class="badge badge-red">${priority}</span>`;
  if (priority === "Haute") return `<span class="badge badge-yellow">${priority}</span>`;
  if (priority === "Moyenne") return `<span class="badge badge-blue">${priority}</span>`;
  return `<span class="badge badge-grey">${priority}</span>`;
}

function getSupervisorBadge(status) {
  if (status === "Très satisfaisant") return `<span class="badge badge-green">${status}</span>`;
  if (status === "Acceptable") return `<span class="badge badge-yellow">${status}</span>`;
  if (status === "À améliorer" || status === "Critique") return `<span class="badge badge-red">${status}</span>`;
  return `<span class="badge badge-grey">${status}</span>`;
}

/* === REGISTER / PILIERS === */

function initRegisterPage() {
  const page = document.body.dataset.page;
  if (page !== "register") return;

  populateRegisterDropdowns();

  const createUserBtn = document.getElementById("createUserBtn");
  if (createUserBtn) {
    createUserBtn.addEventListener("click", createOrAssignUserFromRegisterPage);
  }
}

function initPillarCreation() {
  const page = document.body.dataset.page;
  if (page !== "register") return;

  const createPillarBtn = document.getElementById("createPillarBtn");
  if (createPillarBtn) {
    createPillarBtn.addEventListener("click", createNewPillar);
  }
}

function populateRegisterDropdowns() {
  const pillarSupervisor = document.getElementById("pillarSupervisor");
  const userPillar = document.getElementById("userPillar");
  const userSupervisor = document.getElementById("userSupervisor");
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
      supervisors.map(u => `<option value="${u.id}">${u.name}</option>`).join("");
  }

  if (userPillar) {
    userPillar.innerHTML =
      `<option value="">Sélectionner un pilier</option>` +
      visiblePillars.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  }

  if (userSupervisor) {
    userSupervisor.innerHTML =
      `<option value="">Sélectionner un superviseur</option>` +
      supervisors.map(u => `<option value="${u.id}">${u.name}</option>`).join("");
  }
}

async function createNewPillar() {
  const sb = getSb();
  if (!sb) return;

  if (!canCreatePillar()) {
    setMessage("pillarMessage", "Seuls les superviseurs et admins peuvent créer un pilier.", "error");
    return;
  }

  const name = (document.getElementById("pillarName")?.value || "").trim();
  const supervisorId = document.getElementById("pillarSupervisor")?.value || "";

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

  const fullName = (document.getElementById("userName")?.value || "").trim();
  const email = (document.getElementById("userEmail")?.value || "").trim().toLowerCase();
  const role = document.getElementById("userRole")?.value || "staff";
  const pillarId = document.getElementById("userPillar")?.value || "";
  const supervisorId = document.getElementById("userSupervisor")?.value || "";

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

  const pillarsList = document.getElementById("pillarsList");
  if (!pillarsList) return;

  let visiblePillars = AppState.pillars;
  const currentUser = getCurrentUser();

  if (currentUser && currentUser.user_type !== "admin") {
    visiblePillars = AppState.pillars.filter(p => String(p.id) === String(currentUser.pillar_id));
  }

  if (!visiblePillars.length) {
    pillarsList.innerHTML = `<div class="empty">Aucun pilier disponible.</div>`;
    return;
  }

  pillarsList.innerHTML = visiblePillars.map(p => {
    const supervisor = AppState.users.find(u => String(u.id) === String(p.supervisor_profile_id));
    return `
      <div class="member-card">
        <h4>${p.name}</h4>
        <div class="muted">Superviseur : ${supervisor ? supervisor.name : "Non défini"}</div>
      </div>
    `;
  }).join("");
}

/* === TASK CREATION === */

function initTaskCreation() {
  const page = document.body.dataset.page;
  if (page !== "dashboard") return;

  populateTaskCreationDropdowns();

  const openBtn = document.getElementById("openCreateTaskModalBtn");
  const closeBtn = document.getElementById("closeCreateTaskModalBtn");
  const createBtn = document.getElementById("createTaskBtn");
  const dueDateInput = document.getElementById("taskDueDate");
  const modal = document.getElementById("createTaskModal");

  if (openBtn) {
    if (canCreateTask()) {
      openBtn.addEventListener("click", openCreateTaskModal);
      openBtn.style.display = "";
    } else {
      openBtn.style.display = "none";
    }
  }

  if (closeBtn) closeBtn.addEventListener("click", closeCreateTaskModal);
  if (createBtn) createBtn.addEventListener("click", createNewTask);
  if (dueDateInput) dueDateInput.addEventListener("change", updateCreateTaskAutoStatus);

  window.addEventListener("click", e => {
    if (e.target === modal) closeCreateTaskModal();
  });
}

function updateCreateTaskAutoStatus() {
  const dueDateInput = document.getElementById("taskDueDate");
  const autoStatusInput = document.getElementById("taskAutoStatus");
  if (!autoStatusInput) return;

  autoStatusInput.value = computeAutomaticStatus({
    due_date: dueDateInput?.value || null,
    progress: 0
  });
}

function populateTaskCreationDropdowns() {
  const taskPillar = document.getElementById("taskPillar");
  const taskAssignedTo = document.getElementById("taskAssignedTo");
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
      visiblePillars.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  }

  if (taskAssignedTo) {
    taskAssignedTo.innerHTML =
      `<option value="">Sélectionner un membre</option>` +
      eligibleUsers.map(u => `<option value="${u.id}">${u.name} — ${u.pillar || "Sans pilier"}</option>`).join("");
  }
}

function openCreateTaskModal() {
  if (!canCreateTask()) {
    setMessage("taskCreateMessage", "Seuls les superviseurs et admins peuvent créer une tâche.", "error");
    return;
  }

  populateTaskCreationDropdowns();

  const planningDateInput = document.getElementById("taskPlanningDate");
  const autoStatusInput = document.getElementById("taskAutoStatus");
  if (planningDateInput) planningDateInput.value = new Date().toISOString().slice(0, 10);
  if (autoStatusInput) autoStatusInput.value = STATUS.ON_TRACK;
  const dueDateInput = document.getElementById("taskDueDate");
  if (dueDateInput) dueDateInput.value = "";
  updateCreateTaskAutoStatus();

  const modal = document.getElementById("createTaskModal");
  if (modal) modal.style.display = "block";
}

function closeCreateTaskModal() {
  const modal = document.getElementById("createTaskModal");
  if (modal) modal.style.display = "none";
}

async function createNewTask() {
  const sb = getSb();
  const currentUser = getCurrentUser();
  if (!sb || !currentUser) return;

  if (!canCreateTask()) {
    setMessage("taskCreateMessage", "Seuls les superviseurs et admins peuvent créer une tâche.", "error");
    return;
  }

  const title = (document.getElementById("taskTitle")?.value || "").trim();
  const pillarId = document.getElementById("taskPillar")?.value || "";
  const assignedToId = document.getElementById("taskAssignedTo")?.value || "";
  const priority = document.getElementById("taskPriority")?.value || "Moyenne";
  const dueDate = document.getElementById("taskDueDate")?.value || null;
  const description = (document.getElementById("taskDescription")?.value || "").trim();

  if (!title || !pillarId || !assignedToId || !dueDate) {
    setMessage("taskCreateMessage", "Veuillez renseigner le titre, le pilier, le membre assigné et l’échéance.", "error");
    return;
  }

  if (currentUser.user_type !== "admin" && String(pillarId) !== String(currentUser.pillar_id)) {
    setMessage("taskCreateMessage", "Vous ne pouvez créer une tâche que dans votre pilier.", "error");
    return;
  }

  const payload = {
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
    description,
    created_by: currentUser.id
  };

  const { error } = await sb.from("tasks").insert([payload]);
  if (error) {
    setMessage("taskCreateMessage", `Création impossible : ${error.message}`, "error");
    return;
  }

  setMessage("taskCreateMessage", "Tâche créée avec succès.", "success");
  await reloadAndRerender();
  closeCreateTaskModal();
}

/* === TASK UPDATE === */

function initGlobalActions() {
  const closeBtn = document.getElementById("closeTaskModalBtn");
  const saveBtn = document.getElementById("saveTaskBtn");
  const modal = document.getElementById("taskModal");

  if (closeBtn) closeBtn.addEventListener("click", closeTaskModal);
  if (saveBtn) saveBtn.addEventListener("click", saveTaskUpdate);

  window.addEventListener("click", e => {
    if (e.target === modal) closeTaskModal();
  });
}

function openTaskModal(taskId) {
  const modal = document.getElementById("taskModal");
  if (!modal) return;

  const task = AppState.tasks.find(t => String(t.id) === String(taskId));
  if (!task || !canViewTask(task)) return;

  document.getElementById("editTaskId").value = task.id;
  document.getElementById("editStatus").value = computeAutomaticStatus(task);
  document.getElementById("editProgressScore").value = task.progress_score ?? 0;
  document.getElementById("editStaffComment").value = "";
  document.getElementById("editSupervisorScore").value = task.supervisor_score ?? 0;
  document.getElementById("editSupervisorStatus").value = task.supervisor_status || "Non évalué";
  document.getElementById("editSupervisorComment").value = "";

  modal.style.display = "block";
}

function closeTaskModal() {
  const modal = document.getElementById("taskModal");
  if (modal) modal.style.display = "none";
}

async function saveTaskUpdate() {
  const currentUser = getCurrentUser();
  const sb = getSb();
  if (!currentUser || !sb) return;

  const taskId = Number(document.getElementById("editTaskId").value);
  const task = AppState.tasks.find(t => Number(t.id) === taskId);
  if (!task || !canViewTask(task)) return;

  let progressScore = Number(document.getElementById("editProgressScore").value);
  let supervisorScore = Number(document.getElementById("editSupervisorScore").value);

  progressScore = clamp(progressScore, 0, 10);
  supervisorScore = clamp(supervisorScore, 0, 10);

  const isAssignedUser = String(currentUser.id) === String(task.assigned_to_id);
  const isSupervisorOnPillar = currentUser.user_type === "supervisor" && String(task.pillar_id) === String(currentUser.pillar_id);
  const isAdminUser = currentUser.user_type === "admin";

  const status = computeAutomaticStatus({
    ...task,
    progress: isAssignedUser || isAdminUser ? scoreToPercent(progressScore) : task.progress
  });
  const supervisorStatus = document.getElementById("editSupervisorStatus").value;
  const newStaffComment = document.getElementById("editStaffComment").value.trim();
  const newSupervisorComment = document.getElementById("editSupervisorComment").value.trim();

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

  const { error } = await sb.from("tasks").update(payload).eq("id", taskId);
  if (error) {
    alert(`Erreur mise à jour: ${error.message}`);
    return;
  }

  closeTaskModal();
  await reloadAndRerender();
}

/* === EXPORT / PRINT === */

function initExportAndPrint() {
  const page = document.body.dataset.page;
  if (page !== "dashboard") return;

  const exportBtn = document.getElementById("exportXlsxBtn");
  const printBtn = document.getElementById("printPageBtn");
  const searchBtn = document.getElementById("searchBtn");
  const searchInput = document.getElementById("searchInput");
  const pillarFilter = document.getElementById("pillarFilter");
  const supervisorFilter = document.getElementById("supervisorFilter");
  const assignedToFilter = document.getElementById("assignedToFilter");
  const statusFilter = document.getElementById("statusFilter");
  const startDateFilter = document.getElementById("startDateFilter");
  const endDateFilter = document.getElementById("endDateFilter");

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

  const assignedToFilter = document.getElementById("myTasksAssignedToFilter");
  const statusFilter = document.getElementById("myTasksStatusFilter");
  const startDateFilter = document.getElementById("myTasksStartDateFilter");
  const endDateFilter = document.getElementById("myTasksEndDateFilter");

  if (assignedToFilter) assignedToFilter.addEventListener("change", renderMyTasksPage);
  if (statusFilter) statusFilter.addEventListener("change", renderMyTasksPage);
  if (startDateFilter) startDateFilter.addEventListener("change", renderMyTasksPage);
  if (endDateFilter) endDateFilter.addEventListener("change", renderMyTasksPage);
}

function getFilteredDashboardTasks() {
  const visibleTasks = getVisibleTasks();

  return applyTaskFilters(visibleTasks, {
    search: document.getElementById("searchInput")?.value || "",
    pillar: document.getElementById("pillarFilter")?.value || "",
    supervisorId: document.getElementById("supervisorFilter")?.value || "",
    assignedToId: document.getElementById("assignedToFilter")?.value || "",
    status: document.getElementById("statusFilter")?.value || "",
    startDate: document.getElementById("startDateFilter")?.value || "",
    endDate: document.getElementById("endDateFilter")?.value || ""
  });
}

function getFilteredMyTasks(tasks) {
  return applyTaskFilters(tasks, {
    assignedToId: document.getElementById("myTasksAssignedToFilter")?.value || "",
    status: document.getElementById("myTasksStatusFilter")?.value || "",
    startDate: document.getElementById("myTasksStartDateFilter")?.value || "",
    endDate: document.getElementById("myTasksEndDateFilter")?.value || ""
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

/* === RENDERING === */

function renderTaskRows(tasks, options = {}) {
  const { showDescription = false } = options;

  return tasks.map(task => `
    <tr class="${isLate(task) ? "row-late" : isDueSoon(task) ? "row-due-soon" : ""}">
      <td>${task.id}</td>
      <td><strong>${task.title}</strong><br><span class="muted">${task.pillar || ""}</span></td>
      ${showDescription ? `<td class="description-cell">${task.description || "—"}</td>` : ""}
      <td>${task.assigned_to_name}<br><span class="muted">${task.assigned_to_role || ""}</span></td>
      <td>${task.supervisor_name}<br><span class="muted">${task.supervisor_role || ""}</span></td>
      <td>${getPriorityBadge(task.priority)}</td>
      <td>${getStatusBadge(task.status)}</td>
      <td>
        <div class="progress-track">
          <div class="progress-fill" style="width:${task.progress || 0}%"></div>
        </div>
        ${task.progress || 0}%
      </td>
      <td style="white-space:pre-line;">${task.staff_comment || "—"}</td>
      <td>
        <div class="progress-track">
          <div class="progress-fill supervisor" style="width:${task.supervisor_progress || 0}%"></div>
        </div>
        ${task.supervisor_progress || 0}%<br>${getSupervisorBadge(task.supervisor_status)}
      </td>
      <td style="white-space:pre-line;">${task.supervisor_comment || "—"}</td>
      <td class="${isLate(task) ? 'late' : isDueSoon(task) ? 'soon' : ''}">${task.due_date || ""}</td>
      <td class="no-print">
        <div class="table-actions">
          <button class="action-btn" type="button" onclick="openTaskModal(${task.id})">Mettre à jour</button>
          ${canDeleteTask(task) ? `<button class="action-btn secondary-danger" type="button" onclick="deleteTask(${task.id})">Supprimer</button>` : ``}
        </div>
      </td>
    </tr>
  `).join("");
}

function renderKPIs(targetId, tasks) {
  const el = document.getElementById(targetId);
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
  const tbody = document.getElementById("tasksTbody");
  if (!tbody) return;

  const currentUser = getCurrentUser();
  const pillarFilter = document.getElementById("pillarFilter");
  const supervisorFilter = document.getElementById("supervisorFilter");
  const assignedToFilter = document.getElementById("assignedToFilter");

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
      visiblePillars.map(p => `<option value="${p.name}">${p.name}</option>`).join("");
    pillarFilter.value = visiblePillars.some(p => p.name === currentValue) ? currentValue : "";
  }

  if (supervisorFilter) {
    const currentValue = supervisorFilter.value || "";
    supervisorFilter.innerHTML =
      `<option value="">Tous les superviseurs</option>` +
      visibleSupervisors.map(u => `<option value="${u.id}">${u.name}</option>`).join("");
    supervisorFilter.value = visibleSupervisors.some(u => String(u.id) === String(currentValue)) ? currentValue : "";
  }

  if (assignedToFilter) {
    const currentValue = assignedToFilter.value || "";
    assignedToFilter.innerHTML =
      `<option value="">Tous les assignés</option>` +
      visibleAssignees.map(u => `<option value="${u.id}">${u.name}</option>`).join("");
    assignedToFilter.value = visibleAssignees.some(u => String(u.id) === String(currentValue)) ? currentValue : "";
  }

  const filteredTasks = getFilteredDashboardTasks();

  renderKPIs("dashboardKpis", filteredTasks);
  tbody.innerHTML = renderTaskRows(filteredTasks, { showDescription: true });
}

function renderMyTasksPage() {
  const currentUser = getCurrentUser();
  const tbody = document.getElementById("myTasksTbody");
  const title = document.getElementById("myTasksTitle");
  const assignedToFilter = document.getElementById("myTasksAssignedToFilter");

  if (!currentUser || !tbody || !title) return;

  const myTasks = getVisibleTasks().filter(t => String(t.assigned_to_id) === String(currentUser.id));

  if (assignedToFilter) {
    const currentValue = assignedToFilter.value || "";
    const assignees = [];

    if (myTasks.length) {
      assignees.push({ id: currentUser.id, name: currentUser.name });
    }

    assignedToFilter.innerHTML =
      `<option value="">Tous les assignés</option>` +
      assignees.map(u => `<option value="${u.id}">${u.name}</option>`).join("");
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
  const membersBox = document.getElementById("teamMembersList");
  const tbody = document.getElementById("teamTasksTbody");
  const title = document.getElementById("myTeamTitle");

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
        <h4>${member.name}</h4>
        <div class="muted">${member.user_type} | ${member.pillar || "Sans pilier"}</div>
      </div>
    `).join("")
    : `<div class="empty">Aucun membre rattaché.</div>`;

  tbody.innerHTML = teamTasks.length
    ? renderTaskRows(teamTasks)
    : `<tr><td colspan="12"><span class="muted">Aucune tâche d'équipe.</span></td></tr>`;
}

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

async function reloadAndRerender() {
  await loadReferenceData();

  const page = document.body.dataset.page;
  if (page === "dashboard") renderDashboardPage();
  if (page === "my-tasks") renderMyTasksPage();
  if (page === "my-team") renderMyTeamPage();
  if (page === "register") renderRegisterPage();
}
