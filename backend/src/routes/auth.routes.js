import { Router } from "express";
import { User } from "../models/User.js";
import { token } from "../middlewares/auth.js";

/** Routes publiques d'inscription et de connexion (préfixe /api/auth). */
export const authRouter = Router();

/** Requête POST pour "insertion" de donnée.
 * Inscrit un utilisateur et renvoie un token avec ses données publiques.
 * @param {Object} req - La requête HTTP.
 * @param {Object} res - La réponse HTTP.
 * @param {Function} next - La fonction de middleware suivante.
 */
authRouter.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    console.log(`[auth] Tentative d'inscription pour ${email || "email absent"}`);

    if (!name || !email || !password || password.length < 8) {
      console.warn("[auth] Inscription refusée : données invalides ou incomplètes");
      return res.status(400).json({
        message: "Nom, email et mot de passe de 8 caractères requis",
      });
    }

    // Vérifie si l'email est déjà utilisé avant de créer un nouvel utilisateur.
    if (await User.exists({ email: String(email).toLowerCase() })) {
      console.warn(`[auth] Email déjà utilisé : ${email}`);
      return res.status(409).json({ message: "Email déjà utilisé" });
    }

    // Crée l'utilisateur et le stocke dans MongoDB. Le mot de passe est haché
    // par le hook pre('validate') défini dans le schéma Mongoose.
    const user = await User.create({ name, email, password });
    console.log(`[auth] Utilisateur créé : ${user.id}`);
    res.status(201).json({ token: token(user), user: user.toPublic() });
  } catch (error) {
    console.error("[auth] Erreur pendant l'inscription", error);
    next(error);
  }
});

/** Vérifie les identifiants et ouvre une session JWT. Les identifiants sont envoyés dans le corps de la
 * requête par un HTTP POST. */
authRouter.post("/login", async (req, res, next) => {
  try {
    // req.body est déjà un objet JavaScript grâce au middleware express.json() placé dans app.js.
    // il contient les champs email et password envoyés par le frontend Angular.
    const email = String(req.body?.email || "").toLowerCase();
    console.log(`[auth] Tentative de connexion pour ${email || "email absent"}`);

    // Sélectionne le mot de passe haché pour vérifier les identifiants.
    // User est un modèle Mongoose qui correspond au schéma défini dans models/User.js.
    // on envoie les requête à MongoDB via cet objet. Le mot de passe haché est stocké dans
    // passwordHash, mais il n'est pas renvoyé par défaut dans les requêtes pour
    // des raisons de sécurité.
    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user || !(await user.verifyPassword(req.body?.password || ""))) {
      console.warn(`[auth] Identifiants incorrects pour ${email}`);
      return res.status(401).json({ message: "Identifiants incorrects" });
    }

    console.log(`[auth] Connexion réussie : ${user.id}`);
    res.json({ token: token(user), user: user.toPublic() });
  } catch (error) {
    console.error("[auth] Erreur pendant la connexion", error);
    next(error);
  }
});
