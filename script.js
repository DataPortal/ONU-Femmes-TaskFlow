document.addEventListener("DOMContentLoaded", async () => {
  try {
    await window.AppServices.waitForSupabaseClient();

    const hasSession = await window.AppServices.requireSession();

    if (!hasSession) return;

    await window.AppServices.loadCurrentUser();
    await window.AppServices.loadReferenceData();

    window.AppUI.initUserHeader();
    window.AppUI.initLogout();
    window.AppUI.initModalSystem();
    window.AppUI.initGlobalActions();
    window.AppUI.initTaskCreation();
    window.AppUI.initPillarCreation();
    window.AppUI.initRegisterPage();
    window.AppUI.initMainActivitiesManagement();
    window.AppUI.initExportAndPrint();
    window.AppUI.initMyTasksFilters();

    window.AppUI.renderCurrentPage();
  } catch (error) {
    console.error("Erreur au démarrage :", error);

    if (window.AppUI?.showGlobalError) {
      window.AppUI.showGlobalError(`Une erreur empêche le chargement : ${error.message || error}`);
    } else {
      alert(`Une erreur empêche le chargement : ${error.message || error}`);
    }
  }
});
