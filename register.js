window.addEventListener("DOMContentLoaded", async () => {
  const authUI = window.AuthUI;
  const sb = await authUI?.waitForClient();

  const els = {
    form: document.getElementById("registerForm"),
    btn: document.getElementById("registerBtn"),
    message: document.getElementById("registerMessage"),
    fullName: document.getElementById("registerFullName"),
    email: document.getElementById("registerEmail"),
    office: document.getElementById("registerOffice"),
    pillar: document.getElementById("registerPillar"),
    supervisor: document.getElementById("registerSupervisor"),
    password: document.getElementById("registerPassword"),
    passwordConfirm: document.getElementById("registerPasswordConfirm")
  };

  let cachedPillars = [];
  let cachedSupervisors = [];

  function showMessage(text, type = "info") {
    authUI?.showMessage(els.message, text, type);
  }

  function setSelectLoading(select, label = "Chargement...") {
    if (!select) return;
    select.innerHTML = `<option value="">${label}</option>`;
    select.disabled = true;
  }

  function setSelectEmpty(select, label) {
    if (!select) return;
    select.innerHTML = `<option value="">${label}</option>`;
    select.disabled = true;
  }

  function enableSelect(select) {
    if (!select) return;
    select.disabled = false;
  }

  function renderPillarOptions() {
    if (!els.pillar) return;

    if (!cachedPillars.length) {
      setSelectEmpty(els.pillar, "Aucun pilier disponible");
      return;
    }

    els.pillar.innerHTML =
      `<option value="">Sélectionner un pilier</option>` +
      cachedPillars
        .map(pillar => `
          <option value="${authUI.escapeHtml(pillar.id)}">
            ${authUI.escapeHtml(pillar.name)}
          </option>
        `)
        .join("");

    enableSelect(els.pillar);
  }

  function renderSupervisorOptions(selectedPillarId = "") {
    if (!els.supervisor) return;

    if (!selectedPillarId) {
      els.supervisor.innerHTML = `<option value="">Sélectionner d’abord un pilier</option>`;
      els.supervisor.disabled = true;
      return;
    }

    const filteredSupervisors = cachedSupervisors.filter(supervisor =>
      String(supervisor.pillar_id) === String(selectedPillarId)
    );

    if (!filteredSupervisors.length) {
      setSelectEmpty(els.supervisor, "Aucun superviseur pour ce pilier");
      return;
    }

    els.supervisor.innerHTML =
      `<option value="">Sélectionner un superviseur</option>` +
      filteredSupervisors
        .map(supervisor => `
          <option value="${authUI.escapeHtml(supervisor.id)}">
            ${authUI.escapeHtml(supervisor.full_name || "Superviseur sans nom")}
          </option>
        `)
        .join("");

    enableSelect(els.supervisor);
  }

  async function loadReferenceData() {
    setSelectLoading(els.pillar, "Chargement des piliers...");
    setSelectLoading(els.supervisor, "Chargement des superviseurs...");

    const [pillarsRes, supervisorsRes] = await Promise.all([
      sb
        .from("pillars")
        .select("id, name")
        .order("name", { ascending: true }),

      sb
        .from("profiles")
        .select("id, full_name, role, pillar_id, is_active")
        .in("role", ["supervisor", "admin"])
        .eq("is_active", true)
        .order("full_name", { ascending: true })
    ]);

    if (pillarsRes.error) {
      throw new Error(`Erreur chargement piliers : ${pillarsRes.error.message}`);
    }

    if (supervisorsRes.error) {
      throw new Error(`Erreur chargement superviseurs : ${supervisorsRes.error.message}`);
    }

    cachedPillars = pillarsRes.data || [];
    cachedSupervisors = supervisorsRes.data || [];

    renderPillarOptions();
    renderSupervisorOptions("");

    if (!cachedPillars.length) {
      showMessage(
        "Aucun pilier n’est disponible. Veuillez demander à un administrateur de créer les piliers dans la page Administration.",
        "error"
      );
      return;
    }

    if (!cachedSupervisors.length) {
      showMessage(
        "Aucun superviseur actif n’est disponible. Veuillez vérifier les profils avec le rôle supervisor ou admin.",
        "error"
      );
      return;
    }

    showMessage("Formulaire prêt. Sélectionnez votre pilier puis votre superviseur.", "info");
  }

  if (!authUI || !sb) {
    showMessage("Client Supabase introuvable.", "error");
    return;
  }

  if (!els.form) {
    showMessage("Formulaire d’inscription introuvable.", "error");
    return;
  }

  try {
    await loadReferenceData();
  } catch (error) {
    console.error("Erreur chargement données inscription :", error);
    showMessage(error.message || String(error), "error");
    return;
  }

  els.pillar?.addEventListener("change", () => {
    renderSupervisorOptions(els.pillar.value);
  });

  els.form.addEventListener("submit", async event => {
    event.preventDefault();

    authUI.clearMessage(els.message);

    const vFullName = authUI.safeTrim(els.fullName?.value);
    const vEmail = authUI.normalizeEmail(els.email?.value);
    const vOffice = authUI.safeTrim(els.office?.value);
    const vPillar = els.pillar?.value || "";
    const vSupervisor = els.supervisor?.value || "";
    const vPassword = els.password?.value || "";
    const vPasswordConfirm = els.passwordConfirm?.value || "";

    if (!vFullName) {
      showMessage("Le nom complet est obligatoire.", "error");
      els.fullName?.focus();
      return;
    }

    if (!vEmail) {
      showMessage("L’adresse email est obligatoire.", "error");
      els.email?.focus();
      return;
    }

    if (!authUI.isValidEmail(vEmail)) {
      showMessage("Veuillez saisir une adresse email valide.", "error");
      els.email?.focus();
      return;
    }

    if (!vPillar) {
      showMessage("Veuillez sélectionner un pilier.", "error");
      els.pillar?.focus();
      return;
    }

    if (!vSupervisor) {
      showMessage("Veuillez sélectionner un superviseur.", "error");
      els.supervisor?.focus();
      return;
    }

    const passwordError = authUI.validatePasswordPair(vPassword, vPasswordConfirm);

    if (passwordError) {
      showMessage(passwordError, "error");
      els.password?.focus();
      return;
    }

    authUI.setButtonLoading(els.btn, true, "Création...", "Créer mon compte");

    try {
      const { data, error } = await sb.auth.signUp({
        email: vEmail,
        password: vPassword,
        options: {
          data: {
            full_name: vFullName,
            office: vOffice,
            pillar_id: vPillar,
            supervisor_id: vSupervisor,
            role: "staff"
          }
        }
      });

      if (error) {
        showMessage(`Inscription impossible : ${error.message}`, "error");
        return;
      }

      const authUserId = data?.user?.id;

      if (!authUserId) {
        showMessage(
          "Compte créé, mais l’identifiant utilisateur est introuvable. Vérifiez la confirmation email Supabase.",
          "error"
        );
        return;
      }

      const { error: profileError } = await sb
        .from("profiles")
        .upsert(
          [
            {
              id: authUserId,
              full_name: vFullName,
              email: vEmail,
              role: "staff",
              pillar_id: vPillar,
              supervisor_id: vSupervisor,
              office: vOffice,
              is_active: true
            }
          ],
          { onConflict: "id" }
        );

      if (profileError) {
        showMessage(`Compte créé, mais erreur création profil : ${profileError.message}`, "error");
        return;
      }

      showMessage("Compte créé avec succès. Vous pouvez maintenant vous connecter.", "success");

      els.form.reset();
      renderSupervisorOptions("");

      setTimeout(() => {
        window.location.href = "./login.html";
      }, 1800);
    } catch (error) {
      console.error("Erreur inscription :", error);
      showMessage(`Erreur technique : ${error.message || error}`, "error");
    } finally {
      authUI.setButtonLoading(els.btn, false, "Création...", "Créer mon compte");
    }
  });
});
