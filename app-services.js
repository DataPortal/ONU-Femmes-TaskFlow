(function () {
  const Core = window.AppCore;

  const {
    AppState,
    getPillarNameByIdFromArray,
    getSb,
    hydrateTaskStatus,
    normalizeStatusToDatabase
  } = Core;

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

    AppState.currentUser = profile;
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

    AppState.users = (usersRes.data || []).map(user => ({
      ...user,
      name: user.full_name,
      user_type: user.role,
      pillar: getPillarNameByIdFromArray(user.pillar_id, AppState.pillars)
    }));

    AppState.mainActivities = (activitiesRes.data || []).map(activity => ({
      ...activity,
      pillar_name: getPillarNameByIdFromArray(activity.pillar_id, AppState.pillars)
    }));

    const tasksViewRes = await sb
      .from("tasks_enriched")
      .select("*")
      .order("id", { ascending: true });

    if (!tasksViewRes.error) {
      AppState.tasks = (tasksViewRes.data || [])
        .map(task => ({
          id: task.id,
          title: task.title,

          pillar_id: task.pillar_id,
          pillar: task.pillar_name || "",

          activity_id: task.activity_id || null,
          activity_name: task.activity_name || "",

          assigned_to_id: task.assigned_to_id,
          assigned_to_name: task.assigned_to_name || "Non défini",
          assigned_to_role: task.assigned_to_role || "",

          supervisor_id: task.supervisor_id,
          supervisor_name: task.supervisor_name || "Non défini",
          supervisor_role: task.supervisor_role || "",

          priority: task.priority,
          status: normalizeStatusToDatabase(task.status),

          progress_score: task.progress_score,
          progress: task.progress,
          staff_comment: task.staff_comment || "",

          supervisor_score: task.supervisor_score,
          supervisor_progress: task.supervisor_progress,
          supervisor_status: task.supervisor_status,
          supervisor_comment: task.supervisor_comment || "",

          due_date: task.due_date,
          description: task.description || "",
          created_by: task.created_by,
          created_at: task.created_at
        }))
        .map(hydrateTaskStatus);

      return;
    }

    const tasksRes = await sb.from("tasks").select("*").order("id", { ascending: true });

    if (tasksRes.error) {
      throw new Error(`Lecture tasks impossible: ${tasksRes.error.message}`);
    }

    AppState.tasks = (tasksRes.data || [])
      .map(task => {
        const assigned = AppState.users.find(user =>
          String(user.id) === String(task.assigned_to_id)
        );

        const supervisor = assigned
          ? AppState.users.find(user => String(user.id) === String(assigned.supervisor_id))
          : null;

        const pillar = AppState.pillars.find(p =>
          String(p.id) === String(task.pillar_id)
        );

        const activity = AppState.mainActivities.find(a =>
          String(a.id) === String(task.activity_id)
        );

        return {
          id: task.id,
          title: task.title,

          pillar_id: task.pillar_id,
          pillar: pillar ? pillar.name : "",

          activity_id: task.activity_id || null,
          activity_name: activity ? activity.name : "",

          assigned_to_id: task.assigned_to_id,
          assigned_to_name: assigned ? assigned.name : "Non défini",
          assigned_to_role: assigned ? assigned.user_type : "",

          supervisor_id: supervisor ? supervisor.id : null,
          supervisor_name: supervisor ? supervisor.name : "Non défini",
          supervisor_role: supervisor ? supervisor.user_type : "",

          priority: task.priority,
          status: normalizeStatusToDatabase(task.status),

          progress_score: task.progress_score,
          progress: task.progress,
          staff_comment: task.staff_comment || "",

          supervisor_score: task.supervisor_score,
          supervisor_progress: task.supervisor_progress,
          supervisor_status: task.supervisor_status,
          supervisor_comment: task.supervisor_comment || "",

          due_date: task.due_date,
          description: task.description || "",
          created_by: task.created_by,
          created_at: task.created_at
        };
      })
      .map(hydrateTaskStatus);
  }

  async function reloadAndRerender() {
    await loadReferenceData();
    window.AppUI.renderCurrentPage();
  }

  async function createTaskWithFallbackStatus(payload) {
    const sb = getSb();

    const safePayload = {
      ...payload,
      status: normalizeStatusToDatabase(payload.status)
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
      status: normalizeStatusToDatabase(payload.status)
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
