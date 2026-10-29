/*
 * Règles métier des pistes, écrites sous forme de fonctions pures : elles ne
 * dépendent ni d'Express ni de MongoDB. Les routes les appellent, et les tests
 * peuvent les vérifier directement sans base de données.
 */

/** Niveaux de visibilité d'une piste, du plus restreint au plus ouvert. */
export const VISIBILITIES = ["private", "friends", "public"];

/**
 * Tonalités acceptées : 12 notes en majeur, puis en mineur (suffixe "m").
 * Une liste fermée garde des valeurs homogènes pour la future recherche.
 */
const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const MUSICAL_KEYS = [...NOTES, ...NOTES.map((note) => `${note}m`)];

export const BPM_MIN = 20;
export const BPM_MAX = 300;
export const TITLE_MAX_LENGTH = 120;
export const GENRE_MAX_LENGTH = 40;
export const TAG_MAX_LENGTH = 30;
export const TAGS_MAX_COUNT = 10;

/** Compare deux identifiants, qu'ils soient des chaînes ou des ObjectId. */
function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

/** Extrait l'identifiant du propriétaire, même si `ownerId` a été peuplé. */
function ownerIdOf(track) {
  const owner = track.ownerId;
  return owner && typeof owner === "object" && "_id" in owner ? owner._id : owner;
}

/** Seul le propriétaire peut modifier ou supprimer une piste. */
export function isTrackOwner(track, userId) {
  return sameId(ownerIdOf(track), userId);
}

/**
 * Indique si `userId` peut écouter la piste.
 * `friendIds` contient les amis de `userId` (liste vide tant que la gestion
 * des amis n'existe pas). Une piste partagée nominativement n'est lisible que
 * si l'amitié existe toujours : supprimer un ami coupe aussi ses partages.
 */
export function canReadTrack(track, userId, friendIds = []) {
  if (!track || !userId) return false;
  if (isTrackOwner(track, userId)) return true;
  if (track.visibility === "public") return true;

  const isFriendOfOwner = friendIds.some((id) => sameId(id, ownerIdOf(track)));
  if (!isFriendOfOwner) return false;
  if (track.visibility === "friends") return true;

  return (track.sharedWith || []).some((id) => sameId(id, userId));
}

/**
 * Normalise les tags : accepte un tableau ou une chaîne "blues, lent",
 * passe en minuscules, retire les doublons et les valeurs vides.
 */
export function parseTags(input) {
  const raw = Array.isArray(input) ? input : String(input ?? "").split(",");
  const tags = raw
    .map((tag) => String(tag).trim().toLowerCase())
    .filter((tag) => tag.length > 0);
  return [...new Set(tags)];
}

/** Une valeur vide ("" ou null) signifie « effacer ce champ ». */
function isBlank(value) {
  return value === null || String(value).trim() === "";
}

/**
 * Valide les métadonnées envoyées par le client (formulaire multipart ou JSON).
 * Seuls les champs présents dans `input` sont validés et renvoyés, ce qui sert
 * à la fois à la création et à la modification partielle (PATCH).
 * @returns {{ value: object, errors: string[] }}
 */
export function parseTrackMetadata(input = {}) {
  const value = {};
  const errors = [];

  if (input.title !== undefined) {
    const title = String(input.title).trim();
    if (!title) errors.push("Le titre ne peut pas être vide");
    else if (title.length > TITLE_MAX_LENGTH)
      errors.push(`Le titre dépasse ${TITLE_MAX_LENGTH} caractères`);
    else value.title = title;
  }

  if (input.visibility !== undefined) {
    if (VISIBILITIES.includes(input.visibility)) value.visibility = input.visibility;
    else errors.push("Visibilité inconnue (private, friends ou public)");
  }

  if (input.bpm !== undefined) {
    if (isBlank(input.bpm)) value.bpm = null;
    else {
      const bpm = Number(input.bpm);
      if (Number.isInteger(bpm) && bpm >= BPM_MIN && bpm <= BPM_MAX) value.bpm = bpm;
      else errors.push(`Le BPM doit être un entier entre ${BPM_MIN} et ${BPM_MAX}`);
    }
  }

  if (input.key !== undefined) {
    if (isBlank(input.key)) value.key = null;
    else if (MUSICAL_KEYS.includes(input.key)) value.key = input.key;
    else errors.push("Tonalité inconnue");
  }

  if (input.genre !== undefined) {
    const genre = isBlank(input.genre) ? null : String(input.genre).trim();
    if (genre && genre.length > GENRE_MAX_LENGTH)
      errors.push(`Le genre dépasse ${GENRE_MAX_LENGTH} caractères`);
    else value.genre = genre;
  }

  if (input.tags !== undefined) {
    const tags = parseTags(input.tags);
    if (tags.length > TAGS_MAX_COUNT) errors.push(`${TAGS_MAX_COUNT} tags maximum`);
    else if (tags.some((tag) => tag.length > TAG_MAX_LENGTH))
      errors.push(`Un tag dépasse ${TAG_MAX_LENGTH} caractères`);
    else value.tags = tags;
  }

  return { value, errors };
}

