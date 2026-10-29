# Guitar Practice Cloud

Portail web pour stocker et écouter ses backing tracks de guitare : comptes
utilisateurs, profil, bibliothèque audio paginée, upload avec progression,
lecture sécurisée et suppression.

Projet réalisé dans le cadre des TP1, TP2 et TP3 d'Angular — M1 MIAGE 2026-2027,
puis étendu en mini-projet à partir du TP4 (voir [REPORT.md](REPORT.md)).

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

### TP4 — Mini-projet (étape 1)
- Visibilité des pistes : privée, amis ou publique, modifiable depuis la carte de la piste.
- Métadonnées musicales : BPM, tonalité, genre et tags, à l'upload et en édition.
- Page **Explorer** : pistes publiques récemment ajoutées, avec leur auteur.
- Contrôle d'accès à l'audio selon la visibilité ; backend découpé en routers et règles métier pures.

### TP4 — Mini-projet (étape 2)
- Recherche dans l'Explorer : texte libre (titre, tags, genre, auteur), périmètre, genre, tonalité et intervalle de BPM.
- Lancement automatique après une pause de saisie ; clic sur un tag = recherche de ce tag.
- Seules les pistes que l'utilisateur a le droit d'écouter peuvent apparaître dans les résultats.

### TP4 — Mini-projet (étape 3)
- Page **Amis** : rechercher un utilisateur (nom ou email exact), l'inviter, accepter ou refuser une invitation, annuler une invitation envoyée, retirer un ami.
- Nombre d'invitations reçues affiché dans la navigation.
- Les pistes « Amis » deviennent réellement accessibles aux amis ; retirer un ami coupe cet accès.

### TP4 — Mini-projet (étape 4)
- Partager une piste privée avec certains amis (bouton 🔗), voir ses destinataires et arrêter un partage (✕).
- Page **Partagés avec moi** : pistes « Amis » de mes amis et pistes qu'ils m'ont partagées nommément.
- Retirer un ami supprime les partages entre les deux personnes.

### TP4 — Mini-projet (étape 5)
- Page **Activité** : pistes publiées par mes amis, pistes qu'ils me partagent, invitations acceptées, du plus récent au plus ancien avec « Voir plus ».
- Chaque événement est revérifié à l'affichage : une piste redevenue privée, supprimée ou un ancien ami disparaissent du fil.

