import { canReadTrack, toTrackForViewer } from "./tracks.js";

/* ------------------------------------------------------------------------ */
/* Fil d'activité des amis (étape 5)                                        */
/* ------------------------------------------------------------------------ */

/**
 * Événements enregistrés :
 * - track_published : un ami rend une piste visible (amis ou public) ;
 * - track_shared    : un ami me partage nommément une piste ;
 * - friend_accepted : un ami a accepté mon invitation.
 */
export const ACTIVITY_TYPES = ["track_published", "track_shared", "friend_accepted"];
export const ACTIVITY_LIMIT_DEFAULT = 10;
export const ACTIVITY_LIMIT_MAX = 30;

/** Identifiant sous forme de texte, que la référence soit peuplée ou non. */
function idOf(value) {
  if (value == null) return undefined;
  return String(value._id ?? value);
}

/**
 * Valide `limit` (1 à 30, défaut 10) et le curseur `before` (date ISO) :
 * le fil se lit page après page, des événements les plus récents aux plus anciens.
 * @returns {{ value: { limit: number, before?: Date }, errors: string[] }}
 */
export function parseActivityQuery(query = {}) {
  const errors = [];
  const value = { limit: ACTIVITY_LIMIT_DEFAULT };

  if (query.limit !== undefined && query.limit !== "") {
    const limit = typeof query.limit === "string" ? Number(query.limit) : NaN;
    if (!Number.isInteger(limit) || limit < 1 || limit > ACTIVITY_LIMIT_MAX) {
      errors.push(`limit doit être un entier entre 1 et ${ACTIVITY_LIMIT_MAX}`);
    } else {
      value.limit = limit;
    }
  }

  if (query.before !== undefined && query.before !== "") {
    const before = typeof query.before === "string" ? new Date(query.before) : null;
    if (!before || Number.isNaN(before.getTime())) {
      errors.push("before doit être une date ISO");
    } else {
      value.before = before;
    }
  }

  return { value, errors };
}

/**
 * Une piste est « publiée » quand elle quitte l'état privé (à la création
 * ou par un changement de visibilité). Passer d'« amis » à « public » n'est
 * pas une nouvelle publication : les amis la voyaient déjà.
 */
export function isPublication(previousVisibility, nextVisibility) {
  if (nextVisibility === undefined || nextVisibility === "private") return false;
  return (previousVisibility ?? "private") === "private";
}

/** Destinataires ajoutés par un nouveau partage (ceux qui l'avaient déjà sont ignorés). */
export function addedRecipients(previous = [], next = []) {
  const before = new Set(previous.map(String));
  return [...new Set(next.map(String))].filter((id) => !before.has(id));
}

/**
 * Filtre MongoDB des événements candidats pour `userId` : seuls ceux de mes
 * amis actuels, et parmi eux les partages qui me sont destinés et les
 * invitations que j'avais envoyées. `null` sans ami (inutile d'interroger la base).
 */
export function activityCandidatesFilter(userId, friendIds, before) {
  if (friendIds.length === 0) return null;

  const filter = {
    actorId: { $in: friendIds },
    $or: [
      { type: "track_published" },
      { type: "track_shared", recipients: userId },
      { type: "friend_accepted", targetId: userId },
    ],
  };
  if (before) filter.createdAt = { $lt: before };
  return filter;
}

/**
 * Contrôle final, appliqué à chaque événement lu : l'auteur doit toujours
 * être mon ami, et la piste concernée doit exister et m'être lisible
 * aujourd'hui (canReadTrack). Une piste repassée en privé, supprimée ou un
 * ancien ami disparaissent donc du fil sans autre traitement.
 */
export function isActivityVisible(activity, track, userId, friendIds) {
  const actorId = idOf(activity.actorId);
  if (!actorId || !friendIds.some((id) => String(id) === actorId)) return false;

  if (activity.type === "friend_accepted") return idOf(activity.targetId) === String(userId);
  if (!track) return false;
  if (
    activity.type === "track_shared" &&
    !(activity.recipients ?? []).some((id) => idOf(id) === String(userId))
  ) {
    return false;
  }
  return canReadTrack(track, userId, friendIds);
}

/**
 * Format renvoyé au client. L'auteur est présenté par `{ id, name }` ; la
 * piste éventuelle suit le format Track habituel vu par `viewerId`.
 */
export function toActivityView(activity, track, viewerId) {
  const actor = { id: idOf(activity.actorId), name: activity.actorId?.name ?? "" };
  const view = {
    id: String(activity._id),
    type: activity.type,
    createdAt: activity.createdAt,
    actor,
  };
  if (track) view.track = { ...toTrackForViewer(track, viewerId), ownerName: actor.name };
  return view;
}

/**
 * Curseur de la page suivante : la date du dernier événement lu si la page
 * est pleine, sinon `null` (fin du fil). Il est calculé sur les événements
 * lus, avant le filtrage final, pour ne jamais relire les mêmes.
 */
export function nextActivityCursor(scanned, limit) {
  return scanned.length === limit ? scanned[scanned.length - 1].createdAt : null;
}
