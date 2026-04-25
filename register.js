console.log("register.js chargé");

window.addEventListener("DOMContentLoaded", async function () {
  const form = document.getElementById("registerForm");
  const btn = document.getElementById("registerBtn");
  const message = document.getElementById("registerMessage");

  const fullName = document.getElementById("registerFullName");
  const email = document.getElementById("registerEmail");
  const office = document.getElementById("registerOffice");
  const role = document.getElementById("registerRole");
  const pillar = document.getElementById("registerPillar");
  const supervisor = document.getElementById("registerSupervisor");
  const password = document.getElementById("registerPassword");
  const passwordConfirm = document.getElementById("registerPasswordConfirm");

  const authUI = window.AuthUI;
  const sb = await authUI?.waitForClient();

  if (!authUI || !sb) {
    authUI?.showMessage(message, "Client Supabase introuvable.", "error");
    return;
  }

  if (
    !form || !btn || !message ||
    !fullName || !email || !office || !role ||
    !pillar || !supervisor || !password || !passwordConfirm
  ) {
    console.error("Un ou plusieurs éléments du formulaire sont introuvables.");
    authUI.showMessage(
      message,
      "Le formulaire d’inscription est incomplet ou certains champs sont introuvables.",
      "error"
    );
    return;
  }

  const APP_BASE_URL = "https://dataportal.github.io/ONU-Femmes-TaskFlow/";
  const CONFIRM_URL = `${APP_BASE_URL}confirm.html`;

  let allPillars = [];
  let allSupervisors = [];

  function showMessage(text, type = "info") {
    authUI.showMessage(message, text, type);
  }

  function resetSupervisorSelect(placeholder = "Sélectionner d’abord un pilier") {
    supervisor.innerHTML = `<option value="">${placeholder}</option>`;
    supervisor.disabled = true;
  }

  function populatePillars() {
    if (!Array.isArray(allPillars) || !allPillars.length) {
      pillar.innerHTML = `<option value="">Aucun pilier disponible</option>`;
      pillar.disabled = true;
      resetSupervisorSelect("Aucun superviseur disponible");
      return;
    }

    pillar.innerHTML =
      `<option value="">Sélectionner un pilier</option>` +
      allPillars
        .map(item => `<option value="${String(item.id)}">${authUI.escapeHtml(item.name)}</option>`)
        .join("");

    pillar.disabled = false;
    resetSupervisorSelect();
  }

  function populateSupervisorsForPillar(pillarId) {
    if (!pillarId) {
      resetSupervisorSelect();
      return;
    }

    const supervisorsForPillar = allSupervisors.filter(user =>
      String(user.pillar_id || "") === String(pillarId)
    );

    if (!supervisorsForPillar.length) {
      resetSupervisorSelect("Aucun superviseur trouvé pour ce pilier");
      return;
    }

    supervisor.innerHTML =
      `<option value="">Sélectionner un superviseur</option>` +
      supervisorsForPillar
        .map(user => {
          const name = user.full_name || user.name || user.email || "Superviseur";
          return `<option value="${String(user.id)}">${authUI.escapeHtml(name)}</option>`;
        })
        .join("");

    supervisor.disabled = false;
  }

  async function loadReferenceData() {
    try {
      pillar.disabled = true;
      pillar.innerHTML = `<option value="">Chargement des piliers...</option>`;
      resetSupervisorSelect("Chargement des superviseurs...");

      const [
        pillarsRes,
        profilesRes
      ] = await Promise.all([
        sb
          .from("pillars")
          .select("id, name")
          .order("name", { ascending: true }),
        sb
          .from("profiles")
          .select("id, full_name, email, role, pillar_id, is_active")
          .in("role", ["admin", "supervisor"])
          .eq("is_active", true)
          .order("full_name", { ascending: true })
      ]);

      if (pillarsRes.error) {
        throw new Error(`Chargement des piliers impossible : ${pillarsRes.error.message}`);
      }

      if (profilesRes.error) {
        throw new Error(`Chargement des superviseurs impossible : ${profilesRes.error.message}`);
      }

      allPillars = Array.isArray(pillarsRes.data) ? pillarsRes.data : [];
      allSupervisors = Array.isArray(profilesRes.data) ? profilesRes.data : [];

      populatePillars();

      showMessage(
        "Formulaire prêt. Sélectionnez votre pilier puis votre superviseur.",
        "info"
      );
    } catch (error) {
      console.error("Erreur chargement références :", error);
      pillar.innerHTML = `<option value="">Erreur de chargement</option>`;
      pillar.disabled = true;
      resetSupervisorSelect("Erreur de chargement");
      showMessage(error.message || "Erreur lors du chargement des références.", "error");
    }
  }

  pillar.addEventListener("change", function () {
    populateSupervisorsForPillar(pillar.value);
  });

  role.value = "staff";
  role.disabled = true;

  async function doRegister() {
    const fullNameValue = authUI.safeTrim(fullName.value);
    const emailValue = authUI.normalizeEmail(email.value);
    const officeValue = authUI.safeTrim(office.value);
    const roleValue = "staff";
    const pillarIdValue = pillar.value;
    const supervisorIdValue = supervisor.value;
    const passwordValue = password.value;
    const passwordConfirmValue = passwordConfirm.value;

    if (!fullNameValue || !emailValue || !officeValue || !pillarIdValue || !supervisorIdValue) {
      showMessage(
        "Veuillez renseigner le nom complet, l’email, le bureau/unité, le pilier et le superviseur.",
        "error"
      );
      return;
    }

    if (!authUI.isValidEmail(emailValue)) {
      showMessage("Veuillez saisir une adresse email valide.", "error");
      return;
    }

    const passwordError = authUI.validatePasswordPair(passwordValue, passwordConfirmValue);
    if (passwordError) {
      showMessage(passwordError, "error");
      return;
    }

    authUI.setButtonLoading(btn, true, "Création du compte...");
    showMessage("Création du compte en cours...", "info");

    try {
      const { data, error } = await sb.auth.signUp({
        email: emailValue,
        password: passwordValue,
        options: {
          emailRedirectTo: CONFIRM_URL,
          data: {
            full_name: fullNameValue,
            office: officeValue,
            pillar_id: pillarIdValue,
            supervisor_id: supervisorIdValue,
            role: roleValue
          }
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.user) {
        throw new Error("Le compte n’a pas pu être créé correctement.");
      }

      showMessage(
        "Compte créé. Vérifiez votre email pour confirmer votre inscription avant de vous connecter.",
        "success"
      );

      form.reset();
      role.value = "staff";
      role.disabled = true;
      populatePillars();
    } catch (error) {
      console.error("Erreur inscription :", error);
      showMessage(`Création impossible : ${error.message || error}`, "error");
    } finally {
      authUI.setButtonLoading(btn, false);
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    await doRegister();
  });

  await loadReferenceData();
});
