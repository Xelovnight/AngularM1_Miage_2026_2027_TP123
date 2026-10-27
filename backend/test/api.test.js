import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Track } from "../src/models/Track.js";

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
