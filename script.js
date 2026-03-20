const AppState = {
  pillars: [],
  users: [],
  tasks: [],
  currentUser: null
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await bootstrapApp();
  } catch (error) {
    console.error("Erreur au démarrage :", error);
    showGlobalError("Une erreur empêche le chargement de l’application.");
  }
});

/* =========================
   BOOTSTRAP
========================= */

async function bootstrapApp() {
  const page = document.body.dataset.page || "";

  if (page === "login") {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (session) {
      window.location.href = "index.html";
      return;
    }

    initLoginPage();
    return;
  }

  if (page === "init") {
    await initInitializationPage();
    return;
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
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

  if (page === "dashboard") renderDashboardPage();
  if (page === "my-tasks") renderMyTasksPage();
  if (page === "my-team") renderMyTeamPage();
}

/* =========================
   LOGIN / LOGOUT
========================= */

function initLoginPage() {
  const loginBtn = document.getElementById("loginBtn");
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const messageBox = document.getElementById("loginMessage");

  if (!loginBtn || !emailInput || !passwordInput || !messageBox) return;

  const submitLogin = async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      messageBox.innerHTML = `<div class="error-box">Veuillez renseigner votre email et votre mot de passe.</div>`;
      return;
    }

    messageBox.innerHTML = `<div class="info-box">Connexion en cours...</div>`;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error(error);
      messageBox.innerHTML = `<div class="error-box">Connexion impossible. Vérifiez vos identifiants.</div>`;
      return;
    }

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      messageBox.innerHTML = `<div class="error-box">Connexion réussie, mais impossible de récupérer le compte.</div>`;
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, pillar_id, supervisor_id, office, is_active")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error(profileError);
      messageBox.innerHTML = `<div class="error-box">Compte connecté, mais profil introuvable dans profiles.</div>`;
      return;
    }

    if (profile.is_active === false) {
      await supabase.auth.signOut();
      messageBox.innerHTML = `<div class="error-box">Votre compte est désactivé.</div>`;
      return;
    }

    messageBox.innerHTML = `<div class="success-box">Connexion réussie. Redirection en cours...</div>`;

    setTimeout(() => {
      window.location.href = "index.html";
    }, 700);
  };

  loginBtn.addEventListener("click", submitLogin);

  passwordInput.addEventListener("keydown", e => {
    if (e.key === "Enter") submitLogin();
  });

  emailInput.addEventListener("keydown", e => {
    if (e.key === "Enter") submitLogin();
  });
}

function initLogout() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "login.html";
  });
}

/* =========================
   SESSION / PROFIL
========================= */

async function loadCurrentUser() {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw userError || new Error("Utilisateur non connecté.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      email,
      role,
      pillar_id,
      supervisor_id,
      office,
      is_active
    `)
    .eq("id", user.id)
    .single();

  if (profileError) throw profileError;
  if (!profile?.is_active) throw new Error("Compte désactivé.");

  AppState.currentUser = profile;
}

async function loadReferenceData() {
  const [pillarsRes, usersRes, tasksRes] = await Promise.all([
    supabase
      .from("pillars")
      .select("*")
      .order("name", { ascending: true }),

    supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        email,
        role,
        pillar_id,
        supervisor_id,
        office,
        is_active
      `)
      .eq("is_active", true)
      .order("full_name", { ascending: true }),

    supabase
      .from("tasks_enriched")
      .select("*")
      .order("id", { ascending: true })
  ]);

  if (pillarsRes.error) throw pillarsRes.error;
  if (usersRes.error) throw usersRes.error;
  if (tasksRes.error) throw tasksRes.error;

  AppState.pillars = pillarsRes.data || [];

  AppState.users = (usersRes.data || []).map(u => ({
    ...u,
    name: u.full_name,
    user_type: u.role,
    pillar: getPillarNameByIdFromArray(u.pillar_id, pillarsRes.data || [])
  }));

  AppState.tasks = (tasksRes.data || []).map(t => ({
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
  }));
}

function getPillarNameByIdFromArray(pillarId, pillarsArray) {
  const pillar = pillarsArray.find(p => p.id === pillarId);
  return pillar ? pillar.name : "";
}

