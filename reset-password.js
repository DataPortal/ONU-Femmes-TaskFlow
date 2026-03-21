window.addEventListener("DOMContentLoaded", async function () {
  const sb = await waitForClient();

  const message = document.getElementById("resetPasswordMessage");
  const btn = document.getElementById("resetPasswordBtn");
  const p1 = document.getElementById("resetNewPassword");
  const p2 = document.getElementById("resetConfirmPassword");

  function showMessage(text, type = "info") {
    let className = "info-box";
    if (type === "error") className = "error-box";
    if (type === "success") className = "success-box";
    message.innerHTML = `<div class="${className}">${text}</div>`;
  }

  if (!sb) {
    showMessage("Client Supabase introuvable.", "error");
    return;
  }

  btn.addEventListener("click", async function () {
    const password1 = p1.value;
    const password2 = p2.value;

    if (!password1 || !password2) {
      showMessage("Veuillez renseigner les deux champs.", "error");
      return;
    }

    if (password1 !== password2) {
      showMessage("Les mots de passe ne correspondent pas.", "error");
      return;
    }

    if (password1.length < 8) {
      showMessage("Le mot de passe doit contenir au moins 8 caractères.", "error");
      return;
    }

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
