(function () {
  const AuthUI = window.AuthUI || {};
  const Core = window.AppCore || {};
  const Services = window.AppServices || {};

  const escapeHtml = AuthUI.escapeHtml || function (value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const AppState = Core.AppState || {
    users: [],
    pillars: [],
    mainActivities: [],
    tasks: [],
    currentUser: null
  };

  const STATUS = Core.STATUS || {
    ON_TRACK: "En bonne voie",
    DUE_SOON: "Échéance imminente",
    LATE: "En retard",
    DONE: "Achevé"
  };

  const appendComment = Core.appendComment || function (existing, author, text) {
    if (!text) return existing || "";
    const prefix = author ? `[${author}] ` : "";
    return [existing || "", `${prefix}${text}`].filter(Boolean).join("\n");
  };

  const applyTaskFilters = Core.applyTaskFilters || function (tasks) {
    return tasks || [];
  };

  const byId = Core.byId || function (id) {
    return document.getElementById(id);
  };

  const canCreatePillar = Core.canCreatePillar || function () { return false; };
  const canCreateTask = Core.canCreateTask || function () { return false; };
  const canDeleteTask = Core.canDeleteTask || function () { return false; };
  const canExportDashboard = Core.canExportDashboard || function () { return false; };
  const canManageActivities = Core.canManageActivities || function () { return false; };
  const canManageMembers = Core.canManageMembers || function () { return false; };
  const canViewTask = Core.canViewTask || function () { return true; };
  const clamp = Core.clamp || function (value, min, max) {
    const n = Number(value);
    if (Number.isNaN(n)) return min;
    return Math.min(Math.max(n, min), max);
  };
  const computeAutomaticStatus = Core.computeAutomaticStatus || function (task) {
    return task?.status || STATUS.ON_TRACK;
  };
  const getActivitiesForPillar = Core.getActivitiesForPillar || function () { return []; };
  const getCurrentUser = Core.getCurrentUser || function () { return AppState.currentUser; };
  const getSb = Core.getSb || function () { return window.sb || null; };
  const getVisibleTasks = Core.getVisibleTasks || function () { return AppState.tasks || []; };
  const isDueSoon = Core.isDueSoon || function () { return false; };
  const isLate = Core.isLate || function () { return false; };
  const normalizeStatusToDatabase = Core.normalizeStatusToDatabase || function (status) {
    return status || STATUS.ON_TRACK;
  };
  const scoreToPercent = Core.scoreToPercent || function (score) {
    return clamp(Number(score) * 10, 0, 100);
  };

  function getUserRole(user) {
    return String(user?.role || user?.user_type || "staff").trim().toLowerCase();
  }

  function getUserDisplayName(user) {
    return user?.name || user?.full_name || "Utilisateur";
  }

  function getUserPillarLabel(user) {
    return user?.pillar || user?.pillar_name || "Sans pilier";
  }

  function setRoleControlledVisibility(buttonId, isAllowed) {
    const btn = byId(buttonId);
    if (!btn) return;

    if (isAllowed) {
      btn.classList.remove("is-role-hidden");
      btn.hidden = false;
      btn.style.display = "";
    } else {
      btn.classList.add("is-role-hidden");
      btn.hidden = true;
      btn.style.display = "none";
    }
  }

  function showGlobalError(message) {
    const debugBox = byId("pageDebugMessage");

    if (debugBox && AuthUI.showMessage) {
      AuthUI.showMessage(debugBox, message, "error");
      return;
    }

    console.error(message);
  }

  function setMessage(targetId, text, type = "info") {
    if (AuthUI.showMessage) {
      AuthUI.showMessage(targetId, text, type);
      return;
    }

    const el = byId(targetId);
    if (el) el.textContent = text;
  }

  function clearMessage(targetId) {
    const el = byId(targetId);
    if (el) el.innerHTML = "";
  }

  function getStatusBadge(status) {
    const safeStatus = normalizeStatusToDatabase(status);

    if (safeStatus === STATUS.DONE) {
      return `<span class="badge badge-green">${escapeHtml(safeStatus)}</span>`;
    }
    if (safeStatus === STATUS.ON_TRACK) {
      return `<span class="badge badge-blue">${escapeHtml(safeStatus)}</span>`;
    }
    if (safeStatus === STATUS.DUE_SOON) {
      return `<span class="badge badge-orange">${escapeHtml(safeStatus)}</span>`;
    }
    if (safeStatus === STATUS.LATE) {
      return `<span class="badge badge-red">${escapeHtml(safeStatus)}</span>`;
    }

    return `<span class="badge badge-grey">${escapeHtml(safeStatus || "Non défini")}</span>`;
  }

  function getPriorityBadge(priority) {
    if (priority === "Critique") {
      return `<span class="badge badge-red">${escapeHtml(priority)}</span>`;
    }
    if (priority === "Haute") {
      return `<span class="badge badge-yellow">${escapeHtml(priority)}</span>`;
    }
    if (priority === "Moyenne") {
      return `<span class="badge badge-blue">${escapeHtml(priority)}</span>`;
    }
    return `<span class="badge badge-grey">${escapeHtml(priority || "Basse")}</span>`;
  }

  function getSupervisorBadge(status) {
    if (status === "Très satisfaisant") {
      return `<span class="badge badge-green">${escapeHtml(status)}</span>`;
    }
    if (status === "Acceptable") {
      return `<span class="badge badge-yellow">${escapeHtml(status)}</span>`;
    }
    if (status === "À améliorer" || status === "Critique") {
      return `<span class="badge badge-red">${escapeHtml(status)}</span>`;
    }
    return `<span class="badge badge-grey">${escapeHtml(status || "Non évalué")}</span>`;
  }

  function initUserHeader() {
    const selector = byId("currentUserSelect");
    const label = byId("currentUserLabel");
    const currentUser = getCurrentUser();

    if (selector && currentUser) {
      selector.innerHTML = `
        <option value="${escapeHtml(currentUser.id)}">
          ${escapeHtml(getUserDisplayName(currentUser))} — ${escapeHtml(getUserRole(currentUser))}
        </option>
      `;
      selector.disabled = true;
    }

    if (label && currentUser) {
      const supervisor = (AppState.users || []).find(user =>
        String(user.id) === String(currentUser.supervisor_id)
      );

      label.innerHTML = `
        <strong>${escapeHtml(getUserDisplayName(currentUser))}</strong><br>
        <span class="muted">
          ${escapeHtml(getUserRole(currentUser))} | ${escapeHtml(getUserPillarLabel(currentUser))}
        </span><br>
        <span class="muted">
          Superviseur : ${escapeHtml(supervisor ? getUserDisplayName(supervisor) : "Aucun")}
        </span>
      `;
    }
  }

  function initLogout() {
    const sb = getSb();
    const logoutBtn = byId("logoutBtn");

    if (!sb || !logoutBtn) return;

    if (!logoutBtn.dataset.boundClick) {
      logoutBtn.addEventListener("click", async () => {
        await sb.auth.signOut();
        window.location.replace("login.html");
      });
      logoutBtn.dataset.boundClick = "true";
    }
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
        if (modal.style.display === "block") closeModal(modal.id);
      });
    });
  }

  function initFilterMenus() {
    document.addEventListener("click", event => {
      document.querySelectorAll(".filter-menu[open]").forEach(menu => {
        if (!menu.contains(event.target)) {
          menu.removeAttribute("open");
        }
      });
    });
  }

  function renderKPIs(targetId, tasks) {
    const el = byId(targetId);
    if (!el) return;

    const total = tasks.length;
    const onTrack = tasks.filter(task =>
      normalizeStatusToDatabase(computeAutomaticStatus(task)) === STATUS.ON_TRACK
    ).length;
    const dueSoon = tasks.filter(task =>
      normalizeStatusToDatabase(computeAutomaticStatus(task)) === STATUS.DUE_SOON
    ).length;
    const completed = tasks.filter(task =>
      normalizeStatusToDatabase(computeAutomaticStatus(task)) === STATUS.DONE
    ).length;
    const late = tasks.filter(task =>
      normalizeStatusToDatabase(computeAutomaticStatus(task)) === STATUS.LATE
    ).length;

    el.innerHTML = `
      <div class="card"><h3>Total des tâches</h3><div class="value">${total}</div></div>
      <div class="card"><h3>En bonne voie</h3><div class="value">${onTrack}</div></div>
      <div class="card"><h3>Échéance imminente</h3><div class="value">${dueSoon}</div></div>
      <div class="card"><h3>Achevées</h3><div class="value">${completed}</div></div>
      <div class="card"><h3>En retard</h3><div class="value">${late}</div></div>
    `;
  }

  function renderTaskRows(tasks, options = {}) {
    const { showDescription = false } = options;

    return tasks
      .map(task => {
        const status = normalizeStatusToDatabase(task.status);
        const progress = clamp(task.progress || 0, 0, 100);
        const supervisorProgress = clamp(task.supervisor_progress || 0, 0, 100);

        const description = task.description
          ? escapeHtml(task.description)
          : "Aucune description";

        const staffComment = task.staff_comment
          ? escapeHtml(task.staff_comment)
          : "Aucun commentaire";

        const supervisorComment = task.supervisor_comment
          ? escapeHtml(task.supervisor_comment)
          : "Aucun commentaire";

        return `
          <tr class="${isLate(task) ? "row-late" : isDueSoon(task) ? "row-due-soon" : ""}">
            <td class="id-cell">${escapeHtml(task.id)}</td>

            <td>
              <div class="task-cell">
                <div class="task-title">${escapeHtml(task.title || "Sans titre")}</div>
                <div class="task-pillar">${escapeHtml(task.pillar || "Sans pilier")}</div>
              </div>
            </td>

            <td>
              <span class="task-pill activity">${escapeHtml(task.activity_name || "Non définie")}</span>
            </td>

            ${showDescription ? `
              <td>
                <div class="task-description ${task.description ? "" : "is-empty"}">
                  ${description}
                </div>
              </td>
            ` : ""}

            <td>
              <div class="person-cell">
                <span class="person-name">${escapeHtml(task.assigned_to_name || "Non défini")}</span>
                <span class="person-role">${escapeHtml(task.assigned_to_role || "")}</span>
              </div>
            </td>

            <td>
              <div class="person-cell">
                <span class="person-name">${escapeHtml(task.supervisor_name || "Non défini")}</span>
                <span class="person-role">${escapeHtml(task.supervisor_role || "")}</span>
              </div>
            </td>

            <td>${getPriorityBadge(task.priority)}</td>
            <td>${getStatusBadge(status)}</td>

            <td>
              <div class="progress-cell">
                <div class="progress-track compact">
                  <div class="progress-fill" style="width:${progress}%"></div>
                </div>
                <span class="progress-value">${progress}%</span>
              </div>
            </td>

            <td>
              <div class="comment-box ${task.staff_comment ? "" : "empty-comment"}">
                ${staffComment}
              </div>
            </td>

            <td>
              <div class="supervisor-eval">
                <div class="progress-track compact">
                  <div class="progress-fill supervisor" style="width:${supervisorProgress}%"></div>
                </div>
                <span class="progress-value">${supervisorProgress}%</span>
                ${getSupervisorBadge(task.supervisor_status)}
              </div>
            </td>

            <td>
              <div class="comment-box ${task.supervisor_comment ? "" : "empty-comment"}">
                ${supervisorComment}
              </div>
            </td>

            <td class="${isLate(task) ? "late" : isDueSoon(task) ? "soon" : ""}">
              <div class="due-date-cell">
                <span class="due-date-main">${escapeHtml(task.due_date || "—")}</span>
                <span class="due-date-label">Échéance</span>
              </div>
            </td>

            <td class="no-print action-cell">
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
        `;
      })
      .join("");
  }

  function populateDashboardFilters() {
    const currentUser = getCurrentUser();
    const currentRole = getUserRole(currentUser);

    const pillarFilter = byId("pillarFilter");
    const supervisorFilter = byId("supervisorFilter");
    const assignedToFilter = byId("assignedToFilter");
    const activityFilter = byId("activityFilter");

    let visiblePillars = AppState.pillars;
    let visibleSupervisors = AppState.users.filter(user => {
      const role = getUserRole(user);
      return role === "supervisor" || role === "admin";
    });
    let visibleAssignees = AppState.users;
    let visibleActivities = AppState.mainActivities;

    if (currentUser && currentRole !== "admin") {
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
          .map(pillar => `<option value="${escapeHtml(pillar.name)}">${escapeHtml(pillar.name)}</option>`)
          .join("");
      pillarFilter.value = visiblePillars.some(p => p.name === currentValue) ? currentValue : "";
    }

    if (supervisorFilter) {
      const currentValue = supervisorFilter.value || "";
      supervisorFilter.innerHTML =
        `<option value="">Tous les superviseurs</option>` +
        visibleSupervisors
          .map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(getUserDisplayName(user))}</option>`)
          .join("");
      supervisorFilter.value = visibleSupervisors.some(u => String(u.id) === String(currentValue)) ? currentValue : "";
    }

    if (assignedToFilter) {
      const currentValue = assignedToFilter.value || "";
      assignedToFilter.innerHTML =
        `<option value="">Tous les assignés</option>` +
        visibleAssignees
          .map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(getUserDisplayName(user))}</option>`)
          .join("");
      assignedToFilter.value = visibleAssignees.some(u => String(u.id) === String(currentValue)) ? currentValue : "";
    }

    if (activityFilter) {
      const currentValue = activityFilter.value || "";
      activityFilter.innerHTML =
        `<option value="">Toutes les activités</option>` +
        visibleActivities
          .map(activity => `<option value="${escapeHtml(activity.id)}">${escapeHtml(activity.name)}</option>`)
          .join("");
      activityFilter.value = visibleActivities.some(a => String(a.id) === String(currentValue)) ? currentValue : "";
    }
  }

  function getFilteredDashboardTasks() {
    return applyTaskFilters(getVisibleTasks(), {
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
async function resetAndRefreshDashboard() {
  const searchInput = byId("searchInput");
  const pillarFilter = byId("pillarFilter");
  const supervisorFilter = byId("supervisorFilter");
  const assignedToFilter = byId("assignedToFilter");
  const activityFilter = byId("activityFilter");
  const statusFilter = byId("statusFilter");
  const startDateFilter = byId("startDateFilter");
  const endDateFilter = byId("endDateFilter");

  if (searchInput) searchInput.value = "";
  if (pillarFilter) pillarFilter.value = "";
  if (supervisorFilter) supervisorFilter.value = "";
  if (assignedToFilter) assignedToFilter.value = "";
  if (activityFilter) activityFilter.value = "";
  if (statusFilter) statusFilter.value = "";
  if (startDateFilter) startDateFilter.value = "";
  if (endDateFilter) endDateFilter.value = "";

  await Services.loadReferenceData();
  renderDashboardPage();
}
  function renderDashboardPage() {
    const tbody = byId("tasksTbody");
    if (!tbody) return;

    populateDashboardFilters();

    const filteredTasks = getFilteredDashboardTasks();
    renderKPIs("dashboardKpis", filteredTasks);

    tbody.innerHTML = filteredTasks.length
      ? renderTaskRows(filteredTasks, { showDescription: true })
      : `<tr><td colspan="14"><span class="muted">Aucune tâche correspondant aux filtres.</span></td></tr>`;
  }

  function getFilteredMyTasks(tasks) {
    return applyTaskFilters(tasks, {
      search: byId("myTasksSearchInput")?.value || "",
      assignedToId: byId("myTasksAssignedToFilter")?.value || "",
      activityId: byId("myTasksActivityFilter")?.value || "",
      status: byId("myTasksStatusFilter")?.value || "",
      startDate: byId("myTasksStartDateFilter")?.value || "",
      endDate: byId("myTasksEndDateFilter")?.value || ""
    });
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
      const assignees = myTasks.length ? [{ id: currentUser.id, name: getUserDisplayName(currentUser) }] : [];

      assignedToFilter.innerHTML =
        `<option value="">Tous les assignés</option>` +
        assignees
          .map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)}</option>`)
          .join("");

      assignedToFilter.value = assignees.some(user => String(user.id) === String(currentValue)) ? currentValue : "";
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
          .map(activity => `<option value="${escapeHtml(activity.id)}">${escapeHtml(activity.name)}</option>`)
          .join("");

      activityFilter.value = activities.some(activity => String(activity.id) === String(currentValue)) ? currentValue : "";
    }

    const filteredTasks = getFilteredMyTasks(myTasks);

    title.textContent = `Mes tâches — ${getUserDisplayName(currentUser)}`;
    renderKPIs("myTasksKpis", filteredTasks);

    tbody.innerHTML = filteredTasks.length
      ? renderTaskRows(filteredTasks, { showDescription: true })
      : `<tr><td colspan="14"><span class="muted">Aucune tâche correspondant aux filtres.</span></td></tr>`;
  }

  function getFilteredTeamTasks(tasks) {
    return applyTaskFilters(tasks, {
      search: byId("teamSearchInput")?.value || "",
      supervisorId: byId("teamSupervisorFilter")?.value || "",
      assignedToId: byId("teamAssignedToFilter")?.value || "",
      activityId: byId("teamActivityFilter")?.value || "",
      status: byId("teamStatusFilter")?.value || "",
      startDate: byId("teamStartDateFilter")?.value || "",
      endDate: byId("teamEndDateFilter")?.value || ""
    });
  }

  function populateTeamFilters(teamTasks, teamMembers) {
    const assignedToFilter = byId("teamAssignedToFilter");
    const supervisorFilter = byId("teamSupervisorFilter");
    const activityFilter = byId("teamActivityFilter");

    if (assignedToFilter) {
      const currentValue = assignedToFilter.value || "";
      assignedToFilter.innerHTML =
        `<option value="">Tous les membres</option>` +
        teamMembers
          .map(member => `<option value="${escapeHtml(member.id)}">${escapeHtml(getUserDisplayName(member))}</option>`)
          .join("");
      assignedToFilter.value = teamMembers.some(member => String(member.id) === String(currentValue)) ? currentValue : "";
    }

    if (supervisorFilter) {
      const currentValue = supervisorFilter.value || "";
      const supervisors = AppState.users.filter(user => {
        const role = getUserRole(user);
        return role === "supervisor" || role === "admin";
      });

      supervisorFilter.innerHTML =
        `<option value="">Tous les superviseurs</option>` +
        supervisors
          .map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(getUserDisplayName(user))}</option>`)
          .join("");
      supervisorFilter.value = supervisors.some(user => String(user.id) === String(currentValue)) ? currentValue : "";
    }

    if (activityFilter) {
      const currentValue = activityFilter.value || "";
      const activityIds = [...new Set(teamTasks.map(task => task.activity_id).filter(Boolean))];
      const activities = AppState.mainActivities.filter(activity =>
        activityIds.some(id => String(id) === String(activity.id))
      );

      activityFilter.innerHTML =
        `<option value="">Toutes les activités</option>` +
        activities
          .map(activity => `<option value="${escapeHtml(activity.id)}">${escapeHtml(activity.name)}</option>`)
          .join("");
      activityFilter.value = activities.some(activity => String(activity.id) === String(currentValue)) ? currentValue : "";
    }
  }

  function renderMyTeamPage() {
    const currentUser = getCurrentUser();
    const currentRole = getUserRole(currentUser);
    const membersBox = byId("teamMembersList");
    const tbody = byId("teamTasksTbody");
    const title = byId("myTeamTitle");

    if (!currentUser || !membersBox || !tbody || !title) return;

    let teamMembers = [];
    let teamTasks = [];

    if (currentRole === "admin") {
      teamMembers = AppState.users;
      teamTasks = AppState.tasks;
    } else {
      teamMembers = AppState.users.filter(user =>
        String(user.pillar_id) === String(currentUser.pillar_id)
      );
      teamTasks = getVisibleTasks();
    }

    populateTeamFilters(teamTasks, teamMembers);

    const filteredTeamTasks = getFilteredTeamTasks(teamTasks);

    title.textContent = `Mon équipe — ${getUserDisplayName(currentUser)}`;
    renderKPIs("myTeamKpis", filteredTeamTasks);

    membersBox.innerHTML = teamMembers.length
      ? teamMembers
          .map(member => `
            <div class="member-card">
              <h4>${escapeHtml(getUserDisplayName(member))}</h4>
              <div class="muted">${escapeHtml(getUserRole(member))} | ${escapeHtml(getUserPillarLabel(member))}</div>
              <div class="kpi-inline">
                <span>${filteredTeamTasks.filter(task => String(task.assigned_to_id) === String(member.id)).length} tâche(s)</span>
              </div>
            </div>
          `)
          .join("")
      : `<div class="empty">Aucun membre rattaché.</div>`;

    tbody.innerHTML = filteredTeamTasks.length
      ? renderTaskRows(filteredTeamTasks)
      : `<tr><td colspan="13"><span class="muted">Aucune tâche d'équipe correspondant aux filtres.</span></td></tr>`;
  }

  function populateRegisterDropdowns() {
    const pillarSupervisor = byId("pillarSupervisor");
    const userPillar = byId("userPillar");
    const userSupervisor = byId("userSupervisor");
    const currentUser = getCurrentUser();
    const currentRole = getUserRole(currentUser);

    let supervisors = AppState.users.filter(user => {
      const role = getUserRole(user);
      return role === "supervisor" || role === "admin";
    });

    let visiblePillars = AppState.pillars;

    if (currentUser && currentRole !== "admin") {
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
          .map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(getUserDisplayName(user))}</option>`)
          .join("");
    }

    if (userPillar) {
      userPillar.innerHTML =
        `<option value="">Sélectionner un pilier</option>` +
        visiblePillars
          .map(pillar => `<option value="${escapeHtml(pillar.id)}">${escapeHtml(pillar.name)}</option>`)
          .join("");
    }

    if (userSupervisor) {
      userSupervisor.innerHTML =
        `<option value="">Sélectionner un superviseur</option>` +
        supervisors
          .map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(getUserDisplayName(user))}</option>`)
          .join("");
    }
  }
