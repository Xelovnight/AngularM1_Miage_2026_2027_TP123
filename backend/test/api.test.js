import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Track } from "../src/models/Track.js";
import { readdir } from "node:fs/promises";
import path from "node:path";

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test("health sans dépendre de MongoDB", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "ok");
});

test("schémas Mongoose et relation", () => {
  const u = new User({
    name: "Test",
    email: "TEST@example.com",
    password: "12345678",
  });

  assert.equal(u.email, "test@example.com");
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
  });
  
  assert.equal(t.title, "Blues");
  assert.equal(Track.schema.path("ownerId").options.ref, "User");
  // Une nouvelle piste est privée par défaut, sans métadonnées musicales.
  assert.equal(t.visibility, "private");
  assert.equal(t.bpm, null);
  assert.deepEqual([...t.tags], []);
  assert.equal(t.validateSync(), undefined);
});

test("schéma Track : visibilité, BPM et tonalité invalides refusés par Mongoose", () => {
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
    visibility: "secret",
    bpm: 500,
    key: "H",
  });

  const error = t.validateSync();
  assert.ok(error.errors.visibility);
  assert.ok(error.errors.bpm);
  assert.ok(error.errors.key);
});

test("sécurité : 401 sans jeton JWT", async () => {
  const r = await fetch(base + "/api/tracks");
  assert.equal(r.status, 401);
  const data = await r.json();
  assert.equal(data.message, "Authentification requise");
});

test("sécurité : 401 avec un jeton JWT invalide", async () => {
  const r = await fetch(base + "/api/tracks", {
    headers: { Authorization: "Bearer token-invalide-ou-corrompu" },
  });
  assert.equal(r.status, 401);
  const data = await r.json();
  assert.equal(data.message, "Jeton invalide ou expiré");
});

test("sécurité : 401 sur suppression d’une piste sans jeton", async () => {
  const r = await fetch(base + "/api/tracks/track-12345", {
    method: "DELETE",
  });
  assert.equal(r.status, 401);
});

test("contrat : 400 lors d’un upload sans fichier", async () => {
  const { default: jwt } = await import("jsonwebtoken");
  const secret = process.env.JWT_SECRET || "tp1-development-secret";
  const validToken = jwt.sign({ sub: "673f2a1b9c1002" }, secret);

  const r = await fetch(base + "/api/tracks", {
    method: "POST",
    headers: { Authorization: `Bearer ${validToken}` },
  });
  assert.equal(r.status, 400);
  const data = await r.json();
  assert.equal(data.message, "Fichier audio requis");
});

test("contrat : 400 lors d’un upload avec un type MIME non audio refusé", async () => {
  const { default: jwt } = await import("jsonwebtoken");
  const secret = process.env.JWT_SECRET || "tp1-development-secret";
  const validToken = jwt.sign({ sub: "673f2a1b9c1002" }, secret);

  const form = new FormData();
  form.append("audio", new Blob(["fichier texte"], { type: "text/plain" }), "test.txt");

  const r = await fetch(base + "/api/tracks", {
    method: "POST",
    headers: { Authorization: `Bearer ${validToken}` },
    body: form,
  });

  assert.equal(r.status, 400);
  const data = await r.json();
  assert.equal(data.message, "Format audio non accepté");
});

/** Jeton valide pour un utilisateur fictif : les routes testées ci-dessous
 * répondent avant toute requête MongoDB. */
async function fakeUserToken() {
  const { default: jwt } = await import("jsonwebtoken");
  const secret = process.env.JWT_SECRET || "tp1-development-secret";
  return jwt.sign({ sub: "673f2a1b9c1d2e3f4a5b6c7d" }, secret);
}

test("sécurité : 401 sur les pistes publiques et la modification sans jeton", async () => {
  const list = await fetch(base + "/api/tracks/public");
  assert.equal(list.status, 401);

  const patch = await fetch(base + "/api/tracks/673f2a1b9c1d2e3f4a5b6c7d", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visibility: "public" }),
  });
  assert.equal(patch.status, 401);
});

test("contrat : 400 sur PATCH avec des métadonnées invalides", async () => {
  const r = await fetch(base + "/api/tracks/673f2a1b9c1d2e3f4a5b6c7d", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${await fakeUserToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bpm: 1000, visibility: "secret" }),
  });
  assert.equal(r.status, 400);
  const data = await r.json();
  assert.match(data.message, /BPM/);
  assert.match(data.message, /Visibilité/);
});

test("contrat : 400 sur PATCH sans aucun champ modifiable", async () => {
  const r = await fetch(base + "/api/tracks/673f2a1b9c1d2e3f4a5b6c7d", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${await fakeUserToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ownerId: "quelqu-un-d-autre" }),
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Aucune modification fournie");
});

test("contrat : 404 sur un identifiant de piste mal formé", async () => {
  const headers = { Authorization: `Bearer ${await fakeUserToken()}` };
  const audio = await fetch(base + "/api/tracks/pas-un-id/audio", { headers });
  assert.equal(audio.status, 404);

  const patch = await fetch(base + "/api/tracks/pas-un-id", {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ visibility: "public" }),
  });
  assert.equal(patch.status, 404);
});

