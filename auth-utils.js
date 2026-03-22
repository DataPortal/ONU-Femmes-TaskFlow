(function () {
  function resolveMessageTarget(target) {
    if (!target) return null;
    if (typeof target === "string") {
      return document.getElementById(target);
    }
    return target;
  }

  function showMessage(target, text, type = "info") {
    const element = resolveMessageTarget(target);
    if (!element) return;

    let className = "info-box";
    if (type === "error") className = "error-box";
    if (type === "success") className = "success-box";

    element.innerHTML = `<div class="${className}">${text}</div>`;
  }

  async function waitForClient(maxWaitMs = 8000) {
    const start = Date.now();

    while (!window.sb) {
      if (Date.now() - start > maxWaitMs) return null;
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    return window.sb;
  }

  function normalizeEmail(value) {
    return (value || "").trim().toLowerCase();
  }

  function extractNameFromEmail(email) {
    const localPart = normalizeEmail(email).split("@")[0] || "";
    if (!localPart) return "";

    return localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function isProfileActive(profile) {
    return profile?.is_active !== false;
  }

  function normalizeProfile(profile = {}, authUser = null) {
    const metadata = authUser?.user_metadata || {};
    const email = profile.email || authUser?.email || "";

    return {
      id: profile.id || authUser?.id || null,
      full_name:
        profile.full_name ||
        metadata.full_name ||
        metadata.name ||
        extractNameFromEmail(email) ||
        "Utilisateur",
      email,
      role: profile.role || "staff",
      pillar_id: profile.pillar_id ?? null,
      supervisor_id: profile.supervisor_id ?? null,
      office: profile.office || metadata.office || "",
      is_active: isProfileActive(profile)
    };
  }

  function validatePasswordPair(password, confirmation, minLength = 8) {
    if (!password || !confirmation) {
      return "Veuillez renseigner les deux champs mot de passe.";
    }

    if (password !== confirmation) {
      return "Les mots de passe ne correspondent pas.";
    }

    if (password.length < minLength) {
      return `Le mot de passe doit contenir au moins ${minLength} caractères.`;
    }

    return null;
  }

  function setButtonLoading(button, isLoading, loadingText, idleText) {
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : idleText;
  }

  function getAuthFlowType() {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    return params.get("type") || hashParams.get("type") || "";
  }

  window.AuthUI = {
    extractNameFromEmail,
    getAuthFlowType,
    isProfileActive,
    normalizeEmail,
    normalizeProfile,
    setButtonLoading,
    showMessage,
    validatePasswordPair,
    waitForClient
  };
})();
