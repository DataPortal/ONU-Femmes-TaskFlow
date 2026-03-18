function canManageTeamMember(targetUser) {
  const currentUser = getCurrentUser();
  if (!currentUser || !targetUser) return false;

  const isAdmin = currentUser.user_type === "admin";
  const isSupervisor = currentUser.user_type === "supervisor";

  if (isAdmin) return true;
  if (!isSupervisor) return false;

  return targetUser.supervisor_id === currentUser.id;
}

function canDeleteUser(targetUser) {
  if (!targetUser) return false;

  // On ne supprime réellement que les utilisateurs locaux
  if (targetUser.is_local !== true) return false;

  return canManageTeamMember(targetUser);
}

function appendComment(existingText, authorName, newText) {
  const clean = (newText || "").trim();
  if (!clean) return existingText || "";

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");

  const entry = `[${yyyy}-${mm}-${dd} ${hh}:${mi}] ${authorName} : ${clean}`;
  return existingText ? `${existingText}\n${entry}` : entry;
}

function scoreToPercent(score) {
  const safeScore = clamp(Number(score), 0, 10);
  return safeScore * 10;
}
