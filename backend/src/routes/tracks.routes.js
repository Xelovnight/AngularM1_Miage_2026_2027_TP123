import { Router } from "express";
import mongoose from "mongoose";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { Track } from "../models/Track.js";
import { User } from "../models/User.js";
import { auth } from "../middlewares/auth.js";
import { friendIdsOf } from "../services/friendships.js";
import { recordActivity, removeTrackActivities } from "../services/activity.js";
import { addedRecipients, isPublication } from "../rules/activity.js";
import { UPLOADS, upload, removeUploadedFile } from "../middlewares/upload.js";
import {
  buildSearchFilter,
  canReadTrack,
  containsRegex,
  parsePagination,
  parseSearchQuery,
  parseTrackMetadata,
  sharedWithMeFilter,
  toTrackForViewer,
  validateShareTargets,
} from "../rules/tracks.js";

// Nombre maximal d'utilisateurs dont le nom correspond à la recherche.
const MAX_MATCHING_OWNERS = 50;

/** Routes des pistes audio (préfixe /api/tracks). Toutes exigent un JWT. */
export const tracksRouter = Router();
tracksRouter.use(auth);

/** Un identifiant mal formé ne peut correspondre à aucune piste : 404 direct. */
function rejectInvalidId(req, res) {
  if (mongoose.isValidObjectId(req.params.id)) return false;
  console.warn(`[tracks] Identifiant invalide : ${req.params.id}`);
  res.status(404).json({ message: "Piste inconnue" });
  return true;
}

/**
 * Renvoie une page de pistes au format `Page<Track>`, chaque piste étant
 * présentée du point de vue de `viewerId` (voir toTrackForViewer).
 */
