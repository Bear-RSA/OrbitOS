/* ------------------------------------------------------------------ */
/*  Town Hall's picture                                                */
/*                                                                     */
/*  Same footing as a chat image: the server picks the `public_id`,    */
/*  signs it, and later checks the id the browser echoes back against  */
/*  the folder it would have signed. An id outside the caller's own    */
/*  org folder was never signed, so it cannot become another           */
/*  workspace's logo.                                                  */
/* ------------------------------------------------------------------ */

const TOWN_HALL_PHOTO_ROOT = "townhall";

/** Longest edge Cloudinary keeps. A logo is drawn at 48px at most. */
export const TOWN_HALL_PHOTO_EDGE_PX = 512;

export function townHallPhotoFolder(orgId: string): string {
  return `${TOWN_HALL_PHOTO_ROOT}/${orgId}`;
}

/** Whether `value` is an id this server would have signed for this org's logo. */
export function isTownHallPhotoPublicId(value: unknown, orgId: string): value is string {
  if (typeof value !== "string") return false;
  const prefix = `${townHallPhotoFolder(orgId)}/`;
  if (!value.startsWith(prefix)) return false;
  return /^[A-Za-z0-9_-]{8,64}$/.test(value.slice(prefix.length));
}