function getPillarNameById(pillarId) {
  const pillar = AppState.pillars.find(p => p.id === pillarId);
  return pillar ? pillar.name : "";
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

/* =========================
   HEADER
========================= */

function initUserHeader() {
  const selector = document.getElementById("currentUserSelect");
  const label = document.getElementById("currentUserLabel");
  const currentUser = getCurrentUser();

  if (selector && currentUser) {
    selector.innerHTML = `<option value="${currentUser.id}">${currentUser.name} — ${currentUser.user_type}</option>`;
    selector.disabled = true;
  }

  if (label && currentUser) {
    const supervisor = AppState.users.find(u => u.id === currentUser.supervisor_id);
    label.innerHTML = `
      <strong>${currentUser.name}</strong><br>
      <span class="muted">${currentUser.user_type} | ${currentUser.pillar || "Sans pilier"}</span><br>
      <span class="muted">Superviseur : ${supervisor ? supervisor.name : "Aucun"}</span>
    `;
  }
}

/* =========================
   OUTILS UI
========================= */

function showGlobalError(message) {
  const loginMessage = document.getElementById("loginMessage");
  const initMessage = document.getElementById("initMessage");

  if (loginMessage) {
    loginMessage.innerHTML = `<div class="error-box">${message}</div>`;
    return;
  }

  if (initMessage) {
    initMessage.innerHTML = `<div class="error-box">${message}</div>`;
    return;
  }

  console.error(message);
}

function clamp(v, min, max) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function scoreToPercent(score) {
  return clamp(Number(score), 0, 10) * 10;
}

function isLate(task) {
  if (!task.due_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.due_date);
  return due < today && task.status !== "Terminée";
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
  if (status === "Terminée") return `<span class="badge badge-green">${status}</span>`;
  if (status === "En cours") return `<span class="badge badge-blue">${status}</span>`;
  if (status === "Bloquée") return `<span class="badge badge-red">${status}</span>`;
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

/* =========================
   DROITS
========================= */

function canDeleteTask(task) {
  const currentUser = getCurrentUser();
  if (!currentUser || !task) return false;

  return currentUser.user_type === "admin" ||
    (currentUser.user_type === "supervisor" && task.supervisor_id === currentUser.id);
}

function canDeleteUser(targetUser) {
  const currentUser = getCurrentUser();
  if (!currentUser || !targetUser) return false;

  if (currentUser.user_type === "admin") return true;
  if (currentUser.user_type !== "supervisor") return false;

  return targetUser.supervisor_id === currentUser.id;
}

/* =========================
   INIT APP PAGE
========================= */

async function initInitializationPage() {
  const initBtn = document.getElementById("initializeAppBtn");
  const resetBtn = document.getElementById("resetAppBtn");
  const messageBox = document.getElementById("initMessage");

  if (!initBtn || !resetBtn || !messageBox) return;

  initBtn.addEventListener("click", async () => {
    messageBox.innerHTML = `
      <div class="info-box">
        En mode Supabase, créez d’abord vos comptes dans Authentication puis configurez les profils dans la table <strong>profiles</strong>.
      </div>
    `;
  });

  resetBtn.addEventListener("click", () => {
    messageBox.innerHTML = `
      <div class="info-box">
        En mode Supabase, la réinitialisation se fait au niveau de la base de données.
      </div>
    `;
  });
}

/* =========================
   REGISTER / PILLARS
========================= */

function initRegisterPage() {
  const page = document.body.dataset.page;
  if (page !== "register") return;

  populateRegistrationPillarDropdown();
  populateRegistrationSupervisorDropdown();
  renderRegisteredUsersTable();
  renderCreatedPillarsTable();

  const pillarSelect = document.getElementById("regPillar");
  if (pillarSelect) {
    pillarSelect.addEventListener("change", populateRegistrationSupervisorDropdown);
  }

  const registerBtn = document.getElementById("registerUserBtn");
  if (registerBtn) {
    registerBtn.addEventListener("click", registerNewUser);
  }
}

async function registerNewUser() {
  const currentUser = getCurrentUser();
  const messageBox = document.getElementById("registerMessage");

  if (!currentUser || !messageBox) return;

  if (currentUser.user_type !== "supervisor" && currentUser.user_type !== "admin") {
    messageBox.innerHTML = `<div class="error-box">Seuls les superviseurs et admins peuvent enregistrer un membre.</div>`;
    return;
  }

  const name = document.getElementById("regName")?.value.trim() || "";
  const email = document.getElementById("regEmail")?.value.trim() || "";
  const roleLabel = document.getElementById("regRole")?.value.trim() || "";
  const pillarName = document.getElementById("regPillar")?.value || "";
  const supervisorId = document.getElementById("regSupervisor")?.value || null;
  const office = document.getElementById("regOffice")?.value.trim() || "";

  if (!name || !email || !roleLabel || !pillarName || !supervisorId) {
    messageBox.innerHTML = `<div class="error-box">Veuillez renseigner tous les champs requis.</div>`;
    return;
  }

  const pillar = AppState.pillars.find(p => p.name === pillarName);
  if (!pillar) {
    messageBox.innerHTML = `<div class="error-box">Pilier introuvable.</div>`;
    return;
  }

  messageBox.innerHTML = `
    <div class="info-box">
      Créez d’abord le compte dans <strong>Supabase Authentication</strong>, puis mettez à jour sa ligne dans <strong>profiles</strong> avec :
      role = staff, pillar_id = ${pillar.id}, supervisor_id = ${supervisorId}, office = "${office}".
    </div>
  `;
}

function populateRegistrationPillarDropdown() {
  const select = document.getElementById("regPillar");
  if (!select) return;

  select.innerHTML = `
    <option value="">Sélectionner</option>
    ${AppState.pillars.map(p => `<option value="${p.name}">${p.name} — ${p.full_name}</option>`).join("")}
  `;
}

function populateRegistrationSupervisorDropdown() {
  const pillarName = document.getElementById("regPillar")?.value || "";
  const select = document.getElementById("regSupervisor");
  if (!select) return;

  let supervisors = AppState.users.filter(u => u.user_type === "supervisor" || u.user_type === "admin");

  if (pillarName) {
    supervisors = supervisors.filter(u => u.pillar === pillarName);
  }

  select.innerHTML = `
    <option value="">Sélectionner un superviseur</option>
    ${supervisors.map(u => `<option value="${u.id}">${u.name} — ${u.user_type}</option>`).join("")}
  `;
}

function renderRegisteredUsersTable() {
  const tbody = document.getElementById("registeredUsersTbody");
  if (!tbody) return;

  if (!AppState.users.length) {
    tbody.innerHTML = `<tr><td colspan="8"><span class="muted">Aucun utilisateur disponible.</span></td></tr>`;
    return;
  }

  tbody.innerHTML = AppState.users.map(user => {
    const supervisor = AppState.users.find(u => u.id === user.supervisor_id);
    return `
      <tr>
        <td>${user.id}</td>
        <td>${user.name}</td>
        <td>${user.user_type}</td>
        <td>${user.pillar || "—"}</td>
        <td>${supervisor ? supervisor.name : "Non défini"}</td>
        <td>${user.email || "—"}</td>
        <td>${user.office || "—"}</td>
        <td>${canDeleteUser(user) ? `<button class="action-btn" type="button">Supprimer</button>` : `<span class="muted">Non autorisé</span>`}</td>
      </tr>
    `;
  }).join("");
}

function initPillarCreation() {
  const page = document.body.dataset.page;
  if (page !== "register") return;

  populatePillarSupervisorDropdown();

  const createBtn = document.getElementById("createPillarBtn");
  if (createBtn) createBtn.addEventListener("click", createNewPillar);
}

function populatePillarSupervisorDropdown() {
  const select = document.getElementById("pillarSupervisor");
  if (!select) return;

  const candidates = AppState.users.filter(u => u.user_type === "supervisor" || u.user_type === "admin");

  select.innerHTML = `
    <option value="">Sélectionner un superviseur</option>
    ${candidates.map(u => `<option value="${u.id}">${u.name} — ${u.user_type}</option>`).join("")}
  `;
}

async function createNewPillar() {
  const currentUser = getCurrentUser();
  const messageBox = document.getElementById("pillarMessage");

  if (!currentUser || !messageBox) return;

  if (currentUser.user_type !== "supervisor" && currentUser.user_type !== "admin") {
    messageBox.innerHTML = `<div class="error-box">Seuls les superviseurs et admins peuvent créer un pilier.</div>`;
    return;
  }

  const name = document.getElementById("pillarName")?.value.trim() || "";
  const fullName = document.getElementById("pillarFullName")?.value.trim() || "";
  const supervisorId = document.getElementById("pillarSupervisor")?.value || null;

  if (!name || !fullName || !supervisorId) {
    messageBox.innerHTML = `<div class="error-box">Veuillez remplir tous les champs du pilier.</div>`;
    return;
  }

  const { error } = await supabase.from("pillars").insert([{
    name,
    full_name: fullName,
    supervisor_profile_id: supervisorId
  }]);

  if (error) {
    console.error(error);
    messageBox.innerHTML = `<div class="error-box">Impossible de créer le pilier.</div>`;
    return;
  }

  messageBox.innerHTML = `<div class="success-box">Pilier créé avec succès.</div>`;
  await reloadAndRerender();
}

function renderCreatedPillarsTable() {
  const tbody = document.getElementById("pillarsTbody");
  if (!tbody) return;

  if (!AppState.pillars.length) {
    tbody.innerHTML = `<tr><td colspan="4"><span class="muted">Aucun pilier disponible.</span></td></tr>`;
    return;
  }

  tbody.innerHTML = AppState.pillars.map(pillar => {
    const supervisor = AppState.users.find(u => u.id === pillar.supervisor_profile_id);
    return `
      <tr>
        <td>${pillar.id}</td>
        <td>${pillar.name}</td>
        <td>${pillar.full_name}</td>
        <td>${supervisor ? supervisor.name : "Non défini"}</td>
      </tr>
    `;
  }).join("");
}

/* =========================
   TASKS
========================= */

function initTaskCreation() {
  populateTaskAssignedDropdown();
  populateTaskPillarDropdown();

  const openBtn = document.getElementById("openCreateTaskModalBtn");
  const closeBtn = document.getElementById("closeCreateTaskModalBtn");
  const saveBtn = document.getElementById("createTaskBtn");
  const modal = document.getElementById("createTaskModal");

  if (openBtn) openBtn.addEventListener("click", openCreateTaskModal);
  if (closeBtn) closeBtn.addEventListener("click", closeCreateTaskModal);
  if (saveBtn) saveBtn.addEventListener("click", createNewTask);

  window.addEventListener("click", e => {
    if (e.target === modal) closeCreateTaskModal();
  });
}

function populateTaskAssignedDropdown() {
  const select = document.getElementById("taskAssignedTo");
  if (!select) return;

  const staffList = AppState.users.filter(u =>
    u.user_type === "staff" || u.user_type === "supervisor" || u.user_type === "admin"
  );

  select.innerHTML = `
    <option value="">Sélectionner un membre du staff</option>
    ${staffList.map(u => `<option value="${u.id}">${u.name} — ${u.user_type} (${u.pillar || "Sans pilier"})</option>`).join("")}
  `;
}

function populateTaskPillarDropdown() {
  const select = document.getElementById("taskPillar");
  if (!select) return;

  select.innerHTML = `
    <option value="">Sélectionner</option>
    ${AppState.pillars.map(p => `<option value="${p.name}">${p.name}</option>`).join("")}
  `;
}

function openCreateTaskModal() {
  const modal = document.getElementById("createTaskModal");
  if (!modal) return;
  populateTaskAssignedDropdown();
  populateTaskPillarDropdown();
  modal.style.display = "block";
}

function closeCreateTaskModal() {
  const modal = document.getElementById("createTaskModal");
  if (modal) modal.style.display = "none";
}

async function createNewTask() {
  const currentUser = getCurrentUser();
  const messageBox = document.getElementById("taskCreateMessage");

  if (!currentUser || !messageBox) return;

  if (currentUser.user_type !== "supervisor" && currentUser.user_type !== "admin") {
    messageBox.innerHTML = `<div class="error-box">Seuls les superviseurs et admins peuvent créer une tâche.</div>`;
    return;
  }

  const title = document.getElementById("taskTitle")?.value.trim() || "";
  const pillarName = document.getElementById("taskPillar")?.value || "";
  const assignedToId = document.getElementById("taskAssignedTo")?.value || "";
  const priority = document.getElementById("taskPriority")?.value || "Moyenne";
  const dueDate = document.getElementById("taskDueDate")?.value || null;
  const description = document.getElementById("taskDescription")?.value.trim() || "";

  if (!title || !pillarName || !assignedToId) {
    messageBox.innerHTML = `<div class="error-box">Veuillez renseigner le titre, le pilier et le membre assigné.</div>`;
    return;
  }

  const pillar = AppState.pillars.find(p => p.name === pillarName);
  if (!pillar) {
    messageBox.innerHTML = `<div class="error-box">Pilier introuvable.</div>`;
    return;
  }

  const payload = {
    title,
    pillar_id: pillar.id,
    assigned_to_id: assignedToId,
    priority,
    status: "Non commencée",
    progress_score: 0,
    progress: 0,
    supervisor_score: 0,
    supervisor_progress: 0,
    supervisor_status: "Non évalué",
    due_date: dueDate,
    description,
    created_by: currentUser.id
  };

  const { error } = await supabase.from("tasks").insert([payload]);

  if (error) {
    console.error(error);
    messageBox.innerHTML = `<div class="error-box">Erreur lors de la création de la tâche.</div>`;
    return;
  }

  messageBox.innerHTML = `<div class="success-box">Tâche créée avec succès.</div>`;
  await reloadAndRerender();
  closeCreateTaskModal();
}

async function deleteTask(taskId) {
  const task = AppState.tasks.find(t => t.id === taskId);
  if (!task) return;

  if (!canDeleteTask(task)) {
    alert("Seuls les superviseurs et les admins peuvent supprimer les tâches.");
    return;
  }

  const confirmed = confirm(`Supprimer la tâche "${task.title}" ?`);
  if (!confirmed) return;

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) {
    console.error(error);
    alert("Impossible de supprimer la tâche.");
    return;
  }

  await reloadAndRerender();
}

/* =========================
   TASK UPDATE
========================= */

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

  const task = AppState.tasks.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById("editTaskId").value = task.id;
  document.getElementById("editStatus").value = task.status || "Non commencée";
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
  if (!currentUser) return;

  const taskId = Number(document.getElementById("editTaskId").value);
  const task = AppState.tasks.find(t => t.id === taskId);
  if (!task) return;

  let progressScore = Number(document.getElementById("editProgressScore").value);
  let supervisorScore = Number(document.getElementById("editSupervisorScore").value);

  progressScore = clamp(progressScore, 0, 10);
  supervisorScore = clamp(supervisorScore, 0, 10);

  const status = document.getElementById("editStatus").value;
  const supervisorStatus = document.getElementById("editSupervisorStatus").value;
  const newStaffComment = document.getElementById("editStaffComment").value.trim();
  const newSupervisorComment = document.getElementById("editSupervisorComment").value.trim();

  const isAssignedUser = currentUser.id === task.assigned_to_id;
  const isSupervisor = currentUser.id === task.supervisor_id;
  const isAdmin = currentUser.user_type === "admin";

  const payload = { status };

  if (isAssignedUser || isAdmin) {
    payload.progress_score = progressScore;
    payload.progress = scoreToPercent(progressScore);
    payload.staff_comment = appendComment(task.staff_comment, currentUser.name, newStaffComment);
  }

  if (isSupervisor || isAdmin) {
    payload.supervisor_score = supervisorScore;
    payload.supervisor_progress = scoreToPercent(supervisorScore);
    payload.supervisor_status = supervisorStatus;
    payload.supervisor_comment = appendComment(task.supervisor_comment, currentUser.name, newSupervisorComment);
  }

  if (status === "Terminée" && (payload.progress ?? task.progress) < 100) {
    payload.progress_score = 10;
    payload.progress = 100;
  }

  const { error } = await supabase
    .from("tasks")
    .update(payload)
    .eq("id", taskId);

  if (error) {
    console.error(error);
    alert("Erreur lors de la mise à jour.");
    return;
  }

  const commentsToInsert = [];

  if (newStaffComment && (isAssignedUser || isAdmin)) {
    commentsToInsert.push({
      task_id: taskId,
      author_id: currentUser.id,
      author_role: currentUser.user_type,
      comment_text: newStaffComment,
      comment_type: "staff"
    });
  }

  if (newSupervisorComment && (isSupervisor || isAdmin)) {
    commentsToInsert.push({
      task_id: taskId,
      author_id: currentUser.id,
      author_role: currentUser.user_type,
      comment_text: newSupervisorComment,
      comment_type: "supervisor"
    });
  }

  if (commentsToInsert.length) {
    await supabase.from("task_comments").insert(commentsToInsert);
  }

  await reloadAndRerender();
  closeTaskModal();
}

