window.addEventListener("load", async () => {
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
      if (Date.now() - start > maxWaitMs) return null;
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
    console.error("Éléments login introuvables.");
    return;
  }

  // IMPORTANT :
  // pas de redirection auto ici
  // on nettoie juste une éventuelle session cassée si besoin
  try {
    const { data: sessionData } = await sb.auth.getSession();
    if (sessionData?.session) {
      const {
        data: { user }
      } = await sb.auth.getUser();

      if (user) {
        const { data: profile, error: profileError } = await sb
          .from("profiles")
          .select("id, is_active")
          .eq("id", user.id)
          .single();

        if (profileError || !profile || profile.is_active !== true) {
          await sb.auth.signOut();
        }
      }
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

    loginBtn.disabled = true;
    loginBtn.textContent = "Connexion...";
    showMessage("Connexion en cours...", "info");

    try {
      const { error } = await sb.auth.signInWithPassword({ email, password });

      if (error) {
        showMessage(`Connexion impossible : ${error.message}`, "error");
        return;
      }

      const {
        data: { user },
        error: userError
      } = await sb.auth.getUser();

      if (userError || !user) {
        showMessage("Connexion réussie, mais utilisateur introuvable.", "error");
        return;
      }

      const { data: profile, error: profileError } = await sb
        .from("profiles")
        .select("id, is_active")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        showMessage("Profil introuvable dans profiles.", "error");
        return;
      }

      if (profile.is_active !== true) {
        await sb.auth.signOut();
        showMessage("Votre compte est désactivé.", "error");
        return;
      }

      showMessage("Connexion réussie. Redirection...", "success");

      setTimeout(() => {
        window.location.replace("index.html");
      }, 700);

    } catch (err) {
      console.error(err);
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
});
