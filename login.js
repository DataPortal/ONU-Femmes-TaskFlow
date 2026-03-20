window.addEventListener("load", async () => {
  console.log("login.js chargé");

  const loginBtn = document.getElementById("loginBtn");
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const messageBox = document.getElementById("loginMessage");

  function showMessage(text, type = "info") {
    if (!messageBox) return;
    let className = "info-box";
    if (type === "error") className = "error-box";
    if (type === "success") className = "success-box";
    messageBox.innerHTML = `<div class="${className}">${text}</div>`;
  }

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

  const sb = await waitForSupabaseClient();

  if (!sb) {
    showMessage("Client Supabase introuvable.", "error");
    return;
  }

  if (!loginBtn || !emailInput || !passwordInput || !messageBox) {
    console.error("Éléments login introuvables.", {
      loginBtn,
      emailInput,
      passwordInput,
      messageBox
    });
    return;
  }

  console.log("Éléments login trouvés");

  // Vérifie une session déjà valide
  try {
    const { data: sessionData, error: sessionError } = await sb.auth.getSession();

    if (sessionError) {
      console.error("Erreur session :", sessionError);
    }

    if (sessionData?.session) {
      const {
        data: { user },
        error: userError
      } = await sb.auth.getUser();

      if (!userError && user) {
        const { data: profile, error: profileError } = await sb
          .from("profiles")
          .select("id, is_active")
          .eq("id", user.id)
          .single();

        if (!profileError && profile && profile.is_active === true) {
          window.location.replace("index.html");
          return;
        }
      }

      await sb.auth.signOut();
    }
  } catch (err) {
    console.error("Erreur vérification session/profil :", err);
  }

  async function handleLogin() {
    console.log("Clic sur Connexion détecté");

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showMessage("Veuillez renseigner votre email et votre mot de passe.", "error");
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Connexion...";
    showMessage("Connexion en cours...", "info");

    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password
      });

      console.log("Résultat signInWithPassword :", { data, error });

      if (error) {
        showMessage(`Connexion impossible : ${error.message}`, "error");
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

      console.log("Résultat profile :", { profile, profileError });

      if (profileError) {
        showMessage(`Profil introuvable : ${profileError.message}`, "error");
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
        window.location.replace("index.html");
      }, 700);

    } catch (err) {
      console.error("Erreur inattendue login :", err);
      showMessage(`Erreur technique : ${err.message || err}`, "error");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Connexion";
    }
  }

  loginBtn.addEventListener("click", handleLogin);

  emailInput.addEventListener("keydown", e => {
    if (e.key === "Enter") handleLogin();
  });

  passwordInput.addEventListener("keydown", e => {
    if (e.key === "Enter") handleLogin();
  });

  showMessage("Page prête. Vous pouvez vous connecter.", "info");
});
