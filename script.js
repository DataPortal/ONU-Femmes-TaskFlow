const AppState = {
  pillars: [],
  users: [],
  tasks: [],
  enrichedTasks: []
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  initUserSelector();
  initGlobalActions();
  initRegisterPage();
  initTaskCreation();
  initPillarCreation();

  const page = document.body.dataset.page;
  if (page === "dashboard") renderDashboardPage();
  if (page === "my-tasks") renderMyTasksPage();
  if (page === "my-team") renderMyTeamPage();
});

async function loadData() {
  const [pillarsRes, usersRes, tasksRes] = await Promise.all([
    fetch("data/pillars.json"),
    fetch("data/users.json"),
    fetch("data/tasks.json")
  ]);

  const basePillars = await pillarsRes.json();
  const baseUsers = await usersRes.json();
  const baseTasks = await tasksRes.json();

  const localPillars = JSON.parse(localStorage.getItem("unw_created_pillars") || "[]");
  const localUsers = JSON.parse(localStorage.getItem("unw_registered_users") || "[]");
  const localTasks = JSON.parse(localStorage.getItem("unw_created_tasks") || "[]");

  AppState.pillars = [...basePillars, ...localPillars];
  AppState.users = [...baseUsers, ...localUsers];
  AppState.tasks = [...baseTasks, ...localTasks];

  enrichTasks();
}

function enrichTasks() {
  AppState.enrichedTasks = AppState.tasks.map(task => {
    const assignedUser = AppState.users.find(u => u.id === task.assigned_to_id) || null;
    const supervisor = assignedUser
      ? AppState.users.find(u => u.id === assignedUser.supervisor_id) || null
      : null;

    return {
      ...task,
      assigned_to_name: assignedUser ? assignedUser.name : "Non défini",
      assigned_to_role: assignedUser ? assignedUser.role : "",
      assigned_to_type: assignedUser ? assignedUser.user_type : "",
      supervisor_id: supervisor ? supervisor.id : null,
      supervisor_name: supervisor ? supervisor.name : "Non défini",
      supervisor_role: supervisor ? supervisor.role : ""
    };
  });
}

/* =========================
   UTILISATEUR COURANT
========================= */

function initUserSelector() {
  const selector = document.getElementById("currentUserSelect");
  if (!selector) return;

  selector.innerHTML = AppState.users
    .map(u => `<option value="${u.id}">${u.name} — ${u.role}</option>`)
    .join("");

  const saved = localStorage.getItem("unw_current_user_id");
  const fallbackId = AppState.users[0]?.id ? String(AppState.users[0].id) : "";
  const defaultUserId = saved || fallbackId;

  selector.value = defaultUserId;
  if (defaultUserId) {
    localStorage.setItem("unw_current_user_id", defaultUserId);
  }

  selector.addEventListener("change", e => {
    localStorage.setItem("unw_current_user_id", e.target.value);
    location.reload();
  });

  updateCurrentUserLabel();
}

function getCurrentUserId() {
  return Number(localStorage.getItem("unw_current_user_id")) || AppState.users[0]?.id || null;
}

function getCurrentUser() {
  return AppState.users.find(u => u.id === getCurrentUserId()) || null;
}

function updateCurrentUserLabel() {
  const currentUser = getCurrentUser();
  const label = document.getElementById("currentUserLabel");
  if (!label || !currentUser) return;

  const supervisor = currentUser.supervisor_id
    ? AppState.users.find(u => u.id === currentUser.supervisor_id)
    : null;

  label.innerHTML = `
    <strong>${currentUser.name}</strong><br>
    <span class="muted">${currentUser.role} | ${currentUser.pillar || "Sans pilier"}</span><br>
    <span class="muted">Superviseur : ${supervisor ? supervisor.name : "Aucun"}</span>
  `;
}

/* =========================
   OUTILS GÉNÉRAUX
========================= */

function clamp(v, min, max) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function scoreToPercent(score) {
  const safeScore = clamp(Number(score), 0, 10);
  return safeScore * 10;
}

function isLate(task) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.due_date);
  return due < today && task.status !== "Terminée";
}

