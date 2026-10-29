import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Friendship } from "../src/models/Friendship.js";
import {
  canAccept,
  canDeleteRequest,
  classifyFriendships,
  decideInvitation,
  friendIdsFrom,
  friendshipPairKey,
  otherMember,
  parseUserSearch,
} from "../src/rules/friends.js";

// Tests des règles d'amitié (étape 3), sans base de données.

const alice = new mongoose.Types.ObjectId();
const bob = new mongoose.Types.ObjectId();
const carol = new mongoose.Types.ObjectId();

function friendship(requester, recipient, status = "pending", extra = {}) {
  return { _id: new mongoose.Types.ObjectId(), requester, recipient, status, ...extra };
}

test("friendshipPairKey : même clé quel que soit le sens", () => {
  assert.equal(friendshipPairKey(alice, bob), friendshipPairKey(bob, alice));
  assert.notEqual(friendshipPairKey(alice, bob), friendshipPairKey(alice, carol));
  assert.equal(friendshipPairKey(String(alice), bob), friendshipPairKey(alice, String(bob)));
});

test("schéma Friendship : pairKey calculée par le serveur, statut pending par défaut", async () => {
  const f = new Friendship({ requester: bob, recipient: alice, pairKey: "valeur-du-client" });
  // validate() exécute le hook pre("validate") sans écrire dans MongoDB.
  await f.validate();
  assert.equal(f.pairKey, friendshipPairKey(alice, bob));
  assert.equal(f.status, "pending");
  assert.ok(new Friendship({ requester: bob, recipient: alice, status: "bloqué" }).validateSync().errors.status);
});

test("otherMember : renvoie l'autre membre de la paire", () => {
  const f = friendship(alice, bob);
  assert.equal(otherMember(f, alice), bob);
  assert.equal(otherMember(f, String(bob)), alice);
});

test("friendIdsFrom : seulement les amitiés acceptées dont je suis membre", () => {
  const list = [
    friendship(alice, bob, "accepted"),
    friendship(carol, alice, "accepted"),
    friendship(alice, new mongoose.Types.ObjectId(), "pending"),
    friendship(bob, carol, "accepted"),
  ];
  assert.deepEqual(friendIdsFrom(list, alice).map(String).sort(), [String(bob), String(carol)].sort());
  assert.deepEqual(friendIdsFrom([], alice), []);
});

test("decideInvitation : nouvelle invitation, ou refus si soi-même", () => {
  assert.deepEqual(decideInvitation(null, alice, bob), { action: "create" });
  assert.equal(decideInvitation(null, alice, String(alice)).status, 400);
});

test("decideInvitation : déjà amis ou invitation déjà envoyée → 409", () => {
  const accepted = decideInvitation(friendship(bob, alice, "accepted"), alice, bob);
  assert.equal(accepted.status, 409);
  assert.equal(accepted.message, "Vous êtes déjà amis");

  const pending = decideInvitation(friendship(alice, bob), alice, bob);
  assert.equal(pending.status, 409);
  assert.equal(pending.message, "Invitation déjà envoyée");
});

test("decideInvitation : invitation croisée → acceptation directe", () => {
  assert.deepEqual(decideInvitation(friendship(bob, alice), alice, bob), { action: "accept" });
});

test("canAccept : seulement le destinataire d'une invitation en attente", () => {
  const f = friendship(alice, bob);
  assert.equal(canAccept(f, bob), true);
  assert.equal(canAccept(f, alice), false);
  assert.equal(canAccept(f, carol), false);
  assert.equal(canAccept({ ...f, status: "accepted" }, bob), false);
  assert.equal(canAccept(null, bob), false);
});

test("canDeleteRequest : refus par le destinataire, annulation par l'expéditeur", () => {
  const f = friendship(alice, bob);
  assert.equal(canDeleteRequest(f, bob), true);
  assert.equal(canDeleteRequest(f, alice), true);
  assert.equal(canDeleteRequest(f, carol), false);
  // Une amitié acceptée se retire avec DELETE /friends/:userId, pas ici.
  assert.equal(canDeleteRequest({ ...f, status: "accepted" }, alice), false);
});

test("classifyFriendships : amis, reçues et envoyées, sans email", () => {
  const user = (id, name) => ({ _id: id, name, email: `${name}@example.test` });
  const dave = new mongoose.Types.ObjectId();
  const accepted = friendship(user(bob, "Bob"), user(alice, "Alice"), "accepted", {
    acceptedAt: "2026-10-20",
  });
  const accepted2 = friendship(user(alice, "Alice"), user(dave, "Dave"), "accepted");
  const incoming = friendship(user(carol, "Carol"), user(alice, "Alice"), "pending", {
    createdAt: "2026-10-21",
  });
  const outgoing = friendship(user(alice, "Alice"), user(new mongoose.Types.ObjectId(), "Eve"));

  const overview = classifyFriendships([accepted2, incoming, accepted, outgoing], alice);

  // Amis triés par nom.
  assert.deepEqual(overview.friends.map((f) => f.user.name), ["Bob", "Dave"]);
  assert.deepEqual(overview.friends[0], {
    friendshipId: String(accepted._id),
    user: { id: String(bob), name: "Bob" },
    since: "2026-10-20",
  });
  assert.deepEqual(overview.incoming, [
    { friendshipId: String(incoming._id), user: { id: String(carol), name: "Carol" }, createdAt: "2026-10-21" },
  ]);
  assert.deepEqual(overview.outgoing.map((f) => f.user.name), ["Eve"]);
  assert.equal(JSON.stringify(overview).includes("@example.test"), false);
});

test("parseUserSearch : 2 à 50 caractères", () => {
  assert.deepEqual(parseUserSearch("  bo "), { q: "bo" });
  assert.ok(parseUserSearch("b").error);
  assert.ok(parseUserSearch(undefined).error);
  assert.ok(parseUserSearch(["a", "b"]).error);
  assert.ok(parseUserSearch("x".repeat(51)).error);
});
