import { TEAM_MESSAGES } from "../constants/messages";

export function hashWorkspaceId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getTeamDailyMessage(workspaceId: string): string {
  const hash = hashWorkspaceId(workspaceId);
  const today = new Date();
  // Ensure the date string is deterministic per day (local time)
  const dateString = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  
  let dateHash = 0;
  for (let i = 0; i < dateString.length; i++) {
    const char = dateString.charCodeAt(i);
    dateHash = (dateHash << 5) - dateHash + char;
    dateHash |= 0;
  }
  dateHash = Math.abs(dateHash);
  
  const index = (hash + dateHash) % TEAM_MESSAGES.length;
  return TEAM_MESSAGES[index];
}
