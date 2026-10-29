# Contrat HTTP - TP1 à TP4

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/users/search?q=…` | JWT | `200 PublicUser[]` (TP4) |
| GET | `/friends` | JWT | `200 FriendsOverview` (TP4) |
| POST | `/friends/requests` | `{userId}` + JWT | `201` ou `200 {friendshipId,status}` (TP4) |
| POST | `/friends/requests/:id/accept` | JWT | `200 {friendshipId,status}` (TP4) |
| DELETE | `/friends/requests/:id` | JWT | `204` (TP4) |
| DELETE | `/friends/:userId` | JWT | `204` (TP4) |
| GET | `/activity?limit=10&before=…` | JWT | `200 ActivityFeed` (fil d'activité des amis, TP4) |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` (mes pistes) |
| GET | `/tracks/public?page=1&limit=10` | JWT | `Page<Track>` (pistes publiques, TP4) |
| GET | `/tracks/search?q=…&scope=…&genre=…&key=…&bpmMin=…&bpmMax=…` | JWT | `Page<Track>` (recherche, TP4) |
| GET | `/tracks/shared-with-me?page=1&limit=10` | JWT | `Page<Track>` (pistes de mes amis accessibles, TP4) |
| POST | `/tracks` | multipart : `audio`, `title`, `visibility`, `bpm`, `key`, `genre`, `tags` | `201 Track` |
| PATCH | `/tracks/:id` | JSON : métadonnées à modifier + JWT | `200 Track` (TP4) |
| PUT | `/tracks/:id/shares` | `{userIds}` + JWT | `200 Track` (partage nominatif, TP4) |
| DELETE | `/tracks/:id/shares/:userId` | JWT | `200 Track` (arrêt d'un partage, TP4) |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) |

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`. `page` vaut au minimum 1, `limit` est borné entre 1 et 20. Formats acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé ou relation d'amitié déjà existante.

## Objet `Track`

```json
{
  "id": "6720…",
  "ownerId": "671f…",
  "ownerName": "Alice",
  "title": "Blues en La mineur",
  "originalName": "blues.mp3",
  "mimeType": "audio/mpeg",
  "size": 3605337,
  "createdAt": "2026-10-28T13:56:53.175Z",
  "visibility": "public",
  "bpm": 92,
  "key": "Am",
  "genre": "Blues",
  "tags": ["shuffle", "lent"],
  "sharedWith": ["6721…"]
}
```

- `ownerName` n'est présent que sur `GET /tracks/public`, `GET /tracks/search` et `GET /tracks/shared-with-me`.
- `bpm`, `key` et `genre` valent `null` lorsqu'ils ne sont pas renseignés ; `tags` vaut `[]`.
- Le nom de stockage sur disque n'est jamais renvoyé.
- La liste des partages dépend de qui regarde la piste :
  - le **propriétaire** reçoit `sharedWith`, les identifiants des amis à qui la piste est partagée nommément ;
  - **tout autre utilisateur** reçoit seulement `sharedWithMe` (booléen) : `true` si la piste lui est partagée nommément. Il ne voit jamais les autres destinataires.

## Métadonnées d'une piste (TP4)

Ces règles s'appliquent à `POST /tracks` (champs texte multipart) et à `PATCH /tracks/:id` (JSON).

| Champ | Type | Règle |
|---|---|---|
| `title` | texte | 1 à 120 caractères. À la création, vide ⇒ nom du fichier. |
| `visibility` | texte | `private` (défaut), `friends` ou `public` |
| `bpm` | entier | 20 à 300 ; `""` ou `null` efface la valeur |
| `key` | texte | une des 24 tonalités : `C C# D Eb E F F# G Ab A Bb B`, suivies ou non de `m` (mineur) ; `""` ou `null` efface |
| `genre` | texte | 40 caractères maximum ; `""` ou `null` efface |
| `tags` | tableau ou texte `"a, b"` | 10 tags maximum de 30 caractères, convertis en minuscules, doublons retirés |

Plusieurs erreurs de validation sont renvoyées ensemble dans `message`, séparées par `". "`.

## Visibilité et accès à l'audio (TP4)

`GET /tracks/:id/audio` est autorisé si l'utilisateur connecté :

- est le propriétaire de la piste ;
- ou la piste est `public` ;
- ou la piste est `friends` et il est ami du propriétaire ;
- ou la piste lui est partagée nominativement et il est toujours ami du propriétaire.

« Ami » signifie une amitié **acceptée** (voir `/friends`). Retirer un ami coupe immédiatement l'accès à ses pistes `friends` et à ses partages, dans les deux sens. Une piste inaccessible renvoie `404` comme une piste inexistante, pour ne pas révéler son existence.

## Détail des routes ajoutées ou modifiées au TP4

### `GET /tracks/public`

- **Auth** : JWT obligatoire.
- **Paramètres** : `page` (défaut 1), `limit` (défaut 5, maximum 20).
- **Réponse** : `200 Page<Track>`, pistes `visibility = "public"` de tous les utilisateurs, triées de la plus récente à la plus ancienne, avec `ownerName`.
- **Erreurs** : `401` sans jeton ou jeton invalide.

### `POST /tracks`

- **Auth** : JWT obligatoire.
- **Corps** : `multipart/form-data` avec le fichier `audio` et les champs texte optionnels du tableau des métadonnées.
- **Réponse** : `201 Track`.
- **Erreurs** : `400` sans fichier, format audio refusé, fichier trop gros ou métadonnée invalide (le fichier déjà reçu est alors supprimé du disque) ; `401`.

### `PATCH /tracks/:id`

- **Auth** : JWT obligatoire ; seul le propriétaire peut modifier.
- **Corps** : JSON contenant un ou plusieurs champs parmi `title`, `visibility`, `bpm`, `key`, `genre`, `tags`. Les autres champs sont ignorés.
- **Réponse** : `200 Track` mis à jour.
- **Erreurs** : `400` métadonnée invalide ou aucun champ modifiable ; `401` ; `404` piste inexistante, identifiant mal formé ou piste d'un autre utilisateur.

### `GET /tracks/:id/audio`

- **Auth** : JWT obligatoire.
- **Réponse** : flux audio avec le `Content-Type` d'origine si l'accès est autorisé (voir règles ci-dessus).
- **Erreurs** : `401` ; `404` piste inexistante, identifiant mal formé ou accès non autorisé.

### `GET /tracks/search`

- **Auth** : JWT obligatoire.
- **Paramètres** (tous optionnels, une seule occurrence chacun) :

  | Paramètre | Règle |
  |---|---|
  | `q` | texte libre, 100 caractères maximum. Cherché sans tenir compte de la casse dans le titre, les tags, le genre, le nom du fichier et le nom de l'auteur. Les caractères spéciaux sont cherchés littéralement. |
  | `scope` | `all` (défaut : toutes les pistes que je peux écouter), `public` ou `mine` |
  | `genre` | égalité insensible à la casse, 40 caractères maximum |
  | `key` | une des 24 tonalités |
  | `bpmMin`, `bpmMax` | entiers de 20 à 300, avec `bpmMin ≤ bpmMax` |
  | `page`, `limit` | comme les autres listes (limite par défaut 5, maximum 20) |

- **Réponse** : `200 Page<Track>`, résultats triés du plus récent au plus ancien, avec `ownerName`. Les critères se cumulent (ET logique). Une piste que l'utilisateur ne peut pas écouter n'apparaît jamais, quel que soit le périmètre choisi.
- **Erreurs** : `400` paramètre invalide ou répété (toutes les erreurs dans `message`) ; `401`.

### `GET /tracks/shared-with-me`

- **Auth** : JWT obligatoire.
- **Paramètres** : `page` (défaut 1), `limit` (défaut 5, maximum 20).
- **Réponse** : `200 Page<Track>` avec `ownerName`, du plus récent au plus ancien : pistes de mes **amis actuels** qui sont `friends` ou qui me sont partagées nommément. Les pistes publiques n'y figurent pas (elles sont sur `/tracks/public`). Sans ami, la page est vide.
- **Erreurs** : `401`.

### `PUT /tracks/:id/shares`

- **Auth** : JWT obligatoire ; seul le propriétaire peut partager.
- **Corps** : `{ "userIds": ["…", "…"] }`, la liste **complète** des destinataires (elle remplace la précédente). Une liste vide arrête tous les partages. Les doublons sont retirés ; 50 destinataires maximum.
- **Réponse** : `200 Track` avec `sharedWith` à jour.
- **Erreurs** : `400` si `userIds` n'est pas un tableau d'identifiants, si un destinataire n'est pas un ami confirmé, si l'on se désigne soi-même ou si la liste dépasse 50 ; `404` piste inexistante, identifiant mal formé ou piste d'un autre utilisateur ; `401`.

Le partage nominatif est surtout utile pour une piste `private` : une piste `friends` est déjà visible par tous mes amis et une piste `public` par tout le monde. Il reste enregistré si la visibilité change.

### `DELETE /tracks/:id/shares/:userId`

- **Auth** : JWT obligatoire ; seul le propriétaire peut arrêter un partage.
- **Réponse** : `200 Track` avec `sharedWith` à jour. Arrêter un partage qui n'existait pas n'est pas une erreur (idempotent).
- **Erreurs** : `404` piste inexistante ou d'un autre utilisateur (« Piste inconnue »), identifiant de piste ou d'utilisateur mal formé ; `401`.

## Réseau d'amis (TP4)

Une amitié est unique par paire d'utilisateurs, quel que soit le sens de l'invitation. Elle est d'abord `pending` (invitation envoyée), puis `accepted`. Refuser, annuler ou retirer un ami supprime l'amitié. Les autres utilisateurs ne sont jamais exposés avec leur email :

```json
// PublicUser
{ "id": "671f…", "name": "Alice" }

// FriendsOverview (GET /friends)
{
  "friends":  [{ "friendshipId": "…", "user": PublicUser, "since": "2026-10-28T…" }],
  "incoming": [{ "friendshipId": "…", "user": PublicUser, "createdAt": "2026-10-28T…" }],
  "outgoing": [{ "friendshipId": "…", "user": PublicUser, "createdAt": "2026-10-28T…" }]
}
```

### `GET /users/search`

- **Auth** : JWT obligatoire.
- **Paramètres** : `q`, de 2 à 50 caractères. Il est comparé au nom (contient, sans tenir compte de la casse) **ou** à l'email (égalité exacte).
- **Réponse** : `200 PublicUser[]`, 10 résultats au maximum, triés par nom, sans l'utilisateur connecté.
- **Erreurs** : `400` si `q` est absent, trop court ou trop long ; `401`.

### `GET /friends`

- **Auth** : JWT obligatoire.
- **Réponse** : `200 FriendsOverview`. Les amis sont triés par nom.
- **Erreurs** : `401`.

### `POST /friends/requests`

- **Auth** : JWT obligatoire.
- **Corps** : `{ "userId": "…" }`.
- **Réponses** :
  - `201 { friendshipId, status: "pending" }` : invitation créée ;
  - `200 { friendshipId, status: "accepted" }` : la personne m'avait déjà invité, nous devenons amis immédiatement.
- **Erreurs** : `400` si `userId` est absent ou si l'on s'invite soi-même ; `404` si l'utilisateur est inconnu ou si l'identifiant est mal formé ; `409` si nous sommes déjà amis ou si l'invitation a déjà été envoyée ; `401`.

### `POST /friends/requests/:id/accept`

- **Auth** : JWT obligatoire. Seul le **destinataire** d'une invitation en attente peut l'accepter.
- **Réponse** : `200 { friendshipId, status: "accepted" }`.
- **Erreurs** : `404` si l'invitation est inconnue, déjà acceptée, si je n'en suis pas le destinataire ou si l'identifiant est mal formé ; `401`.

### `DELETE /friends/requests/:id`

- **Auth** : JWT obligatoire. Le destinataire **refuse** l'invitation, l'expéditeur l'**annule**.
- **Réponse** : `204`.
- **Erreurs** : `404` si l'invitation est inconnue, déjà acceptée, si je n'en suis pas membre ou si l'identifiant est mal formé ; `401`.

### `DELETE /friends/:userId`

- **Auth** : JWT obligatoire.
- **Effet** : supprime l'amitié acceptée avec `userId`. L'accès réciproque aux pistes `friends` et aux partages cesse aussitôt, et les partages nominatifs entre les deux utilisateurs sont retirés de leurs pistes (dans les deux sens) : redevenir amis ne les rétablit pas.
- **Réponse** : `204`.
- **Erreurs** : `404` si nous ne sommes pas amis ou si l'identifiant est mal formé ; `401`.

## Fil d'activité des amis (TP4)

Trois actions produisent un événement :

| Type | Déclencheur | Qui le voit |
|---|---|---|
| `track_published` | une piste quitte l'état privé : création en `friends` ou `public`, ou `PATCH` de `private` vers `friends`/`public` | les amis de l'auteur qui peuvent lire la piste |
| `track_shared` | `PUT /tracks/:id/shares` ajoute des destinataires (renvoyer la même liste ne crée rien) | les nouveaux destinataires |
| `friend_accepted` | acceptation d'une invitation, ou invitation croisée | l'expéditeur de l'invitation |

Passer de `friends` à `public` n'est pas une nouvelle publication, car les amis voyaient déjà la piste.

Supprimer une piste supprime ses événements. Les autres conditions sont vérifiées **à chaque lecture**, qui n'affiche un événement que si :

- son auteur est toujours mon ami ;
- la piste concernée existe toujours ;
- je peux la lire (mêmes règles que `GET /tracks/:id/audio`).

```json
// ActivityFeed (GET /activity)
{
  "items": [
    {
      "id": "6721…",
      "type": "track_shared",
      "createdAt": "2026-10-28T14:39:37.255Z",
      "actor": { "id": "671f…", "name": "Carol" },
      "track": Track
    }
  ],
  "nextBefore": "2026-10-28T14:39:36.088Z"
}
```

- `track` est présent pour `track_published` et `track_shared`, au format `Track` habituel, avec `ownerName` et `sharedWithMe`.
- `nextBefore` vaut `null` à la fin du fil.

### `GET /activity`

- **Auth** : JWT obligatoire.
- **Paramètres** :
  - `limit` (1 à 30, défaut 10) ;
  - `before` (date ISO, optionnel) : ne renvoie que les événements strictement plus anciens. On y met la valeur `nextBefore` de la réponse précédente.
- **Réponse** : `200 ActivityFeed`, du plus récent au plus ancien. Sans ami, `{ "items": [], "nextBefore": null }`.
  - Le filtrage final peut renvoyer moins de `limit` éléments alors que `nextBefore` n'est pas `null` : c'est le cas si un événement lu n'est plus visible (piste repassée en privé, partage arrêté).
  - Le client continue tant que `nextBefore` n'est pas `null`.
- **Erreurs** : `400` si `limit` ou `before` est invalide ; `401`.