async function sendPage(res, filter, query, viewerId, populateOwner = false) {
  const { page, limit, skip } = parsePagination(query);

  // La lecture des pistes et le comptage total sont parallélisés pour réduire la latence.
  // Promise.all attend que les deux opérations soient terminées avant de continuer.
  let find = Track.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
  if (populateOwner) find = find.populate("ownerId", "name");
  const [items, total] = await Promise.all([find.lean(), Track.countDocuments(filter)]);

  console.log(`[tracks] ${items.length} piste(s) envoyée(s) sur ${total}`);
  res.json({
    items: items.map((track) => toTrackForViewer(track, viewerId)),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}

/** Retourne une page des pistes appartenant exclusivement à l'utilisateur. */
tracksRouter.get("/", async (req, res, next) => {
  try {
    console.log(`[tracks] Bibliothèque de ${req.auth.sub}, page=${req.query.page ?? 1}`);
    await sendPage(res, { ownerId: req.auth.sub }, req.query, req.auth.sub);
  } catch (error) {
    console.error("[tracks] Erreur de pagination", error);
    next(error);
  }
});

/**
 * Pistes publiques de tous les utilisateurs, les plus récentes d'abord
 * (« fichiers récemment ajoutés »). Le nom du propriétaire est inclus.
 */
tracksRouter.get("/public", async (req, res, next) => {
  try {
    console.log(`[tracks] Pistes publiques, page=${req.query.page ?? 1}`);
    await sendPage(res, { visibility: "public" }, req.query, req.auth.sub, true);
  } catch (error) {
    console.error("[tracks] Erreur de lecture des pistes publiques", error);
    next(error);
  }
});

/**
 * Recherche parmi les pistes que l'utilisateur peut écouter.
 * Flux : query string -> parseSearchQuery (validation) -> noms d'utilisateurs
 * correspondant à `q` -> buildSearchFilter -> MongoDB (paginé, plus récent d'abord).
 */
tracksRouter.get("/search", async (req, res, next) => {
  try {
    const { value: criteria, errors } = parseSearchQuery(req.query);
    if (errors.length > 0) {
      console.warn(`[tracks] Recherche refusée : ${errors.join(", ")}`);
      return res.status(400).json({ message: errors.join(". ") });
    }

    const friendIds = await friendIdsOf(req.auth.sub);

    // Chercher "alice" doit aussi trouver les pistes de l'utilisatrice Alice.
    const ownerIds = criteria.q
      ? (
          await User.find({ name: containsRegex(criteria.q) })
            .select("_id")
            .limit(MAX_MATCHING_OWNERS)
            .lean()
        ).map((user) => user._id)
      : [];

    const filter = buildSearchFilter(criteria, req.auth.sub, { friendIds, ownerIds });
    console.log(
      `[tracks] Recherche par ${req.auth.sub} : ${JSON.stringify(criteria)} (${ownerIds.length} auteur(s) correspondant(s))`,
    );
    await sendPage(res, filter, req.query, req.auth.sub, true);
  } catch (error) {
    console.error("[tracks] Erreur de recherche", error);
    next(error);
  }
});

/**
 * Pistes que mes amis rendent accessibles : visibilité "friends" ou partage
 * nommé avec moi. Chaque piste indique `sharedWithMe` pour distinguer les deux.
 */
tracksRouter.get("/shared-with-me", async (req, res, next) => {
  try {
    const friendIds = await friendIdsOf(req.auth.sub);
    const filter = sharedWithMeFilter(req.auth.sub, friendIds);
    console.log(`[tracks] Partagés avec ${req.auth.sub} : ${friendIds.length} ami(s)`);

    if (!filter) {
      const { page, limit } = parsePagination(req.query);
      return res.json({ items: [], page, limit, total: 0, pages: 1 });
    }
    await sendPage(res, filter, req.query, req.auth.sub, true);
  } catch (error) {
    console.error("[tracks] Erreur de lecture des pistes partagées", error);
    next(error);
  }
});

/**
 * Reçoit le champ multipart audio et les champs texte title, visibility,
 * bpm, key, genre et tags. Flux : multipart/form-data -> Multer (type, taille,
 * nom de stockage) -> validation des métadonnées -> MongoDB.
 * Si la validation ou MongoDB échoue, le fichier déjà écrit est supprimé.
 */
tracksRouter.post("/", upload.single("audio"), async (req, res, next) => {
  if (!req.file) {
    console.warn(`[tracks] Upload sans fichier par ${req.auth.sub}`);
    return res.status(400).json({ message: "Fichier audio requis" });
  }

  try {
    const { title, ...metadata } = req.body ?? {};
    // Un titre vide reste accepté à la création : le nom du fichier le remplace.
    const input = title?.trim() ? { title, ...metadata } : metadata;
    const { value, errors } = parseTrackMetadata(input);

    if (errors.length > 0) {
      console.warn(`[tracks] Métadonnées refusées : ${errors.join(", ")}`);
      await removeUploadedFile(req.file.filename);
      return res.status(400).json({ message: errors.join(". ") });
    }

    const track = await Track.create({
      title: req.file.originalname,
      ...value,
      ownerId: req.auth.sub,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });

    console.log(`[tracks] Upload enregistré : ${track.id} (${track.visibility})`);
    if (isPublication(undefined, track.visibility)) {
      await recordActivity({ actorId: req.auth.sub, type: "track_published", trackId: track._id });
    }
    res.status(201).json(toTrackForViewer(track, req.auth.sub));
  } catch (error) {
    console.error("[tracks] Erreur après l'enregistrement du fichier", error);
    await removeUploadedFile(req.file.filename);
    next(error);
  }
});

/**
 * Modifie la visibilité et/ou les métadonnées d'une piste. Seul le
 * propriétaire peut le faire : le filtre { _id, ownerId } renvoie 404 sinon.
 */
tracksRouter.patch("/:id", async (req, res, next) => {
  try {
    if (rejectInvalidId(req, res)) return;

    const { value, errors } = parseTrackMetadata(req.body ?? {});
    if (errors.length > 0) {
      console.warn(`[tracks] Modification refusée : ${errors.join(", ")}`);
      return res.status(400).json({ message: errors.join(". ") });
    }
    if (Object.keys(value).length === 0) {
      console.warn(`[tracks] Modification vide pour ${req.params.id}`);
      return res.status(400).json({ message: "Aucune modification fournie" });
    }

    // returnDocument "before" : la même opération atomique donne l'ancienne
    // visibilité (pour le fil d'activité) ; la réponse applique ensuite `value`.
    const previous = await Track.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.auth.sub },
      { $set: value },
      { returnDocument: "before", runValidators: true },
    ).lean();

    if (!previous) {
      console.warn(`[tracks] Modification impossible : ${req.params.id}`);
      return res.status(404).json({ message: "Piste inconnue" });
    }

    console.log(`[tracks] Piste modifiée : ${previous._id} (${Object.keys(value).join(", ")})`);
    if (isPublication(previous.visibility, value.visibility)) {
      await recordActivity({ actorId: req.auth.sub, type: "track_published", trackId: previous._id });
    }
    res.json(toTrackForViewer({ ...previous, ...value }, req.auth.sub));
  } catch (error) {
    console.error("[tracks] Erreur de modification", error);
    next(error);
  }
});

/**
 * Définit la liste complète des amis avec qui la piste est partagée
 * (remplace la précédente : une liste vide arrête tous les partages).
 * Réservé au propriétaire ; chaque destinataire doit être un ami confirmé.
 */
