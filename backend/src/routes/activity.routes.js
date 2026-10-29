import { Router } from "express";
import { Activity } from "../models/Activity.js";
import { Track } from "../models/Track.js";
import { auth } from "../middlewares/auth.js";
import { friendIdsOf } from "../services/friendships.js";
import {
  activityCandidatesFilter,
  isActivityVisible,
  nextActivityCursor,
  parseActivityQuery,
  toActivityView,
} from "../rules/activity.js";

/** Fil d'activité des amis (préfixe /api/activity). Exige un JWT. */
export const activityRouter = Router();
activityRouter.use(auth);

/**
 * Événements de mes amis, du plus récent au plus ancien, page par page
 * grâce au curseur `before`. Flux : validation -> amis actuels -> événements
 * candidats -> pistes concernées (une seule requête) -> contrôle d'accès final.
 */
activityRouter.get("/", async (req, res, next) => {
  try {
    const { value, errors } = parseActivityQuery(req.query);
    if (errors.length > 0) {
      console.warn(`[activity] Requête refusée : ${errors.join(", ")}`);
      return res.status(400).json({ message: errors.join(". ") });
    }

    const friendIds = await friendIdsOf(req.auth.sub);
    const filter = activityCandidatesFilter(req.auth.sub, friendIds, value.before);
    if (!filter) {
      console.log(`[activity] Fil vide pour ${req.auth.sub} : aucun ami`);
      return res.json({ items: [], nextBefore: null });
    }

    const scanned = await Activity.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(value.limit)
      .populate("actorId", "name")
      .lean();

    const trackIds = [...new Set(scanned.filter((a) => a.trackId).map((a) => String(a.trackId)))];
    const tracks = trackIds.length > 0 ? await Track.find({ _id: { $in: trackIds } }).lean() : [];
    const tracksById = new Map(tracks.map((track) => [String(track._id), track]));

    const items = [];
    for (const activity of scanned) {
      const track = activity.trackId ? (tracksById.get(String(activity.trackId)) ?? null) : null;
      if (isActivityVisible(activity, track, req.auth.sub, friendIds)) {
        items.push(toActivityView(activity, track, req.auth.sub));
      }
    }

    console.log(
      `[activity] Fil de ${req.auth.sub} : ${items.length} événement(s) affiché(s) sur ${scanned.length} lu(s)`,
    );
    res.json({ items, nextBefore: nextActivityCursor(scanned, value.limit) });
  } catch (error) {
    console.error("[activity] Erreur de lecture du fil", error);
    next(error);
  }
});
