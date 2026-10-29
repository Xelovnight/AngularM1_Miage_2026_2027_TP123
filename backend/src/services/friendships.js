import { Friendship } from "../models/Friendship.js";
import { Track } from "../models/Track.js";
import { friendIdsFrom } from "../rules/friends.js";

/**
 * Identifiants des amis confirmés d'un utilisateur. Utilisé par les routes
 * des pistes pour décider de l'accès (visibilité "friends", partages).
 */
export async function friendIdsOf(userId) {
  const friendships = await Friendship.find({
    status: "accepted",
    $or: [{ requester: userId }, { recipient: userId }],
  })
    .select("requester recipient status")
    .lean();

  return friendIdsFrom(friendships, userId);
}

/**
 * Supprime les partages nominatifs entre deux utilisateurs, dans les deux
 * sens. Appelé quand ils ne sont plus amis : si l'amitié reprend, les
 * anciens partages ne réapparaissent pas d'eux-mêmes.
 * @returns {Promise<number>} nombre de pistes modifiées
 */
export async function removeSharesBetween(a, b) {
  const [fromA, fromB] = await Promise.all([
    Track.updateMany({ ownerId: a, sharedWith: b }, { $pull: { sharedWith: b } }),
    Track.updateMany({ ownerId: b, sharedWith: a }, { $pull: { sharedWith: a } }),
  ]);
  return fromA.modifiedCount + fromB.modifiedCount;
}