function appendComment(existingText, authorName, newText) {
  const clean = (newText || "").trim();
  if (!clean) return existingText || "";

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");

  const entry = `[${yyyy}-${mm}-${dd} ${hh}:${mi}] ${authorName} : ${clean}`;
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
  if (status === "À améliorer" || status === "Critique") {
    return `<span class="badge badge-red">${status}</span>`;
  }
  return `<span class="badge badge-grey">${status}</span>`;
}

function renderTaskRows(tasks) {
  return tasks.map(task => `
    <tr>
      <td>${task.id}</td>
      <td>
        <strong>${task.title}</strong><br>
        <span class="muted">${task.pillar}</span>
      </td>
      <td>${task.assigned_to_name}<br><span class="muted">${task.assigned_to_role}</span></td>
      <td>${task.supervisor_name}<br><span class="muted">${task.supervisor_role}</span></td>
      <td>${getPriorityBadge(task.priority)}</td>
      <td>${getStatusBadge(task.status)}</td>
      <td>
        <div class="progress-track">
          <div class="progress-fill" style="width:${task.progress || 0}%"></div>
        </div>
        Score: ${task.progress_score ?? 0} / 10<br>
        ${task.progress || 0}%
      </td>
      <td style="white-space: pre-line;">${task.staff_comment || '<span class="muted">—</span>'}</td>
      <td>
        <div class="progress-track">
          <div class="progress-fill supervisor" style="width:${task.supervisor_progress || 0}%"></div>
        </div>
        Score: ${task.supervisor_score ?? 0} / 10<br>
        ${task.supervisor_progress || 0}%<br>
        ${getSupervisorBadge(task.supervisor_status)}
      </td>
      <td style="white-space: pre-line;">${task.supervisor_comment || '<span class="muted">—</span>'}</td>
      <td class="${isLate(task) ? 'late' : ''}">${task.due_date}</td>
      <td><button class="action-btn" type="button" onclick="openTaskModal(${task.id})">Mettre à jour</button></td>
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

function rerenderCurrentPage() {
  const page = document.body.dataset.page;
  if (page === "dashboard") renderDashboardPage();
  if (page === "my-tasks") renderMyTasksPage();
  if (page === "my-team") renderMyTeamPage();
}

/* =========================
   DROITS SUR MEMBRES
========================= */

function canManageTeamMember(targetUser) {
  const currentUser = getCurrentUser();
  if (!currentUser || !targetUser) return false;

  const isAdmin = currentUser.user_type === "admin";
  const isSupervisor = currentUser.user_type === "supervisor";

  if (isAdmin) return true;
  if (!isSupervisor) return false;

  return targetUser.supervisor_id === currentUser.id;
}

function canDeleteUser(targetUser) {
  if (!targetUser) return false;
  if (targetUser.is_local !== true) return false;
  return canManageTeamMember(targetUser);
}

function deleteTeamMember(userId) {
  const targetUser = AppState.users.find(u => u.id === userId);
  if (!targetUser) return;

  if (!canDeleteUser(targetUser)) {
    alert("Vous n’êtes pas autorisé à supprimer ce membre.");
    return;
  }

  const confirmed = confirm(`Supprimer ${targetUser.name} de l’équipe ?`);
  if (!confirmed) return;

  const localUsers = getRegisteredLocalUsers().filter(u => u.id !== userId);
  saveRegisteredLocalUsers(localUsers);

  AppState.tasks = AppState.tasks.filter(task => !(task.assigned_to_id === userId && task.is_local === true));
  persistLocalTasks();

  AppState.users = AppState.users.filter(u => u.id !== userId);

  if (getCurrentUserId() === userId) {
    const fallback = AppState.users[0]?.id || "";
    if (fallback) {
      localStorage.setItem("unw_current_user_id", String(fallback));
    } else {
      localStorage.removeItem("unw_current_user_id");
    }
  }

  enrichTasks();
  initUserSelector();
  renderRegisteredUsersTable();
  rerenderCurrentPage();
}

/* =========================
   MODAL MISE À JOUR TÂCHES
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

function openTaskModal(taskId = null) {
  const modal = document.getElementById("taskModal");
  if (!modal) return;

  const task = AppState.enrichedTasks.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById("editTaskId").value = task.id;
  document.getElementById("editStatus").value = task.status || "Non commencée";
  document.getElementById("editProgressScore").value = task.progress_score ?? Math.round((task.progress || 0) / 10);
  document.getElementById("editStaffComment").value = "";
  document.getElementById("editSupervisorScore").value = task.supervisor_score ?? Math.round((task.supervisor_progress || 0) / 10);
  document.getElementById("editSupervisorStatus").value = task.supervisor_status || "Non évalué";
  document.getElementById("editSupervisorComment").value = "";

  modal.style.display = "block";
}

function closeTaskModal() {
  const modal = document.getElementById("taskModal");
  if (modal) modal.style.display = "none";
}

function saveTaskUpdate() {
  const taskId = Number(document.getElementById("editTaskId").value);
  const task = AppState.tasks.find(t => t.id === taskId);
  const currentUser = getCurrentUser();
  if (!task || !currentUser) return;

  const currentEnriched = AppState.enrichedTasks.find(t => t.id === taskId);

  let progressScore = Number(document.getElementById("editProgressScore").value);
  let supervisorScore = Number(document.getElementById("editSupervisorScore").value);

  progressScore = clamp(progressScore, 0, 10);
  supervisorScore = clamp(supervisorScore, 0, 10);

  task.status = document.getElementById("editStatus").value;

  const isAssignedUser = currentUser.id === task.assigned_to_id;
  const isSupervisor = currentUser.id === currentEnriched?.supervisor_id;
  const isAdmin = currentUser.user_type === "admin";

  const newStaffComment = document.getElementById("editStaffComment").value.trim();
  const newSupervisorComment = document.getElementById("editSupervisorComment").value.trim();

  if (isAssignedUser || isAdmin) {
    task.progress_score = progressScore;
    task.progress = scoreToPercent(progressScore);
    task.staff_comment = appendComment(task.staff_comment, currentUser.name, newStaffComment);
  }

  if (isSupervisor || isAdmin) {
    task.supervisor_score = supervisorScore;
    task.supervisor_progress = scoreToPercent(supervisorScore);
    task.supervisor_status = document.getElementById("editSupervisorStatus").value;
    task.supervisor_comment = appendComment(task.supervisor_comment, currentUser.name, newSupervisorComment);
  }

  if (task.status === "Terminée" && (task.progress || 0) < 100) {
    task.progress_score = 10;
    task.progress = 100;
  }

  persistLocalTasks();
  enrichTasks();
  closeTaskModal();
  rerenderCurrentPage();
}

/* =========================
   DASHBOARD
========================= */

function renderDashboardPage() {
  const tasks = AppState.enrichedTasks;
  renderKPIs("dashboardKpis", tasks);

  const searchInput = document.getElementById("searchInput");
  const pillarFilter = document.getElementById("pillarFilter");
  const supervisorFilter = document.getElementById("supervisorFilter");
  const tbody = document.getElementById("tasksTbody");

  if (!searchInput || !pillarFilter || !supervisorFilter || !tbody) return;

  populatePillarFilter(pillarFilter);

  const supervisors = AppState.users.filter(
    u => u.user_type === "supervisor" || u.user_type === "admin"
  );

  supervisorFilter.innerHTML =
    `<option value="">Tous les superviseurs</option>` +
    supervisors.map(s => `<option value="${s.id}">${s.name}</option>`).join("");

  function applyFilters() {
    const search = (searchInput.value || "").toLowerCase().trim();
    const pillar = pillarFilter.value;
    const supervisorId = supervisorFilter.value ? Number(supervisorFilter.value) : null;

    const filtered = tasks.filter(t => {
      const matchSearch =
        t.title.toLowerCase().includes(search) ||
        t.assigned_to_name.toLowerCase().includes(search) ||
        t.supervisor_name.toLowerCase().includes(search) ||
        (t.pillar || "").toLowerCase().includes(search);

      const matchPillar = !pillar || t.pillar === pillar;
      const matchSupervisor = !supervisorId || t.supervisor_id === supervisorId;

      return matchSearch && matchPillar && matchSupervisor;
    });

    tbody.innerHTML = renderTaskRows(filtered);
    renderKPIs("dashboardKpis", filtered);
  }

  searchInput.addEventListener("input", applyFilters);
  pillarFilter.addEventListener("change", applyFilters);
  supervisorFilter.addEventListener("change", applyFilters);

  tbody.innerHTML = renderTaskRows(tasks);
}

function populatePillarFilter(selectElement) {
  if (!selectElement) return;

  const currentValue = selectElement.value || "";
  selectElement.innerHTML =
    `<option value="">Tous les piliers</option>` +
    AppState.pillars.map(p => `<option value="${p.name}">${p.name}</option>`).join("");

  selectElement.value = currentValue;
}

/* =========================
   MES TÂCHES
========================= */

function renderMyTasksPage() {
  const currentUser = getCurrentUser();
  const tbody = document.getElementById("myTasksTbody");
  const title = document.getElementById("myTasksTitle");

  if (!currentUser || !tbody || !title) return;

  const myTasks = AppState.enrichedTasks.filter(t => t.assigned_to_id === currentUser.id);

  title.textContent = `Mes tâches — ${currentUser.name}`;
  renderKPIs("myTasksKpis", myTasks);

  if (!myTasks.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12"><span class="muted">Aucune tâche assignée pour le moment.</span></td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = renderTaskRows(myTasks);
}

/* =========================
   MON ÉQUIPE
========================= */

function renderMyTeamPage() {
  const currentUser = getCurrentUser();
  const membersBox = document.getElementById("teamMembersList");
  const tbody = document.getElementById("teamTasksTbody");
  const title = document.getElementById("myTeamTitle");

  if (!currentUser || !membersBox || !tbody || !title) return;

  const teamMembers = AppState.users.filter(u => u.supervisor_id === currentUser.id);
  const teamTasks = AppState.enrichedTasks.filter(t => t.supervisor_id === currentUser.id);

  title.textContent = `Mon équipe — ${currentUser.name}`;
  renderKPIs("myTeamKpis", teamTasks);

  if (!teamMembers.length) {
    membersBox.innerHTML = `<div class="empty">Vous n'avez aucun membre d'équipe rattaché comme superviseur.</div>`;
    tbody.innerHTML = `
      <tr>
        <td colspan="12"><span class="muted">Aucune tâche d'équipe à afficher.</span></td>
      </tr>
    `;
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
        <div class="muted">${member.role} | ${member.pillar || "Sans pilier"}</div>
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
   INSCRIPTION STAFF
========================= */

function getRegisteredLocalUsers() {
  return JSON.parse(localStorage.getItem("unw_registered_users") || "[]");
}

function saveRegisteredLocalUsers(users) {
  localStorage.setItem("unw_registered_users", JSON.stringify(users));
}

function generateNextUserId() {
  const allIds = AppState.users.map(u => Number(u.id)).filter(id => !Number.isNaN(id));
  return allIds.length ? Math.max(...allIds) + 1 : 1;
}

function initRegisterPage() {
  const page = document.body.dataset.page;
  if (page !== "register") return;

  const registerBtn = document.getElementById("registerUserBtn");
  const clearBtn = document.getElementById("clearRegisteredUsersBtn");
  const pillarSelect = document.getElementById("regPillar");

  populateRegistrationPillarDropdown();
  populateRegistrationSupervisorDropdown();
  renderRegisteredUsersTable();

  if (pillarSelect) {
    pillarSelect.addEventListener("change", populateRegistrationSupervisorDropdown);
  }

  if (registerBtn) {
    registerBtn.addEventListener("click", registerNewUser);
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      localStorage.removeItem("unw_registered_users");
      localStorage.removeItem("unw_current_user_id");
      location.reload();
    });
  }
}

function populateRegistrationPillarDropdown() {
  const select = document.getElementById("regPillar");
  if (!select) return;

  const currentValue = select.value || "";
  select.innerHTML = `
    <option value="">Sélectionner</option>
    ${AppState.pillars.map(p => `
      <option value="${p.name}">${p.name} — ${p.full_name}</option>
    `).join("")}
  `;
  if (currentValue) select.value = currentValue;
}

function populateRegistrationSupervisorDropdown() {
  const pillarValue = document.getElementById("regPillar")?.value || "";
  const supervisorSelect = document.getElementById("regSupervisor");
  if (!supervisorSelect) return;

  let supervisors = AppState.users.filter(
    u => u.user_type === "supervisor" || u.user_type === "admin"
  );

  if (pillarValue) {
    supervisors = supervisors.filter(u => (u.pillar || "") === pillarValue);
  }

  if (!supervisors.length) {
    supervisors = AppState.users.filter(u => u.user_type === "admin");
  }

  supervisorSelect.innerHTML = `
    <option value="">Sélectionner un superviseur</option>
    ${supervisors.map(s => `
      <option value="${s.id}">
        ${s.name} — ${s.role} (${s.pillar || "Sans pilier"})
      </option>
    `).join("")}
  `;
}

function registerNewUser() {
  const name = document.getElementById("regName")?.value.trim() || "";
  const email = document.getElementById("regEmail")?.value.trim() || "";
  const role = document.getElementById("regRole")?.value.trim() || "";
  const pillar = document.getElementById("regPillar")?.value || "";
  const supervisorIdValue = document.getElementById("regSupervisor")?.value || "";
  const office = document.getElementById("regOffice")?.value.trim() || "";
  const messageBox = document.getElementById("registerMessage");

  if (!messageBox) return;

  if (!name || !role || !pillar || !supervisorIdValue) {
    messageBox.innerHTML = `<div class="error-box">Veuillez renseigner le nom, la fonction, le pilier et le superviseur.</div>`;
    return;
  }

  const supervisorId = Number(supervisorIdValue);
  const supervisor = AppState.users.find(u => u.id === supervisorId);
  if (!supervisor) {
    messageBox.innerHTML = `<div class="error-box">Le superviseur sélectionné est introuvable.</div>`;
    return;
  }

  const pillarObj = AppState.pillars.find(p => p.name === pillar);
  const pillarId = pillarObj ? pillarObj.id : null;

  const duplicate = AppState.users.find(
    u => u.name.toLowerCase() === name.toLowerCase() &&
      (u.role || "").toLowerCase() === role.toLowerCase()
  );

  if (duplicate) {
    messageBox.innerHTML = `<div class="error-box">Cet utilisateur existe déjà dans le système.</div>`;
    return;
  }

  const newUser = {
    id: generateNextUserId(),
    name,
    email,
    role,
    pillar,
    pillar_id: pillarId,
    user_type: "staff",
    supervisor_id: supervisorId,
    office,
    is_local: true
  };

  const localUsers = getRegisteredLocalUsers();
  localUsers.push(newUser);
  saveRegisteredLocalUsers(localUsers);

  AppState.users.push(newUser);
  enrichTasks();

  messageBox.innerHTML = `
    <div class="success-box">
      Staff enregistré avec succès. ${name} est maintenant rattaché à ${supervisor.name}.
    </div>
  `;

  clearRegisterForm();
  renderRegisteredUsersTable();
  refreshCurrentUserSelectorAfterRegistration(newUser.id);
}

function clearRegisterForm() {
  const fields = ["regName", "regEmail", "regRole", "regPillar", "regSupervisor", "regOffice"];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function renderRegisteredUsersTable() {
  const tbody = document.getElementById("registeredUsersTbody");
  if (!tbody) return;

  const localUsers = getRegisteredLocalUsers();

  if (!localUsers.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8"><span class="muted">Aucun staff enregistré localement pour le moment.</span></td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = localUsers.map(user => {
    const supervisor = AppState.users.find(u => u.id === user.supervisor_id);
    const canDelete = canDeleteUser(user);

    return `
      <tr>
        <td>${user.id}</td>
        <td>${user.name}</td>
        <td>${user.role}</td>
        <td>${user.pillar || "—"}</td>
        <td>${supervisor ? supervisor.name : "Non défini"}</td>
        <td>${user.email || '<span class="muted">—</span>'}</td>
        <td>${user.office || '<span class="muted">—</span>'}</td>
        <td>
          ${
            canDelete
              ? `<button class="action-btn" type="button" onclick="deleteTeamMember(${user.id})">Supprimer</button>`
              : `<span class="muted">Non autorisé</span>`
          }
        </td>
      </tr>
    `;
  }).join("");
}

function refreshCurrentUserSelectorAfterRegistration(newUserId) {
  const selector = document.getElementById("currentUserSelect");
  if (!selector) return;

  selector.innerHTML = AppState.users
    .map(u => `<option value="${u.id}">${u.name} — ${u.role}</option>`)
    .join("");

  selector.value = String(newUserId);
  localStorage.setItem("unw_current_user_id", String(newUserId));
  updateCurrentUserLabel();
}

/* =========================
   CRÉATION DES PILIERS
========================= */

function getLocalPillars() {
  return JSON.parse(localStorage.getItem("unw_created_pillars") || "[]");
}

function saveLocalPillars(pillars) {
  localStorage.setItem("unw_created_pillars", JSON.stringify(pillars));
}

function generateNextPillarId() {
  const ids = AppState.pillars.map(p => Number(p.id)).filter(id => !Number.isNaN(id));
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function initPillarCreation() {
  const createBtn = document.getElementById("createPillarBtn");
  const clearBtn = document.getElementById("clearPillarsBtn");
  const pillarSupervisor = document.getElementById("pillarSupervisor");

  if (!createBtn && !clearBtn && !pillarSupervisor) return;

  populatePillarSupervisorDropdown();
  renderCreatedPillarsTable();

  if (createBtn) createBtn.addEventListener("click", createNewPillar);

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      localStorage.removeItem("unw_created_pillars");
      location.reload();
    });
  }
}

function populatePillarSupervisorDropdown() {
  const select = document.getElementById("pillarSupervisor");
  if (!select) return;

  const candidates = AppState.users.filter(
    u => u.user_type === "supervisor" || u.user_type === "admin"
  );

  select.innerHTML = `
    <option value="">Sélectionner un superviseur</option>
    ${candidates.map(user => `
      <option value="${user.id}">${user.name} — ${user.role}</option>
    `).join("")}
  `;
}

function createNewPillar() {
  const name = document.getElementById("pillarName")?.value.trim() || "";
  const fullName = document.getElementById("pillarFullName")?.value.trim() || "";
  const supervisorIdValue = document.getElementById("pillarSupervisor")?.value || "";
  const messageBox = document.getElementById("pillarMessage");

  if (!messageBox) return;

  if (!name || !fullName || !supervisorIdValue) {
    messageBox.innerHTML = `<div class="error-box">Veuillez renseigner le nom du pilier, son intitulé complet et le superviseur.</div>`;
    return;
  }

  const exists = AppState.pillars.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    messageBox.innerHTML = `<div class="error-box">Ce pilier existe déjà.</div>`;
    return;
  }

  const newPillar = {
    id: generateNextPillarId(),
    name,
    full_name: fullName,
    supervisor_id: Number(supervisorIdValue),
    description: `Pilier ${fullName}`,
    is_local: true
  };

  AppState.pillars.push(newPillar);

  const localPillars = getLocalPillars();
  localPillars.push(newPillar);
  saveLocalPillars(localPillars);

  messageBox.innerHTML = `<div class="success-box">Pilier créé avec succès.</div>`;

  const pillarName = document.getElementById("pillarName");
  const pillarFullName = document.getElementById("pillarFullName");
  const pillarSupervisor = document.getElementById("pillarSupervisor");

  if (pillarName) pillarName.value = "";
  if (pillarFullName) pillarFullName.value = "";
  if (pillarSupervisor) pillarSupervisor.value = "";

  renderCreatedPillarsTable();
  populateRegistrationPillarDropdown();
  populateTaskPillarDropdown();
}

function renderCreatedPillarsTable() {
  const tbody = document.getElementById("pillarsTbody");
  if (!tbody) return;

  if (!AppState.pillars.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4"><span class="muted">Aucun pilier disponible.</span></td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = AppState.pillars.map(pillar => {
    const supervisor = AppState.users.find(u => u.id === pillar.supervisor_id);
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
   CRÉATION DE TÂCHES
========================= */

function saveLocalTasks(tasks) {
  localStorage.setItem("unw_created_tasks", JSON.stringify(tasks));
}

function persistLocalTasks() {
  const localOnlyTasks = AppState.tasks.filter(task => task.is_local === true);
  saveLocalTasks(localOnlyTasks);
}

function generateNextTaskId() {
  const ids = AppState.tasks.map(t => Number(t.id)).filter(id => !Number.isNaN(id));
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function getAssignableStaff() {
  return AppState.users.filter(u =>
    u.user_type === "staff" || u.user_type === "supervisor" || u.user_type === "admin"
  );
}

function initTaskCreation() {
  const openBtn = document.getElementById("openCreateTaskModalBtn");
  const closeBtn = document.getElementById("closeCreateTaskModalBtn");
  const saveBtn = document.getElementById("createTaskBtn");
  const clearBtn = document.getElementById("clearLocalTasksBtn");
  const modal = document.getElementById("createTaskModal");

  populateTaskAssignedDropdown();
  populateTaskPillarDropdown();

  if (openBtn) openBtn.addEventListener("click", openCreateTaskModal);
  if (closeBtn) closeBtn.addEventListener("click", closeCreateTaskModal);
  if (saveBtn) saveBtn.addEventListener("click", createNewTask);

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      localStorage.removeItem("unw_created_tasks");
      location.reload();
    });
  }

  window.addEventListener("click", e => {
    if (e.target === modal) closeCreateTaskModal();
  });
}

function populateTaskAssignedDropdown() {
  const select = document.getElementById("taskAssignedTo");
  if (!select) return;

  const staffList = getAssignableStaff();

  select.innerHTML = `
    <option value="">Sélectionner un membre du staff</option>
    ${staffList.map(user => `
      <option value="${user.id}">
        ${user.name} — ${user.role} (${user.pillar || "Sans pilier"})
      </option>
    `).join("")}
  `;
}

function populateTaskPillarDropdown() {
  const select = document.getElementById("taskPillar");
  if (!select) return;

  const currentValue = select.value || "";
  select.innerHTML = `
    <option value="">Sélectionner</option>
    ${AppState.pillars.map(p => `
      <option value="${p.name}">${p.name}</option>
    `).join("")}
  `;
  if (currentValue) select.value = currentValue;
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

function createNewTask() {
  const title = document.getElementById("taskTitle")?.value.trim() || "";
  const pillar = document.getElementById("taskPillar")?.value || "";
  const assignedToValue = document.getElementById("taskAssignedTo")?.value || "";
  const priority = document.getElementById("taskPriority")?.value || "Moyenne";
  const dueDate = document.getElementById("taskDueDate")?.value || "";
  const description = document.getElementById("taskDescription")?.value.trim() || "";
  const messageBox = document.getElementById("taskCreateMessage");

  if (!messageBox) return;

  if (!title || !pillar || !assignedToValue || !dueDate) {
    messageBox.innerHTML = `<div class="error-box">Veuillez renseigner le titre, le pilier, le staff assigné et l’échéance.</div>`;
    return;
  }

  const assignedToId = Number(assignedToValue);
  const assignedUser = AppState.users.find(u => u.id === assignedToId);

  if (!assignedUser) {
    messageBox.innerHTML = `<div class="error-box">Le membre du staff sélectionné est introuvable.</div>`;
    return;
  }

  const newTask = {
    id: generateNextTaskId(),
    title,
    pillar,
    assigned_to_id: assignedToId,
    priority,
    status: "Non commencée",
    progress_score: 0,
    progress: 0,
    due_date: dueDate,
    description,
    staff_comment: "",
    supervisor_score: 0,
    supervisor_progress: 0,
    supervisor_status: "Non évalué",
    supervisor_comment: "",
    is_local: true
  };

  AppState.tasks.push(newTask);
  persistLocalTasks();
  enrichTasks();

  messageBox.innerHTML = `
    <div class="success-box">
      Tâche créée avec succès et assignée à ${assignedUser.name}.
    </div>
  `;

  clearTaskCreationForm();
  rerenderCurrentPage();
}

function clearTaskCreationForm() {
  const fields = ["taskTitle", "taskPillar", "taskAssignedTo", "taskPriority", "taskDueDate", "taskDescription"];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const messageBox = document.getElementById("taskCreateMessage");
  if (messageBox) messageBox.innerHTML = "";
}
