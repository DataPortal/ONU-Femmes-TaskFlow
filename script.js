const AppState = {
  pillars: [],
  users: [],
  tasks: [],
  currentUser: null
};

function getSb() {
  return window.sb || null;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await waitForSupabaseClient();
    await bootstrapApp();
  } catch (error) {
    console.error("Erreur au démarrage :", error);
    showGlobalError(`Une erreur empêche le chargement : ${error.message || error}`);
  }
});

async function waitForSupabaseClient(maxWaitMs = 5000) {
  const start = Date.now();
  while (!window.sb) {
    if (Date.now() - start > maxWaitMs) {
      throw new Error("Client Supabase indisponible.");
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function bootstrapApp() {
  const sb = getSb();
  if (!sb) throw new Error("Client Supabase indisponible.");

  const page = document.body.dataset.page || "";

  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError) {
    throw new Error(`Erreur session: ${sessionError.message}`);
  }

  if (!sessionData?.session) {
    window.location.replace("login.html");
    return;
  }

  await loadCurrentUser();
  await loadReferenceData();

  initUserHeader();
  initLogout();
  initGlobalActions();
  initTaskCreation();
  initPillarCreation();
  initRegisterPage();
  initExportAndPrint();
  applyRoleBasedUI();

  if (page === "dashboard") renderDashboardPage();
  if (page === "my-tasks") renderMyTasksPage();
  if (page === "my-team") renderMyTeamPage();
  if (page === "register") renderRegisterPage();
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
  AppState.users = (usersRes.data || []).map(u => ({
    ...u,
    name: u.full_name,
    user_type: u.role,
    pillar: getPillarNameByIdFromArray(u.pillar_id, AppState.pillars)
  }));

  const tasksViewRes = await sb.from("tasks_enriched").select("*").order("id", { ascending: true });

  if (!tasksViewRes.error) {
    AppState.tasks = (tasksViewRes.data || []).map(t => ({
      id: t.id,
      title: t.title,
      pillar_id: t.pillar_id,
      pillar: t.pillar_name || "",
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
    }));
    return;
  }

  const tasksRes = await sb.from("tasks").select("*").order("id", { ascending: true });
  if (tasksRes.error) throw new Error(`Lecture tasks impossible: ${tasksRes.error.message}`);

  AppState.tasks = (tasksRes.data || []).map(t => {
    const assigned = AppState.users.find(u => u.id === t.assigned_to_id);
    const supervisor = assigned ? AppState.users.find(u => u.id === assigned.supervisor_id) : null;
    const pillar = AppState.pillars.find(p => p.id === t.pillar_id);

    return {
      id: t.id,
      title: t.title,
      pillar_id: t.pillar_id,
      pillar: pillar ? pillar.name : "",
      assigned_to_id: t.assigned_to_id,
      assigned_to_name: assigned ? assigned.name : "Non défini",
      assigned
