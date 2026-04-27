window.addEventListener("DOMContentLoaded", async function () {
  const authUI = window.AuthUI;
  const AppCore = window.AppCore;
  const AppServices = window.AppServices;
  const sb = window.sb;

  const pageMessage = document.getElementById("pageDebugMessage");
  const profileUpdateMessage = document.getElementById("profileUpdateMessage");
  const profilePasswordMessage = document.getElementById("profilePasswordMessage");

  function showMessage(target, text, type = "info") {
    if (authUI?.showMessage && target) {
      authUI.showMessage(target, text, type);
    } else {
      console[type === "error" ? "error" : "log"](text);
    }
  }

  function safeText(value, fallback = "—") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function getInitials(fullName) {
    const parts = String(fullName || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!parts.length) return "U";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();

    return (
      parts[0].charAt(0).toUpperCase() +
      parts[1].charAt(0).toUpperCase()
    );
  }

  function formatRole(role) {
    const safeRole = String(role || "").trim().toLowerCase();

    if (safeRole === "admin") return "Administrateur";
    if (safeRole === "supervisor") return "Superviseur";
    if (safeRole === "staff") return "Staff";
    if (safeRole === "management") return "Management";
    return safeRole || "Non défini";
  }

  async function loadProfilePage() {
    try {
      if (!AppServices || !AppCore || !sb) {
        throw new Error("Les modules de l’application ne sont pas disponibles.");
      }

      await AppServices.waitForSupabaseClient();

      const hasSession = await AppServices.requireSession();
      if (!hasSession) return;

      await AppServices.loadCurrentUser();
      await AppServices.loadReferenceData();

      if (window.AppUI?.initUserHeader) window.AppUI.initUserHeader();
      if (window.AppUI?.initLogout) window.AppUI.initLogout();

      const currentUser = AppCore.getCurrentUser?.();
      if (!currentUser) {
        throw new Error("Profil utilisateur introuvable.");
      }

      const supervisor = (AppCore.AppState?.users || []).find(
        user => String(user.id) === String(currentUser.supervisor_id)
      );

      const profileInitials = document.getElementById("profileInitials");
      const profileFullName = document.getElementById("profileFullName");
      const profileRoleLabel = document.getElementById("profileRoleLabel");
      const profileEmail = document.getElementById("profileEmail");
      const profileOffice = document.getElementById("profileOffice");
      const profilePillar = document.getElementById("profilePillar");
      const profileSupervisor = document.getElementById("profileSupervisor");
      const profileStatus = document.getElementById("profileStatus");
      const profileUserId = document.getElementById("profileUserId");

      const profileEditFullName = document.getElementById("profileEditFullName");
      const profileEditOffice = document.getElementById("profileEditOffice");
      const profileEditEmail = document.getElementById("profileEditEmail");

      if (profileInitials) {
        profileInitials.textContent = getInitials(currentUser.full_name || currentUser.name);
      }

      if (profileFullName) {
        profileFullName.textContent = safeText(currentUser.full_name || currentUser.name, "Utilisateur");
      }

      if (profileRoleLabel) {
        profileRoleLabel.textContent = formatRole(currentUser.role || currentUser.user_type);
      }

      if (profileEmail) {
        profileEmail.textContent = safeText(currentUser.email);
      }

      if (profileOffice) {
        profileOffice.textContent = safeText(currentUser.office);
      }

      if (profilePillar) {
        profilePillar.textContent = safeText(currentUser.pillar || currentUser.pillar_name || "Sans pilier");
      }

      if (profileSupervisor) {
        profileSupervisor.textContent = safeText(
          supervisor?.full_name || supervisor?.name || "Aucun superviseur"
        );
      }

      if (profileStatus) {
        profileStatus.textContent = currentUser.is_active === false ? "Inactif" : "Actif";
      }

      if (profileUserId) {
        profileUserId.textContent = safeText(currentUser.id);
      }

      if (profileEditFullName) {
        profileEditFullName.value = currentUser.full_name || currentUser.name || "";
      }

      if (profileEditOffice) {
        profileEditOffice.value = currentUser.office || "";
      }

      if (profileEditEmail) {
        profileEditEmail.value = currentUser.email || "";
      }

      showMessage(pageMessage, "Profil chargé avec succès.", "success");
    } catch (error) {
      console.error("Erreur chargement profil :", error);
      showMessage(pageMessage, `Une erreur empêche le chargement du profil : ${error.message || error}`, "error");
    }
  }

  async function updateProfile() {
    const currentUser = AppCore?.getCurrentUser?.();
    if (!currentUser || !sb) return;

    const fullName = String(document.getElementById("profileEditFullName")?.value || "").trim();
    const office = String(document.getElementById("profileEditOffice")?.value || "").trim();
    const email = String(document.getElementById("profileEditEmail")?.value || "").trim().toLowerCase();

    if (!fullName) {
      showMessage(profileUpdateMessage, "Veuillez renseigner votre nom complet.", "error");
      return;
    }

    try {
      const { error: profileError } = await sb
        .from("profiles")
        .update({
          full_name: fullName,
          office: office,
          email: email
        })
        .eq("id", currentUser.id);

      if (profileError) {
        throw new Error(profileError.message);
      }

      const authUserPayload = {
        data: {
          full_name: fullName,
          office: office
        }
      };

      if (email && email !== currentUser.email) {
        authUserPayload.email = email;
      }

      const { error: authError } = await sb.auth.updateUser(authUserPayload);

      if (authError) {
        throw new Error(authError.message);
      }

      showMessage(profileUpdateMessage, "Profil mis à jour avec succès.", "success");
      await loadProfilePage();
    } catch (error) {
      console.error("Erreur mise à jour profil :", error);
      showMessage(profileUpdateMessage, `Mise à jour impossible : ${error.message || error}`, "error");
    }
  }

  async function updatePassword() {
    const password = document.getElementById("profileNewPassword")?.value || "";
    const confirmPassword = document.getElementById("profileConfirmPassword")?.value || "";

    const validationError = authUI?.validatePasswordPair
      ? authUI.validatePasswordPair(password, confirmPassword)
      : null;

    if (validationError) {
      showMessage(profilePasswordMessage, validationError, "error");
      return;
    }

    try {
      const { error } = await sb.auth.updateUser({
        password: password
      });

      if (error) {
        throw new Error(error.message);
      }

      document.getElementById("profileNewPassword").value = "";
      document.getElementById("profileConfirmPassword").value = "";

      showMessage(profilePasswordMessage, "Mot de passe mis à jour avec succès.", "success");
    } catch (error) {
      console.error("Erreur mise à jour mot de passe :", error);
      showMessage(profilePasswordMessage, `Mise à jour impossible : ${error.message || error}`, "error");
    }
  }

  document.getElementById("updateProfileBtn")?.addEventListener("click", updateProfile);
  document.getElementById("updatePasswordBtn")?.addEventListener("click", updatePassword);

  await loadProfilePage();
});