test("contrat : upload avec BPM invalide refusé et fichier supprimé du disque", async () => {
  const uploads = path.resolve("data/uploads");
  const before = await readdir(uploads);

  const form = new FormData();
  form.append("audio", new Blob(["faux mp3"], { type: "audio/mpeg" }), "solo.mp3");
  form.append("title", "Solo");
  form.append("bpm", "5");

  const r = await fetch(base + "/api/tracks", {
    method: "POST",
    headers: { Authorization: `Bearer ${await fakeUserToken()}` },
    body: form,
  });

  assert.equal(r.status, 400);
  assert.match((await r.json()).message, /BPM/);
  // Aucun fichier orphelin ne doit rester après le refus.
  assert.deepEqual((await readdir(uploads)).sort(), before.sort());
});

test("sécurité : 401 sur la recherche sans jeton", async () => {
  const r = await fetch(base + "/api/tracks/search?q=blues");
  assert.equal(r.status, 401);
});

test("contrat : 400 sur une recherche aux critères invalides", async () => {
  const headers = { Authorization: `Bearer ${await fakeUserToken()}` };

  const range = await fetch(base + "/api/tracks/search?bpmMin=150&bpmMax=100", { headers });
  assert.equal(range.status, 400);
  assert.match((await range.json()).message, /bpmMin/);

  const key = await fetch(base + "/api/tracks/search?key=H&scope=partout", { headers });
  assert.equal(key.status, 400);
  const message = (await key.json()).message;
  assert.match(message, /Tonalité/);
  assert.match(message, /Périmètre/);

  const repeated = await fetch(base + "/api/tracks/search?q=a&q=b", { headers });
  assert.equal(repeated.status, 400);
});

test("sécurité : 401 sur les routes d'amis et la recherche d'utilisateurs sans jeton", async () => {
  for (const [method, url] of [
    ["GET", "/api/friends"],
    ["POST", "/api/friends/requests"],
    ["POST", "/api/friends/requests/673f2a1b9c1d2e3f4a5b6c7d/accept"],
    ["DELETE", "/api/friends/requests/673f2a1b9c1d2e3f4a5b6c7d"],
    ["DELETE", "/api/friends/673f2a1b9c1d2e3f4a5b6c7d"],
    ["GET", "/api/users/search?q=bob"],
  ]) {
    const r = await fetch(base + url, { method });
    assert.equal(r.status, 401, `${method} ${url}`);
  }
});

test("contrat : invitation sans userId, à soi-même ou vers un id mal formé", async () => {
  const token = await fakeUserToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const invite = (body) =>
    fetch(base + "/api/friends/requests", { method: "POST", headers, body: JSON.stringify(body) });

  assert.equal((await invite({})).status, 400);

  const self = await invite({ userId: "673f2a1b9c1d2e3f4a5b6c7d" });
  assert.equal(self.status, 400);
  assert.equal((await self.json()).message, "Impossible de s'inviter soi-même");

  assert.equal((await invite({ userId: "pas-un-id" })).status, 404);
});

test("contrat : 404 sur les identifiants mal formés des routes d'amis", async () => {
  const headers = { Authorization: `Bearer ${await fakeUserToken()}` };
  for (const [method, url] of [
    ["POST", "/api/friends/requests/pas-un-id/accept"],
    ["DELETE", "/api/friends/requests/pas-un-id"],
    ["DELETE", "/api/friends/pas-un-id"],
  ]) {
    const r = await fetch(base + url, { method, headers });
    assert.equal(r.status, 404, `${method} ${url}`);
  }
});

test("contrat : 400 sur une recherche d'utilisateurs trop courte", async () => {
  const headers = { Authorization: `Bearer ${await fakeUserToken()}` };
  const r = await fetch(base + "/api/users/search?q=a", { headers });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Saisissez au moins 2 caractères");
});

test("sécurité : 401 sur les routes de partage sans jeton", async () => {
  const id = "673f2a1b9c1d2e3f4a5b6c7d";
  for (const [method, url] of [
    ["GET", "/api/tracks/shared-with-me"],
    ["PUT", `/api/tracks/${id}/shares`],
    ["DELETE", `/api/tracks/${id}/shares/${id}`],
  ]) {
    const r = await fetch(base + url, { method });
    assert.equal(r.status, 401, `${method} ${url}`);
  }
});

test("contrat : 400 sur un partage dont userIds est mal formé", async () => {
  const headers = {
    Authorization: `Bearer ${await fakeUserToken()}`,
    "Content-Type": "application/json",
  };
  for (const body of [{}, { userIds: "abc" }, { userIds: ["pas-un-id"] }, { userIds: [{ $ne: null }] }]) {
    const r = await fetch(base + "/api/tracks/673f2a1b9c1d2e3f4a5b6c7d/shares", {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
});

test("contrat : 404 sur les identifiants mal formés des routes de partage", async () => {
  const headers = { Authorization: `Bearer ${await fakeUserToken()}` };
  const put = await fetch(base + "/api/tracks/pas-un-id/shares", {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ userIds: [] }),
  });
  assert.equal(put.status, 404);

  const del = await fetch(base + "/api/tracks/673f2a1b9c1d2e3f4a5b6c7d/shares/pas-un-id", {
    method: "DELETE",
    headers,
  });
  assert.equal(del.status, 404);
});

test("sécurité : 401 sur le fil d'activité sans jeton", async () => {
  const r = await fetch(base + "/api/activity");
  assert.equal(r.status, 401);
});

test("contrat : 400 sur un fil d'activité avec limit ou before invalides", async () => {
  const headers = { Authorization: `Bearer ${await fakeUserToken()}` };
  for (const query of ["limit=0", "limit=31", "limit=abc", "before=pas-une-date"]) {
    const r = await fetch(`${base}/api/activity?${query}`, { headers });
    assert.equal(r.status, 400, query);
  }
});
