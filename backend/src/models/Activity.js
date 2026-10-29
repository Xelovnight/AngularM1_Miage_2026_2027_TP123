import mongoose from "mongoose";
import { ACTIVITY_TYPES } from "../rules/activity.js";

const TRACK_TYPES = ["track_published", "track_shared"];

/**
 * Événement du fil d'activité. Il ne copie pas la piste : le fil relit la
 * piste à jour et vérifie l'accès au moment de l'affichage.
 */
const schema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    trackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Track",
      default: null,
      required: function () {
        return TRACK_TYPES.includes(this.type);
      },
    },
    // friend_accepted : utilisateur dont l'invitation a été acceptée.
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      required: function () {
        return this.type === "friend_accepted";
      },
    },
    // track_shared : amis ajoutés par ce partage.
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Lecture du fil : événements de mes amis, du plus récent au plus ancien.
schema.index({ actorId: 1, createdAt: -1 });
// Nettoyage à la suppression d'une piste.
schema.index({ trackId: 1 });

export const Activity = mongoose.model("Activity", schema);