/* =========================
   EXPORT / PRINT
========================= */

function initExportAndPrint() {
  const page = document.body.dataset.page;
  if (page !== "dashboard") return;

  const exportBtn = document.getElementById("exportXlsxBtn");
  const printBtn = document.getElementById("printPageBtn");

  if (exportBtn) exportBtn.addEventListener("click", exportCurrentViewToXlsx);
  if (printBtn) printBtn.addEventListener("click", printCurrentPage);
}

function getCurrentPageName() {
  return document.body.dataset.page || "dashboard";
}

function getCurrentTableDataForExport() {
  const page = getCurrentPageName();

  if (page === "dashboard") {
    const search = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
    const pillar = document.getElementById("pillarFilter")?.value || "";
    const supervisorId = document.getElementById("supervisorFilter")?.value || "";

    return AppState.tasks.filter(t => {
      const matchSearch =
        t.title.toLowerCase().includes(search) ||
        t.assigned_to_name.toLowerCase().includes(search) ||
        t.supervisor_name.toLowerCase().includes(search) ||
        (t.pillar || "").toLowerCase().includes(search);

      const matchPillar = !pillar || t.pillar === pillar;
      const matchSupervisor = !supervisorId || String(t.supervisor_id) === String(supervisorId);

      return matchSearch && matchPillar && matchSupervisor;
    });
  }

  return [];
}

