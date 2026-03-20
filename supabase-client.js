(function () {
  const SUPABASE_URL = "https://ptdqwggwwougrmkbsuvl.supabase.co";
  const SUPABASE_KEY = "sb_publishable_xwdi8H9UizW5CKMNVAQHxg_hz_yVoIz";

  function initSupabaseClient() {
    try {
      if (!window.supabase) {
        console.error("Supabase global non disponible.");
        return;
      }

      const { createClient } = window.supabase;

      if (typeof createClient !== "function") {
        console.error("createClient introuvable dans window.supabase.");
        return;
      }

      if (!window.sb) {
        window.sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
      }

      console.log("Supabase client initialisé avec succès.");
    } catch (error) {
      console.error("Erreur initialisation Supabase :", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSupabaseClient);
  } else {
    initSupabaseClient();
  }
})();