/** Lit `page` et `limit` dans la query string en les bornant. */
export function parsePagination(query = {}, defaultLimit = 5) {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const limit = Math.min(20, Math.max(1, Math.floor(Number(query.limit)) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Convertit une piste (document Mongoose ou objet `.lean()`) en objet sûr
 * pour le frontend. `storedName` et `sharedWith` ne sont jamais exposés ici.
 * Si `ownerId` a été peuplé avec le nom du propriétaire, `ownerName` est ajouté.
 */
export function toPublicTrack(track) {
  const owner = track.ownerId;
  const populated = owner && typeof owner === "object" && "name" in owner;

  return {
    id: String(track._id),
    ownerId: String(ownerIdOf(track)),
    ...(populated ? { ownerName: owner.name } : {}),
    title: track.title,
    originalName: track.originalName,
    mimeType: track.mimeType,
    size: track.size,
    createdAt: track.createdAt,
    visibility: track.visibility ?? "private",
    bpm: track.bpm ?? null,
    key: track.key ?? null,
    genre: track.genre ?? null,
    tags: track.tags ? [...track.tags] : [],
  };
}

/* ------------------------------------------------------------------------ */
/* Recherche (étape 2)                                                      */
/* ------------------------------------------------------------------------ */

/** Périmètres de recherche : tout ce que je peux écouter, public, mes pistes. */
export const SEARCH_SCOPES = ["all", "public", "mine"];
export const SEARCH_QUERY_MAX_LENGTH = 100;

/**
 * Échappe les caractères spéciaux d'une expression régulière : la saisie
 * "a.b*" doit chercher le texte littéral, pas un motif. Cela évite aussi
 * qu'un utilisateur envoie une regex coûteuse au serveur MongoDB.
 */
export function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex insensible à la casse : « contient ce texte ». */
export function containsRegex(text) {
  return new RegExp(escapeRegex(text), "i");
}

/**
 * Valide les paramètres de recherche reçus dans la query string.
 * Un paramètre répété (?q=a&q=b) arrive sous forme de tableau : il est refusé.
 * @returns {{ value: object, errors: string[] }}
 */
export function parseSearchQuery(query = {}) {
  const value = { scope: "all" };
  const errors = [];

  const read = (name) => {
    const raw = query[name];
    if (raw === undefined) return undefined;
    if (typeof raw !== "string") {
      errors.push(`Paramètre ${name} invalide`);
      return undefined;
    }
    const trimmed = raw.trim();
    return trimmed === "" ? undefined : trimmed;
  };

  const q = read("q");
  if (q !== undefined) {
    if (q.length > SEARCH_QUERY_MAX_LENGTH)
      errors.push(`La recherche dépasse ${SEARCH_QUERY_MAX_LENGTH} caractères`);
    else value.q = q;
  }

  const scope = read("scope");
  if (scope !== undefined) {
    if (SEARCH_SCOPES.includes(scope)) value.scope = scope;
    else errors.push("Périmètre inconnu (all, public ou mine)");
  }

  const genre = read("genre");
  if (genre !== undefined) {
    if (genre.length > GENRE_MAX_LENGTH)
      errors.push(`Le genre dépasse ${GENRE_MAX_LENGTH} caractères`);
    else value.genre = genre;
  }

  const key = read("key");
  if (key !== undefined) {
    if (MUSICAL_KEYS.includes(key)) value.key = key;
    else errors.push("Tonalité inconnue");
  }

  for (const name of ["bpmMin", "bpmMax"]) {
    const raw = read(name);
    if (raw === undefined) continue;
    const bpm = Number(raw);
    if (Number.isInteger(bpm) && bpm >= BPM_MIN && bpm <= BPM_MAX) value[name] = bpm;
    else errors.push(`${name} doit être un entier entre ${BPM_MIN} et ${BPM_MAX}`);
  }
  if (value.bpmMin !== undefined && value.bpmMax !== undefined && value.bpmMin > value.bpmMax) {
    errors.push("bpmMin doit être inférieur ou égal à bpmMax");
  }

  return { value, errors };
}

/**
 * Conditions MongoDB des pistes que `userId` peut écouter. C'est la
 * traduction en requête de canReadTrack : les deux doivent rester alignées.
 */
export function readableTracksFilter(userId, friendIds = []) {
  const clauses = [{ ownerId: userId }, { visibility: "public" }];
  if (friendIds.length > 0) {
    clauses.push(
      { visibility: "friends", ownerId: { $in: friendIds } },
      { sharedWith: userId, ownerId: { $in: friendIds } },
    );
  }
  return { $or: clauses };
}

/**
 * Construit le filtre MongoDB d'une recherche validée par parseSearchQuery.
 * - `scope` limite le périmètre, toujours à l'intérieur des pistes lisibles ;
 * - `q` cherche dans le titre, les tags, le genre, le nom du fichier et,
 *   via `ownerIds`, le nom du propriétaire (résolu au préalable par la route) ;
 * - genre et tonalité sont des égalités, le BPM un intervalle.
 */
export function buildSearchFilter(criteria, userId, { friendIds = [], ownerIds = [] } = {}) {
  const conditions = [];

  if (criteria.scope === "mine") conditions.push({ ownerId: userId });
  else if (criteria.scope === "public") conditions.push({ visibility: "public" });
  else conditions.push(readableTracksFilter(userId, friendIds));

  if (criteria.q) {
    const regex = containsRegex(criteria.q);
    const textClauses = [
      { title: regex },
      { tags: regex },
      { genre: regex },
      { originalName: regex },
    ];
    if (ownerIds.length > 0) textClauses.push({ ownerId: { $in: ownerIds } });
    conditions.push({ $or: textClauses });
  }

  if (criteria.genre) {
    conditions.push({ genre: new RegExp(`^${escapeRegex(criteria.genre)}$`, "i") });
  }
  if (criteria.key) conditions.push({ key: criteria.key });

  if (criteria.bpmMin !== undefined || criteria.bpmMax !== undefined) {
    const bpm = {};
    if (criteria.bpmMin !== undefined) bpm.$gte = criteria.bpmMin;
    if (criteria.bpmMax !== undefined) bpm.$lte = criteria.bpmMax;
    conditions.push({ bpm });
  }

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

/* ------------------------------------------------------------------------ */
/* Partage nominatif (étape 4)                                              */
/* ------------------------------------------------------------------------ */

export const SHARES_MAX_COUNT = 50;

/**
 * Valide la liste complète des amis avec qui partager une piste.
 * Chaque identifiant doit désigner un ami confirmé du propriétaire :
 * on ne peut pas partager avec un inconnu ni avec soi-même.
 * @returns {{ value: string[], errors: string[] }}
 */
export function validateShareTargets(userIds, ownerId, friendIds = []) {
  if (!Array.isArray(userIds) || userIds.some((id) => typeof id !== "string")) {
    return { value: [], errors: ["userIds doit être un tableau d'identifiants"] };
  }

  const unique = [...new Set(userIds)];
  const errors = [];
  if (unique.length > SHARES_MAX_COUNT) {
    errors.push(`${SHARES_MAX_COUNT} partages maximum par piste`);
  }
  if (unique.some((id) => sameId(id, ownerId))) {
    errors.push("Impossible de partager une piste avec soi-même");
  }
  const friends = new Set(friendIds.map(String));
  if (unique.some((id) => !sameId(id, ownerId) && !friends.has(id))) {
    errors.push("Une piste ne peut être partagée qu'avec vos amis");
  }

  return { value: errors.length ? [] : unique, errors };
}

/**
 * Filtre MongoDB de la page « Partagés avec moi » : pistes de mes amis
 * visibles par tous leurs amis, ou partagées avec moi nommément.
 * Retourne null si je n'ai aucun ami (inutile d'interroger la base).
 */
export function sharedWithMeFilter(userId, friendIds = []) {
  if (friendIds.length === 0) return null;
  return {
    ownerId: { $in: friendIds },
    $or: [{ visibility: "friends" }, { sharedWith: userId }],
  };
}

/**
 * Vue d'une piste adaptée à celui qui la regarde :
 * - le propriétaire reçoit en plus `sharedWith` (identifiants des amis) ;
 * - un autre utilisateur reçoit `sharedWithMe` : vrai si la piste lui est
 *   partagée nommément. La liste des autres destinataires reste privée.
 */
export function toTrackForViewer(track, viewerId) {
  const view = toPublicTrack(track);
  const sharedWith = (track.sharedWith || []).map(String);
  if (isTrackOwner(track, viewerId)) return { ...view, sharedWith };
  return { ...view, sharedWithMe: sharedWith.includes(String(viewerId)) };
}
