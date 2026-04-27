window.addEventListener("DOMContentLoaded", async function () {
  const authUI = window.AuthUI;
  const AppCore = window.AppCore;
  const AppServices = window.AppServices;

  const pageMessage = document.getElementById("pageDebugMessage");

  function showMessage(text, type = "info") {
    if (authUI?.showMessage && pageMessage) {
      authUI.showMessage(pageMessage, text, type);
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
      if (!AppServices || !AppCore) {
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

      showMessage("Profil chargé avec succès.", "success");
    } catch (error) {
      console.error("Erreur chargement profil :", error);
      showMessage(`Une erreur empêche le chargement du profil : ${error.message || error}`, "error");
    }
  }

  await loadProfilePage();
});
