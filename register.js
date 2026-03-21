window.addEventListener("DOMContentLoaded", async function () {
  const sb = await waitForClient();

  const form = document.getElementById("registerForm");
  const btn = document.getElementById("registerBtn");
  const message = document.getElementById("registerMessage");
  const fullName = document.getElementById("registerFullName");
  const email = document.getElementById("registerEmail");
  const office = document.getElementById("registerOffice");
  const pillar = document.getElementById("registerPillar");
  const supervisor = document.getElementById("registerSupervisor");
  const password = document.getElementById("registerPassword");
  const passwordConfirm = document.getElementById("registerPasswordConfirm");

  function showMessage(text, type = "info") {
    let className = "info-box";
    if (type === "error") className = "error-box";
    if (type === "success") className = "success-box";
    message.innerHTML = `<div class="${className}">${text}</div>`;
  }

  async function loadReferenceData() {
    const [pillarsRes, usersRes] = await Promise.all([
      sb.from("pillars").select("*").order("name", { ascending: true }),
      sb.from("profiles")
        .select("id, full_name, role, pillar_id, is_active")
        .in("role", ["supervisor", "admin"])
        .eq("is_active", true)
        .order("full_name", { ascending: true })
    ]);

    if (pillarsRes.error) {
      showMessage(`Erreur chargement piliers : ${pillarsRes.error.message}`, "error");
      return;
    }

    if (usersRes.error) {
      showMessage(`Erreur chargement superviseurs : ${usersRes.error.message}`, "error");
      return;
    }

    const pillars = pillarsRes.data || [];
    const supervisors = usersRes.data || [];

    pillar.innerHTML =
      `<option value="">Sélectionner un pilier</option>` +
      pillars.map(p => `<option value="${p.id}">${p.name}</option>`).join("");

    function refreshSupervisors() {
      const pillarId = pillar.value;
      let filtered = supervisors;

      if (pillarId) {
        filtered = supervisors.filter(u => String(u.pillar_id) === String(pillarId));
      }

      supervisor.innerHTML =
        `<option value="">Sélectionner un superviseur</option>` +
        filtered.map(u => `<option value="${u.id}">${u.full_name}</option>`).join("");
    }

    pillar.addEventListener("change", refreshSupervisors);
    refreshSupervisors();
  }

  if (!sb) {
    showMessage("Client Supabase introuvable.", "error");
    return;
  }

  await loadReferenceData();

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const vFullName = fullName.value.trim();
    const vEmail = email.value.trim().toLowerCase();
    const vOffice = office.value.trim();
    const vPillar = pillar.value;
    const vSupervisor = supervisor.value;
    const vPassword = password.value;
    const vPasswordConfirm = passwordConfirm.value;

    if (!vFullName || !vEmail || !vPillar || !vSupervisor || !vPassword || !vPasswordConfirm) {
      showMessage("Veuillez renseigner tous les champs obligatoires.", "error");
      return;
    }

    if (vPassword !== vPasswordConfirm) {
      showMessage("Les mots de passe ne correspondent pas.", "error");
      return;
    }

    if (vPassword.length < 8) {
      showMessage("Le mot de passe doit contenir au moins 8 caractères.", "error");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Création...";

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

      const { error: profileError } = await sb.from("profiles").upsert([{
        id: authUserId,
        full_name: vFullName,
        email: vEmail,
        role: "staff",
        pillar_id: vPillar,
        supervisor_id: vSupervisor,
        office: vOffice,
        is_active: true
      }], { onConflict: "id" });

      if (profileError) {
        showMessage(`Erreur création profil : ${profileError.message}`, "error");
        return;
      }

      showMessage("Compte créé avec succès. Vous pouvez maintenant vous connecter.", "success");
      form.reset();
    } catch (err) {
      console.error(err);
      showMessage(`Erreur technique : ${err.message || err}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Créer mon compte";
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