tracksRouter.put("/:id/shares", async (req, res, next) => {
  try {
    if (rejectInvalidId(req, res)) return;

    // Forme du corps vérifiée avant toute requête : un tableau d'ObjectId.
    const requested = req.body?.userIds;
    if (
      !Array.isArray(requested) ||
      !requested.every((id) => typeof id === "string" && mongoose.isValidObjectId(id))
    ) {
      console.warn("[tracks] Partage refusé : userIds invalide");
      return res.status(400).json({ message: "userIds doit être un tableau d'identifiants" });
    }

    const friendIds = await friendIdsOf(req.auth.sub);
    const { value: userIds, errors } = validateShareTargets(
      requested,
      req.auth.sub,
      friendIds,
    );
    if (errors.length > 0) {
      console.warn(`[tracks] Partage refusé : ${errors.join(", ")}`);
      return res.status(400).json({ message: errors.join(". ") });
    }

    // Ancienne liste lue atomiquement pour ne notifier que les nouveaux destinataires.
    const previous = await Track.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.auth.sub },
      { $set: { sharedWith: userIds } },
      { returnDocument: "before", runValidators: true },
    ).lean();
    if (!previous) {
      console.warn(`[tracks] Partage impossible : ${req.params.id}`);
      return res.status(404).json({ message: "Piste inconnue" });
    }

    console.log(`[tracks] Piste ${previous._id} partagée avec ${userIds.length} ami(s)`);
    const recipients = addedRecipients(previous.sharedWith, userIds);
    if (recipients.length > 0) {
      await recordActivity({
        actorId: req.auth.sub,
        type: "track_shared",
        trackId: previous._id,
        recipients,
      });
    }
    res.json(toTrackForViewer({ ...previous, sharedWith: userIds }, req.auth.sub));
  } catch (error) {
    console.error("[tracks] Erreur de partage", error);
    next(error);
  }
});

/** Arrête le partage d'une piste avec un ami précis (propriétaire uniquement). */
tracksRouter.delete("/:id/shares/:userId", async (req, res, next) => {
  try {
    if (rejectInvalidId(req, res)) return;
    if (!mongoose.isValidObjectId(req.params.userId)) {
      console.warn(`[tracks] Destinataire invalide : ${req.params.userId}`);
      return res.status(404).json({ message: "Partage inconnu" });
    }

    const track = await Track.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.auth.sub },
      { $pull: { sharedWith: req.params.userId } },
      { new: true },
    );
    if (!track) {
      console.warn(`[tracks] Arrêt de partage impossible : ${req.params.id}`);
      return res.status(404).json({ message: "Piste inconnue" });
    }

    console.log(`[tracks] Partage de ${track.id} arrêté pour ${req.params.userId}`);
    res.json(toTrackForViewer(track, req.auth.sub));
  } catch (error) {
    console.error("[tracks] Erreur d'arrêt de partage", error);
    next(error);
  }
});

/**
 * Envoie le contenu binaire d'une piste si canReadTrack l'autorise :
 * propriétaire, piste publique, ou ami selon la visibilité. Une piste
 * inaccessible renvoie 404 pour ne pas révéler son existence.
 */
tracksRouter.get("/:id/audio", async (req, res, next) => {
  try {
    if (rejectInvalidId(req, res)) return;

    const track = await Track.findById(req.params.id).select("+storedName");
    const friendIds = track ? await friendIdsOf(req.auth.sub) : [];

    if (!canReadTrack(track, req.auth.sub, friendIds)) {
      console.warn(`[tracks] Audio introuvable ou interdit : ${req.params.id}`);
      return res.status(404).json({ message: "Piste inconnue" });
    }

    const audioPath = path.join(UPLOADS, track.storedName);
    res.type(track.mimeType);
    // Ce callback permet de loguer le succès ou l'erreur du transfert.
    res.sendFile(audioPath, (error) => {
      if (error) {
        console.error(`[tracks] Erreur d'envoi audio ${track.id}`, error);
        if (!res.headersSent) next(error);
        return;
      }
      console.log(`[tracks] Audio envoyé : ${track.id}`);
    });
  } catch (error) {
    console.error("[tracks] Erreur de préparation du flux audio", error);
    next(error);
  }
});

/** Supprime la métadonnée et le fichier physique correspondant. */
tracksRouter.delete("/:id", async (req, res, next) => {
  try {
    if (rejectInvalidId(req, res)) return;

    const track = await Track.findOneAndDelete({
      _id: req.params.id,
      ownerId: req.auth.sub,
    }).select("+storedName");

    if (!track) {
      console.warn(`[tracks] Suppression impossible : ${req.params.id}`);
      return res.status(404).json({ message: "Piste inconnue" });
    }
    await removeTrackActivities(track._id);

    const audioPath = path.join(UPLOADS, track.storedName);
    try {
      await fsPromises.unlink(audioPath);
      console.log(`[tracks] Fichier supprimé : ${audioPath}`);
    } catch (error) {
      // L'exception n'est volontairement pas ignorée : l'administrateur doit
      // voir ce fichier orphelin si sa suppression échoue.
      console.error(`[tracks] Fichier audio non supprimé : ${audioPath}`, error);
      return res.status(500).json({
        message: "Métadonnée supprimée, mais fichier audio non supprimé",
      });
    }

    res.status(204).end();
  } catch (error) {
    console.error("[tracks] Erreur de suppression", error);
    next(error);
  }
});
