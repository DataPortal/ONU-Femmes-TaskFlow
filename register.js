window.addEventListener("DOMContentLoaded", async () => {
  const sb = await waitForClient();

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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showMessage(text, type = "info") {
    if (!els.message) return;

    let className = "info-box";
    if (type === "error") className = "error-box";
    if (type === "success") className = "success-box";

    els.message.innerHTML = `<div class="${className}">${escapeHtml(text)}</div>`;
  }

  function clearMessage() {
    if (els.message) els.message.innerHTML = "";
  }

  function setButtonLoading(button, isLoading, loadingText = "Traitement...") {
    if (!button) return;

    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = loadingText;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  function safeTrim(value) {
    return String(value || "").trim();
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function validatePassword(password, confirmPassword) {
    if (!password || !confirmPassword) {
      return "Veuillez renseigner et confirmer le mot de passe.";
    }

    if (password !== confirmPassword) {
      return "Les mots de passe ne correspondent pas.";
    }

    if (password.length < 8) {
      return "Le mot de passe doit contenir au moins 8 caractères.";
    }

    return "";
  }

  function renderPillarOptions(pillars) {
    if (!els.pillar) return;

    els.pillar.innerHTML =
      `<option value="">Sélectionner un pilier</option>` +
      pillars
        .map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
        .join("");
  }

  function renderSupervisorOptions(supervisors, selectedPillarId = "") {
    if (!els.supervisor) return;

    const filtered = selectedPillarId
      ? supervisors.filter(u => String(u.pillar_id) === String(selectedPillarId))
      : supervisors;

    els.supervisor.innerHTML =
      `<option value="">Sélectionner un superviseur</option>` +
      filtered
        .map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.full_name)}</option>`)
        .join("");
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

    renderPillarOptions(pillars);
    renderSupervisorOptions(supervisors);

    els.pillar?.addEventListener("change", () => {
      renderSupervisorOptions(supervisors, els.pillar.value);
    });
  }

  if (!sb) {
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
    showMessage(error.message || String(error), "error");
    return;
  }

  els.form.addEventListener("submit", async event => {
    event.preventDefault();
    clearMessage();

    const vFullName = safeTrim(els.fullName?.value);
    const vEmail = safeTrim(els.email?.value).toLowerCase();
    const vOffice = safeTrim(els.office?.value);
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

    if (!isValidEmail(vEmail)) {
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

    const passwordError = validatePassword(vPassword, vPasswordConfirm);
    if (passwordError) {
      showMessage(passwordError, "error");
      els.password?.focus();
      return;
    }

    setButtonLoading(els.btn, true, "Création...");

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

      if (els.supervisor) {
        els.supervisor.innerHTML = `<option value="">Sélectionner un superviseur</option>`;
      }
    } catch (error) {
      console.error(error);
      showMessage(`Erreur technique : ${error.message || error}`, "error");
    } finally {
      setButtonLoading(els.btn, false);
    }
  });
});

async function waitForClient(maxWaitMs = 8000) {
  const start = Date.now();

  while (!window.sb) {
    if (Date.now() - start > maxWaitMs) return null;
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return window.sb;
}
