import mongoose from "mongoose";
import { FRIENDSHIP_STATUSES, friendshipPairKey } from "../rules/friends.js";

/*
 * Une amitié entre deux utilisateurs, de l'invitation à l'acceptation.
 * Il n'existe qu'un document par paire : `pairKey` (identifiants triés)
 * porte un index unique, ce qui bloque aussi les invitations croisées
 * envoyées en même temps.
 */
const schema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: { type: String, enum: FRIENDSHIP_STATUSES, default: "pending" },
    acceptedAt: { type: Date, default: null },
    pairKey: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

// Ces index servent à retrouver toutes les amitiés d'un utilisateur,
// qu'il soit à l'origine de l'invitation ou destinataire.
schema.index({ requester: 1, status: 1 });
schema.index({ recipient: 1, status: 1 });

// La clé de paire est toujours calculée par le serveur, jamais reçue du client.
schema.pre("validate", function () {
  if (this.requester && this.recipient) {
    this.pairKey = friendshipPairKey(this.requester, this.recipient);
  }
});

export const Friendship = mongoose.model("Friendship", schema);
