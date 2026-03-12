let tasks = [];
let filteredTasks = [];

async function loadTasks() {
  const response = await fetch('data/tasks.json');
  tasks = await response.json();

  tasks = tasks.map(task => ({
    supervisor_progress: 0,
    supervisor_status: "Non évalué",
    supervisor_comment: "",
    staff_comment: "",
    ...task
  }));

  applyFilters();
}

function getSupervisorBadge(status) {
  switch (status) {
    case "Très satisfaisant":
      return "badge badge-ok";
    case "Acceptable":
      return "badge badge-mid";
    case "À améliorer":
    case "Critique":
      return "badge badge-low";
    default:
      return "badge badge-neutral";
  }
}

function renderTasks(data) {
  const table = document.querySelector("#taskTable tbody");
  table.innerHTML = "";

  data.forEach(task => {
    const today = new Date();
    today.setHours(0,0,0,0);

    const due = new Date(task.due_date);
    const isLate = due < today && task.status !== "Terminée";

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${task.id}</td>
      <td>${task.title}</td>
      <td>${task.pillar}</td>
      <td>${task.assigned_to}</td>
      <td>${task.priority}</td>
      <td>${task.status}</td>

      <td>
        <div class="progressBar">
          <div class="progress" style="width:${task.progress || 0}%"></div>
        </div>
        ${task.progress || 0}%
      </td>

      <td class="commentBox">${task.staff_comment || ""}</td>

      <td>
        <div class="progressBar">
          <div class="progressSupervisor" style="width:${task.supervisor_progress || 0}%"></div>
        </div>
        ${(task.supervisor_progress || 0)}%<br>
        <span class="${getSupervisorBadge(task.supervisor_status)}">${task.supervisor_status}</span>
      </td>

      <td class="commentBox">${task.supervisor_comment || ""}</td>

      <td class="${isLate ? 'lateDate' : ''}">${task.due_date}</td>

      <td>
        <button class="actionBtn" onclick="openUpdateModal(${task.id})">Mettre à jour</button>
      </td>
    `;

    table.appendChild(row);
  });

  updateDashboard(data);
}

function updateDashboard(data = tasks) {
  document.getElementById("totalTasks").innerText = data.length;
  document.getElementById("inProgress").innerText =
    data.filter(t => t.status === "En cours").length;
  document.getElementById("completed").innerText =
    data.filter(t => t.status === "Terminée").length;
  document.getElementById("late").innerText =
    data.filter(t => {
      const today = new Date();
      today.setHours(0,0,0,0);
      return new Date(t.due_date) < today && t.status !== "Terminée";
    }).length;
}

function openForm() {
  document.getElementById("taskForm").style.display = "block";
}

function closeForm() {
  document.getElementById("taskForm").style.display = "none";
}

function addTask() {
  const title = document.getElementById("title").value.trim();
  const pillar = document.getElementById("pillar").value;
  const assigned = document.getElementById("assigned").value.trim();
  const priority = document.getElementById("priority").value;
  const date = document.getElementById("date").value;

  if (!title || !assigned || !date) {
    alert("Veuillez renseigner le titre, la personne assignée et l’échéance.");
    return;
  }

  const newTask = {
    id: tasks.length ? Math.max(...tasks.map(t => t.id)) + 1 : 1,
    title,
    pillar,
    assigned_to: assigned,
    priority,
    status: "Non commencée",
    progress: 0,
    due_date: date,
    staff_comment: "",
    supervisor_progress: 0,
    supervisor_status: "Non évalué",
    supervisor_comment: ""
  };

  tasks.push(newTask);
  closeForm();
  clearTaskForm();
  applyFilters();
}

function clearTaskForm() {
  document.getElementById("title").value = "";
  document.getElementById("assigned").value = "";
  document.getElementById("date").value = "";
  document.getElementById("priority").value = "Basse";
  document.getElementById("pillar").value = "Humanitaire";
}

function openUpdateModal(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById("editTaskId").value = task.id;
  document.getElementById("editStatus").value = task.status || "Non commencée";
  document.getElementById("editProgress").value = task.progress || 0;
  document.getElementById("editStaffComment").value = task.staff_comment || "";
  document.getElementById("editSupervisorProgress").value = task.supervisor_progress || 0;
  document.getElementById("editSupervisorStatus").value = task.supervisor_status || "Non évalué";
  document.getElementById("editSupervisorComment").value = task.supervisor_comment || "";

  document.getElementById("updateModal").style.display = "block";
}

function closeUpdateModal() {
  document.getElementById("updateModal").style.display = "none";
}

function saveTaskUpdate() {
  const id = Number(document.getElementById("editTaskId").value);
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  let progress = Number(document.getElementById("editProgress").value);
  let supervisorProgress = Number(document.getElementById("editSupervisorProgress").value);

  if (isNaN(progress) || progress < 0) progress = 0;
  if (progress > 100) progress = 100;

  if (isNaN(supervisorProgress) || supervisorProgress < 0) supervisorProgress = 0;
  if (supervisorProgress > 100) supervisorProgress = 100;

  task.status = document.getElementById("editStatus").value;
  task.progress = progress;
  task.staff_comment = document.getElementById("editStaffComment").value.trim();
  task.supervisor_progress = supervisorProgress;
  task.supervisor_status = document.getElementById("editSupervisorStatus").value;
  task.supervisor_comment = document.getElementById("editSupervisorComment").value.trim();

  if (task.status === "Terminée" && task.progress < 100) {
    task.progress = 100;
  }

  closeUpdateModal();
  applyFilters();
}

function applyFilters() {
  const searchText = document.getElementById("searchInput")?.value.toLowerCase().trim() || "";
  const pillarValue = document.getElementById("pillarFilter")?.value || "";

  filteredTasks = tasks.filter(task => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchText) ||
      task.assigned_to.toLowerCase().includes(searchText) ||
      task.pillar.toLowerCase().includes(searchText);

    const matchesPillar = !pillarValue || task.pillar === pillarValue;

    return matchesSearch && matchesPillar;
  });

  renderTasks(filteredTasks);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("searchInput").addEventListener("input", applyFilters);
  document.getElementById("pillarFilter").addEventListener("change", applyFilters);
  loadTasks();
});

window.onclick = function(event) {
  const taskForm = document.getElementById("taskForm");
  const updateModal = document.getElementById("updateModal");

  if (event.target === taskForm) closeForm();
  if (event.target === updateModal) closeUpdateModal();
};
