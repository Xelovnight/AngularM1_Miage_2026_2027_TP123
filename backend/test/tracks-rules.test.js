import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  MUSICAL_KEYS,
  canReadTrack,
  isTrackOwner,
  parsePagination,
  parseTags,
  parseTrackMetadata,
  toPublicTrack,
} from "../src/rules/tracks.js";

// Ces tests vérifient les règles métier pures : aucune base de données,
// aucun serveur HTTP. Chaque cas décrit une situation d'accès réelle.

const owner = new mongoose.Types.ObjectId();
const friend = new mongoose.Types.ObjectId();
const stranger = new mongoose.Types.ObjectId();

function track(overrides = {}) {
  return { ownerId: owner, visibility: "private", sharedWith: [], ...overrides };
}

test("canReadTrack : le propriétaire lit toujours sa piste", () => {
  for (const visibility of ["private", "friends", "public"]) {
    assert.equal(canReadTrack(track({ visibility }), String(owner)), true);
  }
});

test("canReadTrack : une piste publique est lisible par tout le monde", () => {
  assert.equal(canReadTrack(track({ visibility: "public" }), stranger), true);
});

test("canReadTrack : une piste privée est refusée aux autres, même amis", () => {
  assert.equal(canReadTrack(track(), stranger), false);
  assert.equal(canReadTrack(track(), friend, [owner]), false);
});

test("canReadTrack : visibilité friends réservée aux amis du propriétaire", () => {
  const t = track({ visibility: "friends" });
  assert.equal(canReadTrack(t, friend, [owner]), true);
  assert.equal(canReadTrack(t, stranger, []), false);
  // Être ami d'une autre personne ne suffit pas.
  assert.equal(canReadTrack(t, stranger, [friend]), false);
});

test("canReadTrack : partage nominatif valable seulement si l'amitié existe encore", () => {
  const t = track({ sharedWith: [friend] });
  assert.equal(canReadTrack(t, friend, [owner]), true);
  // Ami supprimé : le partage ne donne plus accès.
  assert.equal(canReadTrack(t, friend, []), false);
  // Ami du propriétaire, mais piste non partagée avec lui.
  assert.equal(canReadTrack(track(), friend, [owner]), false);
});

test("canReadTrack : piste absente ou utilisateur absent refusés", () => {
  assert.equal(canReadTrack(null, owner), false);
  assert.equal(canReadTrack(track({ visibility: "public" }), undefined), false);
});

test("canReadTrack et isTrackOwner acceptent un propriétaire peuplé", () => {
  const populated = track({ ownerId: { _id: owner, name: "Alice" }, visibility: "friends" });
  assert.equal(isTrackOwner(populated, String(owner)), true);
  assert.equal(canReadTrack(populated, friend, [String(owner)]), true);
  assert.equal(isTrackOwner(populated, stranger), false);
});

test("parseTags : chaîne ou tableau, minuscules, sans doublon ni vide", () => {
  assert.deepEqual(parseTags("Blues, lent , ,BLUES"), ["blues", "lent"]);
  assert.deepEqual(parseTags(["Rock", " solo "]), ["rock", "solo"]);
  assert.deepEqual(parseTags(undefined), []);
});

test("parseTrackMetadata : valeurs valides normalisées", () => {
  const { value, errors } = parseTrackMetadata({
    title: "  Blues en La  ",
    visibility: "public",
    bpm: "92",
    key: "Am",
    genre: " Blues ",
    tags: "shuffle, lent",
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(value, {
    title: "Blues en La",
    visibility: "public",
    bpm: 92,
    key: "Am",
    genre: "Blues",
    tags: ["shuffle", "lent"],
  });
});

test("parseTrackMetadata : seuls les champs fournis sont renvoyés", () => {
  assert.deepEqual(parseTrackMetadata({ visibility: "friends" }), {
    value: { visibility: "friends" },
    errors: [],
  });
  assert.deepEqual(parseTrackMetadata({}), { value: {}, errors: [] });
});

test("parseTrackMetadata : une valeur vide efface bpm, key et genre", () => {
  const { value } = parseTrackMetadata({ bpm: "", key: null, genre: "  " });
  assert.deepEqual(value, { bpm: null, key: null, genre: null });
});

test("parseTrackMetadata : BPM hors bornes ou non entier refusé", () => {
  for (const bpm of ["19", "301", "92.5", "abc"]) {
    assert.equal(parseTrackMetadata({ bpm }).errors.length, 1, `bpm=${bpm}`);
  }
  assert.equal(parseTrackMetadata({ bpm: "20" }).value.bpm, 20);
  assert.equal(parseTrackMetadata({ bpm: 300 }).value.bpm, 300);
});

test("parseTrackMetadata : tonalité, visibilité et titre contrôlés", () => {
  assert.equal(MUSICAL_KEYS.length, 24);
  assert.ok(MUSICAL_KEYS.includes("F#m"));
  assert.deepEqual(parseTrackMetadata({ key: "H" }).errors, ["Tonalité inconnue"]);
  assert.equal(parseTrackMetadata({ visibility: "secret" }).errors.length, 1);
  assert.equal(parseTrackMetadata({ title: "   " }).errors.length, 1);
  assert.equal(parseTrackMetadata({ title: "x".repeat(121) }).errors.length, 1);
});

test("parseTrackMetadata : tags trop nombreux ou trop longs refusés", () => {
  const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`);
  assert.equal(parseTrackMetadata({ tags: eleven }).errors.length, 1);
  assert.equal(parseTrackMetadata({ tags: ["x".repeat(31)] }).errors.length, 1);
});

test("parsePagination : valeurs par défaut et bornes", () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 5, skip: 0 });
  assert.deepEqual(parsePagination({ page: "3", limit: "10" }), { page: 3, limit: 10, skip: 20 });
  assert.deepEqual(parsePagination({ page: "-2", limit: "500" }), { page: 1, limit: 20, skip: 0 });
});

test("toPublicTrack : n'expose ni storedName ni sharedWith et ajoute ownerName", () => {
  const id = new mongoose.Types.ObjectId();
  const result = toPublicTrack({
    _id: id,
    ownerId: { _id: owner, name: "Alice" },
    title: "Funk",
    originalName: "funk.mp3",
    storedName: "secret.mp3",
    mimeType: "audio/mpeg",
    size: 10,
    createdAt: "2026-10-01",
    visibility: "public",
    sharedWith: [friend],
  });

  assert.equal(result.id, String(id));
  assert.equal(result.ownerId, String(owner));
  assert.equal(result.ownerName, "Alice");
  assert.equal(result.bpm, null);
  assert.deepEqual(result.tags, []);
  assert.equal("storedName" in result, false);
  assert.equal("sharedWith" in result, false);
});
