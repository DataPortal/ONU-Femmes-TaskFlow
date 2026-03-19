const AppState = {
  pillars: [],
  users: [],
  tasks: [],
  enrichedTasks: []
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadData();
    guardInitialization();
    initUserSelector();
    initGlobalActions();
    initRegisterPage();
    initTaskCreation();
    initPillarCreation();
    initInitializationPage();
    initExportAndPrint();

    const page = document.body.dataset.page;
    if (page === "dashboard") renderDashboardPage();
    if (page === "my-tasks") renderMyTasksPage();
    if (page === "my-team") renderMyTeamPage();
  } catch (error) {
    console.error("Erreur au chargement de l'application :", error);
    const initMessage = document.getElementById("initMessage");
    if (initMessage) {
      initMessage.innerHTML = `
        <div class="error-box">
          Une erreur empêche le chargement complet de l’application. Ouvrez la console du navigateur pour voir le détail.
        </div>
      `;
    }
  }
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

  const localPillars = getLocalPillars();
  const localUsers = getRegisteredLocalUsers();
  const localTasks = getLocalTasks();
  const deletedUserIds = getDeletedUserIds();
  const deletedTaskIds = getDeletedTaskIds();

  AppState.pillars = [...basePillars, ...localPillars];

  AppState.users = [...baseUsers, ...localUsers].filter(
    user => !deletedUserIds.includes(user.id)
  );

  AppState.tasks = [...baseTasks, ...localTasks]
    .filter(task => !deletedUserIds.includes(task.assigned_to_id))
    .filter(task => !deletedTaskIds.includes(task.id));

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
   EXPORT / IMPRESSION
========================= */

function initExportAndPrint() {
  const exportBtn = document.getElementById("exportXlsxBtn");
  const printBtn = document.getElementById("printPageBtn");

  if (exportBtn) exportBtn.addEventListener("click", exportCurrentViewToXlsx);
  if (printBtn) printBtn.addEventListener("click", printCurrentPage);
}

function getCurrentPageName() {
  return document.body.dataset.page || "dashboard";
}

function getCurrentTableDataForExport() {
  const page = get
