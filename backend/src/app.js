import express from "express";
import cors from "cors";
import multer from "multer";
import { UNSUPPORTED_FORMAT_MESSAGE } from "./middlewares/upload.js";
import { authRouter } from "./routes/auth.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { tracksRouter } from "./routes/tracks.routes.js";
import { friendsRouter } from "./routes/friends.routes.js";
import { activityRouter } from "./routes/activity.routes.js";

/**
 * Construit l'application Express sans ouvrir de port.
 * Cette séparation permet au serveur réel et aux tests de créer la même
 * application. Le port est ouvert uniquement dans server.js.
 *
 * Les routes sont réparties par domaine dans src/routes/ ; les middlewares
 * partagés (JWT, Multer) sont dans src/middlewares/, les règles métier
 * pures dans src/rules/ et les requêtes réutilisées dans src/services/.
 */
export function createApp() {
  const app = express();

  // Journaliser la fin de chaque requête permet de suivre méthode, URL,
  // statut et durée sans exposer les corps contenant des mots de passe.
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      console.log(
        `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt} ms)`,
      );
    });
    next();
  });

  // CORS est nécessaire pour que le frontend Angular puisse appeler l'API.
  // C'est-à-dire que le navigateur autorise les requêtes cross-origin depuis localhost:4200.
  // Dans un vrai projet, il est recommandé de limiter les origines autorisées.
  app.use(cors());

  // Express ne gère pas nativement le JSON : ce middleware transforme le corps JSON en objet JavaScript
  // accessible via req.body.
  // Il est placé avant les routes pour que toutes les requêtes JSON soient traitées.
  app.use(express.json());

  /** Endpoint public utilisé pour vérifier que l'API répond. */
  app.get("/api/health", (_req, res) => {
    console.log("[health] Vérification de l'API");
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/tracks", tracksRouter);
  app.use("/api/friends", friendsRouter);
  app.use("/api/activity", activityRouter);

  /** Gestionnaire central des erreurs connues de l'application. */
  app.use((error, _req, res, next) => {
    console.error("[error] Erreur reçue par le gestionnaire central", error);

    if (
      error instanceof multer.MulterError ||
      error?.message === UNSUPPORTED_FORMAT_MESSAGE
    ) {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "CastError") {
      return res.status(404).json({ message: "Ressource inconnue" });
    }
    // Index unique violé (ex. deux invitations croisées au même instant).
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Cette relation existe déjà" });
    }

    next(error);
  });

  return app;
}
