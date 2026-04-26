(function () {
  const Core = window.AppCore || {};

  const {
    AppState,
    getPillarNameByIdFromArray,
    getSb,
    hydrateTaskStatus,
    normalizeStatusToDatabase
  } = Core;

  if (!AppState || typeof getSb !== "function") {
    console.error("AppCore est incomplet ou indisponible.");
    window.AppServices = {
      waitForSupabaseClient: async () => {
        throw new Error("AppCore indisponible.");
      },
      requireSession: async () => false,
      loadCurrentUser: async () => {
        throw new Error("AppCore indisponible.");
      },
      loadReferenceData: async () => {
        throw new Error("AppCore indisponible.");
      },
      reloadAndRerender: async () => {
        throw new Error("AppCore indisponible.");
      },
      createTaskWithFallbackStatus: async () => {
        throw new Error("AppCore indisponible.");
      },
      updateTaskWithFallbackStatus: async () => {
        throw new Error("AppCore indisponible.");
      },
      loadTaskDocuments: async () => {
        throw new Error("AppCore indisponible.");
      },
      countTaskDocuments: async () => {
        throw new Error("AppCore indisponible.");
      },
      uploadTaskDocuments: async () => {
        throw new Error("AppCore indisponible.");
      },
      replaceTaskDocument: async () => {
        throw new Error("AppCore indisponible.");
      },
      getTaskDocumentSignedUrl: async () => {
        throw new Error("AppCore indisponible.");
      },
      deleteTaskDocument: async () => {
        throw new Error("AppCore indisponible.");
      },
      deleteTaskAndLinkedDocuments: async () => {
        throw new Error("AppCore indisponible.");
      },
      logTaskActivity: async () => {
        throw new Error("AppCore indisponible.");
      },
      loadTaskActivityLogs: async () => {
        throw new Error("AppCore indisponible.");
      }
    };
    return;
  }

  function normalizeRole(value) {
    const role = String(value || "staff").trim().toLowerCase();
    if (role === "admin") return "admin";
    if (role === "supervisor") return "supervisor";
    return "staff";
  }

  function normalizeProfileRecord(profile, pillars = []) {
    const safeProfile = profile || {};
    return {
      ...safeProfile,
      full_name: safeProfile.full_name || "",
      name: safeProfile.full_name || safeProfile.name || "Utilisateur",
      email: safeProfile.email || "",
      role: normalizeRole(safeProfile.role || safeProfile.user_type),
      user_type: normalizeRole(safeProfile.role || safeProfile.user_type),
      pillar_id: safeProfile.pillar_id ?? null,
      supervisor_id: safeProfile.supervisor_id ?? null,
      office: safeProfile.office || "",
      is_active: safeProfile.is_active !== false,
      pillar: getPillarNameByIdFromArray
        ? getPillarNameByIdFromArray(safeProfile.pillar_id, pillars)
        : ""
    };
  }

  function normalizeActivityRecord(activity, pillars = []) {
    const safeActivity = activity || {};
    return {
      ...safeActivity,
      pillar_name: getPillarNameByIdFromArray
        ? getPillarNameByIdFromArray(safeActivity.pillar_id, pillars)
        : ""
    };
  }

  function normalizeTaskRecordFromEnriched(task) {
    const safeTask = task || {};

    return {
      id: safeTask.id,
      title: safeTask.title || "",

      pillar_id: safeTask.pillar_id ?? null,
      pillar: safeTask.pillar_name || "",

      activity_id: safeTask.activity_id ?? null,
      activity_name: safeTask.activity_name || "",

      assigned_to_id: safeTask.assigned_to_id ?? null,
      assigned_to_name: safeTask.assigned_to_name || "Non défini",
      assigned_to_role: normalizeRole(safeTask.assigned_to_role),

      supervisor_id: safeTask.supervisor_id ?? null,
      supervisor_name: safeTask.supervisor_name || "Non défini",
      supervisor_role: normalizeRole(safeTask.supervisor_role),

      priority: safeTask.priority || "Moyenne",
      status: normalizeStatusToDatabase
        ? normalizeStatusToDatabase(safeTask.status)
        : (safeTask.status || "En bonne voie"),

      progress_score: Number(safeTask.progress_score ?? 0),
      progress: Number(safeTask.progress ?? 0),
      staff_comment: safeTask.staff_comment || "",

      supervisor_score: Number(safeTask.supervisor_score ?? 0),
      supervisor_progress: Number(safeTask.supervisor_progress ?? 0),
      supervisor_status: safeTask.supervisor_status || "Non évalué",
      supervisor_comment: safeTask.supervisor_comment || "",

      due_date: safeTask.due_date || null,
      description: safeTask.description || "",
      created_by: safeTask.created_by ?? null,
      created_at: safeTask.created_at || null
    };
  }

  function normalizeTaskRecordFromRaw(task, users, pillars, activities) {
    const safeTask = task || {};

    const assigned = users.find(user =>
      String(user.id) === String(safeTask.assigned_to_id)
    );

    const supervisor = assigned
      ? users.find(user => String(user.id) === String(assigned.supervisor_id))
      : null;

    const pillar = pillars.find(p =>
      String(p.id) === String(safeTask.pillar_id)
    );

    const activity = activities.find(a =>
      String(a.id) === String(safeTask.activity_id)
    );

    return {
      id: safeTask.id,
      title: safeTask.title || "",

      pillar_id: safeTask.pillar_id ?? null,
      pillar: pillar ? pillar.name : "",

      activity_id: safeTask.activity_id ?? null,
      activity_name: activity ? activity.name : "",

      assigned_to_id: safeTask.assigned_to_id ?? null,
      assigned_to_name: assigned ? assigned.name : "Non défini",
      assigned_to_role: assigned ? assigned.user_type : "staff",

      supervisor_id: supervisor ? supervisor.id : null,
      supervisor_name: supervisor ? supervisor.name : "Non défini",
      supervisor_role: supervisor ? supervisor.user_type : "staff",

      priority: safeTask.priority || "Moyenne",
      status: normalizeStatusToDatabase
        ? normalizeStatusToDatabase(safeTask.status)
        : (safeTask.status || "En bonne voie"),

      progress_score: Number(safeTask.progress_score ?? 0),
      progress: Number(safeTask.progress ?? 0),
      staff_comment: safeTask.staff_comment || "",

      supervisor_score: Number(safeTask.supervisor_score ?? 0),
      supervisor_progress: Number(safeTask.supervisor_progress ?? 0),
      supervisor_status: safe
