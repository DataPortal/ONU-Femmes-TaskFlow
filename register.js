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

  function showMessage(text, type = "info") {
    authUI?.showMessage(els.message, text, type);
  }

  if (!authUI || !sb) {
    showMessage("Client Supabase introuvable.", "error");
    return;
  }

  if (!els.form) {
    showMessage("Formulaire d’inscription introuvable.", "error");
    return;
  }

  async function loadReferenceData() {
    const [pillarsRes, usersRes] = await Promise.all([
      sb.from("pillars").select("id, name").order("name", { ascending: true }),
      sb.from("profiles")
        .select("id, full_name, role, pillar_id, is_active")
        .in("role", ["supervisor", "admin"])
        .eq("is_active", true)
        .order("full_name", { ascending: true })
    ]);

    if (pillarsRes.error) {
      throw new Error(`Erreur chargement piliers : ${pillarsRes.error.message}`);
    }

    if (usersRes.error) {
      throw new Error(`Erreur chargement superviseurs : ${usersRes.error.message}`);
    }

    const pillars = pillarsRes.data || [];
    const supervisors = usersRes.data || [];

    els.pillar.innerHTML =
      `<option value="">Sélectionner un pilier</option>` +
      pillars.map(p => `<option value="${authUI.escapeHtml(p.id)}">${authUI.escapeHtml(p.name)}</option>`).join("");

    function renderSupervisorOptions(selectedPillarId = "") {
      const filtered = selectedPillarId
        ? supervisors.filter(u => String(u.pillar_id) === String(selectedPillarId))
        : supervisors;

      els.supervisor.innerHTML =
        `<option value="">Sélectionner un superviseur</option>` +
        filtered.map(u => `<option value="${authUI.escapeHtml(u.id)}">${authUI.escapeHtml(u.full_name)}</option>`).join("");
    }

    renderSupervisorOptions();

    els.pillar?.addEventListener("change", () => {
      renderSupervisorOptions(els.pillar.value);
    });
  }

  try {
    await loadReferenceData();
  } catch (error) {
    showMessage(error.message || String(error), "error");
    return;
  }

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

    authUI.setButtonLoading(els.btn, true, "Création...");

    try {
      const { data, error } = await sb.auth.signUp({
        email: vEmail,
        password: vPassword
      });

      if (error) {
        showMessage(`Inscription impossible : ${error.message}`, "error");
        return;
      }

      const authUserId = data?.user?.id;
      if (!authUserId) {
        showMessage("Compte créé, mais identifiant utilisateur introuvable.", "error");
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
        showMessage(`Erreur création profil : ${profileError.message}`, "error");
        return;
      }

      showMessage("Compte créé avec succès. Vous pouvez maintenant vous connecter.", "success");
      els.form.reset();
      els.supervisor.innerHTML = `<option value="">Sélectionner un superviseur</option>`;
    } catch (error) {
      console.error(error);
      showMessage(`Erreur technique : ${error.message || error}`, "error");
    } finally {
      authUI.setButtonLoading(els.btn, false);
    }
  });
});