### TP4 — Mini-projet (étape 6, finitions)
- Bouton **⬇ Télécharger** dans le lecteur (mêmes droits que l'écoute).
- Nettoyage du typage des erreurs HTTP et vérification de toutes les pages sur ordinateur et mobile.
- **106 tests frontend et 80 tests backend.** Rapport complet, bilan et résultats des tests : [REPORT.md](REPORT.md).

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
│   │   ├── app.js             # middlewares globaux, montage des routers
│   │   ├── routes/            # auth, users, tracks, friends, activity
│   │   ├── services/          # requêtes réutilisées (amis, partages, événements d'activité)
│   │   ├── middlewares/       # JWT, Multer
│   │   ├── rules/             # règles métier pures (accès, validation)
│   │   └── models/            # schémas Mongoose (User, Track, Friendship, Activity)
│   ├── test/                  # tests HTTP et tests des règles métier
│   └── test-support/          # outils des tests (évaluateur de filtres MongoDB)
├── frontend-starter/
│   ├── proxy.conf.json        # redirige /api vers le backend
│   ├── fichiers-audio-de-test/
│   └── src/app/
│       ├── components/        # app, login, register, profile, tracks, explore, friends, shared, activity
│       ├── shared/
│       │   ├── services/      # AuthService, TrackService, FriendService, ActivityService, SnackbarService
│       │   ├── guards/        # authGuard
│       │   ├── interceptors/  # authInterceptor
│       │   ├── components/    # SnackBar, TrackCard, AudioPlayer, ShareDialog
│       │   ├── utils/         # formatage et conversion des métadonnées
│       │   └── models/        # User, Track, Friend, Activity, Page, AuthResponse
│       └── routes.ts
├── API_CONTRACT.md
├── REPORT.md
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

Les tests backend vérifient les règles métier (fonctions pures de
`backend/src/rules/`) sans MongoDB, ainsi que les réponses HTTP qui précèdent
tout accès à la base.

| Fichier de test | Ce qui est vérifié |
|---|---|
| `auth.service.spec.ts`, `auth.interceptor.spec.ts`, `auth.guard.spec.ts` | connexion, header `Authorization`, protection des routes |
| `track.service.spec.ts`, `friend.service.spec.ts`, `activity.service.spec.ts` | URL, méthode, paramètres et corps de chaque appel HTTP |
| `tracks-page.spec.ts` | upload, modification, partage, suppression, erreurs et double clic |
| `explore-page.spec.ts` | récemment ajoutés, recherche avec délai de saisie et filtres |
| `friends-page.spec.ts` | recherche d'utilisateurs, invitations, retrait d'un ami |
| `shared-page.spec.ts`, `activity-page.spec.ts` | listes paginées, « Voir plus », erreurs |
| `track-card`, `share-dialog`, `audio-player` (`*.component.spec.ts`) | affichage et événements des composants partagés, téléchargement |
| `track-format`, `friend-relation`, `activity-format` (`*.spec.ts`) | fonctions de formatage pures |
| `backend/test/api.test.js` | `401`, `400` et `404` de toutes les routes, upload refusé sans fichier orphelin |
| `backend/test/*-rules.test.js` | accès aux pistes, recherche, amis, partage, fil d'activité |

Détail par fichier et résultats : section 8 de [REPORT.md](REPORT.md).

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
| GET | `/users/search?q=…` | JWT | `200 PublicUser[]` |
| GET | `/friends` | JWT | `200 FriendsOverview` |
| POST | `/friends/requests` (`{userId}`) | JWT | `201` / `200 {friendshipId,status}` |
| POST | `/friends/requests/:id/accept` | JWT | `200 {friendshipId,status}` |
| DELETE | `/friends/requests/:id` | JWT | `204` |
| DELETE | `/friends/:userId` | JWT | `204` |
| GET | `/activity?limit=10&before=…` | JWT | `200 { items, nextBefore }` |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| GET | `/tracks/public?page=1&limit=10` | JWT | `Page<Track>` |
| GET | `/tracks/search?q=…&scope=…&genre=…&key=…&bpmMin=…&bpmMax=…` | JWT | `Page<Track>` |
| GET | `/tracks/shared-with-me?page=1&limit=10` | JWT | `Page<Track>` |
| POST | `/tracks` (multipart `audio`, `title`, `visibility`, `bpm`, `key`, `genre`, `tags`) | JWT | `201 Track` |
| PATCH | `/tracks/:id` (JSON métadonnées) | JWT | `200 Track` |
| PUT | `/tracks/:id/shares` (`{userIds}`) | JWT | `200 Track` |
| DELETE | `/tracks/:id/shares/:userId` | JWT | `200 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| DELETE | `/tracks/:id` | JWT | `204` |

Formats audio acceptés : MP3, WAV, OGG, M4A — 25 Mo maximum.

---

## Sécurité

- Le fichier `backend/.env` (URI MongoDB, secret JWT) n'est jamais commité ni copié dans Angular.
- Les mots de passe sont hachés avec `bcrypt` côté backend ; ni mot de passe ni JWT ne sont journalisés.
- Le guard et l'interface Angular améliorent l'expérience, mais c'est le backend qui vérifie
  réellement le JWT, le propriétaire de chaque piste (modification et suppression)
  et le droit d'écoute selon la visibilité.

## Documents

- [SUJET_ETUDIANT_TP1.md](SUJET_ETUDIANT_TP1.md), [SUJET_ETUDIANT_TP2.md](SUJET_ETUDIANT_TP2.md), [SUJET_ETUDIANT_TP3.md](SUJET_ETUDIANT_TP3.md) : sujets des TP ;
- [API_CONTRACT.md](API_CONTRACT.md) : contrat HTTP ;
- [ATLAS_SETUP.md](ATLAS_SETUP.md) : configuration de MongoDB Atlas ;
- [RAPPORT_IA_MODELE.md](RAPPORT_IA_MODELE.md) : rapport d'usage de l'assistant IA, réponses aux questions et preuves Network ;
- [CONSEILS_POUR_UTIISER_ASSISTANT_AI.md](CONSEILS_POUR_UTIISER_ASSISTANT_AI.md) : bonnes pratiques avec un assistant IA.
