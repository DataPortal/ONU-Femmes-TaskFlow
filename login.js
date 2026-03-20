document.addEventListener("DOMContentLoaded", async () => {
  const loginBtn = document.getElementById("loginBtn");
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const messageBox = document.getElementById("loginMessage");

  if (!window.sb) {
    showMessage("Client Supabase introuvable.", "error");
    return;
  }

  try {
    const {
      data: { session },
      error
    } = await window.sb.auth.getSession();

    if (error) {
      console.error("Erreur session :", error);
    }

    if (session) {
      window.location.href = "index.html";
      return;
    }
  } catch (err) {
    console.error("Erreur session :", err);
  }

  if (!loginBtn || !emailInput || !passwordInput || !messageBox) {
    console.error("Éléments de connexion introuvables.");
    return;
  }

  async function handleLogin() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showMessage("Veuillez renseigner votre email et votre mot de passe.", "error");
      return;
    }

    showMessage("Connexion en cours...", "info");
    loginBtn.disabled = true;
    loginBtn.textContent = "Connexion...";

    try {
      const { error: signInError } = await window.sb.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        console.error("Erreur signIn :", signInError);
        showMessage("Connexion impossible. Vérifiez vos identifiants.", "error");
        return;
      }

      const {
        data: { user },
        error: userError
      } = await window.sb.auth.getUser();

      if (userError || !user) {
        console.error("Erreur getUser :", userError);
        showMessage("Connexion réussie, mais impossible de récupérer le compte.", "error");
        return;
      }

      const { data: profile, error: profileError } = await window.sb
        .from("profiles")
        .select("id, full_name, email, role, pillar_id, supervisor_id, office, is_active")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Erreur profile :", profileError);
        showMessage("Compte connecté, mais profil introuvable dans profiles.", "error");
        return;
      }

      if (!profile) {
        showMessage("Aucun profil trouvé pour cet utilisateur.", "error");
        return;
      }

      if (profile.is_active === false) {
        await window.sb.auth.signOut();
        showMessage("Votre compte est désactivé.", "error");
        return;
      }

      showMessage("Connexion réussie. Redirection...", "success");

      setTimeout(() => {
        window.location.href = "index.html";
      }, 800);
    } catch (err) {
      console.error("Erreur inattendue login :", err);
      showMessage("Une erreur technique empêche la connexion.", "error");
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

  function showMessage(text, type) {
    if (!messageBox) return;

    let className = "info-box";
    if (type === "error") className = "error-box";
    if (type === "success") className = "success-box";

    messageBox.innerHTML = `<div class="${className}">${text}</div>`;
  }
});
