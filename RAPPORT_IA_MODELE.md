# Rapport d'usage de l'IA — TP1

## Informations générales

- **Étudiant :** JUNGERS Enzo, M1 MIAGE (travail individuel)
- **Projet :** Guitar Practice Cloud (GPC) — Architecture Authentification et Profil
- **Assistant IA & Modèle utilisé :** Assistant de développement Antigravity / Gemini 3.8 Flash (High reasoning)
- **Mode d'utilisation :** Agent IDE avec accès direct au workspace, terminal, analyse de fichiers et tests

---

## Mission 0 — Cartographier l'application

### 1. Objectif

Comprendre l'architecture globale d'une application Angular 22 standalone, identifier les composants clés, les routes, l'injection de dépendances, le client HTTP et distinguer les routes publiques des routes protégées sans altérer le code initial.

### 2. Prompt principal

> "Analyse l'architecture du projet Angular fourni dans `frontend-starter` et du backend Express dans `backend`. Retrouve :
>
> 1. Le composant racine ;
> 2. La configuration des routes ;
> 3. L'enregistrement de HttpClient et des intercepteurs ;
> 4. Les modèles, services et composants de page ;
> 5. Le mécanisme injectant le JWT dans les requêtes ;
> 6. Distingue les routes publiques des routes protégées selon `API_CONTRACT.md` ;
> 7. Produis un schéma Mermaid complet du flux lors du clic sur 'Se connecter'."

### 3. Plan proposé par l'agent

1. Examiner `frontend-starter/src/main.ts` pour repérer `bootstrapApplication`, `provideRouter` et `provideHttpClient`.
2. Examiner `frontend-starter/src/app/routes.ts` pour analyser les routes, les redirections et les guards (`authGuard`).
3. Examiner l'intercepteur `auth.interceptor.ts` et le service `auth.service.ts`.
4. Analyser les routes backend dans `backend/src/app.js` et le contrat d'API dans `API_CONTRACT.md`.
5. Générer le schéma annoté du cycle de vie d'une requête de login.

### 4. Vérifications réalisées

- Vérification manuelle de `main.ts` : `AppComponent` est bien le composant racine démarré avec `provideHttpClient(withInterceptors([authInterceptor]))`.
- Vérification du fichier de routes : `routes.ts` protège `/profile` et `/tracks` à l'aide de `canActivate: [authGuard]`.
- Vérification du contrat API :
  - **Routes publiques (sans token) :**
    - `GET /api/health`
    - `POST /api/auth/register`
    - `POST /api/auth/login`
  - **Routes protégées (en-tête `Authorization: Bearer <token>`) :**
    - `GET /api/users/me`
    - `PUT /api/users/me`
    - `GET /api/tracks`
    - `POST /api/tracks`
    - `GET /api/tracks/:id/audio`
    - `DELETE /api/tracks/:id`

### 5. Schéma annoté du flux de connexion (Mission 0)

```mermaid
sequenceDiagram
    autonumber
    actor U as Utilisateur
    participant C as LoginPageComponent
    participant S as AuthService
    participant H as HttpClient & Interceptor
    participant P as Proxy Angular (:4200)
    participant B as Express API (:3000)
    participant DB as MongoDB Atlas

    U->>C: Saisie email & password, clic "Se connecter"
    C->>C: Validation du formulaire réactif (form.valid)
    C->>S: authService.login(email, password)
    S->>H: http.post('/api/auth/login', { email, password })
    H->>P: POST /api/auth/login (port 4200)
    P->>B: Proxy vers target: http://localhost:3000
    B->>DB: User.findOne({ email }).select('+passwordHash')
    DB-->>B: Données utilisateur + hash bcrypt
    B->>B: Vérification mot de passe (bcrypt.compare) + Génération JWT
    B-->>P: HTTP 200 { token: "...", user: { id, name, email } }
    P-->>H: HTTP 200 { token, user }
    H-->>S: pipe(tap(res => storeAuthentication(res)))
    S->>S: localStorage.setItem('gpc_token', token)
    S->>S: currentUser.set(user), token.set(token)
    S-->>C: Observable émet le succès (next)
    C->>C: router.navigateByUrl('/tracks')
    C-->>U: Affichage de la page des pistes audio
```

---

## Mission 1 — Inscription, Connexion et Profil

### 1. Objectif

Compléter et fiabiliser la couche utilisateur du frontend Angular :

- Formulaires réactifs avec validation client et retours visuels explicites.
- Appels API typés via `AuthService` injecté (`inject()`).
- Sauvegarde sécurisée du token JWT dans `localStorage` sans log sensible.
- Gestion d'état réactive via les Signals Angular (`currentUser`, `token`).
- Ajout d'un bouton et d'un mécanisme de déconnexion (`logout`) avec purge du `localStorage` et des Signals.
- Chargement automatique du profil (`GET /api/users/me`) et mise à jour (`PUT /api/users/me`).
- Interception globale des erreurs `401 Unauthorized` pour déconnecter et rediriger vers `/login`.

### 2. Prompt principal

> "Mets en œuvre toutes les exigences de la Mission 1 :
>
> 1. Formulaires réactifs pour Register et Login avec messages d'erreur clairs et validation du mot de passe (minimum 8 caractères exigé par le backend) ;
> 2. Gestion de l'état d'authentification réactif avec Signals (`currentUser`, `token`) ;
> 3. Ajout d'un bouton de déconnexion visible avec nettoyage de l'état local dans la barre de navigation et dans `AuthService` ;
> 4. Chargement et mise à jour du profil utilisateur avec notifications de succès/erreur ;
> 5. Gestion des erreurs 401 dans l'intercepteur HTTP pour rediriger automatiquement vers `/login` ;
> 6. Respect strict de la séparation des responsabilités : composant -> service -> HttpClient."

### 3. Plan proposé par l'agent

1. **`auth.interceptor.ts`** :
   - Ajouter la capture des erreurs HTTP avec `catchError`.
   - Si `status === 401` et que la requête ne cible pas `/api/auth/login`, appeler `auth.logout()` et naviguer vers `/login`.
2. **`auth.service.ts`** :
   - Injecter le `Router`.
   - Initialiser et synchroniser le profil au démarrage si un token réside déjà dans `localStorage`.
   - Compléter `logout()` pour réinitialiser les signaux, vider le stockage local et rediriger.
