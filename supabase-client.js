(function () {
  const SUPABASE_URL = "https://ptdqwggwwougrmkbsuvl.supabase.co";
  const SUPABASE_KEY = "sb_publishable_xwdi8H9UizW5CKMNVAQHxg_hz_yVoIz";

  if (!window.supabase) {
    console.error("La librairie Supabase JS n'est pas chargée.");
    return;
  }

  const { createClient } = window.supabase;

  if (typeof createClient !== "function") {
    console.error("createClient introuvable.");
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
})();
