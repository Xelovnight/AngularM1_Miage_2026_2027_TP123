import mongoose from "mongoose";
import {
  BPM_MAX,
  BPM_MIN,
  GENRE_MAX_LENGTH,
  MUSICAL_KEYS,
  TITLE_MAX_LENGTH,
  VISIBILITIES,
  toPublicTrack,
} from "../rules/tracks.js";

/*
 * Ce schéma conserve les métadonnées d'une piste. Le fichier audio lui-même
 * reste sur le disque ; storedName contient le nom technique utilisé côté
 * serveur et n'est jamais exposé par toPublic().
 *
 * Les contraintes reprennent celles de rules/tracks.js : les routes valident
 * d'abord avec parseTrackMetadata, Mongoose sert de seconde barrière.
 */
const schema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: TITLE_MAX_LENGTH },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true, select: false },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },

    // Une piste est privée tant que son propriétaire ne l'ouvre pas.
    visibility: { type: String, enum: VISIBILITIES, default: "private" },

    // Métadonnées musicales optionnelles : null signifie « non renseigné ».
    bpm: { type: Number, min: BPM_MIN, max: BPM_MAX, default: null },
    key: { type: String, enum: [...MUSICAL_KEYS, null], default: null },
    genre: { type: String, trim: true, maxlength: GENRE_MAX_LENGTH, default: null },
    tags: { type: [String], default: [] },

    // Amis avec qui une piste privée est partagée individuellement (étape 4).
    sharedWith: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
  },
  { timestamps: true },
);

// Cet index accélère la liste des pistes d'un utilisateur triées par date.
schema.index({ ownerId: 1, createdAt: -1 });
// Celui-ci sert la page Explorer : pistes publiques les plus récentes.
schema.index({ visibility: 1, createdAt: -1 });

/**
 * Convertit un document Mongoose en objet sûr pour le frontend.
 * L'identifiant MongoDB devient la propriété simple `id` attendue par Angular.
 */
schema.methods.toPublic = function () {
  console.debug(`[track-model] Préparation de la piste publique ${this.id}`);
  return toPublicTrack(this);
};

export const Track = mongoose.model("Track", schema);
