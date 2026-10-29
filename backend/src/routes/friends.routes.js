import { Router } from "express";
import mongoose from "mongoose";
import { Friendship } from "../models/Friendship.js";
import { User } from "../models/User.js";
import { auth } from "../middlewares/auth.js";
import { removeSharesBetween } from "../services/friendships.js";
import { recordActivity } from "../services/activity.js";
import {
  canAccept,
  canDeleteRequest,
  classifyFriendships,
  decideInvitation,
  friendshipPairKey,
} from "../rules/friends.js";

/** Routes du réseau d'amis (préfixe /api/friends). Toutes exigent un JWT. */
export const friendsRouter = Router();
friendsRouter.use(auth);

/** Un identifiant mal formé ne peut correspondre à rien : 404 direct. */
function rejectInvalidId(id, res, message) {
  if (mongoose.isValidObjectId(id)) return false;
  console.warn(`[friends] Identifiant invalide : ${id}`);
  res.status(404).json({ message });
  return true;
}

/**
 * Vue d'ensemble pour la page Amis : amis confirmés, invitations reçues et
 * invitations envoyées. Seuls l'identifiant et le nom des autres utilisateurs
 * sont renvoyés, jamais leur email.
 */
friendsRouter.get("/", async (req, res, next) => {
  try {
    const friendships = await Friendship.find({
      $or: [{ requester: req.auth.sub }, { recipient: req.auth.sub }],
    })
      .populate("requester", "name")
      .populate("recipient", "name")
      .lean();

    const overview = classifyFriendships(friendships, req.auth.sub);
    console.log(
      `[friends] Vue de ${req.auth.sub} : ${overview.friends.length} ami(s), ` +
        `${overview.incoming.length} reçue(s), ${overview.outgoing.length} envoyée(s)`,
    );
    res.json(overview);
  } catch (error) {
    console.error("[friends] Erreur de lecture des amitiés", error);
    next(error);
  }
});

/**
 * Invite un utilisateur. Si celui-ci m'avait déjà invité, l'invitation
 * croisée vaut acceptation : nous devenons amis immédiatement.
 */
friendsRouter.post("/requests", async (req, res, next) => {
  try {
    const recipientId = req.body?.userId;
    if (typeof recipientId !== "string") {
      console.warn("[friends] Invitation sans userId");
      return res.status(400).json({ message: "userId requis" });
    }
    if (rejectInvalidId(recipientId, res, "Utilisateur inconnu")) return;

    // S'inviter soi-même est refusé par decideInvitation sans interroger MongoDB.
    const existing =
      recipientId === String(req.auth.sub)
        ? null
        : await Friendship.findOne({ pairKey: friendshipPairKey(req.auth.sub, recipientId) });
    const decision = decideInvitation(existing, req.auth.sub, recipientId);

    if (decision.action === "reject") {
      console.warn(`[friends] Invitation refusée : ${decision.message}`);
      return res.status(decision.status).json({ message: decision.message });
    }

    if (decision.action === "accept") {
      existing.status = "accepted";
      existing.acceptedAt = new Date();
      await existing.save();
      console.log(`[friends] Invitation croisée : ${existing.id} acceptée`);
      // J'accepte implicitement l'invitation de l'autre : il le verra dans son fil.
      await recordActivity({
        actorId: req.auth.sub,
        type: "friend_accepted",
        targetId: existing.requester,
      });
      return res.json({ friendshipId: existing.id, status: "accepted" });
    }

    if (!(await User.exists({ _id: recipientId }))) {
      console.warn(`[friends] Destinataire inconnu : ${recipientId}`);
      return res.status(404).json({ message: "Utilisateur inconnu" });
    }

    const friendship = await Friendship.create({
      requester: req.auth.sub,
      recipient: recipientId,
    });
    console.log(`[friends] Invitation ${friendship.id} : ${req.auth.sub} -> ${recipientId}`);
    res.status(201).json({ friendshipId: friendship.id, status: "pending" });
  } catch (error) {
    console.error("[friends] Erreur pendant l'invitation", error);
    next(error);
  }
});

/** Le destinataire accepte une invitation en attente. */
friendsRouter.post("/requests/:id/accept", async (req, res, next) => {
  try {
    if (rejectInvalidId(req.params.id, res, "Invitation inconnue")) return;

    const friendship = await Friendship.findById(req.params.id);
    if (!canAccept(friendship, req.auth.sub)) {
      console.warn(`[friends] Acceptation impossible : ${req.params.id}`);
      return res.status(404).json({ message: "Invitation inconnue" });
    }

    friendship.status = "accepted";
    friendship.acceptedAt = new Date();
    await friendship.save();
    console.log(`[friends] Invitation acceptée : ${friendship.id}`);
    await recordActivity({
      actorId: req.auth.sub,
      type: "friend_accepted",
      targetId: friendship.requester,
    });
    res.json({ friendshipId: friendship.id, status: "accepted" });
  } catch (error) {
    console.error("[friends] Erreur pendant l'acceptation", error);
    next(error);
  }
});

/** Refuse (destinataire) ou annule (expéditeur) une invitation en attente. */
friendsRouter.delete("/requests/:id", async (req, res, next) => {
  try {
    if (rejectInvalidId(req.params.id, res, "Invitation inconnue")) return;

    const friendship = await Friendship.findById(req.params.id);
    if (!canDeleteRequest(friendship, req.auth.sub)) {
      console.warn(`[friends] Suppression d'invitation impossible : ${req.params.id}`);
      return res.status(404).json({ message: "Invitation inconnue" });
    }

    await friendship.deleteOne();
    console.log(`[friends] Invitation supprimée par ${req.auth.sub} : ${friendship.id}`);
    res.status(204).end();
  } catch (error) {
    console.error("[friends] Erreur de suppression d'invitation", error);
    next(error);
  }
});

/**
 * Retire un ami. Les pistes "friends" et les partages de cette personne
 * deviennent aussitôt inaccessibles : canReadTrack exige une amitié active.
 * Les partages nominatifs entre les deux utilisateurs sont aussi supprimés.
 */
friendsRouter.delete("/:userId", async (req, res, next) => {
  try {
    if (rejectInvalidId(req.params.userId, res, "Ami inconnu")) return;

    const friendship = await Friendship.findOneAndDelete({
      pairKey: friendshipPairKey(req.auth.sub, req.params.userId),
      status: "accepted",
    });

    if (!friendship) {
      console.warn(`[friends] Pas d'amitié avec ${req.params.userId}`);
      return res.status(404).json({ message: "Ami inconnu" });
    }

    const removedShares = await removeSharesBetween(req.auth.sub, req.params.userId);
    console.log(
      `[friends] Amitié supprimée : ${req.auth.sub} / ${req.params.userId} ` +
        `(partage retiré sur ${removedShares} piste(s))`,
    );
    res.status(204).end();
  } catch (error) {
    console.error("[friends] Erreur de suppression d'ami", error);
    next(error);
  }
});
