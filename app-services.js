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
      supervisor_status: safeTask.supervisor_status || "Non évalué",
      supervisor_comment: safeTask.supervisor_comment || "",

      due_date: safeTask.due_date || null,
      description: safeTask.description || "",
      created_by: safeTask.created_by ?? null,
      created_at: safeTask.created_at || null
    };
  }

  async function waitForSupabaseClient(maxWaitMs = 5000) {
    const start = Date.now();

    while (!window.sb) {
      if (Date.now() - start > maxWaitMs) {
        throw new Error("Client Supabase indisponible.");
      }

      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  async function requireSession() {
    const sb = getSb();

    if (!sb) {
      throw new Error("Client Supabase indisponible.");
    }

    const { data: sessionData, error: sessionError } = await sb.auth.getSession();

    if (sessionError) {
      throw new Error(`Erreur session: ${sessionError.message}`);
    }

    if (!sessionData?.session) {
      window.location.replace("login.html");
      return false;
    }

    return true;
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

    AppState.currentUser = normalizeProfileRecord(profile, AppState.pillars || []);
  }

  async function loadReferenceData() {
    const sb = getSb();

    const [pillarsRes, usersRes, activitiesRes] = await Promise.all([
      sb.from("pillars").select("*").order("name", { ascending: true }),

      sb.from("profiles")
        .select("id, full_name, email, role, pillar_id, supervisor_id, office, is_active")
        .eq("is_active", true)
        .order("full_name", { ascending: true }),

      sb.from("main_activities")
        .select("id, pillar_id, name, description, is_active, created_by, created_at, updated_at")
        .eq("is_active", true)
        .order("name", { ascending: true })
    ]);

    if (pillarsRes.error) {
      throw new Error(`Lecture pillars impossible: ${pillarsRes.error.message}`);
    }

    if (usersRes.error) {
      throw new Error(`Lecture profiles impossible: ${usersRes.error.message}`);
    }

    if (activitiesRes.error) {
      throw new Error(`Lecture main_activities impossible: ${activitiesRes.error.message}`);
    }

    AppState.pillars = pillarsRes.data || [];

    AppState.users = (usersRes.data || []).map(user =>
      normalizeProfileRecord(user, AppState.pillars)
    );

    AppState.mainActivities = (activitiesRes.data || []).map(activity =>
      normalizeActivityRecord(activity, AppState.pillars)
    );

    if (AppState.currentUser?.id) {
      const refreshedCurrentUser = AppState.users.find(user =>
        String(user.id) === String(AppState.currentUser.id)
      );

      if (refreshedCurrentUser) {
        AppState.currentUser = refreshedCurrentUser;
      }
    }

    const tasksViewRes = await sb
      .from("tasks_enriched")
      .select("*")
      .order("id", { ascending: true });

    if (!tasksViewRes.error && Array.isArray(tasksViewRes.data)) {
      AppState.tasks = tasksViewRes.data
        .map(normalizeTaskRecordFromEnriched)
        .map(task => (hydrateTaskStatus ? hydrateTaskStatus(task) : task));

      return;
    }

    const tasksRes = await sb
      .from("tasks")
      .select("*")
      .order("id", { ascending: true });

    if (tasksRes.error) {
      const enrichedMessage = tasksViewRes.error?.message
        ? ` | tasks_enriched: ${tasksViewRes.error.message}`
        : "";
      throw new Error(`Lecture tasks impossible: ${tasksRes.error.message}${enrichedMessage}`);
    }

    AppState.tasks = (tasksRes.data || [])
      .map(task =>
        normalizeTaskRecordFromRaw(
          task,
          AppState.users,
          AppState.pillars,
          AppState.mainActivities
        )
      )
      .map(task => (hydrateTaskStatus ? hydrateTaskStatus(task) : task));
  }

  async function reloadAndRerender() {
    await loadReferenceData();

    if (window.AppUI?.renderCurrentPage) {
      window.AppUI.renderCurrentPage();
    }
  }

  async function createTaskWithFallbackStatus(payload) {
    const sb = getSb();

    const safePayload = {
      ...payload,
      status: normalizeStatusToDatabase
        ? normalizeStatusToDatabase(payload.status)
        : (payload.status || "En bonne voie")
    };

    const { error } = await sb.from("tasks").insert([safePayload]);

    if (error) {
      throw error;
    }
  }

  async function updateTaskWithFallbackStatus(taskId, payload) {
    const sb = getSb();

    const safePayload = {
      ...payload,
      status: normalizeStatusToDatabase
        ? normalizeStatusToDatabase(payload.status)
        : (payload.status || "En bonne voie")
    };

    const { error } = await sb
      .from("tasks")
      .update(safePayload)
      .eq("id", taskId);

    if (error) {
      throw error;
    }
  }

  window.AppServices = {
    createTaskWithFallbackStatus,
    loadCurrentUser,
    loadReferenceData,
    reloadAndRerender,
    requireSession,
    updateTaskWithFallbackStatus,
    waitForSupabaseClient
  };
})();
