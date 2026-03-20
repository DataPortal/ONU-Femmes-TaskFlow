(function () {
  const SUPABASE_URL = "https://ptdqwggwwougrmkbsuvl.supabase.co";
  const SUPABASE_KEY = "sb_publishable_xwdi8H9UizW5CKMNVAQHxg_hz_yVoIz";

  if (!window.supabase) {
    console.error("La librairie Supabase JS n'est pas chargée.");
    return;
  }

  if (!window.sb) {
    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
})();
