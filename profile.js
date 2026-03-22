window.addEventListener("DOMContentLoaded", async function () {
  const authUI = window.AuthUI;
  const sb = await authUI?.waitForClient();

  const message = document.getElementById("profileMessage");
  const saveProfileBtn = document.getElementById("saveProfileBtn");
  const changePasswordBtn = document.getElementById("changePasswordBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  const fullName = document.getElementById("profileFullName");
  const email = document.getElementById("profileEmail");
  const office = document.getElementById("profileOffice");
  const pillarDisplay = document.getElementById("profilePillarDisplay");
  const supervisorDisplay = document.getElementById("profileSupervisorDisplay");
  const newPassword = document.getElementById("newPassword");
  const confirmNewPassword = document.getElementById("confirmNewPassword");

  if (!authUI || !sb) {
    authUI?.showMessage(message, "Client Supabase introuvable.", "error");
    return;
  }

  const {
    data: { session }
  } = await sb.auth.getSession();

  if (!session) {
    window.location.replace("login.html");
    return;
  }

  const {
    data: { user }
  } = await sb.auth.getUser();

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("id, full_name, email, office, pillar_id, supervisor_id, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    authUI.showMessage(message, "Profil introuvable.", "error");
    return;
  }

  const [pillarsRes, supervisorsRes] = await Promise.all([
    sb.from("pillars").select("id, name"),
    sb.from("profiles").select("id, full_name")
  ]);

  const pillars = pillarsRes.data || [];
  const supervisors = supervisorsRes.data || [];

  const pillar = pillars.find(function (item) {
    return String(item.id) === String(profile.pillar_id);
  });
  const supervisor = supervisors.find(function (item) {
    return String(item.id) === String(profile.supervisor_id);
  });

  fullName.value = profile.full_name || "";
  email.value = profile.email || "";
  office.value = profile.office || "";
  pillarDisplay.value = pillar ? pillar.name : "";
  supervisorDisplay.value = supervisor ? supervisor.full_name : "";

  saveProfileBtn?.addEventListener("click", async function () {
    const vFullName = fullName.value.trim();
    const vOffice = office.value.trim();

    if (!vFullName) {
      authUI.showMessage(message, "Le nom complet est obligatoire.", "error");
      return;
    }

    const { error } = await sb
      .from("profiles")
      .update({
        full_name: vFullName,
        office: vOffice
      })
      .eq("id", user.id);

    if (error) {
      authUI.showMessage(message, `Erreur mise à jour profil : ${error.message}`, "error");
      return;
    }

    authUI.showMessage(message, "Profil mis à jour avec succès.", "success");
  });

  changePasswordBtn?.addEventListener("click", async function () {
    const passwordError = authUI.validatePasswordPair(newPassword.value, confirmNewPassword.value);

    if (passwordError) {
      authUI.showMessage(message, passwordError, "error");
      return;
    }

    const { error } = await sb.auth.updateUser({
      password: newPassword.value
    });

    if (error) {
      authUI.showMessage(message, `Erreur changement mot de passe : ${error.message}`, "error");
      return;
    }

    newPassword.value = "";
    confirmNewPassword.value = "";
    authUI.showMessage(message, "Mot de passe modifié avec succès.", "success");
  });

  logoutBtn?.addEventListener("click", async function () {
    await sb.auth.signOut();
    window.location.replace("login.html");
  });
});
