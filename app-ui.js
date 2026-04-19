(function () {
  const AuthUI = window.AuthUI;
  const Core = window.AppCore;
  const Services = window.AppServices;

  const {
    AppState,
    STATUS,
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
    getCurrentUser,
    getSb,
    getVisibleTasks,
    isDueSoon,
    isLate,
    scoreToPercent
  } = Core;

  function showGlobalError(message) {
    const debugBox = byId("pageDebugMessage");

    if (debugBox) {
      AuthUI.showMessage(debugBox, message, "error");
      return;
    }

    alert(message);
  }

  function setMessage(targetId, text, type = "info") {
    AuthUI.showMessage(targetId, text, type);
  }

  function clearMessage(targetId) {
    AuthUI.clearMessage(targetId);
  }

  function getStatusBadge(status) {
    if (status === STATUS.DONE) return `<span class="badge badge-green">${AuthUI.escapeHtml(status)}</span>`;
    if (status === STATUS.DUE_SOON) return `<span class="badge badge-orange">${AuthUI.escapeHtml(status)}</span>`;
    if (status === STATUS.LATE) return `<span class="badge badge-red">${AuthUI.escapeHtml(status)}</span>`;
    if (status === STATUS.ON_TRACK) return `<span class="badge badge-blue">${AuthUI.escapeHtml(status)}</span>`;
    return `<span class="badge badge-grey">${AuthUI.escapeHtml(status || "Non défini")}</span>`;
  }

  function getPriorityBadge(priority) {
    if (priority === "Critique") return `<span class="badge badge-red">${AuthUI.escapeHtml(priority)}</span>`;
    if (priority === "Haute") return `<span class="badge badge-yellow">${AuthUI.escapeHtml(priority)}</span>`;
    if (priority === "Moyenne") return `<span class="badge badge-blue">${AuthUI.escapeHtml(priority)}</span>`;
    return `<span class="badge badge-grey">${AuthUI.escapeHtml(priority || "Basse")}</span>`;
  }

  function getSupervisorBadge(status) {
    if (status === "Très satisfaisant") return `<span class="badge badge-green">${AuthUI.escapeHtml(status)}</span>`;
    if (status === "Acceptable") return `<span class="badge badge-yellow">${AuthUI.escapeHtml(status)}</span>`;
    if (status === "À améliorer" || status === "Critique") return `<span class="badge badge-red">${AuthUI.escapeHtml(status)}</span>`;
    return `<span class="badge badge-grey">${AuthUI.escapeHtml(status || "Non évalué")}</span>`;
  }

  function initUserHeader() {
    const selector = byId("currentUserSelect");
    const label = byId("currentUserLabel");
    const currentUser = getCurrentUser();

    if (selector && currentUser) {
      selector.innerHTML = `<option value="${AuthUI.escapeHtml(currentUser.id)}">${AuthUI.escapeHtml(currentUser.name)} — ${AuthUI.escapeHtml(currentUser.user_type)}</option>`;
      selector.disabled = true;
    }

    if (label && currentUser) {
      const supervisor = AppState.users.find(user =>
        String(user.id) === String(currentUser.supervisor_id)
      );

      label.innerHTML = `
        <strong>${AuthUI.escapeHtml(currentUser.name)}</strong><br>
        <span class="muted">${AuthUI.escapeHtml(currentUser.user_type)} | ${AuthUI.escapeHtml(currentUser.pillar || "Sans pilier")}</span><br>
        <span class="muted">Superviseur : ${AuthUI.escapeHtml(supervisor ? supervisor.name : "Aucun")}</span>
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
        if (modal.style.display === "block") {
          closeModal(modal.id);
        }
      });
    });
  }

  function populateRegisterDropdowns() {
    const pillarSupervisor = byId("pillarSupervisor");
    const userPillar = byId("userPillar");
    const userSupervisor = byId("userSupervisor");
    const currentUser = getCurrentUser();

    let supervisors = AppState.users.filter(user =>
      user.user_type === "supervisor" || user.user_type === "admin"
    );

    let visiblePillars = AppState.pillars;

    if (currentUser && currentUser.user_type !== "admin") {
      supervisors = supervisors.filter(user =>
        String(user.pillar_id) === String(currentUser.pillar_id)
      );

      visiblePillars = AppState.pillars.filter(pillar =>
        String(pillar.id) === String(currentUser.pillar_id)
      );
    }

    if (pillarSupervisor) {
      pillarSupervisor.innerHTML =
        `<option value="">Sélectionner un superviseur</option>` +
        supervisors
          .map(user => `<option value="${AuthUI.escapeHtml(user.id)}">${AuthUI.escapeHtml(user.name)}</option>`)
          .join("");
    }

    if (userPillar) {
      userPillar.innerHTML =
        `<option value="">Sélectionner un pilier</option>` +
        visiblePillars
          .map(pillar => `<option value="${AuthUI.escapeHtml(pillar.id)}">${AuthUI.escapeHtml(pillar.name)}</option>`)
          .join("");
    }

    if (userSupervisor) {
      userSupervisor.innerHTML =
        `<option value="">Sélectionner un superviseur</option>` +
        supervisors
          .map(user => `<option value="${AuthUI.escapeHtml(user.id)}">${AuthUI.escapeHtml(user.name)}</option>`)
          .join("");
    }
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

    const { error } = await sb.from("pillars").insert([
      {
        name,
        full_name: name,
        supervisor_profile_id: supervisorId
      }
    ]);

    if (error) {
      setMessage("pillarMessage", `Impossible de créer le pilier : ${error.message}`, "error");
      return;
    }

    setMessage("pillarMessage", "Pilier créé avec succès.", "success");

    if (byId("pillarName")) byId("pillarName").value = "";

    await Services.reloadAndRerender();
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
    const office = String(byId("userOffice")?.value || "").trim();
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

    const existingUser = AppState.users.find(user =>
      (user.email || "").toLowerCase() === email
    );

    if (!existingUser) {
      setMessage("userMessage", "Créez d’abord le compte utilisateur dans Authentication ou utilisez la page d’auto-inscription.", "error");
      return;
    }

    const { error } = await sb
      .from("profiles")
      .update({
        full_name: fullName,
        role,
        office,
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

    await Services.reloadAndRerender();
  }

  function populateActivityManagementDropdown() {
    const activityPillar = byId("activityPillar");
    const currentUser = getCurrentUser();

    if (!activityPillar || !currentUser) return;

    let visiblePillars = AppState.pillars;

    if (currentUser.user_type !== "admin") {
      visiblePillars = AppState.pillars.filter(pillar =>
        String(pillar.id) === String(currentUser.pillar_id)
      );
    }

    activityPillar.innerHTML =
      `<option value="">Sélectionner un pilier</option>` +
      visiblePillars
        .map(pillar => `<option value="${AuthUI.escapeHtml(pillar.id)}">${AuthUI.escapeHtml(pillar.name)}</option>`)
        .join("");

    if (visiblePillars.length === 1) {
      activityPillar.value = String(visiblePillars[0].id);
    }
  }

  function renderMainActivitiesList() {
    const list = byId("mainActivitiesList");
    const currentUser = getCurrentUser();

    if (!list || !currentUser) return;

    let visibleActivities = AppState.mainActivities;

    if (currentUser.user_type !== "admin") {
      visibleActivities = AppState.mainActivities.filter(activity =>
        String(activity.pillar_id) === String(currentUser.pillar_id)
      );
    }

    if (!visibleActivities.length) {
      list.innerHTML = `<div class="empty">Aucune activité principale enregistrée.</div>`;
      return;
    }

    list.innerHTML = visibleActivities
      .map(activity => `
        <div class="member-card">
          <h4>${AuthUI.escapeHtml(activity.name)}</h4>
          <div class="muted">Pilier : ${AuthUI.escapeHtml(activity.pillar_name || "Non défini")}</div>
          <div class="muted">${AuthUI.escapeHtml(activity.description || "Aucune description")}</div>
          <div class="card-actions" style="margin-top:12px;">
            <button
              class="action-btn secondary-danger js-disable-activity"
              type="button"
              data-activity-id="${Number(activity.id)}"
            >
              Désactiver
            </button>
          </div>
        </div>
      `)
      .join("");
  }

  async function createMainActivity() {
    const sb = getSb();
    const currentUser = getCurrentUser();

    if (!sb || !currentUser) return;

    if (!canManageActivities()) {
      setMessage("activityMessage", "Seuls les admins et superviseurs peuvent ajouter des activités.", "error");
      return;
    }

    const pillarId = byId("activityPillar")?.value || "";
    const name = String(byId("activityName")?.value || "").trim();
    const description = String(byId("activityDescription")?.value || "").trim();

    if (!pillarId) {
      setMessage("activityMessage", "Veuillez sélectionner un pilier.", "error");
      return;
    }

    if (!name) {
      setMessage("activityMessage", "Veuillez renseigner le nom de l’activité.", "error");
      return;
    }

    if (currentUser.user_type !== "admin" && String(pillarId) !== String(currentUser.pillar_id)) {
      setMessage("activityMessage", "Vous ne pouvez ajouter des activités que pour votre pilier.", "error");
      return;
    }

    const { error } = await sb.from("main_activities").insert([
      {
        pillar_id: pillarId,
        name,
        description,
        is_active: true,
        created_by: currentUser.id
      }
    ]);

    if (error) {
      setMessage("activityMessage", `Création impossible : ${error.message}`, "error");
      return;
    }

    if (byId("activityName")) byId("activityName").value = "";
    if (byId("activityDescription")) byId("activityDescription").value = "";

    setMessage("activityMessage", "Activité principale ajoutée avec succès.", "success");

    await Services.reloadAndRerender();
  }

  async function disableMainActivity(activityId) {
    const sb = getSb();
    const currentUser = getCurrentUser();

    if (!sb || !currentUser) return;

    const activity = AppState.mainActivities.find(item =>
      String(item.id) === String(activityId)
    );

    if (!activity) {
      alert("Activité introuvable.");
      return;
    }

    if (currentUser.user_type !== "admin" && String(activity.pillar_id) !== String(currentUser.pillar_id)) {
      alert("Vous ne pouvez désactiver que les activités de votre pilier.");
      return;
    }

    const confirmed = confirm(`Désactiver l’activité "${activity.name}" ?`);
    if (!confirmed) return;

    const { error } = await sb
      .from("main_activities")
      .update({ is_active: false })
      .eq("id", activityId);

    if (error) {
      alert(`Désactivation impossible : ${error.message}`);
      return;
    }

    await Services.reloadAndRerender();
  }

  function initMainActivitiesManagement() {
    const page = document.body.dataset.page;

    if (page !== "register") return;

    populateActivityManagementDropdown();
    renderMainActivitiesList();

    const createActivityBtn = byId("createActivityBtn");

    if (createActivityBtn) {
      createActivityBtn.addEventListener("click", createMainActivity);
    }

    document.addEventListener("click", event => {
      const disableBtn = event.target.closest(".js-disable-activity");

      if (!disableBtn) return;

      const activityId = disableBtn.dataset.activityId;
      disableMainActivity(activityId);
    });
  }

  function populateTaskCreationDropdowns() {
    const taskPillar = byId("taskPillar");
    const taskAssignedTo = byId("taskAssignedTo");
    const currentUser = getCurrentUser();

    let visiblePillars = AppState.pillars;
    let eligibleUsers = AppState.users;

    if (currentUser && currentUser.user_type !== "admin") {
      visiblePillars = AppState.pillars.filter(pillar =>
        String(pillar.id) === String(currentUser.pillar_id)
      );

      eligibleUsers = AppState.users.filter(user =>
        String(user.pillar_id) === String(currentUser.pillar_id)
      );
    }

    if (taskPillar) {
      taskPillar.innerHTML =
        `<option value="">Sélectionner un pilier</option>` +
        visiblePillars
          .map(pillar => `<option value="${AuthUI.escapeHtml(pillar.id)}">${AuthUI.escapeHtml(pillar.name)}</option>`)
          .join("");
    }

    if (taskAssignedTo) {
      taskAssignedTo.innerHTML =
        `<option value="">Sélectionner un membre</option>` +
        eligibleUsers
          .map(user => `<option value="${AuthUI.escapeHtml(user.id)}">${AuthUI.escapeHtml(user.name)} — ${AuthUI.escapeHtml(user.pillar || "Sans pilier")}</option>`)
          .join("");
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
      activities
        .map(activity => `
          <option value="${AuthUI.escapeHtml(activity.id)}">
            ${AuthUI.escapeHtml(activity.name)}
          </option>
        `)
        .join("");

    activitySelect.value = activities.some(activity =>
      String(activity.id) === String(previousValue)
    )
      ? previousValue
      : "";
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
    const currentUser = getCurrentUser();

    if (!currentUser) return;

    if (!canCreateTask()) {
      setMessage("taskCreateMessage", "Seuls les superviseurs et admins peuvent créer une tâche.", "error");
      return;
    }

    const title = String(byId("taskTitle")?.value || "").trim();
    const pillarId = byId("taskPillar")?.value || "";
    const assignedToId = byId("taskAssignedTo")?.value || "";
    const priority = byId("taskPriority")?.value || "Moyenne";
    const dueDate = byId("taskDueDate")?.value || null;
    const activityId = byId("taskActivity")?.value || null;
    const selectedActivity = AppState.mainActivities.find(activity =>
      String(activity.id) === String(activityId)
    );
    const description = String(byId("taskDescription")?.value || "").trim();

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
      activity_id: activityId,
      activity_name: selectedActivity ? selectedActivity.name : null,
      description,
      created_by: currentUser.id
    };

    try {
      await Services.createTaskWithFallbackStatus(payload);
      setMessage("taskCreateMessage", "Tâche créée avec succès.", "success");
      await Services.reloadAndRerender();
      closeCreateTaskModal();
    } catch (error) {
      setMessage("taskCreateMessage", `Création impossible : ${error.message}`, "error");
    }
  }

  function openTaskModal(taskId) {
    const task = AppState.tasks.find(item =>
      String(item.id) === String(taskId)
    );

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

    if (!currentUser) return;

    const taskId = Number(byId("editTaskId")?.value);
    const task = AppState.tasks.find(item => Number(item.id) === taskId);

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

    try {
      await Services.updateTaskWithFallbackStatus(taskId, payload);
      closeTaskModal();
      await Services.reloadAndRerender();
    } catch (error) {
      showGlobalError(`Erreur mise à jour : ${error.message}`);
    }
  }

  function getFilteredDashboardTasks() {
    const visibleTasks = getVisibleTasks();

    return applyTaskFilters(visibleTasks, {
      search: byId("searchInput")?.value || "",
      pillar: byId("pillarFilter")?.value || "",
      supervisorId: byId("supervisorFilter")?.value || "",
      assignedToId: byId("assignedToFilter")?.value || "",
      activityId: byId("activityFilter")?.value || "",
      status: byId("statusFilter")?.value || "",
      startDate: byId("startDateFilter")?.value || "",
      endDate: byId("endDateFilter")?.value || ""
    });
  }

  function getFilteredMyTasks(tasks) {
    return applyTaskFilters(tasks, {
      assignedToId: byId("myTasksAssignedToFilter")?.value || "",
      activityId: byId("myTasksActivityFilter")?.value || "",
      status: byId("myTasksStatusFilter")?.value || "",
      startDate: byId("myTasksStartDateFilter")?.value || "",
      endDate: byId("myTasksEndDateFilter")?.value || ""
    });
  }

  function exportCurrentViewToXlsx() {
    if (typeof XLSX === "undefined") {
      alert("Librairie XLSX indisponible.");
      return;
    }

    const rows = getFilteredDashboardTasks();

    const exportData = rows.map(task => ({
      ID: task.id,
      Tache: task.title,
      Pilier: task.pillar || "",
      Activite_principale: task.activity_name || "",
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

  function renderTaskRows(tasks, options = {}) {
    const { showDescription = false } = options;

    return tasks
      .map(task => `
        <tr class="${isLate(task) ? "row-late" : isDueSoon(task) ? "row-due-soon" : ""}">
          <td>${AuthUI.escapeHtml(task.id)}</td>

          <td>
            <strong>${AuthUI.escapeHtml(task.title)}</strong><br>
            <span class="muted">${AuthUI.escapeHtml(task.pillar || "")}</span>
          </td>

          <td>${AuthUI.escapeHtml(task.activity_name || "—")}</td>

          ${showDescription ? `<td class="description-cell">${AuthUI.escapeHtml(task.description || "—")}</td>` : ""}

          <td>
            ${AuthUI.escapeHtml(task.assigned_to_name || "Non défini")}<br>
            <span class="muted">${AuthUI.escapeHtml(task.assigned_to_role || "")}</span>
          </td>

          <td>
            ${AuthUI.escapeHtml(task.supervisor_name || "Non défini")}<br>
            <span class="muted">${AuthUI.escapeHtml(task.supervisor_role || "")}</span>
          </td>

          <td>${getPriorityBadge(task.priority)}</td>
          <td>${getStatusBadge(task.status)}</td>

          <td>
            <div class="progress-track">
              <div class="progress-fill" style="width:${clamp(task.progress || 0, 0, 100)}%"></div>
            </div>
            ${clamp(task.progress || 0, 0, 100)}%
          </td>

          <td style="white-space:pre-line;">${AuthUI.escapeHtml(task.staff_comment || "—")}</td>

          <td>
            <div class="progress-track">
              <div class="progress-fill supervisor" style="width:${clamp(task.supervisor_progress || 0, 0, 100)}%"></div>
            </div>
            ${clamp(task.supervisor_progress || 0, 0, 100)}%<br>
            ${getSupervisorBadge(task.supervisor_status)}
          </td>

          <td style="white-space:pre-line;">${AuthUI.escapeHtml(task.supervisor_comment || "—")}</td>

          <td class="${isLate(task) ? "late" : isDueSoon(task) ? "soon" : ""}">
            ${AuthUI.escapeHtml(task.due_date || "")}
          </td>

          <td class="no-print">
            <div class="table-actions">
              <button class="action-btn js-open-task-modal" type="button" data-task-id="${Number(task.id)}">
                Mettre à jour
              </button>

              ${canDeleteTask(task) ? `
                <button class="action-btn secondary-danger js-delete-task" type="button" data-task-id="${Number(task.id)}">
                  Supprimer
                </button>
              ` : ``}
            </div>
          </td>
        </tr>
      `)
      .join("");
  }

  function renderKPIs(targetId, tasks) {
    const el = byId(targetId);

    if (!el) return;

    const total = tasks.length;
    const onTrack = tasks.filter(task => computeAutomaticStatus(task) === STATUS.ON_TRACK).length;
    const dueSoon = tasks.filter(task => computeAutomaticStatus(task) === STATUS.DUE_SOON).length;
    const completed = tasks.filter(task => computeAutomaticStatus(task) === STATUS.DONE).length;
    const late = tasks.filter(task => computeAutomaticStatus(task) === STATUS.LATE).length;

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
    const activityFilter = byId("activityFilter");

    let visiblePillars = AppState.pillars;
    let visibleSupervisors = AppState.users.filter(user =>
      user.user_type === "supervisor" || user.user_type === "admin"
    );
    let visibleAssignees = AppState.users;
    let visibleActivities = AppState.mainActivities;

    if (currentUser && currentUser.user_type !== "admin") {
      visiblePillars = AppState.pillars.filter(pillar =>
        String(pillar.id) === String(currentUser.pillar_id)
      );

      visibleSupervisors = visibleSupervisors.filter(user =>
        String(user.pillar_id) === String(currentUser.pillar_id)
      );

      visibleAssignees = AppState.users.filter(user =>
        String(user.pillar_id) === String(currentUser.pillar_id)
      );

      visibleActivities = AppState.mainActivities.filter(activity =>
        String(activity.pillar_id) === String(currentUser.pillar_id)
      );
    }

    if (pillarFilter) {
      const currentValue = pillarFilter.value || "";

      pillarFilter.innerHTML =
        `<option value="">Tous les piliers</option>` +
        visiblePillars
          .map(pillar => `<option value="${AuthUI.escapeHtml(pillar.name)}">${AuthUI.escapeHtml(pillar.name)}</option>`)
          .join("");

      pillarFilter.value = visiblePillars.some(pillar => pillar.name === currentValue)
        ? currentValue
        : "";
    }

    if (supervisorFilter) {
      const currentValue = supervisorFilter.value || "";

      supervisorFilter.innerHTML =
        `<option value="">Tous les superviseurs</option>` +
        visibleSupervisors
          .map(user => `<option value="${AuthUI.escapeHtml(user.id)}">${AuthUI.escapeHtml(user.name)}</option>`)
          .join("");

      supervisorFilter.value = visibleSupervisors.some(user => String(user.id) === String(currentValue))
        ? currentValue
        : "";
    }

    if (assignedToFilter) {
      const currentValue = assignedToFilter.value || "";

      assignedToFilter.innerHTML =
        `<option value="">Tous les assignés</option>` +
        visibleAssignees
          .map(user => `<option value="${AuthUI.escapeHtml(user.id)}">${AuthUI.escapeHtml(user.name)}</option>`)
          .join("");

      assignedToFilter.value = visibleAssignees.some(user => String(user.id) === String(currentValue))
        ? currentValue
        : "";
    }

    if (activityFilter) {
      const currentValue = activityFilter.value || "";

      activityFilter.innerHTML =
        `<option value="">Toutes les activités</option>` +
        visibleActivities
          .map(activity => `<option value="${AuthUI.escapeHtml(activity.id)}">${AuthUI.escapeHtml(activity.name)}</option>`)
          .join("");

      activityFilter.value = visibleActivities.some(activity => String(activity.id) === String(currentValue))
        ? currentValue
        : "";
    }

    const filteredTasks = getFilteredDashboardTasks();

    renderKPIs("dashboardKpis", filteredTasks);

    tbody.innerHTML = filteredTasks.length
      ? renderTaskRows(filteredTasks, { showDescription: true })
      : `<tr><td colspan="14"><span class="muted">Aucune tâche correspondant aux filtres.</span></td></tr>`;
  }

  function renderMyTasksPage() {
    const currentUser = getCurrentUser();
    const tbody = byId("myTasksTbody");
    const title = byId("myTasksTitle");
    const assignedToFilter = byId("myTasksAssignedToFilter");
    const activityFilter = byId("myTasksActivityFilter");

    if (!currentUser || !tbody || !title) return;

    const myTasks = getVisibleTasks().filter(task =>
      String(task.assigned_to_id) === String(currentUser.id)
    );

    if (assignedToFilter) {
      const currentValue = assignedToFilter.value || "";
      const assignees = myTasks.length ? [{ id: currentUser.id, name: currentUser.name }] : [];

      assignedToFilter.innerHTML =
        `<option value="">Tous les assignés</option>` +
        assignees
          .map(user => `<option value="${AuthUI.escapeHtml(user.id)}">${AuthUI.escapeHtml(user.name)}</option>`)
          .join("");

      assignedToFilter.value = assignees.some(user => String(user.id) === String(currentValue))
        ? currentValue
        : "";
    }

    if (activityFilter) {
      const currentValue = activityFilter.value || "";

      const activityIds = [...new Set(myTasks.map(task => task.activity_id).filter(Boolean))];

      const activities = AppState.mainActivities.filter(activity =>
        activityIds.some(id => String(id) === String(activity.id))
      );

      activityFilter.innerHTML =
        `<option value="">Toutes les activités</option>` +
        activities
          .map(activity => `<option value="${AuthUI.escapeHtml(activity.id)}">${AuthUI.escapeHtml(activity.name)}</option>`)
          .join("");

      activityFilter.value = activities.some(activity => String(activity.id) === String(currentValue))
        ? currentValue
        : "";
    }

    const filteredTasks = getFilteredMyTasks(myTasks);

    title.textContent = `Mes tâches — ${currentUser.name}`;
    renderKPIs("myTasksKpis", filteredTasks);

    tbody.innerHTML = filteredTasks.length
      ? renderTaskRows(filteredTasks, { showDescription: true })
      : `<tr><td colspan="14"><span class="muted">Aucune tâche correspondant aux filtres.</span></td></tr>`;
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
      teamMembers = AppState.users.filter(user =>
        String(user.pillar_id) === String(currentUser.pillar_id)
      );

      teamTasks = getVisibleTasks();
    }

    title.textContent = `Mon équipe — ${currentUser.name}`;
    renderKPIs("myTeamKpis", teamTasks);

    membersBox.innerHTML = teamMembers.length
      ? teamMembers
          .map(member => `
            <div class="member-card">
              <h4>${AuthUI.escapeHtml(member.name)}</h4>
              <div class="muted">${AuthUI.escapeHtml(member.user_type)} | ${AuthUI.escapeHtml(member.pillar || "Sans pilier")}</div>
            </div>
          `)
          .join("")
      : `<div class="empty">Aucun membre rattaché.</div>`;

    tbody.innerHTML = teamTasks.length
      ? renderTaskRows(teamTasks)
      : `<tr><td colspan="13"><span class="muted">Aucune tâche d'équipe.</span></td></tr>`;
  }

  function renderRegisterPage() {
    populateRegisterDropdowns();
    populateActivityManagementDropdown();
    renderMainActivitiesList();

    const pillarsList = byId("pillarsList");
    const membersList = byId("registeredMembersList");
    const currentUser = getCurrentUser();

    if (!pillarsList || !membersList) return;

    let visiblePillars = AppState.pillars;
    let visibleMembers = AppState.users;

    if (currentUser && currentUser.user_type !== "admin") {
      visiblePillars = AppState.pillars.filter(pillar =>
        String(pillar.id) === String(currentUser.pillar_id)
      );

      visibleMembers = AppState.users.filter(user =>
        String(user.pillar_id) === String(currentUser.pillar_id)
      );
    }

    if (!visiblePillars.length) {
      pillarsList.innerHTML = `<div class="empty">Aucun pilier disponible.</div>`;
    } else {
      pillarsList.innerHTML = visiblePillars
        .map(pillar => {
          const supervisor = AppState.users.find(user =>
            String(user.id) === String(pillar.supervisor_profile_id)
          );

          const activities = AppState.mainActivities.filter(activity =>
            String(activity.pillar_id) === String(pillar.id)
          );

          return `
            <div class="member-card">
              <h4>${AuthUI.escapeHtml(pillar.name)}</h4>
              <div class="muted">Superviseur : ${AuthUI.escapeHtml(supervisor ? supervisor.name : "Non défini")}</div>
              <div class="muted">Activités principales : ${AuthUI.escapeHtml(activities.length ? activities.map(a => a.name).join(", ") : "Non définies")}</div>
            </div>
          `;
        })
        .join("");
    }

    membersList.innerHTML = visibleMembers.length
      ? visibleMembers
          .map(member => `
            <div class="member-card">
              <h4>${AuthUI.escapeHtml(member.name)}</h4>
              <div class="muted">${AuthUI.escapeHtml(member.user_type)} | ${AuthUI.escapeHtml(member.pillar || "Sans pilier")}</div>
              <div class="muted">${AuthUI.escapeHtml(member.email || "")}</div>
            </div>
          `)
          .join("")
      : `<div class="empty">Aucun membre trouvé.</div>`;
  }

  async function deleteTask(taskId) {
    const sb = getSb();
    const task = AppState.tasks.find(item =>
      String(item.id) === String(taskId)
    );

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

    await Services.reloadAndRerender();
  }

  function initGlobalActions() {
    const closeTopBtn = byId("closeTaskModalBtn");
    const closeBottomBtn = byId("closeTaskModalBtnFooter");
    const saveBtn = byId("saveTaskBtn");

    if (closeTopBtn) closeTopBtn.addEventListener("click", closeTaskModal);
    if (closeBottomBtn) closeBottomBtn.addEventListener("click", closeTaskModal);
    if (saveBtn) saveBtn.addEventListener("click", saveTaskUpdate);

    document.addEventListener("click", event => {
      const openBtn = event.target.closest(".js-open-task-modal");

      if (openBtn) {
        const taskId = openBtn.dataset.taskId;
        openTaskModal(taskId);
        return;
      }

      const deleteBtn = event.target.closest(".js-delete-task");

      if (deleteBtn) {
        const taskId = deleteBtn.dataset.taskId;
        deleteTask(taskId);
      }
    });
  }

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

  function initPillarCreation() {
    const page = document.body.dataset.page;

    if (page !== "register") return;

    const createPillarBtn = byId("createPillarBtn");

    if (createPillarBtn) {
      createPillarBtn.addEventListener("click", createNewPillar);
    }
  }

  function initRegisterPage() {
    const page = document.body.dataset.page;

    if (page !== "register") return;

    populateRegisterDropdowns();

    const createUserBtn = byId("createUserBtn");

    if (createUserBtn) {
      createUserBtn.addEventListener("click", createOrAssignUserFromRegisterPage);
    }
  }

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
    const activityFilter = byId("activityFilter");
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
      searchInput.addEventListener("keydown", event => {
        if (event.key === "Enter") renderDashboardPage();
      });
    }

    if (pillarFilter) pillarFilter.addEventListener("change", renderDashboardPage);
    if (supervisorFilter) supervisorFilter.addEventListener("change", renderDashboardPage);
    if (assignedToFilter) assignedToFilter.addEventListener("change", renderDashboardPage);
    if (activityFilter) activityFilter.addEventListener("change", renderDashboardPage);
    if (statusFilter) statusFilter.addEventListener("change", renderDashboardPage);
    if (startDateFilter) startDateFilter.addEventListener("change", renderDashboardPage);
    if (endDateFilter) endDateFilter.addEventListener("change", renderDashboardPage);
  }

  function initMyTasksFilters() {
    const page = document.body.dataset.page;

    if (page !== "my-tasks") return;

    const assignedToFilter = byId("myTasksAssignedToFilter");
    const activityFilter = byId("myTasksActivityFilter");
    const statusFilter = byId("myTasksStatusFilter");
    const startDateFilter = byId("myTasksStartDateFilter");
    const endDateFilter = byId("myTasksEndDateFilter");

    if (assignedToFilter) assignedToFilter.addEventListener("change", renderMyTasksPage);
    if (activityFilter) activityFilter.addEventListener("change", renderMyTasksPage);
    if (statusFilter) statusFilter.addEventListener("change", renderMyTasksPage);
    if (startDateFilter) startDateFilter.addEventListener("change", renderMyTasksPage);
    if (endDateFilter) endDateFilter.addEventListener("change", renderMyTasksPage);
  }

  function renderCurrentPage() {
    const page = document.body.dataset.page;

    if (page === "dashboard") renderDashboardPage();
    if (page === "my-tasks") renderMyTasksPage();
    if (page === "my-team") renderMyTeamPage();
    if (page === "register") renderRegisterPage();
  }

  window.AppUI = {
    initExportAndPrint,
    initGlobalActions,
    initLogout,
    initMainActivitiesManagement,
    initModalSystem,
    initMyTasksFilters,
    initPillarCreation,
    initRegisterPage,
    initTaskCreation,
    initUserHeader,
    renderCurrentPage,
    renderMainActivitiesList,
    showGlobalError
  };
})();
