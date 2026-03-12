const AppState = {
  users: [],
  tasks: [],
  enrichedTasks: []
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  initUserSelector();
  initGlobalActions();

  const page = document.body.dataset.page;
  if (page === "dashboard") renderDashboardPage();
  if (page === "my-tasks") renderMyTasksPage();
  if (page === "my-team") renderMyTeamPage();
});

async function loadData() {
  const [usersRes, tasksRes] = await Promise.all([
    fetch("data/users.json"),
    fetch("data/tasks.json")
  ]);

  AppState.users = await usersRes.json();
  AppState.tasks = await tasksRes.json();
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

function initUserSelector() {
  const selector = document.getElementById("currentUserSelect");
  if (!selector) return;

  selector.innerHTML = AppState.users
    .map(u => `<option value="${u.id}">${u.name} — ${u.role}</option>`)
    .join("");

  const saved = localStorage.getItem("unw_current_user_id");
  const defaultUserId = saved || String(AppState.users[0]?.id || "");

  selector.value = defaultUserId;
  localStorage.setItem("unw_current_user_id", defaultUserId);

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
    <span class="muted">${currentUser.role} | ${currentUser.pillar}</span><br>
    <span class="muted">Superviseur : ${supervisor ? supervisor.name : "Aucun"}</span>
  `;
}

function initGlobalActions() {
  const openBtn = document.getElementById("openTaskModalBtn");
  const closeBtn = document.getElementById("closeTaskModalBtn");
  const saveBtn = document.getElementById("saveTaskBtn");
  const modal = document.getElementById("taskModal");

  if (openBtn) openBtn.addEventListener("click", openTaskModal);
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

  document.getElementById("editTaskId").value = task ? task.id : "";
  document.getElementById("editStatus").value = task?.status || "Non commencée";
  document.getElementById("editProgress").value = task?.progress ?? 0;
  document.getElementById("editStaffComment").value = task?.staff_comment || "";
  document.getElementById("editSupervisorProgress").value = task?.supervisor_progress ?? 0;
  document.getElementById("editSupervisorStatus").value = task?.supervisor_status || "Non évalué";
  document.getElementById("editSupervisorComment").value = task?.supervisor_comment || "";

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

  let progress = Number(document.getElementById("editProgress").value);
  let supervisorProgress = Number(document.getElementById("editSupervisorProgress").value);

  progress = clamp(progress, 0, 100);
  supervisorProgress = clamp(supervisorProgress, 0, 100);

  task.status = document.getElementById("editStatus").value;

  const isAssignedUser = currentUser.id === task.assigned_to_id;
  const isSupervisor = currentUser.id === currentEnriched?.supervisor_id;
  const isAdmin = currentUser.user_type === "admin";

  if (isAssignedUser || isAdmin) {
    task.progress = progress;
    task.staff_comment = document.getElementById("editStaffComment").value.trim();
  }

  if (isSupervisor || isAdmin) {
    task.supervisor_progress = supervisorProgress;
    task.supervisor_status = document.getElementById("editSupervisorStatus").value;
    task.supervisor_comment = document.getElementById("editSupervisorComment").value.trim();
  }

  if (task.status === "Terminée" && task.progress < 100) {
    task.progress = 100;
  }

  enrichTasks();
  closeTaskModal();

  const page = document.body.dataset.page;
  if (page === "dashboard") renderDashboardPage();
  if (page === "my-tasks") renderMyTasksPage();
  if (page === "my-team") renderMyTeamPage();
}

function clamp(v, min, max) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
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
  if (status === "À améliorer") return `<span class="badge badge-red">${status}</span>`;
  if (status === "Critique") return `<span class="badge badge-red">${status}</span>`;
  return `<span class="badge badge-grey">${status}</span>`;
}

function isLate(task) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.due_date);
  return due < today && task.status !== "Terminée";
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
        ${task.progress || 0}%
      </td>
      <td>${task.staff_comment || '<span class="muted">—</span>'}</td>
      <td>
        <div class="progress-track">
          <div class="progress-fill supervisor" style="width:${task.supervisor_progress || 0}%"></div>
        </div>
        ${task.supervisor_progress || 0}%<br>
        ${getSupervisorBadge(task.supervisor_status)}
      </td>
      <td>${task.supervisor_comment || '<span class="muted">—</span>'}</td>
      <td class="${isLate(task) ? 'late' : ''}">${task.due_date}</td>
      <td><button class="action-btn" onclick="openTaskModal(${task.id})">Mettre à jour</button></td>
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
  const tasks = AppState.enrichedTasks;
  renderKPIs("dashboardKpis", tasks);

  const searchInput = document.getElementById("searchInput");
  const pillarFilter = document.getElementById("pillarFilter");
  const supervisorFilter = document.getElementById("supervisorFilter");
  const tbody = document.getElementById("tasksTbody");

  const supervisors = AppState.users.filter(u => u.user_type === "supervisor" || u.user_type === "admin");
  supervisorFilter.innerHTML = `<option value="">Tous les superviseurs</option>` +
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
        t.pillar.toLowerCase().includes(search);

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

function renderMyTasksPage() {
  const currentUser = getCurrentUser();
  const tbody = document.getElementById("myTasksTbody");
  const title = document.getElementById("myTasksTitle");

  if (!currentUser || !tbody) return;

  const myTasks = AppState.enrichedTasks.filter(t => t.assigned_to_id === currentUser.id);

  title.textContent = `Mes tâches — ${currentUser.name}`;
  renderKPIs("myTasksKpis", myTasks);

  if (!myTasks.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10"><span class="muted">Aucune tâche assignée pour le moment.</span></td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = renderTaskRows(myTasks);
}

function renderMyTeamPage() {
  const currentUser = getCurrentUser();
  const membersBox = document.getElementById("teamMembersList");
  const tbody = document.getElementById("teamTasksTbody");
  const title = document.getElementById("myTeamTitle");

  if (!currentUser || !membersBox || !tbody) return;

  const teamMembers = AppState.users.filter(u => u.supervisor_id === currentUser.id);
  const teamTasks = AppState.enrichedTasks.filter(t => t.supervisor_id === currentUser.id);

  title.textContent = `Mon équipe — ${currentUser.name}`;
  renderKPIs("myTeamKpis", teamTasks);

  if (!teamMembers.length) {
    membersBox.innerHTML = `<div class="empty">Vous n'avez aucun membre d'équipe rattaché comme superviseur.</div>`;
    tbody.innerHTML = `
      <tr>
        <td colspan="10"><span class="muted">Aucune tâche d'équipe à afficher.</span></td>
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
        <div class="muted">${member.role} | ${member.pillar}</div>
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
