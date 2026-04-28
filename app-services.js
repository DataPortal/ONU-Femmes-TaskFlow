(function () {
  const Core = window.AppCore || {};

  const {
    AppState,
    getPillarNameByIdFromArray,
    getSb,
    hydrateTaskStatus,
    normalizeRole,
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

  function normalizeProfileRecord(profile, pillars = []) {
    const safeProfile = profile || {};

    return {
      ...safeProfile,
      id: safeProfile.id || null,
      full_name: safeProfile.full_name || "",
      name: safeProfile.full_name || safeProfile.name || "Utilisateur",
      email: safeProfile.email || "",
      role: normalizeRole
        ? normalizeRole(safeProfile.role || safeProfile.user_type)
        : String(safeProfile.role || safeProfile.user_type || "staff").toLowerCase(),
      user_type: normalizeRole
        ? normalizeRole(safeProfile.role || safeProfile.user_type)
        : String(safeProfile.role || safeProfile.user_type || "staff").toLowerCase(),
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
      pillar: safeTask.pillar_name || safeTask.pillar || "",

      activity_id: safeTask.activity_id ?? null,
      activity_name: safeTask.activity_name || "",

      assigned_to_id: safeTask.assigned_to_id ?? null,
      assigned_to_name: safeTask.assigned_to_name || "Non défini",
      assigned_to_role: normalizeRole
        ? normalizeRole(safeTask.assigned_to_role)
        : String(safeTask.assigned_to_role || "staff").toLowerCase(),

      supervisor_id: safeTask.supervisor_id ?? null,
      supervisor_name: safeTask.supervisor_name || "Non défini",
      supervisor_role: normalizeRole
        ? normalizeRole(safeTask.supervisor_role)
        : String(safeTask.supervisor_role || "staff").toLowerCase(),

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

    const assigned = (users || []).find(user =>
      String(user.id) === String(safeTask.assigned_to_id)
    );

    const supervisor = assigned
      ? (users || []).find(user => String(user.id) === String(assigned.supervisor_id))
      : null;

    const pillar = (pillars || []).find(item =>
      String(item.id) === String(safeTask.pillar_id)
    );

    const activity = (activities || []).find(item =>
      String(item.id) === String(safeTask.activity_id)
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
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (!tasksViewRes.error && Array.isArray(tasksViewRes.data)) {
      AppState.tasks = tasksViewRes.data
        .map(normalizeTaskRecordFromEnriched)
        .map(task => (hydrateTaskStatus ? hydrateTaskStatus(task) : task));
      return;
    }

    const tasksRes = await sb
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

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

    const { data, error } = await sb
      .from("tasks")
      .insert([safePayload])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
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

  async function loadTaskDocuments(taskId) {
    const sb = getSb();

    const { data, error } = await sb
      .from("task_documents")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async function countTaskDocuments(taskId) {
    const sb = getSb();

    const { count, error } = await sb
      .from("task_documents")
      .select("*", { count: "exact", head: true })
      .eq("task_id", taskId);

    if (error) throw error;
    return count || 0;
  }

  async function uploadTaskDocuments(taskId, files, currentUserId) {
    const sb = getSb();

    if (!files || !files.length) {
      throw new Error("Aucun fichier sélectionné.");
    }

    const existingCount = await countTaskDocuments(taskId);
    const remainingSlots = 5 - existingCount;

    if (remainingSlots <= 0) {
      throw new Error("Cette tâche a déjà atteint la limite de 5 fichiers.");
    }

    if (files.length > remainingSlots) {
      throw new Error(`Vous pouvez encore ajouter ${remainingSlots} fichier(s) maximum pour cette tâche.`);
    }

    const uploadedRows = [];

    for (const file of files) {
      const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${file.name.replace(/\s+/g, "_")}`;
      const filePath = `task-${taskId}/${safeName}`;

      const { error: uploadError } = await sb.storage
        .from("task-documents")
        .upload(filePath, file, { upsert: false });

      if (uploadError) {
        throw new Error(`Storage upload refusé : ${uploadError.message}`);
      }

      const { data, error: insertError } = await sb
        .from("task_documents")
        .insert([{
          task_id: taskId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by: currentUserId
        }])
        .select()
        .single();

      if (insertError) {
        await sb.storage.from("task-documents").remove([filePath]).catch(() => {});
        throw new Error(`Enregistrement du document refusé : ${insertError.message}`);
      }

      uploadedRows.push(data);
    }

    return uploadedRows;
  }

  async function replaceTaskDocument(documentId, newFile, currentUserId) {
    const sb = getSb();

    if (!newFile) {
      throw new Error("Aucun nouveau fichier sélectionné.");
    }

    const { data: existingDoc, error: readError } = await sb
      .from("task_documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (readError || !existingDoc) {
      throw new Error("Document introuvable.");
    }

    const newSafeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${newFile.name.replace(/\s+/g, "_")}`;
    const newFilePath = `task-${existingDoc.task_id}/${newSafeName}`;

    const { error: uploadError } = await sb.storage
      .from("task-documents")
      .upload(newFilePath, newFile, { upsert: false });

    if (uploadError) {
      throw new Error(`Storage upload refusé : ${uploadError.message}`);
    }

    const { data: updatedDoc, error: updateError } = await sb
      .from("task_documents")
      .update({
        file_name: newFile.name,
        file_path: newFilePath,
        file_size: newFile.size,
        mime_type: newFile.type,
        uploaded_by: currentUserId
      })
      .eq("id", documentId)
      .select()
      .single();

    if (updateError) {
      await sb.storage.from("task-documents").remove([newFilePath]).catch(() => {});
      throw new Error(`Remplacement refusé : ${updateError.message}`);
    }

    await sb.storage.from("task-documents").remove([existingDoc.file_path]).catch(() => {});

    return {
      oldDocument: existingDoc,
      newDocument: updatedDoc
    };
  }

  async function getTaskDocumentSignedUrl(filePath) {
    const sb = getSb();

    const { data, error } = await sb.storage
      .from("task-documents")
      .createSignedUrl(filePath, 3600);

    if (error) throw error;
    return data?.signedUrl || "";
  }

  async function deleteTaskDocument(documentId, filePath) {
    const sb = getSb();

    const { error: dbError } = await sb
      .from("task_documents")
      .delete()
      .eq("id", documentId);

    if (dbError) throw dbError;

    const { error: storageError } = await sb.storage
      .from("task-documents")
      .remove([filePath]);

    if (storageError) throw storageError;
  }

  async function deleteTaskAndLinkedDocuments(taskId) {
    const sb = getSb();
    if (!sb) throw new Error("Client Supabase introuvable.");

    const safeTaskId = Number(taskId);
    if (!safeTaskId) {
      throw new Error("ID de tâche invalide.");
    }

    const { data: docs, error: docsError } = await sb
      .from("task_documents")
      .select("id, file_path")
      .eq("task_id", safeTaskId);

    if (docsError) {
      throw new Error(`Lecture des documents impossible : ${docsError.message}`);
    }

    const filePaths = (docs || [])
      .map(doc => doc.file_path)
      .filter(Boolean);

    if (filePaths.length) {
      const { error: storageError } = await sb
        .storage
        .from("task-documents")
        .remove(filePaths);

      if (storageError) {
        throw new Error(`Suppression des fichiers impossible : ${storageError.message}`);
      }
    }

    const { error: deleteDocsError } = await sb
      .from("task_documents")
      .delete()
      .eq("task_id", safeTaskId);

    if (deleteDocsError) {
      throw new Error(`Suppression des documents liés impossible : ${deleteDocsError.message}`);
    }

    const { error: deleteLogsError } = await sb
      .from("task_activity_logs")
      .delete()
      .eq("task_id", safeTaskId);

    if (deleteLogsError) {
      throw new Error(`Suppression de l’historique impossible : ${deleteLogsError.message}`);
    }

    const { error: deleteTaskError } = await sb
      .from("tasks")
      .delete()
      .eq("id", safeTaskId);

    if (deleteTaskError) {
      throw new Error(`Suppression de la tâche impossible : ${deleteTaskError.message}`);
    }

    return true;
  }

  async function logTaskActivity({
    taskId,
    actionType,
    actionLabel,
    actorId,
    actorName,
    oldValue = null,
    newValue = null
  }) {
    const sb = getSb();

    const { error } = await sb
      .from("task_activity_logs")
      .insert([{
        task_id: taskId,
        action_type: actionType,
        action_label: actionLabel,
        actor_id: actorId,
        actor_name: actorName,
        old_value: oldValue,
        new_value: newValue
      }]);

    if (error) throw error;
  }

  async function loadTaskActivityLogs(taskId) {
    const sb = getSb();

    const { data, error } = await sb
      .from("task_activity_logs")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }
  async function getVisibleTeamMembers(currentUserProfile) {
  if (!currentUserProfile) {
    throw new Error("Profil utilisateur introuvable.");
  }

  const role = currentUserProfile.role;
  const pillar = currentUserProfile.pillar;

  let query = supabaseClient
    .from("profiles")
    .select(`
      id,
      full_name,
      email,
      role,
      office,
      pillar,
      supervisor,
      created_at
    `)
    .order("full_name", { ascending: true });

  if (role === "admin" || role === "management") {
    // Admin et Management voient tous les membres
    return await query;
  }

  if (role === "supervisor" || role === "staff") {
    // Supervisor et Staff voient uniquement les membres de leur pilier
    if (!pillar) {
      throw new Error("Aucun pilier n’est associé à votre profil.");
    }

    return await query.eq("pillar", pillar);
  }

  // Par défaut, aucun accès
  throw new Error("Vous n’avez pas les permissions nécessaires pour consulter cette page.");
}
  window.AppServices = {
    createTaskWithFallbackStatus,
    deleteTaskAndLinkedDocuments,
    deleteTaskDocument,
    getTaskDocumentSignedUrl,
    loadCurrentUser,
    loadReferenceData,
    loadTaskActivityLogs,
    loadTaskDocuments,
    logTaskActivity,
    reloadAndRerender,
    requireSession,
    countTaskDocuments,
    replaceTaskDocument,
    updateTaskWithFallbackStatus,
    uploadTaskDocuments,
    waitForSupabaseClient
  };
})();
