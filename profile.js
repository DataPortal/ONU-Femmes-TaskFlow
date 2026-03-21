window.addEventListener("DOMContentLoaded", async function () {
  const sb = await waitForClient();

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

  function showMessage(text, type = "info") {
    let className = "info-box";
    if (type === "error") className = "error-box";
    if (type === "success") className = "success-box";
    message.innerHTML = `<div class="${className}">${text}</div>`;
  }

  if (!sb) {
    showMessage("Client Supabase introuvable.", "error");
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
    showMessage("Profil introuvable.", "error");
    return;
  }

  const [pillarsRes, supervisorsRes] = await Promise.all([
    sb.from("pillars").select("id, name"),
    sb.from("profiles").select("id, full_name")
  ]);

  const pillars = pillarsRes.data || [];
  const supervisors = supervisorsRes.data || [];

  const pillar = pillars.find(p => String(p.id) === String(profile.pillar_id));
  const supervisor = supervisors.find(s => String(s.id) === String(profile.supervisor_id));

  fullName.value = profile.full_name || "";
  email.value = profile.email || "";
  office.value = profile.office || "";
  pillarDisplay.value = pillar ? pillar.name : "";
  supervisorDisplay.value = supervisor ? supervisor.full_name : "";

  saveProfileBtn.addEventListener("click", async function () {
    const vFullName = fullName.value.trim();
    const vOffice = office.value.trim();

    if (!vFullName) {
      showMessage("Le nom complet est obligatoire.", "error");
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
      showMessage(`Erreur mise à jour profil : ${error.message}`, "error");
      return;
    }

    showMessage("Profil mis à jour avec succès.", "success");
  });

  changePasswordBtn.addEventListener("click", async function () {
    const p1 = newPassword.value;
    const p2 = confirmNewPassword.value;

    if (!p1 || !p2) {
      showMessage("Veuillez renseigner les deux champs mot de passe.", "error");
      return;
    }

    if (p1 !== p2) {
      showMessage("Les mots de passe ne correspondent pas.", "error");
      return;
    }

    if (p1.length < 8) {
      showMessage("Le mot de passe doit contenir au moins 8 caractères.", "error");
      return;
    }

    const { error } = await sb.auth.updateUser({
      password: p1
    });

    if (error) {
      showMessage(`Erreur changement mot de passe : ${error.message}`, "error");
      return;
    }

    newPassword.value = "";
    confirmNewPassword.value = "";
    showMessage("Mot de passe modifié avec succès.", "success");
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      await sb.auth.signOut();
      window.location.replace("login.html");
    });
  }
});

async function waitForClient(maxWaitMs = 8000) {
  const start = Date.now();
  while (!window.sb) {
    if (Date.now() - start > maxWaitMs) return null;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return window.sb;
}
