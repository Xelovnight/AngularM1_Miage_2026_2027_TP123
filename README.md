# Guitar Practice Cloud

Portail web pour stocker et écouter ses backing tracks de guitare : comptes
utilisateurs, profil, bibliothèque audio paginée, upload avec progression,
lecture sécurisée et suppression.

Projet réalisé dans le cadre des TP1, TP2 et TP3 d'Angular — M1 MIAGE 2026-2027.

**Auteur :** JUNGERS Enzo (travail individuel)

---

## Fonctionnalités

### TP1 — Authentification et profil
- Inscription et connexion avec formulaires réactifs et messages de validation.
- JWT conservé dans `localStorage`, utilisateur courant exposé par le Signal `currentUser`.
- Ajout automatique du header `Authorization: Bearer …` par un intercepteur HTTP.
- Routes `/tracks` et `/profile` protégées par un guard.
- Consultation du profil (`GET /api/users/me`) et modification du nom (`PUT /api/users/me`).
- Déconnexion et retour vers `/login` en cas de `401` (token invalide ou expiré).

### TP2 — Bibliothèque, upload et lecture audio
- Pagination côté serveur (`GET /api/tracks?page=…&limit=5`) avec boutons Précédent / Suivant.
- État de la page en Signals : `tracks`, `page`, `pages`, `loading`, `error`.
- Upload multipart (`audio` + `title`) avec validation préalable du type MIME et de la taille (25 Mo max).
- Morceaux affichés en cards : titre, nom original, format, taille et date lisibles.
- Lecture authentifiée : `HttpClient` → `Blob` → `URL.createObjectURL` → `<audio>`,
  avec révocation des ObjectURL et messages d'erreur audio compréhensibles.

### TP3 — Fiabilisation
- Suppression d'une piste avec confirmation, protection contre le double clic et notifications SnackBar.
- Gestion d'une piste déjà supprimée ou appartenant à un autre utilisateur (`404`).
- Barre de progression de l'upload via les événements HTTP (`reportProgress`, `observe: 'events'`).
- 13 tests frontend (Vitest) et 7 tests backend (`node:test`), sans dépendance à MongoDB.

---

## Stack technique

| Partie | Technologies |
|---|---|
| Frontend | Angular 22 (composants standalone, `inject()`, Signals, Reactive Forms, `@if` / `@for`), RxJS, Vitest |
| Backend | Node.js, Express 5, Mongoose 9, Multer 2, JWT (`jsonwebtoken`), `bcryptjs` |
| Base de données | MongoDB Atlas |

## Architecture

```text
Composant Angular → Service Angular → HttpClient → authInterceptor (JWT)
      → proxy /api (localhost:4200) → API Express (localhost:3000) → MongoDB Atlas
```

Angular ne communique jamais directement avec MongoDB. Les fichiers audio sont
stockés sur le disque du backend (`backend/data/uploads`), leurs métadonnées
dans MongoDB.

```text
.
├── backend/
│   ├── src/
│   │   ├── server.js          # connexion MongoDB et démarrage
│   │   ├── app.js             # routes Express, auth JWT, Multer
│   │   └── models/            # schémas Mongoose (User, Track)
│   └── test/api.test.js       # tests de santé, de contrat et de sécurité
├── frontend-starter/
│   ├── proxy.conf.json        # redirige /api vers le backend
│   ├── fichiers-audio-de-test/
│   └── src/app/
│       ├── components/        # app, login, register, profile, tracks
│       ├── shared/
│       │   ├── services/      # AuthService, TrackService, SnackbarService
│       │   ├── guards/        # authGuard
│       │   ├── interceptors/  # authInterceptor
│       │   ├── components/    # SnackBar
│       │   └── models/        # User, Track, Page, AuthResponse
│       └── routes.ts
├── API_CONTRACT.md
└── RAPPORT_IA_MODELE.md
```

---

## Installation et lancement

### Prérequis
- Node.js 22 ou plus récent (une version LTS est recommandée) ;
- un cluster MongoDB Atlas avec un utilisateur de base de données (voir [ATLAS_SETUP.md](ATLAS_SETUP.md)).

### 1. Backend

```bash
cd backend
cp .env.example .env
```

Compléter `backend/.env` :