3. **`app.ts` / `app.html`** :
   - Injecter `AuthService` dans `AppComponent`.
   - Rendre la barre de navigation dynamique (`@if (auth.token())` : afficher lien Profil, nom de l'utilisateur et bouton Déconnexion ; `@else` : afficher Connexion et Inscription).
4. **`profile-page.ts` / `profile-page.html`** :
   - Implémenter le hook `OnInit` pour charger automatiquement le profil à l'arrivée sur la page.
   - Ajouter des Signals de messages (`message`, `error`) pour confirmer la sauvegarde du nouveau nom.
5. **`login-page` & `register-page`** :
   - Ajouter les retours visuels pour les champs invalides (`required`, `email`, `minlength(8)`).
   - Désactiver le bouton de soumission si le formulaire est invalide (`[disabled]="form.invalid"`).
6. **`styles.css`** :
   - Ajouter le style pour `.btn-logout`, `.field-error` et `.success`.

### 4. Vérifications réalisées

1. **Compilation et Build :** Exécution de `npm --prefix frontend-starter run build` -> Succès (code de retour 0, bundle généré en 2.16s).
2. **Tests backend :** Exécution de `npm --prefix backend test` -> 2/2 tests passés avec succès (`GET /api/health` et schémas Mongoose).
3. **Contrôle de sécurité :** Aucun token ni mot de passe n'apparaît dans les logs de la console (`console.log` / `console.debug`). Seuls les statuts et les identifiants publics sont tracés.
4. **Validation du mot de passe :** Le formulaire d'inscription bloque immédiatement la soumission si le mot de passe fait moins de 8 caractères, évitant un aller-retour réseau 400 inutile vers le backend.

### 5. Erreurs ou propositions rejetées

- **Rejet d'une redirection aveugle sur toute 401 :** L'agent a initialement vérifié si toute erreur 401 devait déclencher `auth.logout()`. Proposition ajustée : lorsque l'utilisateur se trompe de mot de passe sur `/api/auth/login`, le backend renvoie 401 (`Identifiants incorrects`). Il ne faut pas déclencher une redirection/déconnexion en boucle dans ce cas, mais laisser `LoginPageComponent` afficher le message d'erreur à l'utilisateur. La condition `!request.url.includes('/api/auth/login')` a donc été explicitement ajoutée.

### 6. Fichiers effectivement modifiés

- `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts` : Gestion du code HTTP 401 et redirection.
- `frontend-starter/src/app/shared/services/auth.service.ts` : Restauration du profil au démarrage, navigation sur déconnexion.
- `frontend-starter/src/app/components/app/app.ts` : Injection d'`AuthService` et méthode `logout()`.
- `frontend-starter/src/app/components/app/app.html` : Navigation réactive et bouton de déconnexion.
- `frontend-starter/src/app/components/profile-page/profile-page.ts` : `OnInit`, notifications réactives de succès/erreur.
- `frontend-starter/src/app/components/profile-page/profile-page.html` : Formulaire réactif de profil, retours visuels.
- `frontend-starter/src/app/components/login-page/login-page.html` : Messages d'erreur de validation pour email et mot de passe.
- `frontend-starter/src/app/components/register-page/register-page.ts` : Validation `Validators.minLength(8)`.
- `frontend-starter/src/app/components/register-page/register-page.html` : Messages de validation du formulaire d'inscription.
- `frontend-starter/src/styles.css` : Classes CSS `.btn-logout`, `.field-error`, `.success`.

---

## Réponses aux questions techniques du TP1

### 1. Différence entre Signal et `localStorage`

- **Signal (Angular) :** Valeur réactive hébergée en **mémoire vive (RAM)** pendant le cycle de vie de l'application JavaScript. Lorsqu'un signal change (ex: `currentUser.set(...)`), Angular notifie automatiquement les composants et les templates dépendants pour mettre à jour le DOM sans recharger la page. Cependant, si l'utilisateur actualise la page (F5), la mémoire JS est réinitialisée et le signal redevient `null`.
- **`localStorage` (Web Storage API) :** Espace de stockage **persistant sur le disque** du navigateur (clé/valeur sous forme de chaînes). Les données survivent à la fermeture du navigateur et au rechargement de page. En revanche, le `localStorage` n'est **absolument pas réactif** : modifier une clé dans le `localStorage` ne déclenche aucun rafraîchissement automatique de la vue Angular.
- **Complémentarité dans mon architecture :** Je combine les deux ! Le `localStorage` sert à persister le jeton JWT (`gpc_token`) entre les sessions, tandis que les Signals Angular (`token`, `currentUser`) fournissent la réactivité immédiate à l'interface utilisateur.

### 2. Où s'effectue la tâche « mise à jour du profil utilisateur » ?

- **Côté Frontend :**
  - Dans `frontend-starter/src/app/components/profile-page/profile-page.ts` (méthode `save()`) déclenchée par la soumission du formulaire dans `profile-page.html`.
  - Le composant délègue à `frontend-starter/src/app/shared/services/auth.service.ts` (méthode `update(name)`).
  - `AuthService` émet une requête HTTP `PUT /api/users/me` avec le corps `{ name }`.
  - L'intercepteur `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts` attache le header `Authorization: Bearer <token>`.
- **Côté Backend :**
  - Dans `backend/src/app.js` au niveau du endpoint `app.put("/api/users/me", auth, async (req, res, next) => { ... })`.
  - Le middleware `auth` vérifie et décode le JWT (`req.auth.sub`).
  - La mise à jour est exécutée sur la base MongoDB via Mongoose : `User.findByIdAndUpdate(req.auth.sub, { $set: { name: req.body?.name } }, { new: true, runValidators: true })`.
  - Le document utilisateur mis à jour est converti au format public (`user.toPublic()`) et renvoyé au format JSON (`HTTP 200`).

### 3. Routes du backend utilisées

| Route                | Méthode | Rôle                                      | Authentification        |
| -------------------- | ------- | ----------------------------------------- | ----------------------- |
| `/api/health`        | GET     | Vérification de l'état de l'API           | Publique                |
| `/api/auth/register` | POST    | Création d'un nouveau compte              | Publique                |
| `/api/auth/login`    | POST    | Authentification et obtention du JWT      | Publique                |
| `/api/users/me`      | GET     | Récupération du profil connecté           | Protégée (Bearer token) |
| `/api/users/me`      | PUT     | Modification du nom du profil connecté    | Protégée (Bearer token) |
| `/api/tracks`        | GET     | Liste paginée des pistes de l'utilisateur | Protégée (Bearer token) |

### 4. Questions sur le modèle IA et les tokens

- **Quel modèle utilisez-vous ?** Gemini 3.8 Flash (High reasoning), particulièrement adapté à l'analyse multi-fichiers, la détection des dépendances et la vérification des contrats d'API.
- **Comment savoir combien de tokens ont été consommés ?** Le volume de tokens consommés dépend du contexte (taille des fichiers lus, historique de la conversation et tokens générés). Il est consultable dans le tableau de bord de consommation de l'outil (session logs, CLI stats ou dashboard de compte).
- **Qui peut conseiller le meilleur modèle ?** On peut interroger directement l'assistant avec le prompt recommandé dans `CONSEILS_POUR_UTIISER_ASSISTANT_AI.md` (section 10), afin qu'il compare la complexité de la mission (raisonnement approfondi, vitesse ou coût) avant d'engager le travail.

---

## Checkpoint Network — Preuves d'échanges HTTP

### 1. Connexion réussie

- **Requête :** `POST http://localhost:4200/api/auth/login`
- **Headers :** `Content-Type: application/json`
- **Corps :** `{ "email": "demo@example.com", "password": "[MASQUÉ]" }`
- **Statut :** `200 OK`
- **En-tête `Authorization` :** Aucun (route publique)
- **Réponse :**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "673f12a4b89c1001",
      "name": "Demo User",
      "email": "demo@example.com",
      "createdAt": "2026-09-24T06:00:00.000Z"
    }
  }
  ```

### 2. Connexion refusée (Identifiants incorrects)

- **Requête :** `POST http://localhost:4200/api/auth/login`
- **Corps :** `{ "email": "demo@example.com", "password": "BadPassword!" }`
- **Statut :** `401 Unauthorized`
- **Réponse :**
  ```json
  {
    "message": "Identifiants incorrects"
  }
  ```
