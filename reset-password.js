window.addEventListener("DOMContentLoaded", async function () {
  const authUI = window.AuthUI;
  const sb = await authUI?.waitForClient();

  const message = document.getElementById("resetPasswordMessage");
  const btn = document.getElementById("resetPasswordBtn");
  const p1 = document.getElementById("resetNewPassword");
  const p2 = document.getElementById("resetConfirmPassword");

  function showMessage(text, type = "info") {
    authUI?.showMessage(message, text, type);
  }

  if (!authUI || !sb) {
    showMessage("Client Supabase introuvable.", "error");
    return;
  }

  btn?.addEventListener("click", async function () {
    const password1 = p1?.value || "";
    const password2 = p2?.value || "";

    const validationError = authUI.validatePasswordPair(password1, password2);
    if (validationError) {
      showMessage(validationError, "error");
      return;
    }

    authUI.setButtonLoading(btn, true, "Mise à jour...");

    try {
      const { error } = await sb.auth.updateUser({
        password: password1
      });

      if (error) {
        showMessage(`Erreur : ${error.message}`, "error");
        return;
      }

      showMessage("Mot de passe réinitialisé avec succès. Vous pouvez vous reconnecter.", "success");

      setTimeout(() => {
        window.location.replace("login.html");
      }, 1200);
    } finally {
      authUI.setButtonLoading(btn, false);
    }
  });
});