```env
MONGODB_URI=mongodb+srv://UTILISATEUR:MOT_DE_PASSE@CLUSTER.mongodb.net/guitar-practice-cloud?retryWrites=true&w=majority
JWT_SECRET=une-longue-chaine-aleatoire
PORT=3000
```

> `node --env-file` ne remplace pas une variable par sa valeur à l'intérieur
> d'une autre : l'identifiant et le mot de passe doivent être écrits directement
> dans `MONGODB_URI` (caractères spéciaux encodés, par exemple `@` → `%40`).

```bash
npm install
npm start
```

L'API répond sur `http://localhost:3000` ; vérifier avec `GET /api/health`.

### 2. Frontend

Dans un second terminal :

```bash
cd frontend-starter
npm install
npm start
```

Ouvrir `http://localhost:4200`. Compte de démonstration : `demo@example.com` / `Demo1234!`.

### Dépannage : `querySrv ECONNREFUSED`

Sous Windows, Node peut ne pas réussir la résolution DNS SRV d'une URI
`mongodb+srv://` alors que le réseau fonctionne. Il suffit alors d'utiliser
la chaîne de connexion standard `mongodb://hôte1:27017,hôte2:27017,hôte3:27017/…?ssl=true&replicaSet=…&authSource=admin`,
qui ne dépend pas de cette résolution.

---

## Tests et build

```bash
cd frontend-starter
npm test
```

```bash
cd frontend-starter
npm run build
```

```bash
cd backend
npm test
```

Les tests frontend simulent les réponses HTTP (`HttpTestingController` ou
services mockés) : ils vérifient URL, méthodes, paramètres, headers et états
de l'interface sans backend ni base de données.

| Fichier de test | Ce qui est vérifié |
|---|---|
| `auth.service.spec.ts` | `login()` envoie `POST /api/auth/login` avec le bon corps ; `logout()` nettoie l'état |
| `track.service.spec.ts` | `list()` transmet `page` et `limit` |
| `auth.interceptor.spec.ts` | ajout ou absence du header `Authorization` |
| `auth.guard.spec.ts` | accès autorisé avec token, redirection vers `/login` sinon |
| `tracks-page.spec.ts` | erreur HTTP affichée, suppression puis rechargement, progression et échec de l'upload |
| `backend/test/api.test.js` | `401` sans JWT ou avec JWT invalide, `400` sans fichier ou avec un type MIME refusé |

---

## API

Toutes les routes sont préfixées par `/api`. Détails complets dans [API_CONTRACT.md](API_CONTRACT.md).

| Méthode | Route | Auth | Réponse |
|---|---|---|---|
| GET | `/health` | — | `{ "status": "ok" }` |
| POST | `/auth/register` | — | `201 { token, user }` |
| POST | `/auth/login` | — | `200 { token, user }` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | JWT | `200 User` |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` (multipart `audio`, `title`) | JWT | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| DELETE | `/tracks/:id` | JWT | `204` |

Formats audio acceptés : MP3, WAV, OGG, M4A — 25 Mo maximum.

---

## Sécurité

- Le fichier `backend/.env` (URI MongoDB, secret JWT) n'est jamais commité ni copié dans Angular.
- Les mots de passe sont hachés avec `bcrypt` côté backend ; ni mot de passe ni JWT ne sont journalisés.
- Le guard et l'interface Angular améliorent l'expérience, mais c'est le backend qui vérifie
  réellement le JWT et le propriétaire de chaque piste (lecture et suppression).

## Documents

- [SUJET_ETUDIANT_TP1.md](SUJET_ETUDIANT_TP1.md), [SUJET_ETUDIANT_TP2.md](SUJET_ETUDIANT_TP2.md), [SUJET_ETUDIANT_TP3.md](SUJET_ETUDIANT_TP3.md) : sujets des TP ;
- [API_CONTRACT.md](API_CONTRACT.md) : contrat HTTP ;
- [ATLAS_SETUP.md](ATLAS_SETUP.md) : configuration de MongoDB Atlas ;
- [RAPPORT_IA_MODELE.md](RAPPORT_IA_MODELE.md) : rapport d'usage de l'assistant IA, réponses aux questions et preuves Network ;
- [CONSEILS_POUR_UTIISER_ASSISTANT_AI.md](CONSEILS_POUR_UTIISER_ASSISTANT_AI.md) : bonnes pratiques avec un assistant IA.
