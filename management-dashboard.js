(function () {
  const Core = window.AppCore || {};
  const Services = window.AppServices || {};
  const AuthUI = window.AuthUI || {};

  const AppState = Core.AppState || {};
  const byId = Core.byId || ((id) => document.getElementById(id));
  const getCurrentUser = Core.getCurrentUser || (() => AppState.currentUser);
  const getSb = Core.getSb || (() => window.sb);
  const normalizeStatusToDatabase = Core.normalizeStatusToDatabase || ((v) => v || "");
  const computeAutomaticStatus = Core.computeAutomaticStatus || ((task) => task.status || "");
  const clamp = Core.clamp || ((v, min, max) => Math.max(min, Math.min(max, Number(v) || 0)));

  const STATUS = Core.STATUS || {
    ON_TRACK: "En bonne voie",
    DUE_SOON: "Échéance imminente",
    LATE: "En retard",
    DONE: "Achevé"
  };

  const ManagementState = {
    documents: [],
    logs: [],
    filteredTasks: []
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getUserRole(user) {
    return String(user?.role || user?.user_type || "staff").trim().toLowerCase();
  }

  function getUserDisplayName(user) {
    return user?.name || user?.full_name || "Utilisateur";
  }

  function showMessage(text, type = "info") {
    const target = byId("managementPageMessage");
    if (AuthUI.showMessage && target) {
      AuthUI.showMessage(target, text, type);
    }
  }

  function clearMessage() {
    const target = byId("managementPageMessage");
    if (target) target.innerHTML = "";
  }

  function daysBetween(dateA, dateB) {
    if (!dateA || !dateB) return null;
    const a = new Date(dateA);
    const b = new Date(dateB);
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
  }

  function safeDate(dateValue) {
    if (!dateValue) return "";
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  }

  function getBadgeLevel(value, warningThreshold, dangerThreshold, reverse = false) {
    if (!reverse) {
      if (value >= dangerThreshold) return { label: "Élevé", className: "badge-red" };
      if (value >= warningThreshold) return { label: "Modéré", className: "badge-orange" };
      return { label: "Stable", className: "badge-green" };
    }
    if (value <= dangerThreshold) return { label: "Faible", className: "badge-red" };
    if (value <= warningThreshold) return { label: "Moyen", className: "badge-orange" };
    return { label: "Bon", className: "badge-green" };
  }

  function getPriorityAlert(task) {
    if (task.priority === "Critique" && task.computed_status === STATUS.LATE) {
      return { label: "Critique", className: "badge-red" };
    }
    if (task.computed_status === STATUS.LATE) {
      return { label: "Retard", className: "badge-red" };
    }
    if (task.computed_status === STATUS.DUE_SOON) {
      return { label: "Imminente", className: "badge-orange" };
    }
    return { label: "Suivi", className: "badge-blue" };
  }

  function getStaleSignal(days) {
    if (days >= 14) return { label: "Fort signal", className: "badge-red" };
    if (days >= 7) return { label: "Vigilance", className: "badge-orange" };
    return { label: "À jour", className: "badge-green" };
  }

  function getLastActivityDate(taskId, task) {
    const relatedLogs = ManagementState.logs
      .filter(log => String(log.task_id) === String(taskId))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (relatedLogs.length) return relatedLogs[0].created_at;
    return task.created_at || null;
  }

  function getDocCountForTask(taskId) {
    return ManagementState.documents.filter(doc => String(doc.task_id) === String(taskId)).length;
  }

  function getTasksWithComputedStatus() {
    return (AppState.tasks || []).map(task => ({
      ...task,
      computed_status: normalizeStatusToDatabase(computeAutomaticStatus(task))
    }));
  }

  function taskMatchesFilters(task) {
    const search = String(byId("managementSearchInput")?.value || "").trim().toLowerCase();
    const pillar = byId("managementPillarFilter")?.value || "";
    const supervisorId = byId("managementSupervisorFilter")?.value || "";
    const priority = byId("managementPriorityFilter")?.value || "";
    const status = byId("managementStatusFilter")?.value || "";
    const startDate = byId("managementStartDate")?.value || "";
    const endDate = byId("managementEndDate")?.value || "";

    const haystack = [
      task.title,
      task.pillar,
      task.activity_name,
      task.assigned_to_name,
      task.supervisor_name,
      task.description
    ]
      .join(" ")
      .toLowerCase();

    if (search && !haystack.includes(search)) return false;
    if (pillar && String(task.pillar || "") !== String(pillar)) return false;
    if (supervisorId && String(task.supervisor_id || "") !== String(supervisorId)) return false;
    if (priority && String(task.priority || "") !== String(priority)) return false;
    if (status && String(task.computed_status || "") !== String(status)) return false;

    if (startDate || endDate) {
      if (!task.due_date) return false;
      const due = safeDate(task.due_date);
      if (startDate && due < startDate) return false;
      if (endDate && due > endDate) return false;
    }

    return true;
  }

  function getFilteredTasks() {
    return getTasksWithComputedStatus().filter(taskMatchesFilters);
  }

  function populateFilters(tasks) {
    const pillarFilter = byId("managementPillarFilter");
    const supervisorFilter = byId("managementSupervisorFilter");

    const pillars = [...new Set(tasks.map(t => t.pillar).filter(Boolean))].sort();
    const supervisors = [...new Map(
      tasks
        .filter(t => t.supervisor_id)
        .map(t => [String(t.supervisor_id), { id: t.supervisor_id, name: t.supervisor_name || "Non défini" }])
    ).values()];

    if (pillarFilter) {
      const current = pillarFilter.value || "";
      pillarFilter.innerHTML =
        `<option value="">Tous les piliers</option>` +
        pillars.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
      pillarFilter.value = pillars.includes(current) ? current : "";
    }

    if (supervisorFilter) {
      const current = supervisorFilter.value || "";
      supervisorFilter.innerHTML =
        `<option value="">Tous les superviseurs</option>` +
        supervisors.map(s => `<option value="${escapeHtml(String(s.id))}">${escapeHtml(s.name)}</option>`).join("");
      supervisorFilter.value = supervisors.some(s => String(s.id) === String(current)) ? current : "";
    }
  }

  function renderExecutiveKpis(tasks) {
    const el = byId("managementExecutiveKpis");
    if (!el) return;

    const total = tasks.length;
    const completed = tasks.filter(t => t.computed_status === STATUS.DONE).length;
    const late = tasks.filter(t => t.computed_status === STATUS.LATE).length;
    const dueSoon = tasks.filter(t => t.computed_status === STATUS.DUE_SOON).length;
    const onTrack = tasks.filter(t => t.computed_status === STATUS.ON_TRACK).length;
    const critical = tasks.filter(t => t.priority === "Critique").length;
    const withDocs = tasks.filter(t => getDocCountForTask(t.id) > 0).length;
    const avgProgress = total
      ? Math.round(tasks.reduce((sum, t) => sum + Number(t.progress || 0), 0) / total)
      : 0;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;

    const items = [
      { title: "Total tâches", value: total, accent: "blue", icon: "◼" },
      { title: "Achevées", value: completed, accent: "green", icon: "✓" },
      { title: "En bonne voie", value: onTrack, accent: "blue", icon: "↗" },
      { title: "Imminentes", value: dueSoon, accent: "orange", icon: "!" },
      { title: "En retard", value: late, accent: "red", icon: "⚠" },
      { title: "Taux d’achèvement", value: `${completionRate}%`, accent: "green", icon: "%" },
      { title: "Progression moyenne", value: `${avgProgress}%`, accent: "blue", icon: "◔" },
      { title: "Tâches critiques", value: critical, accent: "red", icon: "◆" },
      { title: "Avec documents", value: withDocs, accent: "orange", icon: "▣" }
    ];

    el.innerHTML = items.map(item => `
      <div class="management-kpi-card management-kpi-${item.accent}">
        <div class="management-kpi-top">
          <span class="management-kpi-icon">${item.icon}</span>
          <span class="management-kpi-label">${escapeHtml(item.title)}</span>
        </div>
        <div class="management-kpi-value">${escapeHtml(item.value)}</div>
      </div>
    `).join("");
  }

  function getPillarAggregates(tasks) {
    const groups = new Map();

    tasks.forEach(task => {
      const key = task.pillar || "Sans pilier";

      if (!groups.has(key)) {
        groups.set(key, {
          pillar: key,
          total: 0,
          completed: 0,
          late: 0,
          dueSoon: 0,
          progressSum: 0,
          withDocs: 0,
          withoutDocs: 0
        });
      }

      const g = groups.get(key);
      g.total += 1;
      g.progressSum += Number(task.progress || 0);

      if (task.computed_status === STATUS.DONE) g.completed += 1;
      if (task.computed_status === STATUS.LATE) g.late += 1;
      if (task.computed_status === STATUS.DUE_SOON) g.dueSoon += 1;

      const docCount = getDocCountForTask(task.id);
      if (docCount > 0) g.withDocs += 1;
      else g.withoutDocs += 1;
    });

    return [...groups.values()].map(g => ({
      ...g,
      completionRate: g.total ? Math.round((g.completed / g.total) * 100) : 0,
      delayRate: g.total ? Math.round((g.late / g.total) * 100) : 0,
      avgProgress: g.total ? Math.round(g.progressSum / g.total) : 0
    })).sort((a, b) => a.pillar.localeCompare(b.pillar));
  }

  function renderGauge(targetId, percent, label, accentClass = "") {
    const el = byId(targetId);
    if (!el) return;

    const safePercent = clamp(percent, 0, 100);

    el.innerHTML = `
      <div class="management-gauge ${accentClass}">
        <div class="management-gauge-ring" style="--gauge:${safePercent};">
          <div class="management-gauge-center">
            <div class="management-gauge-value">${safePercent}%</div>
            <div class="management-gauge-label">${escapeHtml(label)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderExecutiveSummary(tasks) {
    const el = byId("managementExecutiveSummary");
    if (!el) return;

    const total = tasks.length;
    const late = tasks.filter(t => t.computed_status === STATUS.LATE).length;
    const dueSoon = tasks.filter(t => t.computed_status === STATUS.DUE_SOON).length;
    const critical = tasks.filter(t => t.priority === "Critique").length;
    const withDocs = tasks.filter(t => getDocCountForTask(t.id) > 0).length;
    const completed = tasks.filter(t => t.computed_status === STATUS.DONE).length;

    const bullets = [
      `Le portefeuille compte ${total} tâche(s), dont ${completed} achevée(s).`,
      `${late} tâche(s) sont actuellement en retard et ${dueSoon} à échéance imminente.`,
      `${critical} tâche(s) critiques requièrent une attention particulière.`,
      `${withDocs} tâche(s) disposent déjà d’une traçabilité documentaire.`
    ];

    el.innerHTML = bullets.map(item => `
      <div class="management-summary-item">
        <span class="management-summary-dot"></span>
        <span>${escapeHtml(item)}</span>
      </div>
    `).join("");
  }

  function renderBarChart(targetId, items, valueKey, barClass = "") {
    const el = byId(targetId);
    if (!el) return;

    if (!items.length) {
      el.innerHTML = `<div class="empty">Aucune donnée disponible.</div>`;
      return;
    }

    el.innerHTML = items.map(item => `
      <div class="management-bar-row premium-row">
        <div class="management-bar-label">${escapeHtml(item.pillar)}</div>
        <div class="management-bar-track">
          <div class="management-bar-fill ${barClass}" style="width:${clamp(item[valueKey], 0, 100)}%"></div>
        </div>
        <div class="management-bar-value">${item[valueKey]}%</div>
      </div>
    `).join("");
  }

  function renderPillarSummaryTable(aggregates) {
    const tbody = byId("managementPillarTbody");
    if (!tbody) return;

    tbody.innerHTML = aggregates.length
      ? aggregates.map(item => {
          const health = getBadgeLevel(item.completionRate, 55, 35, true);
          return `
            <tr>
              <td>${escapeHtml(item.pillar)}</td>
              <td>${item.total}</td>
              <td>${item.completed}</td>
              <td>${item.late}</td>
              <td>${item.dueSoon}</td>
              <td>${item.completionRate}%</td>
              <td>${item.avgProgress}%</td>
              <td>${item.withDocs}</td>
              <td>${item.withoutDocs}</td>
              <td><span class="badge ${health.className}">${health.label}</span></td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="10"><span class="muted">Aucune donnée à afficher.</span></td></tr>`;
  }

  function renderAlerts(tasks) {
    const tbody = byId("managementAlertsTbody");
    if (!tbody) return;

    const ranked = [...tasks]
      .filter(t => t.computed_status === STATUS.LATE || t.computed_status === STATUS.DUE_SOON || t.priority === "Critique")
      .sort((a, b) => {
        const aScore =
          (a.priority === "Critique" ? 1000 : a.priority === "Haute" ? 500 : 0) +
          (a.computed_status === STATUS.LATE ? 300 : a.computed_status === STATUS.DUE_SOON ? 150 : 0) +
          (100 - Number(a.progress || 0));
        const bScore =
          (b.priority === "Critique" ? 1000 : b.priority === "Haute" ? 500 : 0) +
          (b.computed_status === STATUS.LATE ? 300 : b.computed_status === STATUS.DUE_SOON ? 150 : 0) +
          (100 - Number(b.progress || 0));
        return bScore - aScore;
      })
      .slice(0, 10);

    tbody.innerHTML = ranked.length
      ? ranked.map(task => {
          const signal = getPriorityAlert(task);
          return `
            <tr>
              <td>${escapeHtml(task.title)}</td>
              <td>${escapeHtml(task.pillar || "")}</td>
              <td>${escapeHtml(task.assigned_to_name || "")}</td>
              <td>${escapeHtml(task.priority || "")}</td>
              <td>${escapeHtml(task.computed_status || "")}</td>
              <td>${escapeHtml(safeDate(task.due_date) || "—")}</td>
              <td><span class="badge ${signal.className}">${signal.label}</span></td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="7"><span class="muted">Aucune alerte prioritaire.</span></td></tr>`;
  }

  function renderStaleTasks(tasks) {
    const tbody = byId("managementStaleTbody");
    if (!tbody) return;

    const now = new Date();

    const staleRows = tasks
      .map(task => {
        const lastActivity = getLastActivityDate(task.id, task);
        const diff = lastActivity ? daysBetween(now, lastActivity) : null;
        return {
          ...task,
          lastActivity,
          staleDays: diff
        };
      })
      .filter(task => (task.staleDays ?? -1) >= 7)
      .sort((a, b) => (b.staleDays || 0) - (a.staleDays || 0))
      .slice(0, 10);

    tbody.innerHTML = staleRows.length
      ? staleRows.map(task => {
          const signal = getStaleSignal(task.staleDays || 0);
          return `
            <tr>
              <td>${escapeHtml(task.title)}</td>
              <td>${escapeHtml(task.pillar || "")}</td>
              <td>${escapeHtml(task.assigned_to_name || "")}</td>
              <td>${escapeHtml(safeDate(task.lastActivity) || "—")}</td>
              <td>${task.staleDays ?? "—"}</td>
              <td><span class="badge ${signal.className}">${signal.label}</span></td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="6"><span class="muted">Aucune tâche sans activité récente.</span></td></tr>`;
  }

  function renderDocumentationKpis(tasks) {
    const el = byId("managementDocumentationKpis");
    if (!el) return;

    const totalDocs = ManagementState.documents.length;
    const totalTasks = tasks.length;
    const withDocs = tasks.filter(t => getDocCountForTask(t.id) > 0).length;
    const withoutDocs = totalTasks - withDocs;
    const completedWithoutDocs = tasks.filter(t => t.computed_status === STATUS.DONE && getDocCountForTask(t.id) === 0).length;
    const criticalWithoutDocs = tasks.filter(t => t.priority === "Critique" && getDocCountForTask(t.id) === 0).length;

    const items = [
      { kicker: "Documents", title: "Total documents", value: totalDocs, accent: "blue" },
      { kicker: "Traçabilité", title: "Tâches avec documents", value: withDocs, accent: "green" },
      { kicker: "Vigilance", title: "Tâches sans documents", value: withoutDocs, accent: "orange" },
      { kicker: "Redevabilité", title: "Achevées sans justificatif", value: completedWithoutDocs, accent: "red" },
      { kicker: "Critiques", title: "Critiques sans document", value: criticalWithoutDocs, accent: "red" }
    ];

    el.innerHTML = items.map(item => `
      <div class="management-doc-card premium-doc-card ${item.accent}">
        <span class="section-kicker">${escapeHtml(item.kicker)}</span>
        <h4>${escapeHtml(item.title)}</h4>
        <div class="management-doc-value">${escapeHtml(item.value)}</div>
      </div>
    `).join("");
  }

  async function loadManagementSideData() {
    const sb = getSb();
    if (!sb) throw new Error("Client Supabase introuvable.");

    const [docsRes, logsRes] = await Promise.all([
      sb.from("task_documents").select("id, task_id, file_name, file_path, created_at"),
      sb.from("task_activity_logs").select("id, task_id, created_at, action_type, action_label")
    ]);

    ManagementState.documents = docsRes.error ? [] : (docsRes.data || []);
    ManagementState.logs = logsRes.error ? [] : (logsRes.data || []);
  }

  function renderAll() {
    const tasks = getFilteredTasks();
    ManagementState.filteredTasks = tasks;

    const total = tasks.length;
    const completed = tasks.filter(t => t.computed_status === STATUS.DONE).length;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;
    const avgProgress = total ? Math.round(tasks.reduce((sum, t) => sum + Number(t.progress || 0), 0) / total) : 0;

    renderExecutiveKpis(tasks);
    renderGauge("completionGauge", completionRate, "Achèvement", "is-completion");
    renderGauge("progressGauge", avgProgress, "Progression", "is-progress");
    renderExecutiveSummary(tasks);

    const aggregates = getPillarAggregates(tasks);
    renderBarChart("pillarCompletionChart", aggregates, "completionRate");
    renderBarChart("pillarDelayChart", aggregates, "delayRate", "is-danger");
    renderBarChart(
      "pillarVolumeChart",
      aggregates.map(item => ({
        pillar: item.pillar,
        totalPercent: tasks.length ? Math.round((item.total / tasks.length) * 100) : 0
      })),
      "totalPercent",
      "is-orange"
    );

    renderPillarSummaryTable(aggregates);
    renderAlerts(tasks);
    renderStaleTasks(tasks);
    renderDocumentationKpis(tasks);
  }

  function exportManagementView() {
    if (typeof window.XLSX === "undefined") {
      alert("Librairie XLSX indisponible.");
      return;
    }

    const tasks = ManagementState.filteredTasks || [];
    const aggregates = getPillarAggregates(tasks);

    const wb = window.XLSX.utils.book_new();

    const tasksSheet = window.XLSX.utils.json_to_sheet(
      tasks.map(task => ({
        Tache: task.title,
        Pilier: task.pillar || "",
        Activite: task.activity_name || "",
        Assigne_a: task.assigned_to_name || "",
        Superviseur: task.supervisor_name || "",
        Priorite: task.priority || "",
        Statut: task.computed_status || "",
        Progression: task.progress || 0,
        Echeance: safeDate(task.due_date) || "",
        Documents: getDocCountForTask(task.id)
      }))
    );

    const pillarsSheet = window.XLSX.utils.json_to_sheet(
      aggregates.map(item => ({
        Pilier: item.pillar,
        Total: item.total,
        Achevees: item.completed,
        En_retard: item.late,
        Imminentes: item.dueSoon,
        Taux_achevement: item.completionRate,
        Progression_moyenne: item.avgProgress,
        Avec_documents: item.withDocs,
        Sans_documents: item.withoutDocs
      }))
    );

    window.XLSX.utils.book_append_sheet(wb, tasksSheet, "Management_Taches");
    window.XLSX.utils.book_append_sheet(wb, pillarsSheet, "Synthese_Piliers");
    window.XLSX.writeFile(wb, "UNW_Management_Dashboard_V2.xlsx");
  }

  function bindEvents() {
    const searchBtn = byId("managementSearchBtn");
    const refreshBtn = byId("managementRefreshBtn");
    const exportBtn = byId("managementExportBtn");
    const printBtn = byId("managementPrintBtn");
    const searchInput = byId("managementSearchInput");

    const filters = [
      "managementPillarFilter",
      "managementSupervisorFilter",
      "managementPriorityFilter",
      "managementStatusFilter",
      "managementStartDate",
      "managementEndDate"
    ];

    if (searchBtn && !searchBtn.dataset.boundClick) {
      searchBtn.addEventListener("click", renderAll);
      searchBtn.dataset.boundClick = "true";
    }

    if (refreshBtn && !refreshBtn.dataset.boundClick) {
      refreshBtn.addEventListener("click", async () => {
        if (searchInput) searchInput.value = "";
        filters.forEach(id => {
          const el = byId(id);
          if (el) el.value = "";
        });

        await Services.loadReferenceData();
        await loadManagementSideData();
        populateFilters(getTasksWithComputedStatus());
        renderAll();
      });
      refreshBtn.dataset.boundClick = "true";
    }

    if (exportBtn && !exportBtn.dataset.boundClick) {
      exportBtn.addEventListener("click", exportManagementView);
      exportBtn.dataset.boundClick = "true";
    }

    if (printBtn && !printBtn.dataset.boundClick) {
      printBtn.addEventListener("click", () => window.print());
      printBtn.dataset.boundClick = "true";
    }

    if (searchInput && !searchInput.dataset.boundKeydown) {
      searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") renderAll();
      });
      searchInput.dataset.boundKeydown = "true";
    }

    filters.forEach(id => {
      const el = byId(id);
      if (el && !el.dataset.boundChange) {
        el.addEventListener("change", renderAll);
        el.dataset.boundChange = "true";
      }
    });

    document.addEventListener("click", (event) => {
      document.querySelectorAll(".filter-menu[open]").forEach(menu => {
        if (!menu.contains(event.target)) {
          menu.removeAttribute("open");
        }
      });
    });
  }

  function populateFilters(tasks) {
    const pillarFilter = byId("managementPillarFilter");
    const supervisorFilter = byId("managementSupervisorFilter");

    const pillars = [...new Set(tasks.map(t => t.pillar).filter(Boolean))].sort();
    const supervisors = [...new Map(
      tasks
        .filter(t => t.supervisor_id)
        .map(t => [String(t.supervisor_id), { id: t.supervisor_id, name: t.supervisor_name || "Non défini" }])
    ).values()];

    if (pillarFilter) {
      const current = pillarFilter.value || "";
      pillarFilter.innerHTML =
        `<option value="">Tous les piliers</option>` +
        pillars.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
      pillarFilter.value = pillars.includes(current) ? current : "";
    }

    if (supervisorFilter) {
      const current = supervisorFilter.value || "";
      supervisorFilter.innerHTML =
        `<option value="">Tous les superviseurs</option>` +
        supervisors.map(s => `<option value="${escapeHtml(String(s.id))}">${escapeHtml(s.name)}</option>`).join("");
      supervisorFilter.value = supervisors.some(s => String(s.id) === String(current)) ? current : "";
    }
  }

  function initHeader() {
    const currentUser = getCurrentUser();
    const select = byId("currentUserSelect");
    const label = byId("currentUserLabel");
    const logoutBtn = byId("logoutBtn");
    const sb = getSb();

    if (select && currentUser) {
      select.innerHTML = `<option>${escapeHtml(getUserDisplayName(currentUser))}</option>`;
      select.disabled = true;
    }

    if (label && currentUser) {
      label.innerHTML = `
        <strong>${escapeHtml(getUserDisplayName(currentUser))}</strong><br>
        <span class="muted">${escapeHtml(getUserRole(currentUser))}</span>
      `;
    }

    if (logoutBtn && sb && !logoutBtn.dataset.boundClick) {
      logoutBtn.addEventListener("click", async () => {
        await sb.auth.signOut();
        window.location.replace("login.html");
      });
      logoutBtn.dataset.boundClick = "true";
    }
  }

  async function bootstrap() {
    clearMessage();

    await Services.waitForSupabaseClient();
    const hasSession = await Services.requireSession();
    if (!hasSession) return;

    await Services.loadCurrentUser();
    await Services.loadReferenceData();

    const currentUser = getCurrentUser();
    const role = getUserRole(currentUser);

    if (!["admin", "supervisor"].includes(role)) {
      showMessage("Accès réservé au management, aux superviseurs ou aux administrateurs.", "error");
      return;
    }

    initHeader();
    await loadManagementSideData();
    populateFilters(getTasksWithComputedStatus());
    bindEvents();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await bootstrap();
    } catch (error) {
        console.error(error);
        showMessage(`Une erreur empêche le chargement du dashboard management : ${error.message || error}`, "error");
    }
  });
})();