function exportCurrentViewToXlsx() {
  try {
    const rows = getCurrentTableDataForExport();

    const exportData = rows.map(task => ({
      ID: task.id,
      Tache: task.title,
      Pilier: task.pillar || "",
      Assigne_a: task.assigned_to_name || "",
      Role_assigne: task.assigned_to_role || "",
      Superviseur: task.supervisor_name || "",
      Role_superviseur: task.supervisor_role || "",
      Priorite: task.priority || "",
      Statut: task.status || "",
      Score_staff: task.progress_score ?? 0,
      Progression_staff_pourcent: task.progress ?? 0,
      Commentaire_staff: task.staff_comment || "",
      Score_superviseur: task.supervisor_score ?? 0,
      Progression_superviseur_pourcent: task.supervisor_progress ?? 0,
      Appreciation_superviseur: task.supervisor_status || "",
      Commentaire_superviseur: task.supervisor_comment || "",
      Echeance: task.due_date || "",
      En_retard: isLate(task) ? "Oui" : "Non"
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Taches");

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

    XLSX.writeFile(workbook, `UNW_TaskManager_dashboard_${stamp}.xlsx`);
  } catch (error) {
    console.error("Erreur export XLSX :", error);
    alert("Impossible d’exporter les données.");
  }
}

function printCurrentPage() {
  window.print();
}

/* =========================
   TABLE RENDER
========================= */

function renderTaskRows(tasks) {
  return tasks.map(task => `
    <tr>
      <td>${task.id}</td>
      <td>
        <strong>${task.title}</strong><br>
        <span class="muted">${task.pillar || ""}</span>
      </td>
      <td>${task.assigned_to_name}<br><span class="muted">${task.assigned_to_role}</span></td>
      <td>${task.supervisor_name}<br><span class="muted">${task.supervisor_role}</span></td>
      <td>${getPriorityBadge(task.priority)}</td>
      <td>${getStatusBadge(task.status)}</td>
      <td>
        <div class="progress-track">
          <div class="progress-fill" style="width:${task.progress || 0}%"></div>
        </div>
        Score: ${task.progress_score ?? 0} / 10<br>${task.progress || 0}%
      </td>
      <td style="white-space: pre-line;">${task.staff_comment || '<span class="muted">—</span>'}</td>
      <td>
        <div class="progress-track">
          <div class="progress-fill supervisor" style="width:${task.supervisor_progress || 0}%"></div>
        </div>
        Score: ${task.supervisor_score ?? 0} / 10<br>${task.supervisor_progress || 0}%<br>${getSupervisorBadge(task.supervisor_status)}
      </td>
      <td style="white-space: pre-line;">${task.supervisor_comment || '<span class="muted">—</span>'}</td>
      <td class="${isLate(task) ? 'late' : ''}">${task.due_date || ""}</td>
      <td>
        <div class="table-actions no-print">
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
  const inProgress = tasks.filter(t => t.status === "En cours").length;
  const completed = tasks.filter(t => t.status === "Terminée").length;
  const late = tasks.filter(t => isLate(t)).length;

  el.innerHTML = `
    <div class="card"><h3>Total des tâches</h3><div class="value">${total}</div></div>
    <div class="card"><h3>En cours</h3><div class="value">${inProgress}</div></div>
    <div class="card"><h3>Terminées</h3><div class="value">${completed}</div></div>
    <div class="card"><h3>En retard</h3><div class="value">${late}</div></div>
  `;
}

/* =========================
   PAGE RENDERS
========================= */

function renderDashboardPage() {
  const searchInput = document.getElementById("searchInput");
  const searchBtn = document.getElementById("searchBtn");
  const pillarFilter = document.getElementById("pillarFilter");
  const supervisorFilter = document.getElementById("supervisorFilter");
  const tbody = document.getElementById("tasksTbody");

  if (!searchInput || !searchBtn || !pillarFilter || !supervisorFilter || !tbody) return;

  pillarFilter.innerHTML =
    `<option value="">Tous les piliers</option>` +
    AppState.pillars.map(p => `<option value="${p.name}">${p.name}</option>`).join("");

  const supervisors = AppState.users.filter(u => u.user_type === "supervisor" || u.user_type === "admin");
  supervisorFilter.innerHTML =
    `<option value="">Tous les superviseurs</option>` +
    supervisors.map(s => `<option value="${s.id}">${s.name}</option>`).join("");

  const applyFilters = () => {
    const search = (searchInput.value || "").toLowerCase().trim();
    const pillar = pillarFilter.value;
    const supervisorId = supervisorFilter.value;

    const filtered = AppState.tasks.filter(t => {
      const matchSearch =
        t.title.toLowerCase().includes(search) ||
        t.assigned_to_name.toLowerCase().includes(search) ||
        t.supervisor_name.toLowerCase().includes(search) ||
        (t.pillar || "").toLowerCase().includes(search);

      const matchPillar = !pillar || t.pillar === pillar;
      const matchSupervisor = !supervisorId || String(t.supervisor_id) === String(supervisorId);

      return matchSearch && matchPillar && matchSupervisor;
    });

    tbody.innerHTML = renderTaskRows(filtered);
    renderKPIs("dashboardKpis", filtered);
  };

  searchBtn.addEventListener("click", applyFilters);
  searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") applyFilters();
  });
  pillarFilter.addEventListener("change", applyFilters);
  supervisorFilter.addEventListener("change", applyFilters);

  tbody.innerHTML = renderTaskRows(AppState.tasks);
  renderKPIs("dashboardKpis", AppState.tasks);
}

function renderMyTasksPage() {
  const currentUser = getCurrentUser();
  const tbody = document.getElementById("myTasksTbody");
  const title = document.getElementById("myTasksTitle");
  const searchInput = document.getElementById("myTasksSearchInput");
  const searchBtn = document.getElementById("myTasksSearchBtn");

  if (!currentUser || !tbody || !title) return;

  const myTasks = AppState.tasks.filter(t => t.assigned_to_id === currentUser.id);
  title.textContent = `Mes tâches — ${currentUser.name}`;

  const applySearch = () => {
    const search = (searchInput?.value || "").toLowerCase().trim();

    const filtered = myTasks.filter(t =>
      t.title.toLowerCase().includes(search) ||
      (t.pillar || "").toLowerCase().includes(search) ||
      (t.status || "").toLowerCase().includes(search) ||
      (t.priority || "").toLowerCase().includes(search) ||
      (t.supervisor_name || "").toLowerCase().includes(search) ||
      (t.staff_comment || "").toLowerCase().includes(search) ||
      (t.supervisor_comment || "").toLowerCase().includes(search)
    );

    renderKPIs("myTasksKpis", filtered);

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="12"><span class="muted">Aucune tâche trouvée.</span></td></tr>`;
      return;
    }

    tbody.innerHTML = renderTaskRows(filtered);
  };

  if (searchBtn) searchBtn.addEventListener("click", applySearch);
  if (searchInput) {
    searchInput.addEventListener("keydown", e => {
      if (e.key === "Enter") applySearch();
    });
  }

  renderKPIs("myTasksKpis", myTasks);
  tbody.innerHTML = myTasks.length
    ? renderTaskRows(myTasks)
    : `<tr><td colspan="12"><span class="muted">Aucune tâche assignée pour le moment.</span></td></tr>`;
}

function renderMyTeamPage() {
  const currentUser = getCurrentUser();
  const membersBox = document.getElementById("teamMembersList");
  const tbody = document.getElementById("teamTasksTbody");
  const title = document.getElementById("myTeamTitle");

  if (!currentUser || !membersBox || !tbody || !title) return;

  const teamMembers = AppState.users.filter(u => u.supervisor_id === currentUser.id);
  const teamTasks = AppState.tasks.filter(t => t.supervisor_id === currentUser.id);

  title.textContent = `Mon équipe — ${currentUser.name}`;
  renderKPIs("myTeamKpis", teamTasks);

  if (!teamMembers.length) {
    membersBox.innerHTML = `<div class="empty">Vous n'avez aucun membre d'équipe rattaché comme superviseur.</div>`;
    tbody.innerHTML = `<tr><td colspan="12"><span class="muted">Aucune tâche d'équipe à afficher.</span></td></tr>`;
    return;
  }

  membersBox.innerHTML = teamMembers.map(member => {
    const memberTasks = teamTasks.filter(t => t.assigned_to_id === member.id);
    const done = memberTasks.filter(t => t.status === "Terminée").length;
    const inProgress = memberTasks.filter(t => t.status === "En cours").length;
    const late = memberTasks.filter(t => isLate(t)).length;

    return `
      <div class="member-card">
        <h4>${member.name}</h4>
        <div class="muted">${member.user_type} | ${member.pillar || "Sans pilier"}</div>
        <div class="kpi-inline">
          <span>Total tâches : <strong>${memberTasks.length}</strong></span>
          <span>En cours : <strong>${inProgress}</strong></span>
          <span>Terminées : <strong>${done}</strong></span>
          <span>En retard : <strong>${late}</strong></span>
        </div>
      </div>
    `;
  }).join("");

  tbody.innerHTML = renderTaskRows(teamTasks);
}

/* =========================
   RELOAD
========================= */

async function reloadAndRerender() {
  await loadReferenceData();

  const page = document.body.dataset.page;
  if (page === "register") {
    populateRegistrationPillarDropdown();
    populateRegistrationSupervisorDropdown();
    renderRegisteredUsersTable();
    renderCreatedPillarsTable();
  }
  if (page === "dashboard") renderDashboardPage();
  if (page === "my-tasks") renderMyTasksPage();
  if (page === "my-team") renderMyTeamPage();
}
