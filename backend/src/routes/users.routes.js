import { Router } from "express";
import { User } from "../models/User.js";
import { auth } from "../middlewares/auth.js";
import { parseUserSearch } from "../rules/friends.js";
import { containsRegex } from "../rules/tracks.js";

/** Routes du profil de l'utilisateur connecté (préfixe /api/users). */
export const usersRouter = Router();

/**
 * Recherche d'utilisateurs à inviter : nom contenant `q`, ou email exact.
 * Seuls `id` et `name` sont renvoyés : la recherche ne permet pas de lire
 * l'email d'un autre utilisateur. L'utilisateur connecté est exclu.
 */
usersRouter.get("/search", auth, async (req, res, next) => {
  try {
    const { q, error } = parseUserSearch(req.query.q);
    if (error) {
      console.warn(`[user] Recherche refusée : ${error}`);
      return res.status(400).json({ message: error });
    }

    const users = await User.find({
      _id: { $ne: req.auth.sub },
      $or: [{ name: containsRegex(q) }, { email: q.toLowerCase() }],
    })
      .select("name")
      .sort({ name: 1 })
      .limit(10)
      .lean();

    console.log(`[user] Recherche d'utilisateurs : ${users.length} résultat(s)`);
    res.json(users.map((user) => ({ id: String(user._id), name: user.name })));
  } catch (error) {
    console.error("[user] Erreur de recherche d'utilisateurs", error);
    next(error);
  }
});

/** Retourne le profil public de l'utilisateur identifié par le JWT.
 * Les paramètres sont :
 * @param auth - Le middleware qui vérifie le JWT et ajoute req.auth.
 * @param {Object} req - La requête HTTP.
 * @param {Object} res - La réponse HTTP.
 * @param {Function} next - La fonction de middleware suivante.
 */
usersRouter.get("/me", auth, async (req, res, next) => {
  try {
    // req.auth.sub contient l'identifiant MongoDB de l'utilisateur
    // extrait du JWT par le middleware auth. ici req.auth est un objet ajouté par le middleware
    // auth à la requête, et sub est la propriété qui contient l'identifiant de l'utilisateur.
    const user = await User.findById(req.auth.sub);
    if (!user) {
      console.warn(`[user] Profil introuvable : ${req.auth.sub}`);
      return res.status(404).json({ message: "Utilisateur inconnu" });
    }

    console.log(`[user] Profil envoyé : ${user.id}`);
    res.json(user.toPublic());
  } catch (error) {
    console.error("[user] Erreur de lecture du profil", error);
    next(error);
  }
});

/** Modifie uniquement le nom de l'utilisateur connecté. */
usersRouter.put("/me", auth, async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.auth.sub,
      { $set: { name: req.body?.name } },
      { new: true, runValidators: true },
    );

    if (!user) {
      console.warn(`[user] Mise à jour impossible : ${req.auth.sub}`);
      return res.status(404).json({ message: "Utilisateur inconnu" });
    }

    console.log(`[user] Nom mis à jour : ${user.id}`);
    res.json(user.toPublic());
  } catch (error) {
    console.error("[user] Erreur de mise à jour du profil", error);
    next(error);
  }
});
