import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchFilter,
  canReadTrack,
  containsRegex,
  escapeRegex,
  parseSearchQuery,
  readableTracksFilter,
} from "../src/rules/tracks.js";
import { matches } from "../test-support/mongo-match.js";

// Tests des règles de recherche (étape 2), sans base de données.

const ME = "me";
const FRIEND = "friend";
const STRANGER = "stranger";

const tracks = [
  { _id: 1, ownerId: ME, visibility: "private", title: "Mon blues", genre: "Blues", key: "Am", bpm: 80, tags: ["lent"], sharedWith: [] },
  { _id: 2, ownerId: FRIEND, visibility: "public", title: "Funk du soir", genre: "Funk", key: "E", bpm: 110, tags: ["groove"], sharedWith: [] },
  { _id: 3, ownerId: FRIEND, visibility: "friends", title: "Blues rapide", genre: "blues", key: "A", bpm: 140, tags: ["shuffle"], sharedWith: [] },
  { _id: 4, ownerId: FRIEND, visibility: "private", title: "Ballade", genre: "Pop", key: "C", bpm: 70, tags: [], sharedWith: [ME] },
  { _id: 5, ownerId: FRIEND, visibility: "private", title: "Secret", genre: "Rock", key: "D", bpm: 120, tags: [], sharedWith: [] },
  { _id: 6, ownerId: STRANGER, visibility: "friends", title: "Inconnu", genre: "Jazz", key: "F", bpm: 100, tags: [], sharedWith: [ME] },
  { _id: 7, ownerId: STRANGER, visibility: "public", title: "Rock (live) v2.0", genre: "Rock", key: "G", bpm: 150, tags: ["live"], sharedWith: [] },
];

const ids = (filter) => tracks.filter((t) => matches(t, filter)).map((t) => t._id);

test("readableTracksFilter sélectionne exactement les pistes autorisées par canReadTrack", () => {
  for (const user of [ME, FRIEND, STRANGER]) {
    for (const friendIds of [[], [FRIEND], [ME], [FRIEND, STRANGER]]) {
      const expected = tracks.filter((t) => canReadTrack(t, user, friendIds)).map((t) => t._id);
      assert.deepEqual(ids(readableTracksFilter(user, friendIds)), expected, `${user} / ${friendIds}`);
    }
  }
});

test("buildSearchFilter : sans critère, toutes les pistes lisibles", () => {
  assert.deepEqual(ids(buildSearchFilter({ scope: "all" }, ME)), [1, 2, 7]);
  assert.deepEqual(ids(buildSearchFilter({ scope: "all" }, ME, { friendIds: [FRIEND] })), [1, 2, 3, 4, 7]);
});

test("buildSearchFilter : périmètres public et mine", () => {
  assert.deepEqual(ids(buildSearchFilter({ scope: "public" }, ME)), [2, 7]);
  assert.deepEqual(ids(buildSearchFilter({ scope: "mine" }, ME)), [1]);
});

test("buildSearchFilter : q cherche dans titre, tags et genre sans tenir compte de la casse", () => {
  const all = { friendIds: [FRIEND] };
  assert.deepEqual(ids(buildSearchFilter({ scope: "all", q: "BLUES" }, ME, all)), [1, 3]);
  assert.deepEqual(ids(buildSearchFilter({ scope: "all", q: "groove" }, ME, all)), [2]);
  // Une piste correspondante mais non lisible n'apparaît jamais.
  assert.deepEqual(ids(buildSearchFilter({ scope: "all", q: "secret" }, ME, all)), []);
});

test("buildSearchFilter : q trouve aussi les pistes d'un auteur dont le nom correspond", () => {
  assert.deepEqual(ids(buildSearchFilter({ scope: "all", q: "zzz" }, ME, { ownerIds: [STRANGER] })), [7]);
});

test("buildSearchFilter : les caractères spéciaux sont cherchés littéralement", () => {
  assert.deepEqual(ids(buildSearchFilter({ scope: "all", q: "(live) v2.0" }, ME)), [7]);
  assert.deepEqual(ids(buildSearchFilter({ scope: "all", q: "v2.." }, ME)), []);
});

test("buildSearchFilter : genre exact (insensible à la casse), tonalité et intervalle de BPM", () => {
  const all = { friendIds: [FRIEND] };
  assert.deepEqual(ids(buildSearchFilter({ scope: "all", genre: "BLUES" }, ME, all)), [1, 3]);
  // "Blu" ne doit pas correspondre au genre "Blues" : égalité, pas « contient ».
  assert.deepEqual(ids(buildSearchFilter({ scope: "all", genre: "Blu" }, ME, all)), []);
  assert.deepEqual(ids(buildSearchFilter({ scope: "all", key: "Am" }, ME, all)), [1]);
  assert.deepEqual(ids(buildSearchFilter({ scope: "all", bpmMin: 100, bpmMax: 140 }, ME, all)), [2, 3]);
  assert.deepEqual(ids(buildSearchFilter({ scope: "all", bpmMin: 145 }, ME, all)), [7]);
});

test("buildSearchFilter : critères combinés", () => {
  const filter = buildSearchFilter(
    { scope: "all", q: "blues", bpmMax: 100 },
    ME,
    { friendIds: [FRIEND] },
  );
  assert.deepEqual(ids(filter), [1]);
});

test("escapeRegex et containsRegex", () => {
  assert.equal(escapeRegex("a.b*(c)"), "a\\.b\\*\\(c\\)");
  assert.equal(containsRegex("Blues").test("mon BLUES lent"), true);
  assert.equal(containsRegex(".*").test("abc"), false);
});

test("parseSearchQuery : valeurs valides et périmètre par défaut", () => {
  assert.deepEqual(parseSearchQuery({}), { value: { scope: "all" }, errors: [] });
  assert.deepEqual(
    parseSearchQuery({ q: "  blues ", scope: "mine", genre: "Blues", key: "Am", bpmMin: "80", bpmMax: "120" }),
    {
      value: { scope: "mine", q: "blues", genre: "Blues", key: "Am", bpmMin: 80, bpmMax: 120 },
      errors: [],
    },
  );
});

test("parseSearchQuery : paramètres vides ignorés", () => {
  assert.deepEqual(parseSearchQuery({ q: "   ", genre: "", bpmMin: "" }), {
    value: { scope: "all" },
    errors: [],
  });
});

test("parseSearchQuery : erreurs de validation", () => {
  assert.equal(parseSearchQuery({ scope: "everything" }).errors.length, 1);
  assert.equal(parseSearchQuery({ key: "H" }).errors.length, 1);
  assert.equal(parseSearchQuery({ bpmMin: "10" }).errors.length, 1);
  assert.equal(parseSearchQuery({ bpmMax: "abc" }).errors.length, 1);
  assert.equal(parseSearchQuery({ q: "x".repeat(101) }).errors.length, 1);
  assert.deepEqual(parseSearchQuery({ bpmMin: "150", bpmMax: "100" }).errors, [
    "bpmMin doit être inférieur ou égal à bpmMax",
  ]);
  // Paramètre répété (?q=a&q=b) : Express fournit un tableau.
  assert.deepEqual(parseSearchQuery({ q: ["a", "b"] }).errors, ["Paramètre q invalide"]);
});
