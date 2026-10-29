import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  canReadTrack,
  sharedWithMeFilter,
  toTrackForViewer,
  validateShareTargets,
} from "../src/rules/tracks.js";
import { matches } from "../test-support/mongo-match.js";

// Tests des règles de partage nominatif (étape 4), sans base de données.

const id = () => String(new mongoose.Types.ObjectId());
const ME = id();
const BOB = id();
const CAROL = id();
const STRANGER = id();

test("validateShareTargets : amis confirmés acceptés, doublons retirés", () => {
  assert.deepEqual(validateShareTargets([BOB, CAROL, BOB], ME, [BOB, CAROL]), {
    value: [BOB, CAROL],
    errors: [],
  });
  // Une liste vide arrête tous les partages.
  assert.deepEqual(validateShareTargets([], ME, []), { value: [], errors: [] });
});

test("validateShareTargets : refuse un non-ami ou soi-même", () => {
  assert.deepEqual(validateShareTargets([BOB, STRANGER], ME, [BOB]).errors, [
    "Une piste ne peut être partagée qu'avec vos amis",
  ]);
  assert.deepEqual(validateShareTargets([ME], ME, [BOB]).errors, [
    "Impossible de partager une piste avec soi-même",
  ]);
  // En cas d'erreur, rien n'est retenu.
  assert.deepEqual(validateShareTargets([BOB, STRANGER], ME, [BOB]).value, []);
});

test("validateShareTargets : refuse un corps mal formé ou trop long", () => {
  for (const bad of [undefined, "abc", [1, 2], [{ $ne: null }]]) {
    assert.equal(validateShareTargets(bad, ME, [BOB]).errors.length, 1);
  }
  const many = Array.from({ length: 51 }, id);
  assert.ok(validateShareTargets(many, ME, many).errors.includes("50 partages maximum par piste"));
});

test("sharedWithMeFilter : null sans ami, sinon pistes friends ou partagées avec moi", () => {
  assert.equal(sharedWithMeFilter(ME, []), null);

  const tracks = [
    { _id: 1, ownerId: BOB, visibility: "friends", sharedWith: [] },
    { _id: 2, ownerId: BOB, visibility: "private", sharedWith: [ME] },
    { _id: 3, ownerId: BOB, visibility: "private", sharedWith: [CAROL] },
    { _id: 4, ownerId: BOB, visibility: "public", sharedWith: [] },
    { _id: 5, ownerId: STRANGER, visibility: "friends", sharedWith: [ME] },
    { _id: 6, ownerId: ME, visibility: "friends", sharedWith: [] },
  ];
  const filter = sharedWithMeFilter(ME, [BOB]);
  const selected = tracks.filter((t) => matches(t, filter));

  assert.deepEqual(selected.map((t) => t._id), [1, 2]);
  // Tout ce que la page affiche doit être réellement lisible.
  for (const t of selected) assert.equal(canReadTrack(t, ME, [BOB]), true);
});

test("toTrackForViewer : le propriétaire voit ses destinataires", () => {
  const track = { _id: id(), ownerId: ME, title: "Solo", visibility: "private", sharedWith: [BOB, CAROL] };
  const view = toTrackForViewer(track, ME);
  assert.deepEqual(view.sharedWith, [BOB, CAROL]);
  assert.equal("sharedWithMe" in view, false);
});

test("toTrackForViewer : un destinataire sait seulement que la piste lui est partagée", () => {
  const track = { _id: id(), ownerId: BOB, title: "Solo", visibility: "private", sharedWith: [ME, CAROL] };

  const mine = toTrackForViewer(track, ME);
  assert.equal(mine.sharedWithMe, true);
  assert.equal("sharedWith" in mine, false);

  assert.equal(toTrackForViewer({ ...track, visibility: "friends", sharedWith: [] }, ME).sharedWithMe, false);
});
