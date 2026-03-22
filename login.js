console.log("login.js chargé");

window.addEventListener("DOMContentLoaded", async function () {
  const form = document.getElementById("loginForm");
  const btn = document.getElementById("loginBtn");
  const email = document.getElementById("loginEmail");
  const password = document.getElementById("loginPassword");
  const message = document.getElementById("loginMessage");
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");

  if (!form || !btn || !email || !password || !message) {
    console.error("Éléments de connexion introuvables.");
    return;
  }

  const authUI = window.AuthUI;
  const sb = await authUI?.waitForClient();

  if (!authUI || !sb) {
    authUI?.showMessage(message, "Client Supabase introuvable.", "error");
    return;
  }

  authUI.showMessage(message, "Page prête. Vous pouvez vous connecter.", "info");

  async function doLogin() {
    const emailValue = authUI.normalizeEmail(email.value);
    const passwordValue = password.value;

    if (!emailValue || !passwordValue) {
      authUI.showMessage(message, "Veuillez renseigner votre email et votre mot de passe.", "error");
      return;
    }

    authUI.setButtonLoading(btn, true, "Connexion...", "Connexion");
    authUI.showMessage(message, "Connexion en cours...", "info");

    try {
      const { error } = await sb.auth.signInWithPassword({
        email: emailValue,
        password: passwordValue
      });

      if (error) {
        authUI.showMessage(message, `Connexion impossible : ${error.message}`, "error");
        return;
      }

      const {
        data: { user },
        error: userError
      } = await sb.auth.getUser();

      if (userError || !user) {
        authUI.showMessage(message, "Connexion réussie, mais utilisateur introuvable.", "error");
        return;
      }

      const { data: profile, error: profileError } = await sb
        .from("profiles")
        .select("id, is_active")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        authUI.showMessage(message, "Profil introuvable dans profiles.", "error");
        return;
      }

      if (profile.is_active !== true) {
        await sb.auth.signOut();
        authUI.showMessage(message, "Votre compte est désactivé.", "error");
        return;
      }

      authUI.showMessage(message, "Connexion réussie. Redirection...", "success");

      setTimeout(function () {
        window.location.replace("dashboard.html");
      }, 700);
    } catch (err) {
      console.error("Erreur login :", err);
      authUI.showMessage(message, `Erreur technique : ${err.message || err}`, "error");
    } finally {
      authUI.setButtonLoading(btn, false, "Connexion...", "Connexion");
    }
  }

  async function doForgotPassword() {
    const emailValue = authUI.normalizeEmail(email.value);

    if (!emailValue) {
      authUI.showMessage(message, "Veuillez d’abord renseigner votre adresse email.", "error");
      return;
    }

    const redirectTo = new URL("reset-password.html", window.location.href).href;

    authUI.showMessage(message, "Envoi du lien de réinitialisation...", "info");

    const { error } = await sb.auth.resetPasswordForEmail(emailValue, { redirectTo });

    if (error) {
      authUI.showMessage(message, `Réinitialisation impossible : ${error.message}`, "error");
      return;
    }

    authUI.showMessage(
      message,
      "Un lien de réinitialisation a été envoyé à votre adresse email.",
      "success"
    );
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    await doLogin();
  });

  forgotPasswordLink?.addEventListener("click", async function (event) {
    event.preventDefault();
    await doForgotPassword();
  });
});
