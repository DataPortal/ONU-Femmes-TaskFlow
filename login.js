window.addEventListener("load", async function () {
  console.log("login.js chargé");

  const btn = document.getElementById("loginBtn");
  const email = document.getElementById("loginEmail");
  const password = document.getElementById("loginPassword");
  const message = document.getElementById("loginMessage");

  function showMessage(text, type = "info") {
    let className = "info-box";
    if (type === "error") className = "error-box";
    if (type === "success") className = "success-box";
    message.innerHTML = `<div class="${className}">${text}</div>`;
  }

  async function waitForClient(maxWaitMs = 5000) {
    const start = Date.now();
    while (!window.sb) {
      if (Date.now() - start > maxWaitMs) return null;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return window.sb;
  }

  if (!btn || !email || !password || !message) {
    console.error("Éléments de connexion introuvables", { btn, email, password, message });
    return;
  }

  const sb = await waitForClient();

  if (!sb) {
    showMessage("Client Supabase introuvable.", "error");
    return;
  }

  console.log("Bouton trouvé, client Supabase prêt");

  async function doLogin() {
    console.log("Clic détecté sur Connexion");

    const emailValue = email.value.trim();
    const passwordValue = password.value;

    if (!emailValue || !passwordValue) {
      showMessage("Veuillez renseigner votre email et votre mot de passe.", "error");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Connexion...";
    showMessage("Connexion en cours...", "info");

    try {
      const { error } = await sb.auth.signInWithPassword({
        email: emailValue,
        password: passwordValue
      });

      console.log("Résultat signInWithPassword", error);

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
      console.error("Erreur login :", err);
      showMessage(`Erreur technique : ${err.message || err}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Connexion";
    }
  }

  btn.onclick = doLogin;

  email.addEventListener("keydown", function (e) {
    if (e.key === "Enter") doLogin();
  });

  password.addEventListener("keydown", function (e) {
    if (e.key === "Enter") doLogin();
  });

  showMessage("Page prête. Vous pouvez vous connecter.", "info");
});
