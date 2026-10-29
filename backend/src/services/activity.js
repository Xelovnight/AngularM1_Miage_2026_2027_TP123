import { Activity } from "../models/Activity.js";

/**
 * Enregistre un événement du fil d'activité. Le fil est secondaire : un
 * échec est journalisé mais ne fait pas échouer l'action principale
 * (upload, partage, acceptation), déjà enregistrée.
 */
export async function recordActivity(data) {
  try {
    const activity = await Activity.create(data);
    console.log(`[activity] ${activity.type} par ${activity.actorId} (${activity.id})`);
  } catch (error) {
    console.error(`[activity] Événement ${data.type} non enregistré`, error);
  }
}

/** Supprime les événements d'une piste supprimée. */
export async function removeTrackActivities(trackId) {
  try {
    const { deletedCount } = await Activity.deleteMany({ trackId });
    console.log(`[activity] ${deletedCount} événement(s) supprimé(s) pour la piste ${trackId}`);
  } catch (error) {
    console.error(`[activity] Événements de la piste ${trackId} non supprimés`, error);
  }
}
