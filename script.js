(function () {
  async function waitForAppModules(maxWaitMs = 10000) {
    const start = Date.now();

    while (true) {
      const hasServices =
        window.AppServices &&
        typeof window.AppServices.waitForSupabaseClient === "function" &&
        typeof window.AppServices.requireSession === "function" &&
        typeof window.AppServices.loadCurrentUser === "function" &&
        typeof window.AppServices.loadReferenceData === "function";

      const hasUI =
        window.AppUI &&
        typeof window.AppUI.initUserHeader === "function" &&
        typeof window.AppUI.initLogout === "function" &&
        typeof window.AppUI.initModalSystem === "function" &&
        typeof window.AppUI.initFilterMenus === "function" &&
        typeof window.AppUI.initGlobalActions === "function" &&
        typeof window.AppUI.initTaskCreation === "function" &&
        typeof window.AppUI.initPillarCreation === "function" &&
        typeof window.AppUI.initRegisterPage === "function" &&
        typeof window.AppUI.initMainActivitiesManagement === "function" &&
        typeof window.AppUI.initExportAndPrint === "function" &&
        typeof window.AppUI.initMyTasksFilters === "function" &&
        typeof window.AppUI.initTeamFilters === "function" &&
        typeof window.AppUI.renderCurrentPage === "function";

      const hasCore =
        window.AppCore &&
        window.AppCore.AppState &&
        typeof window.AppCore.getCurrentUser === "function";

      if (hasServices && hasUI && hasCore) {
        return true;
      }

      if (Date.now() - start > maxWaitMs) {
        throw new Error("Les modules de l’application ne sont pas complètement chargés.");
      }

      await new Promise(resolve => setTimeout(resolve, 80));
    }
  }

  function showStartupError(message) {
    console.error(message);

    if (window.AppUI?.showGlobalError) {
      window.AppUI.showGlobalError(message);
      return;
    }

    if (window.AuthUI?.showMessage && document.getElementById("pageDebugMessage")) {
      window.AuthUI.showMessage("pageDebugMessage", message, "error");
      return;
    }

    alert(message);
  }

  async function bootstrap() {
    await waitForAppModules();

    await window.AppServices.waitForSupabaseClient();

    const hasSession = await window.AppServices.requireSession();
    if (!hasSession) return;

    await window.AppServices.loadCurrentUser();
    await window.AppServices.loadReferenceData();

    const currentUser = window.AppCore.getCurrentUser?.();
    if (!currentUser) {
      throw new Error("Utilisateur courant introuvable après chargement du profil.");
    }

    window.AppUI.initUserHeader();
    window.AppUI.initLogout();
    window.AppUI.initModalSystem();
    window.AppUI.initFilterMenus();
    window.AppUI.initGlobalActions();
    window.AppUI.initTaskCreation();
    window.AppUI.initPillarCreation();
    window.AppUI.initRegisterPage();
    window.AppUI.initMainActivitiesManagement();
    window.AppUI.initExportAndPrint();
    window.AppUI.initMyTasksFilters();
    window.AppUI.initTeamFilters();
    window.AppUI.renderCurrentPage();

    // Deuxième rendu léger pour éviter les cas où les références
    // se chargent juste après le premier cycle visuel
    requestAnimationFrame(() => {
      try {
        window.AppUI.initTaskCreation();
        window.AppUI.initExportAndPrint();
        window.AppUI.renderCurrentPage();
      } catch (error) {
        console.warn("Rerender secondaire ignoré :", error);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await bootstrap();
    } catch (error) {
      showStartupError(`Une erreur empêche le chargement : ${error?.message || error}`);
    }
  });
})();
