import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Activity } from "../src/models/Activity.js";
import {
  activityCandidatesFilter,
  addedRecipients,
  isActivityVisible,
  isPublication,
  nextActivityCursor,
  parseActivityQuery,
  toActivityView,
} from "../src/rules/activity.js";
import { matches } from "../test-support/mongo-match.js";

// Tests des règles du fil d'activité (étape 5), sans base de données.

const id = () => String(new mongoose.Types.ObjectId());
const ME = id();
const BOB = id();
const CAROL = id();
const STRANGER = id();

test("parseActivityQuery : valeurs par défaut, limite et curseur valides", () => {
  assert.deepEqual(parseActivityQuery({}), { value: { limit: 10 }, errors: [] });

  const { value, errors } = parseActivityQuery({ limit: "5", before: "2026-10-28T12:00:00.000Z" });
  assert.deepEqual(errors, []);
  assert.equal(value.limit, 5);
  assert.equal(value.before.toISOString(), "2026-10-28T12:00:00.000Z");
});

test("parseActivityQuery : limite ou curseur invalides", () => {
  for (const limit of ["0", "31", "2.5", "abc", ["5", "6"]]) {
    assert.equal(parseActivityQuery({ limit }).errors.length, 1, String(limit));
  }
  for (const before of ["pas une date", ["2026-10-28"]]) {
    assert.deepEqual(parseActivityQuery({ before }).errors, ["before doit être une date ISO"]);
  }
});

test("isPublication : seule la sortie de l'état privé est une publication", () => {
  assert.equal(isPublication(undefined, "public"), true); // création
  assert.equal(isPublication(undefined, "private"), false);
  assert.equal(isPublication("private", "friends"), true);
  assert.equal(isPublication("friends", "public"), false); // déjà visible des amis
  assert.equal(isPublication("public", "private"), false);
  assert.equal(isPublication("private", undefined), false); // visibilité non modifiée
});

test("addedRecipients : seulement les nouveaux destinataires, sans doublon", () => {
  assert.deepEqual(addedRecipients([BOB], [BOB, CAROL, CAROL]), [CAROL]);
  assert.deepEqual(addedRecipients([BOB, CAROL], [BOB]), []); // retrait : aucun événement
  assert.deepEqual(addedRecipients(undefined, [BOB]), [BOB]);
});

test("activityCandidatesFilter : null sans ami, sinon les événements de mes amis qui me concernent", () => {
  assert.equal(activityCandidatesFilter(ME, []), null);

  const t = (h) => new Date(Date.UTC(2026, 9, 28, h));
  const activities = [
    { _id: 1, actorId: BOB, type: "track_published", createdAt: t(10) },
    { _id: 2, actorId: BOB, type: "track_shared", recipients: [ME, CAROL], createdAt: t(11) },
    { _id: 3, actorId: BOB, type: "track_shared", recipients: [CAROL], createdAt: t(12) },
    { _id: 4, actorId: BOB, type: "friend_accepted", targetId: ME, createdAt: t(13) },
    { _id: 5, actorId: BOB, type: "friend_accepted", targetId: CAROL, createdAt: t(14) },
    { _id: 6, actorId: STRANGER, type: "track_published", createdAt: t(15) },
    { _id: 7, actorId: ME, type: "track_published", createdAt: t(16) },
  ];
  const ids = (filter) => activities.filter((a) => matches(a, filter)).map((a) => a._id);

  assert.deepEqual(ids(activityCandidatesFilter(ME, [BOB])), [1, 2, 4]);
  // Le curseur exclut l'événement de la date donnée et les plus récents.
  assert.deepEqual(ids(activityCandidatesFilter(ME, [BOB], t(11))), [1]);
});