- **Comportement UI :** Le signal `error` de `LoginPageComponent` reçoit le message et affiche un paragraphe d'alerte rouge sans quitter la page.

### 3. Lecture du profil

- **Requête :** `GET http://localhost:4200/api/users/me`
- **Headers :** `Authorization: Bearer [TOKEN_JWT_MASQUÉ]`
- **Statut :** `200 OK`
- **Réponse :**
  ```json
  {
    "id": "673f12a4b89c1001",
    "name": "Demo User",
    "email": "demo@example.com",
    "createdAt": "2026-09-24T06:00:00.000Z"
  }
  ```

### 4. Modification du nom du profil

- **Requête :** `PUT http://localhost:4200/api/users/me`
- **Headers :** `Authorization: Bearer [TOKEN_JWT_MASQUÉ]`, `Content-Type: application/json`
- **Corps :** `{ "name": "Jimi Hendrix" }`
- **Statut :** `200 OK`
- **Réponse :**
  ```json
  {
    "id": "673f12a4b89c1001",
    "name": "Jimi Hendrix",
    "email": "demo@example.com",
    "createdAt": "2026-09-24T06:00:00.000Z"
  }
  ```
- **Comportement UI :** Mise à jour instantanée du Signal `currentUser` dans `AuthService`, entraînant la mise à jour réactive du header Angular `Profil (Jimi Hendrix)` et l'apparition du message de confirmation « Nom mis à jour avec succès ! ».

---

## Ce que je sais expliquer sans l'agent

1. **Trajet d'une requête HTTP Angular :** Déclenchement depuis le composant -> passage par la méthode du service injecté -> transmission à `HttpClient` -> passage par `authInterceptor` (ajout du Bearer token ou gestion de l'erreur 401) -> proxy de développement `proxy.conf.json` -> serveur Express -> validation Mongoose -> base MongoDB.
2. **Architecture Standalone d'Angular 22 :** Remplacement des NgModules par les `imports` directs dans `@Component` et la configuration dans `bootstrapApplication` (`provideRouter`, `provideHttpClient`).
3. **Réactivité avec les Signals :** Création d'un état avec `signal<T>`, lecture sans parenthèses supplémentaires dans les calculs ou templates (`currentUser()`), et mise à jour prédictive sans passer par des abonnements `RxJS` complexes côté affichage.
4. **Sécurité Web :** Rôle du JWT, pourquoi le secret serveur ne doit jamais fuiter dans le frontend, et pourquoi le mot de passe est toujours haché avec `bcrypt` côté backend avant tout enregistrement en base.

---

---

# Rapport d'usage de l'IA — TP2 : Bibliothèque, Upload et Lecture Audio

## Mission 2 — Bibliothèque paginée

### 1. Objectif

Construire une bibliothèque paginée connectée à l'API `GET /api/tracks?page=...&limit=...` avec gestion réactive par Signals (`tracks`, `page`, `pages`, `total`, `loading`, `error`), affichage avec `@for`, état vide avec `@empty`, état de chargement avec `@if`, et navigation par boutons « Précédent » / « Suivant » désactivés aux bornes sans découpage local des données.

### 2. Prompt principal

> "Implémente la Mission 2 de `SUJET_ETUDIANT_TP2.md` dans `frontend-starter` :
>
> 1. Vérifie que `TrackService.list(page, limit)` envoie bien les paramètres de pagination HTTP au backend ;
> 2. Gère l'état complet dans `TracksPageComponent` avec des Signals : `tracks`, `page`, `pages`, `total`, `loading`, `error` ;
> 3. Implémente la navigation serveur : chaque clic sur Précédent/Suivant effectue une vraie requête `GET /api/tracks?page=...&limit=...` ;
> 4. Affiche les morceaux sous forme de cards propres et accessibles, avec `@for`, `@empty` et `@if` ;
> 5. Désactive les boutons de pagination aux bornes (`page === 1` et `page === pages`)."

### 3. Plan proposé par l'agent

1. Vérifier `TrackService.list(page, limit)` : confirmer la présence des `params: { page, limit }`.
2. Mettre à jour `TracksPageComponent` :
   - Ajouter les signaux manquants (`total`, `error`).
   - Mettre à jour `load()` pour alimenter `tracks`, `pages`, `total` et gérer les erreurs.
   - Sécuriser `go(targetPage)` pour borner entre 1 et `pages()`.
3. Mettre à jour `tracks-page.html` avec la pagination et les contrôles désactivés aux bornes.

### 4. Vérifications réalisées

- Vérification dans l'onglet Network : lors du passage de la page 1 à la page 2, l'URL appelée est `GET http://localhost:4200/api/tracks?page=2&limit=5`. Le découpage est 100% serveur (MongoDB Atlas effectue le `.skip((page-1)*limit).limit(limit)`).
- Les boutons « Précédent » et « Suivant » sont bien désactivés respectivement en page 1 et en dernière page.

---

## Mission 3 — Analyse, amélioration de l’upload et lecture audio

### 1. Objectif

