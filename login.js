console.log("login.js chargé");

window.addEventListener("DOMContentLoaded", async function () {
  const form = document.getElementById("loginForm");
  const btn = document.getElementById("loginBtn");
  const email = document.getElementById("loginEmail");
  const password = document.getElementById("loginPassword");
  const message = document.getElementById("loginMessage");
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");

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
      if (Date.now() - start > maxWaitMs) return null;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return window.sb;
  }

  if (!form || !btn || !email || !password || !message) {
    console.error("Éléments de connexion introuvables.");
    return;
  }

  const sb = await waitForClient();

  if (!sb) {
    showMessage("Client Supabase introuvable.", "error");
    return;
  }

  showMessage("Page prête. Vous pouvez vous connecter.", "info");

  async function doLogin() {
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
        window.location.replace("dashboard.html");
      }, 700);
    } catch (err) {
      console.error("Erreur login :", err);
      showMessage(`Erreur technique : ${err.message || err}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Connexion";
    }
  }

  async function doForgotPassword() {
    const emailValue = email.value.trim();

    if (!emailValue) {
      showMessage("Veuillez d’abord renseigner votre adresse email.", "error");
      return;
    }

    showMessage("Envoi du lien de réinitialisation...", "info");

    const { error } = await sb.auth.resetPasswordForEmail(emailValue, {
      redirectTo: "https://dataportal.github.io/ONU-Femmes-TaskFlow/reset-password.html"
    });

    if (error) {
      showMessage(`Erreur : ${error.message}`, "error");
      return;
    }

    showMessage("Un email de réinitialisation a été envoyé.", "success");
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    await doLogin();
  });

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", async function (e) {
      e.preventDefault();
      await doForgotPassword();
    });
  }
});