test("isActivityVisible : l'accès à la piste est vérifié au moment de la lecture", () => {
  const published = { actorId: { _id: BOB, name: "Bob" }, type: "track_published" };
  const track = (visibility, sharedWith = []) => ({ _id: id(), ownerId: BOB, visibility, sharedWith });

  assert.equal(isActivityVisible(published, track("friends"), ME, [BOB]), true);
  assert.equal(isActivityVisible(published, track("public"), ME, [BOB]), true);
  // Piste repassée en privé, supprimée, ou auteur qui n'est plus mon ami.
  assert.equal(isActivityVisible(published, track("private"), ME, [BOB]), false);
  assert.equal(isActivityVisible(published, null, ME, [BOB]), false);
  assert.equal(isActivityVisible(published, track("public"), ME, [CAROL]), false);
  // Auteur supprimé : populate renvoie null.
  assert.equal(isActivityVisible({ ...published, actorId: null }, track("public"), ME, [BOB]), false);
});

test("isActivityVisible : partage destiné à moi et toujours actif", () => {
  const shared = { actorId: BOB, type: "track_shared", recipients: [ME] };
  const privateTrack = (sharedWith) => ({ _id: id(), ownerId: BOB, visibility: "private", sharedWith });

  assert.equal(isActivityVisible(shared, privateTrack([ME]), ME, [BOB]), true);
  // Partage arrêté depuis : la piste n'est plus lisible.
  assert.equal(isActivityVisible(shared, privateTrack([]), ME, [BOB]), false);
  // Événement destiné à quelqu'un d'autre.
  assert.equal(isActivityVisible({ ...shared, recipients: [CAROL] }, privateTrack([ME, CAROL]), ME, [BOB]), false);
});

test("isActivityVisible : invitation acceptée, seulement pour son expéditeur", () => {
  const accepted = { actorId: BOB, type: "friend_accepted", targetId: ME };
  assert.equal(isActivityVisible(accepted, null, ME, [BOB]), true);
  assert.equal(isActivityVisible(accepted, null, CAROL, [BOB]), false);
});

test("toActivityView : auteur, date et piste vue par le lecteur", () => {
  const trackId = id();
  const activity = {
    _id: id(),
    actorId: { _id: BOB, name: "Bob" },
    type: "track_shared",
    createdAt: new Date("2026-10-28T12:00:00.000Z"),
    trackId,
    recipients: [ME],
  };
  const track = { _id: trackId, ownerId: BOB, title: "Solo", visibility: "private", sharedWith: [ME, CAROL] };

  const view = toActivityView(activity, track, ME);
  assert.deepEqual(view.actor, { id: BOB, name: "Bob" });
  assert.equal(view.type, "track_shared");
  assert.equal(view.track.title, "Solo");
  assert.equal(view.track.ownerName, "Bob");
  assert.equal(view.track.sharedWithMe, true);
  // Les autres destinataires ne sont jamais révélés.
  assert.equal("sharedWith" in view.track, false);

  const accepted = toActivityView({ ...activity, type: "friend_accepted", trackId: null }, null, ME);
  assert.equal("track" in accepted, false);
});

test("nextActivityCursor : date du dernier événement lu si la page est pleine", () => {
  const scanned = [{ createdAt: "a" }, { createdAt: "b" }];
  assert.equal(nextActivityCursor(scanned, 2), "b");
  assert.equal(nextActivityCursor(scanned, 10), null);
});

test("schéma Activity : piste ou destinataire obligatoire selon le type", () => {
  const missingTrack = new Activity({ actorId: BOB, type: "track_published" }).validateSync();
  assert.ok(missingTrack?.errors.trackId);

  const missingTarget = new Activity({ actorId: BOB, type: "friend_accepted" }).validateSync();
  assert.ok(missingTarget?.errors.targetId);

  const badType = new Activity({ actorId: BOB, type: "liked", trackId: id() }).validateSync();
  assert.ok(badType?.errors.type);

  assert.equal(new Activity({ actorId: BOB, type: "friend_accepted", targetId: ME }).validateSync(), undefined);
});