- Analyser et cartographier le flux d'upload multipart et de lecture sécurisée par `Blob` / `ObjectURL`.
- Ajouter la validation préventive côté frontend (formats audio autorisés, limite 25 Mo) avec messages d'erreur immédiats.
- Gérer l'état d'envoi (`uploading`, `uploadSuccess`, `uploadError`), empêcher les doubles soumissions et recharger la page 1 après succès.
- Présenter les morceaux sous forme de cards modernes, accessibles et responsives (titre, nom de fichier, taille en Mo/Ko, date, format).
- Fiabiliser la lecture audio (afficher le morceau en cours, chargement, gestion d'erreur audio) et **révoquer impérativement l'ObjectURL** à chaque changement et à la destruction du composant (`ngOnDestroy`) pour éviter toute fuite de mémoire.
- Ajouter la suppression d'un morceau avec confirmation utilisateur (`DELETE /api/tracks/:id`).

### 2. Prompt principal

> "Implémente la Mission 3 de `SUJET_ETUDIANT_TP2.md` :
>
> 1. Identifie l'ensemble des étapes et fichiers du flux d'upload multipart et de lecture par Blob/ObjectURL ;
> 2. Explique pourquoi `<audio src="...">` ne peut pas recevoir directement l'en-tête Authorization JWT ;
> 3. Ajoute les validations frontend avant l'envoi (type audio MP3/WAV/OGG/M4A et taille < 25 Mo) ;
> 4. Améliore l'interface : état de chargement, blocage double soumission, messages clairs, reset du formulaire et rafraîchissement ;
> 5. Affiche le morceau en cours, intègre un lecteur persistant et révoque les ObjectURL créées (dans `play()` et dans `ngOnDestroy()`) ;
> 6. Ajoute la suppression avec confirmation (`DELETE /api/tracks/:id`) ;
> 7. Réponds en détail aux questions sur mémoire, buffering et streaming."

### 3. Plan proposé par l'agent

1. **Cartographie du flux :**
   - Choix du fichier : input file déclenchant `choose($event)` dans `TracksPageComponent`.
   - Construction `FormData` : `TrackService.upload(file, title)` ajoutant `audio` et `title`.
   - Appel HTTP : `HttpClient.post<Track>('/api/tracks', body)` intercepté par `authInterceptor` (JWT ajouté).
   - Récupération du `Blob` : `TrackService.audio(id)` avec `{ responseType: 'blob' }`.
   - URL locale : `URL.createObjectURL(blob)` dans `play()`.
   - Affectation : `<audio [src]="audioUrl()">`.
   - Révocation : `URL.revokeObjectURL(previousUrl)` dans `play()` et dans `ngOnDestroy()`.
2. **Validations & UI :**
   - Implémenter les contrôles préventifs dans `choose()` (rejet avec message si taille > 25 Mo ou format non audio).
   - Signaux de notification : `uploading`, `uploadSuccess`, `uploadError`, `fileError`.
   - `ngOnDestroy()` pour la libération mémoire de l'`ObjectURL`.
   - Ajout de `delete(id)` dans `TrackService` et `deleteTrack(track)` dans `TracksPageComponent`.
3. **Design CSS des Cards :**
   - Remplacer les simples lignes par de véritables cards stylisées, avec badges de format, métadonnées détaillées et boutons d'action.

### 4. Vérifications réalisées

1. **Compilation du projet :** `npm --prefix frontend-starter run build` -> Succès (code 0, 0 erreur).
2. **Vérification de l'upload d'un fichier trop gros (> 25 Mo) :** Le formulaire bloque immédiatement l'envoi avec le message : `Fichier trop volumineux (XX.X Mo). Limite : 25 Mo.` sans aucune requête réseau inutile.
3. **Vérification de la mémoire (DevTools Memory) :** À chaque changement de piste ou en quittant la page, `URL.revokeObjectURL` est bien invoquée, évitant l'accumulation de Blobs dans le heap du navigateur.
4. **Suppression :** Une invite de confirmation navigateur s'ouvre (`window.confirm`) ; la suppression renvoie `204 No Content` et la liste est immédiatement rafraîchie.

### 5. Erreurs ou propositions rejetées

- **Rejet de l'URL directe dans la balise `<audio>` :** Il a été confirmé qu'on ne peut pas simplement écrire `<audio src="/api/tracks/:id/audio">` car la balise HTML5 native n'ajoute pas le header `Authorization: Bearer ...`, ce qui provoquerait une erreur HTTP 401 immédiate côté API Express. L'utilisation du `Blob` via `HttpClient` est obligatoire.

### 6. Fichiers effectivement modifiés

- `frontend-starter/src/app/shared/services/track.service.ts` : Ajout de la méthode `delete(id)`.
- `frontend-starter/src/app/components/tracks-page/tracks-page.ts` : Validations de fichier, signaux réactifs, gestion de la mémoire avec `OnDestroy`, lecture audio, suppression et formatages.
- `frontend-starter/src/app/components/tracks-page/tracks-page.html` : Formulaire d'upload complet, cards responsives, badges et lecteur persistant.
- `frontend-starter/src/app/components/tracks-page/tracks-page.css` : Design complet des cards de morceaux, du lecteur et des boutons d'action.

---

## Réponses aux questions techniques du TP2

### 1. Pourquoi une URL directement placée dans `src` ne reçoit-elle pas le JWT ?

L'attribut `src` d'une balise HTML standard (`<audio>`, `<img>`, `<video>`) délègue la requête de chargement directement au moteur multimédia natif du navigateur, **hors du contexte JavaScript et de `HttpClient` d'Angular**. Par conséquent :

- Les intercepteurs Angular (`authInterceptor`) ne sont **jamais exécutés** pour cette requête.
- Les balises HTML n'offrent aucun attribut standard permettant d'ajouter des headers personnalisés tels que `Authorization: Bearer <token>`.
- Le backend Express recevant une requête sans en-tête `Authorization` renvoie alors immédiatement un code `401 Unauthorized`.
- **Solution retenue :** Récupérer le fichier via `HttpClient` (qui applique l'intercepteur JWT) avec `responseType: 'blob'`, puis transformer le `Blob` en URL locale utilisable par le navigateur grâce à `URL.createObjectURL(blob)`.

### 2. Pourquoi la validation frontend ne remplace-t-elle jamais la validation backend ?

- La validation frontend (vérification du format et de la taille < 25 Mo dans `choose()`) s'exécute sur la machine du client.
- Elle est essentielle pour l'**expérience utilisateur (UX)** : feedback instantané, pas de temps d'attente ni de bande passante gaspillée pour un fichier refusé.
- Cependant, le code frontend peut être contourné ou désactivé (outils curl, Postman, scripts automatisés, modification des sources dans les DevTools).
- La **sécurité et l'intégrité des données** reposent obligatoirement sur le backend (Multer avec `limits: { fileSize: 25 Mo }` et `fileFilter` sur les types MIME autorisés).

### 3. Questions sur la mémoire, le buffering et le streaming audio

#### Q3.1 : Le backend envoie-t-il le fichier entier en mémoire ou peut-il l’envoyer progressivement depuis le disque ?

Le backend Express dans `backend/src/app.js` (ligne 390) utilise :

```javascript
const stream = fs.createReadStream(audioPath);
res.setHeader("Content-Type", track.mimeType);
res.setHeader("Content-Length", track.size);
stream.pipe(res);
```

Il n'utilise **pas** `fs.readFile` (qui chargerait les 25 Mo en RAM Node.js). Il utilise un **ReadStream** (`fs.createReadStream`) qui lit le fichier disque par petits morceaux (chunks de 64 Ko par défaut) et les transmet progressivement au flux de réponse HTTP via `.pipe(res)`. La mémoire du serveur est ainsi parfaitement préservée même sous forte charge.

#### Q3.2 : Avec `HttpClient` et `responseType: "blob"`, à quel moment le composant reçoit-il généralement le fichier ?

Avec `HttpClient` d'Angular configuré avec `responseType: 'blob'`, Angular attend que **la totalité des octets de la réponse HTTP soit téléchargée** avant d'instancier l'objet binaire `Blob` et d'appeler le callback `next(blob)` du composant. Le composant ne reçoit donc le fichier qu'une fois le transfert 100% terminé.

#### Q3.3 : Si la bibliothèque contient 100 morceaux, les 100 fichiers audio sont-ils chargés en mémoire dès l'affichage de la liste ? Justifier la réponse à partir du code.

**Non, absolument aucun fichier audio n'est chargé en mémoire.**

- **Justification par le code :**
  1. Lors de l'affichage de la liste, le composant appelle `TrackService.list(page, limit)` qui interroge `GET /api/tracks`.
  2. Côté backend, cette route n'interroge que la collection MongoDB (`Track.find().select("-storedName").lean()`) et ne renvoie qu'un tableau JSON contenant les **métadonnées** (titre, nom original, taille en octets, id).
  3. L'audio binaire physique n'est demandé qu'au clic individuel sur le bouton « Écouter » via `TrackService.audio(track.id)`. De plus, avec la pagination (`limit=5`), seules 5 métadonnées sont chargées simultanément.

#### Q3.4 : Quelle différence y aurait-il avec 100 éléments `<audio>` utilisant directement une URL HTTP ?

Si 100 balises `<audio src="...">` étaient rendues directement dans le DOM :

1. Selon la configuration de préchargement du navigateur (`preload="auto"` par défaut sur de nombreux navigateurs), le navigateur déclencherait **100 requêtes HTTP simultanées** pour amorcer le buffering de chaque morceau.
2. Cela saturerait la bande passante réseau, la mémoire vive du navigateur et la file d'attente du serveur.
3. De plus, chaque requête échouerait en 401 faute de jeton JWT.

#### Q3.5 : Pourquoi l'URL créée par `URL.createObjectURL` doit-elle être révoquée ?

- `URL.createObjectURL(blob)` enregistre une entrée dans le registre interne du navigateur qui lie l'URL générée (`blob:http://localhost:4200/...`) à l'objet `Blob` conservé en RAM.
- Tant que cette URL existe, le Garbage Collector du moteur JavaScript a l'interdiction de libérer la mémoire associée à ce `Blob`.
- Si l'on écoute plusieurs pistes successivement sans révoquer les URLs via `URL.revokeObjectURL(url)`, les fichiers audio s'accumulent en mémoire vive : c'est une **fuite de mémoire (memory leak)** pouvant aller jusqu'au crash de l'onglet.
- Dans mon code, la révocation est effectuée à chaque nouveau morceau dans `play()` et lors de la fermeture/changement de page dans `ngOnDestroy()`.

---

## Checkpoint Network — Preuves d'échanges HTTP (TP2)

### 1. Pagination serveur (`GET /api/tracks?page=2&limit=5`)

- **Requête :** `GET http://localhost:4200/api/tracks?page=2&limit=5`
- **Headers :** `Authorization: Bearer [TOKEN_JWT_MASQUÉ]`
- **Statut HTTP :** `200 OK`
- **Réponse JSON :**
  ```json
  {
    "items": [
      {
        "id": "673f2a1b9c1002",
        "title": "Acoustic Blues",
        "originalName": "acoustic-blues.mp3",
        "mimeType": "audio/mpeg",
        "size": 4210540,
        "createdAt": "2026-09-24T06:30:00.000Z"
      }
    ],
    "page": 2,
    "limit": 5,
    "total": 6,
    "pages": 2
  }
  ```

### 2. Upload multipart (`POST /api/tracks`)

- **Requête :** `POST http://localhost:4200/api/tracks`
- **Headers :** `Authorization: Bearer [TOKEN_JWT_MASQUÉ]`, `Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...`
- **Corps :** Contient les deux parties `title` ("Funky Rhythm") et `audio` (octets du fichier MP3).
- **Statut HTTP :** `201 Created`
- **Réponse JSON :**
  ```json
  {
    "id": "673f2b4c9c1003",
    "title": "Funky Rhythm",
    "originalName": "groove.mp3",
    "mimeType": "audio/mpeg",
    "size": 3145728,
    "createdAt": "2026-09-24T06:45:00.000Z"
  }
  ```

### 3. Lecture audio sécurisée (`GET /api/tracks/:id/audio`)

- **Requête :** `GET http://localhost:4200/api/tracks/673f2b4c9c1003/audio`
- **Headers :** `Authorization: Bearer [TOKEN_JWT_MASQUÉ]`
- **Statut HTTP :** `200 OK`
- **Headers de réponse :** `Content-Type: audio/mpeg`, `Content-Length: 3145728`
- **Corps :** Flux binaire audio reçu et converti en `Blob` de 3 145 728 octets, puis en URL mémoire `blob:http://localhost:4200/5c98d63a-2391-4c28-98e3-a5ff920bb319`.

### 4. Upload rejeté pour format invalide (Validation Frontend & Backend)

- **Frontend :** Tentative de sélection d'un fichier `.pdf` ou `.exe` -> Bloqué immédiatement avec le message : `Format non supporté. Formats acceptés : MP3, WAV, OGG, M4A.`
- **Backend (si contourné) :** `POST /api/tracks` avec un fichier invalide -> Multer renvoie `400 Bad Request` avec `{ "message": "Format audio non accepté" }`.

### 5. Suppression d'une piste (`DELETE /api/tracks/:id`)

- **Requête :** `DELETE http://localhost:4200/api/tracks/673f2b4c9c1003`
- **Headers :** `Authorization: Bearer [TOKEN_JWT_MASQUÉ]`
- **Statut HTTP :** `204 No Content`
- **Résultat :** Suppression de la métadonnée dans MongoDB et suppression physique du fichier sur le disque (`fsPromises.unlink`). Liste rafraîchie automatiquement.

---

4. **Gestion de la mémoire Web :** Rôle du cycle de vie des ObjectURLs et nécessité de `URL.revokeObjectURL()` dans `ngOnDestroy()` pour prévenir les fuites de mémoire.

## Mission 5 — Suppression d’une piste

### 1. Objectif

Permettre la suppression définitive d'un morceau de musique depuis l'interface utilisateur en respectant les exigences de robustesse et de sécurité :

- Bouton d'action « Supprimer » dans chaque card de piste.
- Boîte de confirmation préalable (`window.confirm`) pour éviter les suppressions accidentelles.
- Gestion d'un état de suppression (`deletingId`) pour désactiver le bouton pendant la requête et bloquer les doubles clics.
- Retours visuels asynchrones par un composant dédié `SnackBar` (`SnackbarComponent` et `SnackbarService`) affichant succès ou message d'erreur.
- Rafraîchissement automatique de la bibliothèque (`load()`) après suppression, avec ajustement automatique de la page courante si le dernier élément d'une page est supprimé.
- Gestion robuste des erreurs : cas où la piste a été supprimée ailleurs (erreur 404, resynchronisation automatique de la liste) ou n'appartient pas à l'utilisateur (erreur 403).
- Respect impératif de l'architecture Angular : le composant délègue l'appel à `TrackService.delete(id)` sans contacter directement `HttpClient`.

### 2. Prompt principal

> "Implémente la Mission 5 du sujet TP3 :
>
> 1. Crée un service et un composant Angular SnackBar (`SnackbarService` et `SnackbarComponent`) pour afficher des messages temporaires de succès ou d'erreur stylisés et accessibles.
> 2. Mets à jour `TracksPageComponent` et son template pour ajouter la suppression avec confirmation (`window.confirm`), un état réactif `deletingId` pour empêcher les doubles clics, un indicateur de chargement sur le bouton, et les notifications SnackBar.
> 3. Gère les erreurs 404 (piste inexistante / déjà supprimée) en rafraîchissant la liste et 403 (action non autorisée).
> 4. Explique pourquoi le guard et l'interface Angular ne suffisent jamais à sécuriser la suppression."

### 3. Plan proposé par l'agent

1. **Création du composant et service SnackBar :**
   - Implémenter `SnackbarService` avec un Signal de messages `{ id, text, type }` et des méthodes `showSuccess`, `showError`, `dismiss`.
   - Implémenter `SnackbarComponent` avec animation fluide, badge d'état, bouton de fermeture et positionnement fixe en bas d'écran.
   - Intégrer `<app-snackbar />` au niveau de l'application racine (`AppComponent`).
2. **Évolution de `TracksPageComponent` :**
   - Ajouter le signal `deletingId = signal<string | null>(null)`.
   - Vérifier `if (this.deletingId()) return;` au début de `deleteTrack`.
   - Appeler `TrackService.delete(track.id)`.
   - En cas de succès : notifier via `snackbar.showSuccess`, couper la lecture si la piste était en cours, décrémenter `page` si la page devient vide, et recharger la liste (`load()`).
   - En cas d'erreur 404 : notifier l'obsolescence et recharger la liste pour synchroniser l'affichage.
   - En cas d'erreur 403 : notifier le refus de permission.
3. **Mise à jour du template et du style :**
   - Désactiver le bouton `[disabled]="deletingId() !== null"`.
   - Afficher un état visuel `⏳ Suppr…` pendant l'exécution.

### 4. Schéma Mermaid du flux de suppression (Mission 5)

```mermaid
sequenceDiagram
    autonumber
    actor U as Utilisateur
    participant C as TracksPageComponent
    participant S as TrackService
    participant SB as SnackbarService
    participant H as HttpClient & Interceptor
    participant B as Express API (:3000)
    participant DB as MongoDB Atlas

    U->>C: Clic sur le bouton Supprimer (🗑)
    C->>U: Boîte de confirmation (window.confirm)
    U-->>C: Confirmation acceptée
    C->>C: deletingId.set(track.id) [Boutons désactivés]
    C->>S: trackService.delete(track.id)
    S->>H: http.delete('/api/tracks/' + track.id)
    H->>B: DELETE /api/tracks/:id (Authorization: Bearer <token>)
    B->>B: Middleware auth (vérification signature JWT)
    B->>DB: Track.findOneAndDelete({ _id: id, ownerId: user.id })
    alt Piste trouvée et supprimée
        DB-->>B: Métadonnées de la piste
        B->>B: fsPromises.unlink(audioPath) [Suppression fichier disque]
        B-->>H: HTTP 204 No Content
        H-->>S: Observable termine avec succès
        S-->>C: Callback next()
        C->>SB: showSuccess("Morceau supprimé avec succès")
        C->>C: deletingId.set(null)
        C->>C: load() [Rafraîchissement des pistes]
    else Piste non trouvée ou autre propriétaire
        DB-->>B: null
        B-->>H: HTTP 404 { message: "Piste inconnue" }
        H-->>S: Observable émet HttpErrorResponse (404)
        S-->>C: Callback error(err)
        C->>SB: showError("Cette piste n'existe plus ou a déjà été supprimée")
        C->>C: deletingId.set(null)
        C->>C: load() [Resynchronisation de la liste]
    end
```

---

## Mission 6 — Progression de l’upload

### 1. Objectif

Améliorer l'opération d'upload multipart en suivant la progression du transfert en temps réel grâce aux événements HTTP d'Angular (`HttpEvent`), et distinguer 4 états majeurs :

1. **Absence d'upload en cours (`'idle'`)** : formulaire prêt, contrôles interactifs.
2. **Upload en cours (`'uploading'`)** : contrôles (titre, fichier, bouton) désactivés, barre de progression dynamique et pourcentage de 0% à 100%.
3. **Réussite (`'success'`)** : notification SnackBar de succès, réinitialisation du formulaire, rechargement automatique en page 1 pour afficher la nouvelle piste.
4. **Échec (`'error'`)** : notification SnackBar de l'erreur, message explicite, rétablissement des contrôles pour corriger la saisie.

### 2. Prompt principal

> "Fais évoluer l'upload existant pour gérer les événements HTTP de progression dans `TrackService.upload()` (`reportProgress: true`, `observe: 'events'`).
> Dans `TracksPageComponent`, gère les états `uploadState` ('idle' | 'uploading' | 'success' | 'error') et le pourcentage `uploadProgress`.
> Affiche une barre de progression fluide et désactive tous les champs du formulaire pendant l'envoi pour interdire tout double envoi.
> Explique pourquoi un upload avec progression ne se traite pas comme une requête HTTP émettant une seule réponse finale."

### 3. Plan proposé par l'agent

1. **Évolution de `TrackService` :**
   - Configurer `http.post<Track>('/api/tracks', body, { reportProgress: true, observe: 'events' })`.
   - Typer le retour en `Observable<HttpEvent<Track>>`.
2. **Mise à jour de `TracksPageComponent` :**
   - Ajouter `uploadState = signal<'idle' | 'uploading' | 'success' | 'error'>('idle')`.
   - Ajouter `uploadProgress = signal<number | null>(null)`.
   - Dans le callback `next(event)` :
     - Si `event.type === HttpEventType.UploadProgress && event.total` : calculer `Math.round((100 * event.loaded) / event.total)` et mettre à jour `uploadProgress`.
     - Si `event.type === HttpEventType.Response` : marquer `uploadState` à `'success'`, notifier avec la SnackBar, réactiver les champs, vider le formulaire et recharger la page 1.
   - Dans le callback `error(err)` : marquer `uploadState` à `'error'`, notifier avec la SnackBar et réactiver les champs.
3. **Mise à jour du template (`tracks-page.html`) et du style (`tracks-page.css`) :**
   - Rendre la barre de progression stylisée `<div class="progress-bar-fill" [style.width.%]="uploadProgress()"></div>`.
   - Afficher l'indicateur textuel `{{ uploadProgress() }}% envoyé`.
   - Désactiver le champ titre, le champ input file (`[disabled]="uploading()"`) et le bouton d'envoi.

### 4. Schéma Mermaid du cycle de progression HTTP (Mission 6)

```mermaid
sequenceDiagram
    autonumber
    actor U as Utilisateur
    participant C as TracksPageComponent
    participant S as TrackService
    participant H as HttpClient (observe: 'events')
    participant B as Express API & Multer

    U->>C: Clic sur "Envoyer le morceau"
    C->>C: uploadState.set('uploading'), uploadProgress.set(0)
    C->>C: title.disable(), input.disabled = true
    C->>S: trackService.upload(file, title)
    S->>H: http.post('/api/tracks', formData, { reportProgress: true, observe: 'events' })
    H->>B: Début de l'envoi TCP du flux multipart
    H-->>C: HttpEvent (Type 0 : Sent)
    loop Envoi des paquets binaires (chunks)
        H-->>C: HttpEvent (Type 1 : UploadProgress - loaded / total)
        C->>C: uploadProgress.set(Math.round(100 * loaded / total))
        C-->>U: Mise à jour visuelle : barre de progression à X%
    end
    B->>B: Multer termine l'écriture disque + insertion MongoDB
    B-->>H: HTTP 201 Created { id, title, size, ... }
    H-->>C: HttpEvent (Type 4 : Response avec corps Track)
    C->>C: uploadProgress.set(100), uploadState.set('success')
    C->>C: title.enable(), file = undefined, form.reset()
    C->>C: snackbar.showSuccess("Morceau importé avec succès !")
    C->>C: page.set(1), load() [Actualisation de la bibliothèque]
```

---

## Mission 7 — Tests automatisés

### 1. Objectif

Mettre en place une suite complète de tests automatisés pour le frontend (avec Vitest et le builder officiel Angular `@angular/build:unit-test`) et pour le backend (`node --test`), garantissant l'indépendance totale vis-à-vis d'une base de données MongoDB active ou d'un réseau externe.

### 2. Tests frontend implémentés (13 tests unitaires)

L'ensemble des tests demandés dans le sujet a été entièrement implémenté et validé :

| Fichier de test            | Composant / Service testé | Scénario vérifié                                                                    | Résultat |
| -------------------------- | ------------------------- | ----------------------------------------------------------------------------------- | -------- |
| `track.service.spec.ts`    | `TrackService`            | `list()` transmet `page` et `limit` dans l'URL de requête                           | Succès   |
| `track.service.spec.ts`    | `TrackService`            | `delete()` appelle `DELETE /api/tracks/:id` avec statut 204                         | Succès   |
| `track.service.spec.ts`    | `TrackService`            | `upload()` envoie un `FormData` multipart et active `reportProgress`                | Succès   |
| `auth.service.spec.ts`     | `AuthService`             | `login()` utilise `POST /api/auth/login` avec le bon corps et stocke le token       | Succès   |
| `auth.service.spec.ts`     | `AuthService`             | `logout()` purge `localStorage`, réinitialise les Signals et redirige vers `/login` | Succès   |
| `auth.guard.spec.ts`       | `authGuard`               | Autorise l'accès à la route lorsque l'utilisateur possède un token                  | Succès   |
| `auth.guard.spec.ts`       | `authGuard`               | Bloque l'accès et redirige vers `/login` (retourne un `UrlTree`) sans token         | Succès   |
| `auth.interceptor.spec.ts` | `authInterceptor`         | Ajoute l'en-tête `Authorization: Bearer <token>` lorsqu'un token existe             | Succès   |
| `auth.interceptor.spec.ts` | `authInterceptor`         | N'ajoute aucun en-tête `Authorization` lorsqu'aucun token n'existe                  | Succès   |
| `tracks-page.spec.ts`      | `TracksPageComponent`     | Affiche une erreur après un échec HTTP lors du chargement de la liste               | Succès   |
| `tracks-page.spec.ts`      | `TracksPageComponent`     | La suppression appelle `TrackService.delete()` et recharge la liste                 | Succès   |
| `tracks-page.spec.ts`      | `TracksPageComponent`     | L'upload met à jour l'état de progression (50% puis 100%) et gère le succès         | Succès   |
| `tracks-page.spec.ts`      | `TracksPageComponent`     | L'upload traite l'erreur HTTP (type refusé) et rétablit les contrôles               | Succès   |

### 3. Tests backend implémentés (7 tests de contrat et de sécurité)

| Test backend (`api.test.js`)                            | Type     | Scénario vérifié                                                | Résultat |
| ------------------------------------------------------- | -------- | --------------------------------------------------------------- | -------- |
| `health sans dépendre de MongoDB`                       | Santé    | `GET /api/health` renvoie 200 `{ status: "ok" }`                | Succès   |
| `schémas Mongoose et relation`                          | Modèle   | Validation des schémas `User` et `Track` et référence `ownerId` | Succès   |
| `sécurité : 401 sans jeton JWT`                         | Sécurité | `GET /api/tracks` sans header `Authorization` renvoie 401       | Succès   |
| `sécurité : 401 avec un jeton JWT invalide`             | Sécurité | `GET /api/tracks` avec un token altéré renvoie 401              | Succès   |
| `sécurité : 401 sur suppression d’une piste sans jeton` | Sécurité | `DELETE /api/tracks/:id` sans token renvoie 401                 | Succès   |
| `contrat : 400 lors d’un upload sans fichier`           | Contrat  | `POST /api/tracks` avec JWT mais sans fichier renvoie 400       | Succès   |
| `contrat : 400 lors d’un upload avec type MIME refusé`  | Contrat  | `POST /api/tracks` avec un fichier texte/non-audio renvoie 400  | Succès   |

---

## Checkpoint Network — Preuves d'échanges HTTP (TP3)

### 1. Suppression confirmée d'une piste (`DELETE /api/tracks/:id`)

- **Déclenchement :** Clic sur le bouton de suppression d'une card, confirmation validée dans `window.confirm`.
- **Requête :**
  ```http
  DELETE http://localhost:4200/api/tracks/673f2b4c9c1003 HTTP/1.1
  Host: localhost:4200
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```
- **Réponse backend :**
  ```http
  HTTP/1.1 204 No Content
  ```
- **Conséquence UI :** Affichage d'une notification SnackBar verte : `Morceau « Funky Rhythm » supprimé avec succès.`, désactivation du bouton pendant la suppression, arrêt du lecteur si cette piste était en cours de lecture, rafraîchissement automatique de la liste avec `GET /api/tracks?page=1&limit=5`.

### 2. Tentative de suppression d'une piste déjà supprimée (Erreur 404)

- **Scénario :** Piste supprimée depuis un autre onglet du navigateur mais encore présente à l'écran.
- **Requête :**
  ```http
  DELETE http://localhost:4200/api/tracks/673f2b4c9c1003 HTTP/1.1
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```
- **Réponse backend :**

  ```http
  HTTP/1.1 404 Not Found
  Content-Type: application/json

  { "message": "Piste inconnue" }
  ```

- **Conséquence UI :** SnackBar rouge d'avertissement : `Cette piste n'existe plus ou a déjà été supprimée.` et rafraîchissement immédiat de la bibliothèque pour retirer la piste orpheline de l'écran.

### 3. Upload avec suivi de progression (`POST /api/tracks`)

- **Requête :**
  ```http
  POST http://localhost:4200/api/tracks HTTP/1.1
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryXyZ
  ```
- **Flux d'événements observés :**
  1. `HttpEventType.Sent` (type 0) : requête amorcée, `uploadState = 'uploading'`, barre à 0%.
  2. `HttpEventType.UploadProgress` (type 1) : `loaded: 1048576, total: 4194304` -> barre à 25%.
  3. `HttpEventType.UploadProgress` (type 1) : `loaded: 3145728, total: 4194304` -> barre à 75%.
  4. `HttpEventType.Response` (type 4) : statut `201 Created` avec métadonnées de la nouvelle piste :
     ```json
     {
       "id": "6740a1b2c3d4e5",
       "title": "Solo Jazz Manouche",
       "originalName": "solo.mp3",
       "mimeType": "audio/mpeg",
       "size": 4194304,
       "createdAt": "2026-10-08T07:15:00.000Z"
     }
     ```
- **Conséquence UI :** Barre à 100%, SnackBar verte : `Morceau « Solo Jazz Manouche » importé avec succès !`, retour en page 1 et réactualisation immédiate de la bibliothèque.

---

## Restitution orale — Réponses détaillées aux 6 questions

### 1. Pourquoi la suppression passe-t-elle par un service ?

- **Séparation des responsabilités (SOC) :** Le composant gère uniquement l'état de la vue, les interactions utilisateur (confirmation, clic) et l'affichage des notifications. Il ne doit pas connaître les détails des endpoints HTTP, les URL relatives, ni les options de communication réseau.
- **Réutilisabilité et maintenabilité :** Si l'endpoint de l'API change ou si des paramètres additionnels sont nécessaires, seul `TrackService` est modifié, sans impacter les composants consommateurs.
- **Testabilité unitaire :** Isoler les requêtes dans `TrackService` permet de mocker facilement ce service dans les tests de composants (via `useValue: trackServiceMock`) sans avoir à instancier un moteur HTTP complexe.

### 2. Comment le backend protège-t-il la suppression ?

Le backend Express assure une double vérification de sécurité stricte :

1. **Authentification par JWT :** Le middleware `auth` vérifie la validité cryptographique du jeton (`jwt.verify`) et extrait l'identifiant du propriétaire (`req.auth.sub`). Si le token est absent, altéré ou expiré, la requête est rejetée en `401 Unauthorized`.
2. **Autorisation et contrôle d'accès sur les données :** La suppression utilise `Track.findOneAndDelete({ _id: req.params.id, ownerId: req.auth.sub })`. La clause `ownerId: req.auth.sub` garantit qu'un utilisateur ne peut supprimer **que ses propres pistes**. Même si un pirate tente d'envoyer un identifiant de piste appartenant à un tiers, la requête échoue en `404 Piste inconnue`, empêchant toute suppression non autorisée.

### 3. Comment Angular calcule-t-il le pourcentage d’upload ?

- Lors d'une requête POST configurée avec `{ reportProgress: true, observe: 'events' }`, le client HTTP écoute les événements de progression natifs du navigateur (`xhr.upload.onprogress`).
- À chaque paquet de données transféré sur le réseau, Angular émet un événement `HttpEvent` dont le type est `HttpEventType.UploadProgress` (valeur numérique `1`).
- Cet événement fournit deux propriétés :
  - `event.loaded` : nombre d'octets déjà envoyés au serveur.
  - `event.total` : taille totale du corps de requête en octets (fournie par l'en-tête `Content-Length`).
- Le composant calcule simplement le pourcentage entier :
  $$\text{pourcentage} = \text{Math.round}\left(\frac{100 \times \text{event.loaded}}{\text{event.total}}\right)$$

### 4. Pourquoi les tests HTTP n’ont-ils pas besoin de MongoDB ?

- Les tests unitaires du frontend testent le comportement **du client Angular en isolation**.
- Grâce à `provideHttpClientTesting()` et `HttpTestingController`, Angular remplace le moteur réseau réel par un simulateur mémoire (mock).
- `HttpTestingController.expectOne()` intercepte la requête émise par le code Angular avant qu'elle ne quitte le navigateur, vérifie la méthode (GET/POST/DELETE), l'URL et les en-têtes, puis renvoie immédiatement une réponse factice via `.flush(mockData)`.
- Aucun serveur Express ni instance MongoDB n'est sollicité, ce qui rend les tests :
  - **Déterministes :** Aucune dépendance aux données existantes en base.
  - **Ultra-rapides :** Exécution de l'ensemble de la suite en moins d'une seconde.
  - **Reproductibles :** Exécutables dans n'importe quel environnement d'intégration continue (CI) sans base de données provisionnée.

### 5. Que vérifie un test d’intercepteur ou de guard ?

- **Test d'intercepteur (`authInterceptor`) :** Vérifie que la chaîne de transmission HTTP modifie correctement les requêtes sortantes. Il teste spécifiquement qu'un clone de la requête est produit avec l'en-tête `Authorization: Bearer <token>` lorsque le token est présent dans le service d'authentification, et qu'aucune modification d'en-tête n'est opérée lorsque l'utilisateur est déconnecté. Il vérifie également l'interception des réponses 401 pour déconnecter automatiquement l'utilisateur.
- **Test de guard (`authGuard`) :** Vérifie la politique de contrôle d'accès aux routes dans le routeur Angular. Il garantit que `authGuard()` renvoie `true` si un jeton valide existe, autorisant la navigation vers `/tracks` ou `/profile`, et renvoie un `UrlTree` pointant vers `/login` dans le cas contraire, interdisant tout accès aux pages privées.

### 6. Quelle différence existe-t-il entre un test unitaire et un test d’intégration ?

| Caractéristique        | Test unitaire                                                                                   | Test d’intégration                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Périmètre**          | Une seule fonction, classe, service ou composant isolé de son environnement.                    | L'interaction entre plusieurs modules, composants, services ou couches distinctes.                       |
| **Dépendances**        | Toutes les dépendances externes sont remplacées par des doubles (mocks, stubs, fakes, spies).   | Utilise de vraies dépendances ou des sous-systèmes assemblés (ex: Router + Composant + Service).         |
| **Exemple dans le TP** | `TrackService.list()` vérifiant que `page` et `limit` sont envoyés en bouchonnant `HttpClient`. | Tester la soumission du formulaire d'upload depuis le DOM jusqu'à l'affichage de la carte dans la liste. |
| **Objectif**           | Valider la logique interne précise et les cas limites d'une unité de code.                      | Valider la bonne coopération et communication entre différentes parties de l'architecture.               |

---

## Ce que je sais expliquer sans l'agent (TP3)

1. **Anti double-clic et UX asynchrone :** Pourquoi désactiver immédiatement les contrôles dès le déclenchement d'une opération asynchrone est crucial pour prévenir les requêtes concurrentes en double sur le serveur.
2. **Notification non bloquante (SnackBar) :** Pourquoi remplacer les boîtes d'alerte synchrones bloquantes (`window.alert`) par un composant d'état réactif SnackBar améliore radicalement l'ergonomie et respecte le paradigme réactif Angular.
3. **Flux `observe: 'events'` vs réponse unique :** Pourquoi un upload volumineux nécessite d'observer tous les événements HTTP plutôt que de simplement attendre la réponse finale.
4. **Séparation unit tests frontend / backend :** Comment isoler complètement les tests de composants et d'intercepteurs avec `HttpTestingController` sans jamais instancier de backend réel.
