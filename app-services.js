(function () {
  const {
    AppState,
    extractPillarActivitiesFromDb,
    getPillarNameByIdFromArray,
    getSb,
    hydrateTaskStatus,
    isStatusConstraintError
  } = window.AppCore;

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
    if (!sb) throw new Error("Client Supabase indisponible.");

    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    if (sessionError) throw new Error(`Erreur session: ${sessionError.message}`);

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

    if (userError || !user) throw new Error("Utilisateur non connecté ou introuvable.");

    const { data: profile, error: profileError } = await sb
      .from("profiles")
      .select("id, full_name, email, role, pillar_id, supervisor_id, office, is_active")
      .eq("id", user.id)
      .single();

    if (profileError) throw new Error(`Lecture du profil impossible: ${profileError.message}`);
    if (!profile) throw new Error("Aucun profil trouvé dans profiles.");
    if (!profile.is_active) throw new Error("Compte désactivé.");

    AppState.currentUser = profile;
  }

  async function loadReferenceData() {
    const sb = getSb();

    const [pillarsRes, usersRes] = await Promise.all([
      sb.from("pillars").select("*").order("name", { ascending: true }),
      sb.from("profiles")
        .select("id, full_name, email, role, pillar_id, supervisor_id, office, is_active")
        .eq("is_active", true)
        .order("full_name", { ascending: true })
    ]);

    if (pillarsRes.error) throw new Error(`Lecture pillars impossible: ${pillarsRes.error.message}`);
    if (usersRes.error) throw new Error(`Lecture profiles impossible: ${usersRes.error.message}`);

    AppState.pillars = pillarsRes.data || [];
    AppState.pillarActivitiesById = extractPillarActivitiesFromDb(AppState.pillars);

    AppState.users = (usersRes.data || []).map(u => ({
      ...u,
      name: u.full_name,
      user_type: u.role,
      pillar: getPillarNameByIdFromArray(u.pillar_id, AppState.pillars)
    }));

    const tasksViewRes = await sb.from("tasks_enriched").select("*").order("id", { ascending: true });

    if (!tasksViewRes.error) {
      AppState.tasks = (tasksViewRes.data || [])
        .map(t => ({
          id: t.id,
          title: t.title,
          pillar_id: t.pillar_id,
          pillar: t.pillar_name || "",
          activity_name: t.activity_name || "",
          assigned_to_id: t.assigned_to_id,
          assigned_to_name: t.assigned_to_name || "Non défini",
          assigned_to_role: t.assigned_to_role || "",
          supervisor_id: t.supervisor_id,
          supervisor_name: t.supervisor_name || "Non défini",
          supervisor_role: t.supervisor_role || "",
          priority: t.priority,
          status: t.status,
          progress_score: t.progress_score,
          progress: t.progress,
          staff_comment: t.staff_comment || "",
          supervisor_score: t.supervisor_score,
          supervisor_progress: t.supervisor_progress,
          supervisor_status: t.supervisor_status,
          supervisor_comment: t.supervisor_comment || "",
          due_date: t.due_date,
          description: t.description || "",
          created_by: t.created_by,
          created_at: t.created_at
        }))
        .map(hydrateTaskStatus);

      return;
    }

    const tasksRes = await sb.from("tasks").select("*").order("id", { ascending: true });
    if (tasksRes.error) throw new Error(`Lecture tasks impossible: ${tasksRes.error.message}`);

    AppState.tasks = (tasksRes.data || [])
      .map(t => {
        const assigned = AppState.users.find(u => String(u.id) === String(t.assigned_to_id));
        const supervisor = assigned
          ? AppState.users.find(u => String(u.id) === String(assigned.supervisor_id))
          : null;
        const pillar = AppState.pillars.find(p => String(p.id) === String(t.pillar_id));

        return {
          id: t.id,
          title: t.title,
          pillar_id: t.pillar_id,
          pillar: pillar ? pillar.name : "",
          activity_name: t.activity_name || "",
          assigned_to_id: t.assigned_to_id,
          assigned_to_name: assigned ? assigned.name : "Non défini",
          assigned_to_role: assigned ? assigned.user_type : "",
          supervisor_id: supervisor ? supervisor.id : null,
          supervisor_name: supervisor ? supervisor.name : "Non défini",
          supervisor_role: supervisor ? supervisor.user_type : "",
          priority: t.priority,
          status: t.status,
          progress_score: t.progress_score,
          progress: t.progress,
          staff_comment: t.staff_comment || "",
          supervisor_score: t.supervisor_score,
          supervisor_progress: t.supervisor_progress,
          supervisor_status: t.supervisor_status,
          supervisor_comment: t.supervisor_comment || "",
          due_date: t.due_date,
          description: t.description || "",
          created_by: t.created_by,
          created_at: t.created_at
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
    const statusCandidates = window.AppCore.getStatusCandidates(payload.status);
    let insertError = null;

    for (const candidate of statusCandidates) {
      const attemptPayload = { ...payload, status: candidate };
      const { error } = await sb.from("tasks").insert([attemptPayload]);
      if (!error) {
        insertError = null;
        break;
      }

      insertError = error;
      if (!isStatusConstraintError(error)) break;
    }

    if (insertError) throw insertError;
  }

  async function updateTaskWithFallbackStatus(taskId, payload) {
    const sb = getSb();
    const statusCandidates = window.AppCore.getStatusCandidates(payload.status);
    let updateError = null;

    for (const candidate of statusCandidates) {
      const attemptPayload = { ...payload, status: candidate };
      const { error } = await sb.from("tasks").update(attemptPayload).eq("id", taskId);
      if (!error) {
        updateError = null;
        break;
      }

      updateError = error;
      if (!isStatusConstraintError(error)) break;
    }

    if (updateError) throw updateError;
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