async function renderTaskDocuments(taskId) {
  const list = byId("taskDocumentsList");
  if (!list) return;

  try {
    const docs = await Services.loadTaskDocuments(taskId);

    if (!docs.length) {
      list.innerHTML = `<div class="empty">Aucun document lié à cette tâche.</div>`;
      return;
    }

    const rows = await Promise.all(
      docs.map(async doc => {
        const url = await Services.getTaskDocumentSignedUrl(doc.file_path);
        return `
          <div class="member-card">
            <h4>${escapeHtml(doc.file_name)}</h4>
            <div class="muted">${escapeHtml(doc.mime_type || "Fichier")}</div>
            <div class="muted">${Number(doc.file_size || 0).toLocaleString()} octets</div>
            <div class="card-actions" style="margin-top:12px;">
              <a href="${escapeHtml(url)}" target="_blank" class="btn btn-outline">Télécharger</a>
              <button
                class="action-btn secondary-danger js-delete-task-document"
                type="button"
                data-document-id="${Number(doc.id)}"
                data-file-path="${escapeHtml(doc.file_path)}"
              >
                Supprimer
              </button>
            </div>
          </div>
        `;
      })
    );

    list.innerHTML = rows.join("");
  } catch (error) {
    list.innerHTML = `<div class="error-box">Erreur chargement documents : ${escapeHtml(error.message || error)}</div>`;
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
async function renderTaskActivityLogs(taskId) {
  const list = byId("taskActivityLogsList");
  if (!list) return;

  try {
    const logs = await Services.loadTaskActivityLogs(taskId);

    if (!logs.length) {
      list.innerHTML = `<div class="empty">Aucune action enregistrée.</div>`;
      return;
    }

    list.innerHTML = logs.map(log => `
      <div class="member-card">
        <h4>${escapeHtml(log.action_label)}</h4>
        <div class="muted">Par : ${escapeHtml(log.actor_name || "Utilisateur")}</div>
        <div class="muted">Date : ${escapeHtml(log.created_at || "")}</div>
      </div>
    `).join("");
  } catch (error) {
    list.innerHTML = `<div class="error-box">Erreur chargement historique : ${escapeHtml(error.message || error)}</div>`;
  }
}
  async function createOrAssignUserFromRegisterPage() {
    const sb = getSb();
    const currentUser = getCurrentUser();
    const currentRole = getUserRole(currentUser);

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

    if (currentRole !== "admin" && String(pillarId) !== String(currentUser.pillar_id)) {
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
    const currentRole = getUserRole(currentUser);

    if (!activityPillar || !currentUser) return;

    let visiblePillars = AppState.pillars;

    if (currentRole !== "admin") {
      visiblePillars = AppState.pillars.filter(pillar =>
        String(pillar.id) === String(currentUser.pillar_id)
      );
    }

    activityPillar.innerHTML =
      `<option value="">Sélectionner un pilier</option>` +
      visiblePillars
        .map(pillar => `<option value="${escapeHtml(pillar.id)}">${escapeHtml(pillar.name)}</option>`)
        .join("");

    if (visiblePillars.length === 1) {
      activityPillar.value = String(visiblePillars[0].id);
    }
  }

  function renderMainActivitiesList() {
    const list = byId("mainActivitiesList");
    const currentUser = getCurrentUser();
    const currentRole = getUserRole(currentUser);

    if (!list || !currentUser) return;

    let visibleActivities = AppState.mainActivities;

    if (currentRole !== "admin") {
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
          <h4>${escapeHtml(activity.name)}</h4>
          <div class="muted">Pilier : ${escapeHtml(activity.pillar_name || "Non défini")}</div>
          <div class="muted">${escapeHtml(activity.description || "Aucune description")}</div>
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
    const currentRole = getUserRole(currentUser);

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

    if (currentRole !== "admin" && String(pillarId) !== String(currentUser.pillar_id)) {
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
    const currentRole = getUserRole(currentUser);

    if (!sb || !currentUser) return;

    const activity = AppState.mainActivities.find(item =>
      String(item.id) === String(activityId)
    );

    if (!activity) {
      alert("Activité introuvable.");
      return;
    }

    if (currentRole !== "admin" && String(activity.pillar_id) !== String(currentUser.pillar_id)) {
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

  function renderRegisterPage() {
    populateRegisterDropdowns();
    populateActivityManagementDropdown();
    renderMainActivitiesList();

    const pillarsList = byId("pillarsList");
    const membersList = byId("registeredMembersList");
    const accessNotice = byId("registerAccessNotice");
    const currentUser = getCurrentUser();
    const currentRole = getUserRole(currentUser);

    if (!currentUser) return;

    if (accessNotice) {
      if (currentRole === "admin") {
        accessNotice.innerHTML = "";
      } else {
        accessNotice.innerHTML = `
          <div class="info-box">
            Vous gérez ici uniquement les éléments de votre pilier.
          </div>
        `;
      }
    }

    if (!pillarsList || !membersList) return;

    let visiblePillars = AppState.pillars;
    let visibleMembers = AppState.users;

    if (currentRole !== "admin") {
      visiblePillars = AppState.pillars.filter(pillar =>
        String(pillar.id) === String(currentUser.pillar_id)
      );

      visibleMembers = AppState.users.filter(user =>
        String(user.pillar_id) === String(currentUser.pillar_id)
      );
    }

    pillarsList.innerHTML = visiblePillars.length
      ? visiblePillars
          .map(pillar => {
            const supervisor = AppState.users.find(user =>
              String(user.id) === String(pillar.supervisor_profile_id)
            );

            const activities = AppState.mainActivities.filter(activity =>
              String(activity.pillar_id) === String(pillar.id)
            );

            return `
              <div class="member-card">
                <h4>${escapeHtml(pillar.name)}</h4>
                <div class="muted">
                  Superviseur : ${escapeHtml(supervisor ? getUserDisplayName(supervisor) : "Non défini")}
                </div>
                <div class="muted">
                  Activités principales :
                  ${escapeHtml(activities.length ? activities.map(a => a.name).join(", ") : "Non définies")}
                </div>
              </div>
            `;
          })
          .join("")
      : `<div class="empty">Aucun pilier disponible.</div>`;

    membersList.innerHTML = visibleMembers.length
      ? visibleMembers
          .map(member => `
            <div class="member-card">
              <h4>${escapeHtml(getUserDisplayName(member))}</h4>
              <div class="muted">
                ${escapeHtml(getUserRole(member))} | ${escapeHtml(getUserPillarLabel(member))}
              </div>
              <div class="muted">${escapeHtml(member.email || "")}</div>
            </div>
          `)
          .join("")
      : `<div class="empty">Aucun membre trouvé.</div>`;
  }

  function populateTaskCreationDropdowns() {
    const taskPillar = byId("taskPillar");
    const taskAssignedTo = byId("taskAssignedTo");
    const currentUser = getCurrentUser();
    const currentRole = getUserRole(currentUser);

    let visiblePillars = AppState.pillars;
    let eligibleUsers = AppState.users;

    if (currentUser && currentRole !== "admin") {
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
          .map(pillar => `<option value="${escapeHtml(pillar.id)}">${escapeHtml(pillar.name)}</option>`)
          .join("");
    }

    if (taskAssignedTo) {
      taskAssignedTo.innerHTML =
        `<option value="">Sélectionner un membre</option>` +
        eligibleUsers
          .map(user => `
            <option value="${escapeHtml(user.id)}">
              ${escapeHtml(getUserDisplayName(user))} — ${escapeHtml(getUserPillarLabel(user))}
            </option>
          `)
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
        .map(activity => `<option value="${escapeHtml(activity.id)}">${escapeHtml(activity.name)}</option>`)
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

    autoStatusInput.value = normalizeStatusToDatabase(computeAutomaticStatus({
      due_date: dueDateInput?.value || null,
      progress: 0
    }));
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
    const currentRole = getUserRole(currentUser);

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

    if (currentRole !== "admin" && String(pillarId) !== String(currentUser.pillar_id)) {
      setMessage("taskCreateMessage", "Vous ne pouvez créer une tâche que dans votre pilier.", "error");
      return;
    }

    const payload = {
      title,
      pillar_id: pillarId,
      assigned_to_id: assignedToId,
      priority,
      status: normalizeStatusToDatabase(computeAutomaticStatus({ due_date: dueDate, progress: 0 })),
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
      const createdTask = AppState.tasks[AppState.tasks.length - 1];
      await Services.reloadAndRerender();
      closeCreateTaskModal();
    } catch (error) {
      setMessage("taskCreateMessage", `Création impossible : ${error.message}`, "error");
    }
  }

  function openTaskModal(taskId) {
    const task = AppState.tasks.find(item => String(item.id) === String(taskId));
    if (!task || !canViewTask(task)) return;

    if (byId("editTaskId")) byId("editTaskId").value = task.id;
    if (byId("editStatus")) byId("editStatus").value = normalizeStatusToDatabase(computeAutomaticStatus(task));
    if (byId("editProgressScore")) byId("editProgressScore").value = task.progress_score ?? 0;
    if (byId("editStaffComment")) byId("editStaffComment").value = "";
    if (byId("editSupervisorScore")) byId("editSupervisorScore").value = task.supervisor_score ?? 0;
    if (byId("editSupervisorStatus")) byId("editSupervisorStatus").value = task.supervisor_status || "Non évalué";
    if (byId("editSupervisorComment")) byId("editSupervisorComment").value = "";
    renderTaskDocuments(task.id);
    renderTaskActivityLogs(task.id);
    openModal("taskModal");
  }

  function closeTaskModal() {
    closeModal("taskModal");
  }
  async function uploadDocumentForCurrentTask() {
  const currentUser = getCurrentUser();
  const taskId = Number(byId("editTaskId")?.value);
  const fileInput = byId("taskDocumentFile");
  const file = fileInput?.files?.[0];

  if (!currentUser || !taskId || !file) {
    alert("Veuillez sélectionner un fichier.");
    return;
  }

  try {
    await Services.uploadTaskDocument(taskId, file, currentUser.id);
    if (fileInput) fileInput.value = "";
    await renderTaskDocuments(taskId);
  } catch (error) {
    alert(`Erreur upload document : ${error.message || error}`);
  }
}
  async function saveTaskUpdate() {
    const currentUser = getCurrentUser();
    const currentRole = getUserRole(currentUser);

    if (!currentUser) return;

    const taskId = Number(byId("editTaskId")?.value);
    const task = AppState.tasks.find(item => Number(item.id) === taskId);

    if (!task || !canViewTask(task)) return;

    const progressScore = clamp(Number(byId("editProgressScore")?.value), 0, 10);
    const supervisorScore = clamp(Number(byId("editSupervisorScore")?.value), 0, 10);

    const isAssignedUser = String(currentUser.id) === String(task.assigned_to_id);
    const isSupervisorOnPillar =
      currentRole === "supervisor" &&
      String(task.pillar_id) === String(currentUser.pillar_id);
    const isAdminUser = currentRole === "admin";

    const status = normalizeStatusToDatabase(computeAutomaticStatus({
      ...task,
      progress: (isAssignedUser || isAdminUser) ? scoreToPercent(progressScore) : task.progress
    }));

    const supervisorStatus = byId("editSupervisorStatus")?.value || "Non évalué";
    const newStaffComment = String(byId("editStaffComment")?.value || "").trim();
    const newSupervisorComment = String(byId("editSupervisorComment")?.value || "").trim();

    const payload = { status };

    if (isAssignedUser || isAdminUser) {
      payload.progress_score = progressScore;
      payload.progress = scoreToPercent(progressScore);
      payload.staff_comment = appendComment(task.staff_comment, getUserDisplayName(currentUser), newStaffComment);
    }

    if (isSupervisorOnPillar || isAdminUser) {
      payload.supervisor_score = supervisorScore;
      payload.supervisor_progress = scoreToPercent(supervisorScore);
      payload.supervisor_status = supervisorStatus;
      payload.supervisor_comment = appendComment(task.supervisor_comment, getUserDisplayName(currentUser), newSupervisorComment);
    }

    try {
      await Services.updateTaskWithFallbackStatus(taskId, payload);
      closeTaskModal();
      await Services.reloadAndRerender();
    } catch (error) {
      showGlobalError(`Erreur mise à jour : ${error.message}`);
    }
  }

  async function deleteTask(taskId) {
    const sb = getSb();
    const task = AppState.tasks.find(item => String(item.id) === String(taskId));

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
    const uploadBtn = byId("uploadTaskDocumentBtn");
  if (uploadBtn && !uploadBtn.dataset.boundClick) {
  uploadBtn.addEventListener("click", uploadDocumentForCurrentTask);
  uploadBtn.dataset.boundClick = "true";
}
    if (closeTopBtn && !closeTopBtn.dataset.boundClick) {
      closeTopBtn.addEventListener("click", closeTaskModal);
      closeTopBtn.dataset.boundClick = "true";
    }

    if (closeBottomBtn && !closeBottomBtn.dataset.boundClick) {
      closeBottomBtn.addEventListener("click", closeTaskModal);
      closeBottomBtn.dataset.boundClick = "true";
    }

    if (saveBtn && !saveBtn.dataset.boundClick) {
      saveBtn.addEventListener("click", saveTaskUpdate);
      saveBtn.dataset.boundClick = "true";
    }

    document.addEventListener("click", event => {
      const openBtn = event.target.closest(".js-open-task-modal");
      const deleteDocBtn = event.target.closest(".js-delete-task-document");
if (deleteDocBtn) {
  Services.deleteTaskDocument(
    deleteDocBtn.dataset.documentId,
    deleteDocBtn.dataset.filePath
  ).then(() => {
    const taskId = Number(byId("editTaskId")?.value);
    renderTaskDocuments(taskId);
  }).catch(error => {
    alert(`Erreur suppression document : ${error.message || error}`);
  });
  return;
}
      if (openBtn) {
        openTaskModal(openBtn.dataset.taskId);
        return;
      }

      const deleteBtn = event.target.closest(".js-delete-task");
      if (deleteBtn) {
        deleteTask(deleteBtn.dataset.taskId);
        return;
      }

      const disableBtn = event.target.closest(".js-disable-activity");
      if (disableBtn) {
        disableMainActivity(disableBtn.dataset.activityId);
      }
    });
  }

  function initRoleControlledButtons() {
    const page = document.body.dataset.page;
    if (page !== "dashboard") return;

    setRoleControlledVisibility("openCreateTaskModalBtn", !!canCreateTask());
    setRoleControlledVisibility("exportXlsxBtn", !!canExportDashboard());
  }

  function initTaskCreation() {
    const page = document.body.dataset.page;
    if (page !== "dashboard") return;

    const openBtn = byId("openCreateTaskModalBtn");
    const closeTopBtn = byId("closeCreateTaskModalBtn");
    const closeBottomBtn = byId("closeCreateTaskModalBtnFooter");
    const createBtn = byId("createTaskBtn");
    const dueDateInput = byId("taskDueDate");
    const pillarInput = byId("taskPillar");

    setRoleControlledVisibility("openCreateTaskModalBtn", !!canCreateTask());

    if (openBtn && canCreateTask() && !openBtn.dataset.boundClick) {
      openBtn.addEventListener("click", openCreateTaskModal);
      openBtn.dataset.boundClick = "true";
    }

    if (closeTopBtn && !closeTopBtn.dataset.boundClick) {
      closeTopBtn.addEventListener("click", closeCreateTaskModal);
      closeTopBtn.dataset.boundClick = "true";
    }

    if (closeBottomBtn && !closeBottomBtn.dataset.boundClick) {
      closeBottomBtn.addEventListener("click", closeCreateTaskModal);
      closeBottomBtn.dataset.boundClick = "true";
    }

    if (createBtn && !createBtn.dataset.boundClick) {
      createBtn.addEventListener("click", createNewTask);
      createBtn.dataset.boundClick = "true";
    }

    if (dueDateInput && !dueDateInput.dataset.boundChange) {
      dueDateInput.addEventListener("change", updateCreateTaskAutoStatus);
      dueDateInput.dataset.boundChange = "true";
    }

    if (pillarInput && !pillarInput.dataset.boundChange) {
      pillarInput.addEventListener("change", populateTaskActivityOptions);
      pillarInput.dataset.boundChange = "true";
    }
  }

  function initPillarCreation() {
    const page = document.body.dataset.page;
    if (page !== "register") return;

    const createPillarBtn = byId("createPillarBtn");
    if (createPillarBtn && !createPillarBtn.dataset.boundClick) {
      createPillarBtn.addEventListener("click", createNewPillar);
      createPillarBtn.dataset.boundClick = "true";
    }
  }

  function initRegisterPage() {
    const page = document.body.dataset.page;
    if (page !== "register") return;

    const createUserBtn = byId("createUserBtn");
    const createActivityBtn = byId("createActivityBtn");

    if (createUserBtn && !createUserBtn.dataset.boundClick) {
      createUserBtn.addEventListener("click", createOrAssignUserFromRegisterPage);
      createUserBtn.dataset.boundClick = "true";
    }

    if (createActivityBtn && !createActivityBtn.dataset.boundClick) {
      createActivityBtn.addEventListener("click", createMainActivity);
      createActivityBtn.dataset.boundClick = "true";
    }
  }

  function initMainActivitiesManagement() {
    const page = document.body.dataset.page;
    if (page !== "register") return;

    populateActivityManagementDropdown();
    renderMainActivitiesList();
  }

  function exportCurrentViewToXlsx() {
    if (typeof window.XLSX === "undefined") {
      alert("Librairie XLSX indisponible.");
      return;
    }

    const rows = getFilteredDashboardTasks();

    const exportData = rows.map(task => ({
      ID: task.id,
      Tache: task.title,
      Pilier: task.pillar || "",
      Activite_principale: task.activity_name || "",
      Description: task.description || "",
      Assigne_a: task.assigned_to_name || "",
      Superviseur: task.supervisor_name || "",
      Priorite: task.priority || "",
      Statut: normalizeStatusToDatabase(task.status) || "",
      Score_staff: task.progress_score ?? 0,
      Progression_staff_pourcent: task.progress ?? 0,
      Commentaire_staff: task.staff_comment || "",
      Score_superviseur: task.supervisor_score ?? 0,
      Progression_superviseur_pourcent: task.supervisor_progress ?? 0,
      Appreciation_superviseur: task.supervisor_status || "",
      Commentaire_superviseur: task.supervisor_comment || "",
      Echeance: task.due_date || ""
    }));

    const worksheet = window.XLSX.utils.json_to_sheet(exportData);
    const workbook = window.XLSX.utils.book_new();

    window.XLSX.utils.book_append_sheet(workbook, worksheet, "Taches");
    window.XLSX.writeFile(workbook, "UNW_TaskManager.xlsx");
  }

  function initExportAndPrint() {
    const page = document.body.dataset.page;
    const resetBtn = byId("resetDashboardBtn");
    if (page !== "dashboard") return;

    const exportBtn = byId("exportXlsxBtn");
    const printBtn = byId("printPageBtn");
    const searchBtn = byId("searchBtn");
    const searchInput = byId("searchInput");

    const filters = [
      "pillarFilter",
      "supervisorFilter",
      "assignedToFilter",
      "activityFilter",
      "statusFilter",
      "startDateFilter",
      "endDateFilter"
    ];

    setRoleControlledVisibility("exportXlsxBtn", !!canExportDashboard());

    if (exportBtn && canExportDashboard() && !exportBtn.dataset.boundClick) {
      exportBtn.addEventListener("click", exportCurrentViewToXlsx);
      exportBtn.dataset.boundClick = "true";
    }

    if (printBtn && !printBtn.dataset.boundClick) {
      printBtn.addEventListener("click", () => window.print());
      printBtn.dataset.boundClick = "true";
    }

    if (searchBtn && !searchBtn.dataset.boundClick) {
      searchBtn.addEventListener("click", renderDashboardPage);
      searchBtn.dataset.boundClick = "true";
    }

    if (searchInput && !searchInput.dataset.boundKeydown) {
      searchInput.addEventListener("keydown", event => {
        if (event.key === "Enter") renderDashboardPage();
      });
      searchInput.dataset.boundKeydown = "true";
    }

    filters.forEach(id => {
      const el = byId(id);
      if (el && !el.dataset.boundChange) {
        el.addEventListener("change", renderDashboardPage);
        el.dataset.boundChange = "true";
      }
    });
  }
if (resetBtn && !resetBtn.dataset.boundClick) {
  resetBtn.addEventListener("click", resetAndRefreshDashboard);
  resetBtn.dataset.boundClick = "true";
}
  function initMyTasksFilters() {
    const page = document.body.dataset.page;
    if (page !== "my-tasks") return;

    const searchBtn = byId("myTasksSearchBtn");
    const searchInput = byId("myTasksSearchInput");

    const filters = [
      "myTasksAssignedToFilter",
      "myTasksActivityFilter",
      "myTasksStatusFilter",
      "myTasksStartDateFilter",
      "myTasksEndDateFilter"
    ];

    if (searchBtn && !searchBtn.dataset.boundClick) {
      searchBtn.addEventListener("click", renderMyTasksPage);
      searchBtn.dataset.boundClick = "true";
    }

    if (searchInput && !searchInput.dataset.boundKeydown) {
      searchInput.addEventListener("keydown", event => {
        if (event.key === "Enter") renderMyTasksPage();
      });
      searchInput.dataset.boundKeydown = "true";
    }

    filters.forEach(id => {
      const el = byId(id);
      if (el && !el.dataset.boundChange) {
        el.addEventListener("change", renderMyTasksPage);
        el.dataset.boundChange = "true";
      }
    });
  }

  function initTeamFilters() {
    const page = document.body.dataset.page;
    if (page !== "my-team") return;

    const searchBtn = byId("teamSearchBtn");
    const searchInput = byId("teamSearchInput");

    const filters = [
      "teamAssignedToFilter",
      "teamActivityFilter",
      "teamStatusFilter",
      "teamSupervisorFilter",
      "teamStartDateFilter",
      "teamEndDateFilter"
    ];

    if (searchBtn && !searchBtn.dataset.boundClick) {
      searchBtn.addEventListener("click", renderMyTeamPage);
      searchBtn.dataset.boundClick = "true";
    }

    if (searchInput && !searchInput.dataset.boundKeydown) {
      searchInput.addEventListener("keydown", event => {
        if (event.key === "Enter") renderMyTeamPage();
      });
      searchInput.dataset.boundKeydown = "true";
    }

    filters.forEach(id => {
      const el = byId(id);
      if (el && !el.dataset.boundChange) {
        el.addEventListener("change", renderMyTeamPage);
        el.dataset.boundChange = "true";
      }
    });
  }

  function renderCurrentPage() {
    const page = document.body.dataset.page;

    if (page === "dashboard") {
      initRoleControlledButtons();
      renderDashboardPage();
      return;
    }

    if (page === "my-tasks") {
      renderMyTasksPage();
      return;
    }

    if (page === "my-team") {
      renderMyTeamPage();
      return;
    }

    if (page === "register") {
      renderRegisterPage();
    }
  }

  window.AppUI = {
    initExportAndPrint,
    initFilterMenus,
    initGlobalActions,
    initLogout,
    initMainActivitiesManagement,
    initModalSystem,
    initMyTasksFilters,
    initPillarCreation,
    initRegisterPage,
    initTaskCreation,
    initTeamFilters,
    initUserHeader,
    renderCurrentPage,
    renderMainActivitiesList,
    showGlobalError
  };
})();
