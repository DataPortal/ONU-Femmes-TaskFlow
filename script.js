const AppState = {
  pillars: [],
  users: [],
  tasks: [],
  currentUser: null
};

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

  if (page === "init") {
    initInitializationPage();
    return;
  }

  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError) {
    throw new Error(`Erreur session: ${sessionError.message}`);
  }

  if (!sessionData?.session) {
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

async function loadCurrentUser() {
  const sb = getSb();

  const {
    data: { user },
    error: userError
  } = await sb.auth.getUser();

  if (userError || !user) {
    throw new Error("Utilisateur non connecté ou introuvable.");
  }

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("id, full_name, email, role, pillar_id, supervisor_id, office, is_active")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(`Lecture du profil impossible: ${profileError.message}`);
  }

  if (!profile) {
    throw new Error("Aucun profil trouvé dans profiles.");
  }

  if (!profile.is_active) {
    throw new Error("Compte désactivé.");
  }

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

  // 1er essai : vue enrichie
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
    }));
    return;
  }

  console.warn("tasks_enriched indisponible, fallback sur tasks :", tasksViewRes.error.message);

  // 2e essai : fallback simple sur tasks
  const tasksRes = await sb.from("tasks").select("*").order("id", { ascending: true });
  if (tasksRes.error) throw new Error(`Lecture tasks impossible: ${tasksRes.error.message}`);

  AppState.tasks = (tasksRes.data || []).map(t => {
    const assigned = AppState.users.find(u => u.id === t.assigned_to_id);
    const supervisor = assigned ? AppState.users.find(u => u.id === assigned.supervisor_id) : null;
    const pillar = AppState.pillars.find(p => p.id === t.pillar_id);

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
  });
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

function initLogout() {
  const sb = getSb();
  const logoutBtn = document.getElementById("logoutBtn");
  if (!sb || !logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.href = "login.html";
  });
}

function showGlobalError(message) {
  const initMessage = document.getElementById("initMessage");
  const debugBox = document.getElementById("pageDebugMessage");

  if (debugBox) {
    debugBox.innerHTML = `<div class="error-box">${message}</div>`;
    return;
  }

  if (initMessage) {
    initMessage.innerHTML = `<div class="error-box">${message}</div>`;
    return;
  }

  alert(message);
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

function canDeleteTask(task) {
  const currentUser = getCurrentUser();
  if (!currentUser || !task) return false;

  return currentUser.user_type === "admin" ||
    (currentUser.user_type === "supervisor" && task.supervisor_id === currentUser.id);
}

function initInitializationPage() {
  const initBtn = document.getElementById("initializeAppBtn");
  const resetBtn = document.getElementById("resetAppBtn");
  const messageBox = document.getElementById("initMessage");

  if (!initBtn || !resetBtn || !messageBox) return;

  initBtn.addEventListener("click", async () => {
    messageBox.innerHTML = `<div class="info-box">En mode Supabase, créez d’abord les comptes dans Authentication puis configurez profiles.</div>`;
  });

  resetBtn.addEventListener("click", () => {
    messageBox.innerHTML = `<div class="info-box">La réinitialisation se fait dans Supabase.</div>`;
  });
}

function initRegisterPage() {}
function initPillarCreation() {}
function initTaskCreation() {}

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
  const sb = getSb();
  if (!currentUser || !sb) return;

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

  const { error } = await sb.from("tasks").update(payload).eq("id", taskId);
  if (error) {
    alert(`Erreur mise à jour: ${error.message}`);
    return;
  }

  closeTaskModal();
  await reloadAndRerender();
}

function initExportAndPrint() {
  const page = document.body.dataset.page;
  if (page !== "dashboard") return;

  const exportBtn = document.getElementById("exportXlsxBtn");
  const printBtn = document.getElementById("printPageBtn");

  if (exportBtn) exportBtn.addEventListener("click", exportCurrentViewToXlsx);
  if (printBtn) printBtn.addEventListener("click", printCurrentPage);
}

function getCurrentTableDataForExport() {
  return AppState.tasks;
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

function renderTaskRows(tasks) {
  return tasks.map(task => `
    <tr>
      <td>${task.id}</td>
      <td><strong>${task.title}</strong><br><span class="muted">${task.pillar || ""}</span></td>
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
      <td class="${isLate(task) ? 'late' : ''}">${task.due_date || ""}</td>
      <td class="no-print">
        <div class="table-actions">
          <button class="action-btn" type="button" onclick="openTaskModal(${task.id})">Mettre à jour</button>
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

function renderDashboardPage() {
  const tbody = document.getElementById("tasksTbody");
  if (!tbody) return;

  renderKPIs("dashboardKpis", AppState.tasks);
  tbody.innerHTML = renderTaskRows(AppState.tasks);
}

function renderMyTasksPage() {
  const currentUser = getCurrentUser();
  const tbody = document.getElementById("myTasksTbody");
  const title = document.getElementById("myTasksTitle");

  if (!currentUser || !tbody || !title) return;

  const myTasks = AppState.tasks.filter(t => t.assigned_to_id === currentUser.id);
  title.textContent = `Mes tâches — ${currentUser.name}`;
  renderKPIs("myTasksKpis", myTasks);
  tbody.innerHTML = myTasks.length
    ? renderTaskRows(myTasks)
    : `<tr><td colspan="12"><span class="muted">Aucune tâche assignée.</span></td></tr>`;
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

  membersBox.innerHTML = teamMembers.length
    ? teamMembers.map(member => `<div class="member-card"><h4>${member.name}</h4><div class="muted">${member.user_type} | ${member.pillar || "Sans pilier"}</div></div>`).join("")
    : `<div class="empty">Aucun membre rattaché.</div>`;

  tbody.innerHTML = teamTasks.length
    ? renderTaskRows(teamTasks)
    : `<tr><td colspan="12"><span class="muted">Aucune tâche d'équipe.</span></td></tr>`;
}

async function reloadAndRerender() {
  await loadReferenceData();

  const page = document.body.dataset.page;
  if (page === "dashboard") renderDashboardPage();
  if (page === "my-tasks") renderMyTasksPage();
  if (page === "my-team") renderMyTeamPage();
}
