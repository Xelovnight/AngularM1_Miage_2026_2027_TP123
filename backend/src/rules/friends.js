/*
 * Règles métier des amitiés, écrites sous forme de fonctions pures (aucune
 * dépendance à Express ou MongoDB) pour être testées directement.
 *
 * Une amitié est un document unique par paire d'utilisateurs :
 * - status "pending"  : `requester` a invité `recipient`, qui n'a pas répondu ;
 * - status "accepted" : les deux utilisateurs sont amis.
 * Refuser, annuler ou supprimer une amitié supprime le document.
 */

export const FRIENDSHIP_STATUSES = ["pending", "accepted"];

/** Compare deux identifiants, qu'ils soient des chaînes ou des ObjectId. */
function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

/** Identifiant d'un champ éventuellement peuplé ({ _id, name }). */
function idOf(value) {
  return value && typeof value === "object" && "_id" in value ? value._id : value;
}

/**
 * Clé unique d'une paire, indépendante du sens : A→B et B→A donnent la même
 * clé. Un index unique sur cette clé empêche deux invitations croisées.
 */
export function friendshipPairKey(a, b) {
  return [String(a), String(b)].sort().join(":");
}

/** L'autre membre de l'amitié, vu depuis `userId`. */
export function otherMember(friendship, userId) {
  return sameId(idOf(friendship.requester), userId) ? friendship.recipient : friendship.requester;
}

/** Vrai si `userId` est l'un des deux membres. */
export function isMember(friendship, userId) {
  return (
    sameId(idOf(friendship.requester), userId) || sameId(idOf(friendship.recipient), userId)
  );
}

/** Identifiants des amis confirmés de `userId` (sert au contrôle d'accès des pistes). */
export function friendIdsFrom(friendships, userId) {
  return friendships
    .filter((f) => f.status === "accepted" && isMember(f, userId))
    .map((f) => idOf(otherMember(f, userId)));
}

/**
 * Décide quoi faire quand `requesterId` invite `recipientId`, sachant
 * l'amitié `existing` entre eux (ou null). Retourne :
 * - { action: "create" }  : nouvelle invitation ;
 * - { action: "accept" }  : l'autre m'avait déjà invité, on devient amis ;
 * - { action: "reject", status, message } : invitation impossible.
 */
export function decideInvitation(existing, requesterId, recipientId) {
  if (sameId(requesterId, recipientId)) {
    return { action: "reject", status: 400, message: "Impossible de s'inviter soi-même" };
  }
  if (!existing) return { action: "create" };
  if (existing.status === "accepted") {
    return { action: "reject", status: 409, message: "Vous êtes déjà amis" };
  }
  if (sameId(idOf(existing.requester), requesterId)) {
    return { action: "reject", status: 409, message: "Invitation déjà envoyée" };
  }
  // Invitation croisée : la personne invitée m'avait déjà invité.
  return { action: "accept" };
}

/** Seul le destinataire d'une invitation en attente peut l'accepter. */
export function canAccept(friendship, userId) {
  return (
    !!friendship &&
    friendship.status === "pending" &&
    sameId(idOf(friendship.recipient), userId)
  );
}

/**
 * Une invitation en attente peut être supprimée par ses deux membres :
 * le destinataire la refuse, l'expéditeur l'annule.
 */
export function canDeleteRequest(friendship, userId) {
  return !!friendship && friendship.status === "pending" && isMember(friendship, userId);
}

/** Forme publique d'un utilisateur : jamais d'email dans les listes d'amis. */
function publicUser(user) {
  return user && typeof user === "object" && "name" in user
    ? { id: String(user._id), name: user.name }
    : { id: String(user), name: null };
}

/**
 * Range les amitiés de `userId` en trois listes pour la page Amis :
 * amis confirmés, invitations reçues, invitations envoyées.
 * `requester` et `recipient` sont normalement peuplés avec { _id, name }.
 */
export function classifyFriendships(friendships, userId) {
  const overview = { friends: [], incoming: [], outgoing: [] };

  for (const f of friendships) {
    if (!isMember(f, userId)) continue;
    const entry = {
      friendshipId: String(f._id),
      user: publicUser(otherMember(f, userId)),
    };

    if (f.status === "accepted") {
      overview.friends.push({ ...entry, since: f.acceptedAt ?? f.updatedAt ?? null });
    } else if (sameId(idOf(f.recipient), userId)) {
      overview.incoming.push({ ...entry, createdAt: f.createdAt ?? null });
    } else {
      overview.outgoing.push({ ...entry, createdAt: f.createdAt ?? null });
    }
  }

  overview.friends.sort((a, b) => (a.user.name ?? "").localeCompare(b.user.name ?? "", "fr"));
  return overview;
}

/** Valide le texte de recherche d'utilisateurs (2 à 50 caractères). */
export function parseUserSearch(raw) {
  if (typeof raw !== "string") return { error: "Paramètre q requis" };
  const q = raw.trim();
  if (q.length < 2) return { error: "Saisissez au moins 2 caractères" };
  if (q.length > 50) return { error: "La recherche dépasse 50 caractères" };
  return { q };
}
