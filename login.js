document.addEventListener("DOMContentLoaded", async () => {
  const sb = await waitForSupabaseClient();

  const loginBtn = document.getElementById("loginBtn");
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const messageBox = document.getElementById("loginMessage");

  if (!sb) {
    showMessage("Client Supabase introuvable.", "error");
    return;
  }

  if (!loginBtn || !emailInput || !passwordInput || !messageBox) {
    console.error("Éléments login manquants.");
    return;
  }

  try {
    const { data, error } = await sb.auth.getSession();
    if (error) {
      console.error("Erreur session :", error);
    }

    if (data?.session) {
      window.location.href = "index.html";
      return;
    }
  } catch (err) {
    console.error("Erreur vérification session :", err);
  }

  async function handleLogin() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showMessage("Veuillez renseigner votre email et votre mot de passe.", "error");
      return;
    }

    setLoading(true);
    showMessage("Connexion en cours...", "info");

    try {
      const { error: signInError } = await sb.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        console.error("Erreur signInWithPassword :", signInError);
        showMessage("Connexion impossible. Vérifiez vos identifiants.", "error");
        return;
      }

      const {
        data: { user },
        error: userError
      } = await sb.auth.getUser();

      if (userError || !user) {
        console.error("Erreur getUser :", userError);
        showMessage("Connexion réussie, mais impossible de récupérer le compte.", "error");
        return;
      }

      const { data: profile, error: profileError } = await sb
        .from("profiles")
        .select("id, full_name, email, role, pillar_id, supervisor_id, office, is_active")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Erreur lecture profiles :", profileError);
        showMessage("Compte connecté, mais profil introuvable dans profiles.", "error");
        return;
      }

      if (!profile) {
        showMessage("Aucun profil trouvé pour cet utilisateur.", "error");
        return;
      }

      if (profile.is_active === false) {
        await sb.auth.signOut();
        showMessage("Votre compte est désactivé.", "error");
        return;
      }

      showMessage("Connexion réussie. Redirection...", "success");

      setTimeout(() => {
        window.location.href = "index.html";
      }, 700);
    } catch (err) {
      console.error("Erreur inattendue login :", err);
      showMessage("Une erreur technique empêche la connexion.", "error");
    } finally {
      setLoading(false);
    }
  }

  loginBtn.addEventListener("click", handleLogin);

  emailInput.addEventListener("keydown", e => {
    if (e.key === "Enter") handleLogin();
  });

  passwordInput.addEventListener("keydown", e => {
    if (e.key === "Enter") handleLogin();
  });

  function setLoading(isLoading) {
    loginBtn.disabled = isLoading;
    loginBtn.textContent = isLoading ? "Connexion..." : "Connexion";
  }

  function showMessage(text, type) {
    let className = "info-box";
    if (type === "error") className = "error-box";
    if (type === "success") className = "success-box";
    messageBox.innerHTML = `<div class="${className}">${text}</div>`;
  }
});

async function waitForSupabaseClient(maxWaitMs = 5000) {
  const start = Date.now();

  while (!window.sb) {
    if (Date.now() - start > maxWaitMs) {
      console.error("Timeout: client Supabase indisponible.");
      return null;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return window.sb;
}
