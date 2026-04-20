window.addEventListener("DOMContentLoaded", async () => {
  const authUI = window.AuthUI;
  const sb = await authUI?.waitForClient();

  const els = {
    message: document.getElementById("profileMessage"),
    saveProfileBtn: document.getElementById("saveProfileBtn"),
    changePasswordBtn: document.getElementById("changePasswordBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
    fullName: document.getElementById("profileFullName"),
    email: document.getElementById("profileEmail"),
    office: document.getElementById("profileOffice"),
    pillarDisplay: document.getElementById("profilePillarDisplay"),
    supervisorDisplay: document.getElementById("profileSupervisorDisplay"),
    newPassword: document.getElementById("newPassword"),
    confirmNewPassword: document.getElementById("confirmNewPassword")
  };

  function showMessage(text, type = "info") {
    if (!authUI?.showMessage || !els.message) return;
    authUI.showMessage(els.message, text, type);
  }

  function fillProfileForm(profile, pillarName = "", supervisorName = "") {
    if (els.fullName) els.fullName.value = profile.full_name || "";
    if (els.email) els.email.value = profile.email || "";
    if (els.office) els.office.value = profile.office || "";
    if (els.pillarDisplay) els.pillarDisplay.value = pillarName || "";
    if (els.supervisorDisplay) els.supervisorDisplay.value = supervisorName || "";
  }

  if (!authUI || !sb) {
    showMessage("Client Supabase introuvable.", "error");
    return;
  }

  try {
    const {
      data: { session },
      error: sessionError
    } = await sb.auth.getSession();

    if (sessionError) {
      showMessage(`Erreur de session : ${sessionError.message}`, "error");
      return;
    }

    if (!session) {
      window.location.replace("login.html");
      return;
    }

    const {
      data: { user },
      error: userError
    } = await sb.auth.getUser();

    if (userError || !user) {
      showMessage("Utilisateur introuvable ou non connecté.", "error");
      return;
    }

    const [profileRes, pillarsRes, supervisorsRes] = await Promise.all([
      sb
        .from("profiles")
        .select("id, full_name, email, office, pillar_id, supervisor_id, is_active")
        .eq("id", user.id)
        .single(),
      sb.from("pillars").select("id, name"),
      sb.from("profiles").select("id, full_name, is_active")
    ]);

    if (profileRes.error || !profileRes.data) {
      showMessage("Profil introuvable.", "error");
      return;
    }

    const profile = profileRes.data;

    if (profile.is_active === false) {
      showMessage("Votre compte est désactivé.", "error");
      return;
    }

    const pillars = pillarsRes.data || [];
    const supervisors = (supervisorsRes.data || []).filter(item => item.is_active !== false);

    const pillar = pillars.find(item => String(item.id) === String(profile.pillar_id));
    const supervisor = supervisors.find(item => String(item.id) === String(profile.supervisor_id));

    fillProfileForm(profile, pillar ? pillar.name : "", supervisor ? supervisor.full_name : "");

    els.saveProfileBtn?.addEventListener("click", async () => {
      const vFullName = String(els.fullName?.value || "").trim();
      const vOffice = String(els.office?.value || "").trim();

      if (!vFullName) {
        showMessage("Le nom complet est obligatoire.", "error");
        els.fullName?.focus();
        return;
      }

      authUI.setButtonLoading(els.saveProfileBtn, true, "Enregistrement...");

      try {
        const { error } = await sb
          .from("profiles")
          .update({
            full_name: vFullName,
            office: vOffice
          })
          .eq("id", user.id);

        if (error) {
          showMessage(`Erreur de mise à jour du profil : ${error.message}`, "error");
          return;
        }

        showMessage("Profil mis à jour avec succès.", "success");
      } catch (error) {
        showMessage(`Erreur inattendue : ${error.message || error}`, "error");
      } finally {
        authUI.setButtonLoading(els.saveProfileBtn, false);
      }
    });

    els.changePasswordBtn?.addEventListener("click", async () => {
      const password = els.newPassword?.value || "";
      const confirmPassword = els.confirmNewPassword?.value || "";

      const passwordError = authUI.validatePasswordPair(password, confirmPassword);

      if (passwordError) {
        showMessage(passwordError, "error");
        return;
      }

      authUI.setButtonLoading(els.changePasswordBtn, true, "Mise à jour...");

      try {
        const { error } = await sb.auth.updateUser({
          password
        });

        if (error) {
          showMessage(`Erreur lors du changement du mot de passe : ${error.message}`, "error");
          return;
        }

        if (els.newPassword) els.newPassword.value = "";
        if (els.confirmNewPassword) els.confirmNewPassword.value = "";

        showMessage("Mot de passe modifié avec succès.", "success");
      } catch (error) {
        showMessage(`Erreur inattendue : ${error.message || error}`, "error");
      } finally {
        authUI.setButtonLoading(els.changePasswordBtn, false);
      }
    });

    els.logoutBtn?.addEventListener("click", async () => {
      authUI.setButtonLoading(els.logoutBtn, true, "Déconnexion...");

      try {
        await sb.auth.signOut();
        window.location.replace("login.html");
      } catch (error) {
        showMessage(`Erreur lors de la déconnexion : ${error.message || error}`, "error");
        authUI.setButtonLoading(els.logoutBtn, false);
      }
    });
  } catch (error) {
    showMessage(`Une erreur empêche le chargement du profil : ${error.message || error}`, "error");
  }
});
