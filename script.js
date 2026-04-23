document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (!window.AppServices) {
      throw new Error("AppServices introuvable. Vérifiez le chargement de app-services.js.");
    }

    if (typeof window.AppServices.waitForSupabaseClient !== "function") {
      throw new Error("waitForSupabaseClient est introuvable dans AppServices.");
    }

    if (typeof window.AppServices.requireSession !== "function") {
      throw new Error("requireSession est introuvable dans AppServices.");
    }

    if (typeof window.AppServices.loadCurrentUser !== "function") {
      throw new Error("loadCurrentUser est introuvable dans AppServices.");
    }

    if (typeof window.AppServices.loadReferenceData !== "function") {
      throw new Error("loadReferenceData est introuvable dans AppServices.");
    }

    await window.AppServices.waitForSupabaseClient();

    const hasSession = await window.AppServices.requireSession();
    if (!hasSession) return;

    await window.AppServices.loadCurrentUser();
    await window.AppServices.loadReferenceData();

    if (!window.AppUI) {
      throw new Error("AppUI introuvable. Vérifiez le chargement de app-ui.js.");
    }

    const safeCall = (fnName) => {
      const fn = window.AppUI?.[fnName];
      if (typeof fn === "function") {
        fn();
      } else {
        console.warn(`AppUI.${fnName} introuvable ou non exécutable.`);
      }
    };

    safeCall("initUserHeader");
    safeCall("initLogout");
    safeCall("initModalSystem");
    safeCall("initFilterMenus");
    safeCall("initGlobalActions");
    safeCall("initTaskCreation");
    safeCall("initPillarCreation");
    safeCall("initRegisterPage");
    safeCall("initMainActivitiesManagement");
    safeCall("initExportAndPrint");
    safeCall("initMyTasksFilters");
    safeCall("initTeamFilters");
    safeCall("renderCurrentPage");
  } catch (error) {
    console.error("Erreur au démarrage :", error);

    const message = `Une erreur empêche le chargement : ${error?.message || error}`;

    if (window.AppUI?.showGlobalError) {
      window.AppUI.showGlobalError(message);
    } else if (window.AuthUI?.showMessage && document.getElementById("pageDebugMessage")) {
      window.AuthUI.showMessage("pageDebugMessage", message, "error");
    } else {
      alert(message);
    }
  }
});
