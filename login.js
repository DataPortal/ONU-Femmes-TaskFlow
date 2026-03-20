console.log("login.js chargé");

window.addEventListener("DOMContentLoaded", async function () {
  console.log("DOMContentLoaded déclenché");

  const form = document.getElementById("loginForm");
  const btn = document.getElementById("loginBtn");
  const email = document.getElementById("loginEmail");
  const password = document.getElementById("loginPassword");
  const message = document.getElementById("loginMessage");

  function showMessage(text, type = "info") {
    if (!message) return;
    let className = "info-box";
    if (type === "error") className = "error-box";
    if (type === "success") className = "success-box";
    message.innerHTML = `<div class="${className}">${text}</div>`;
  }

  async function waitForClient(maxWaitMs = 8000) {
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

  if (!form || !btn || !email || !password || !message) {
    console.error("Éléments de connexion introuvables.", {
      form,
      btn,
      email,
      password,
      message
    });
    return;
  }

  console.log("Éléments login trouvés");

  const sb = await waitForClient();

  if (!sb) {
    showMessage("Client Supabase introuvable.", "error");
    return;
  }

  console.log("Client Supabase prêt");
  showMessage("Page prête. Vous pouvez vous connecter.", "info");

  async function doLogin() {
    console.log("Tentative de connexion lancée");

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

      console.log("Résultat signInWithPassword :", error);

      if (error) {
        showMessage(`Connexion impossible : ${error.message}`, "error");
        return;
      }

      const {
        data: { user },
        error: userError
      } = await sb.auth.getUser();

      console.log("Utilisateur connecté :", user, userError);

      if (userError || !user) {
        showMessage("Connexion réussie, mais utilisateur introuvable.", "error");
        return;
      }

      const { data: profile, error: profileError } = await sb
        .from("profiles")
        .select("id, is_active")
        .eq("id", user.id)
        .single();

      console.log("Profil récupéré :", profile, profileError);

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

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    console.log("Submit formulaire détecté");
    await doLogin();
  });

  btn.addEventListener("click", function () {
    console.log("Clic bouton Connexion détecté");
  });

  console.log("Listeners attachés");
});
