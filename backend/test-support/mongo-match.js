/**
 * Mini-évaluateur des opérateurs MongoDB utilisés par nos filtres
 * ($and, $or, $in, $gte, $lte, $lt, égalité, regex, champs tableaux).
 * Il permet de vérifier qu'un filtre sélectionne les bons documents
 * sans lancer MongoDB. Placé hors de test/ pour que node --test ne le
 * compte pas comme un fichier de tests.
 */
export function matches(doc, filter) {
  return Object.entries(filter).every(([field, condition]) => {
    if (field === "$and") return condition.every((sub) => matches(doc, sub));
    if (field === "$or") return condition.some((sub) => matches(doc, sub));

    const value = doc[field];
    const values = Array.isArray(value) ? value : [value];
    const test = (v) => {
      if (condition instanceof RegExp) return v != null && condition.test(String(v));
      if (condition && typeof condition === "object") {
        if ("$in" in condition && !condition.$in.some((c) => String(c) === String(v))) return false;
        if ("$gte" in condition && !(v != null && v >= condition.$gte)) return false;
        if ("$lte" in condition && !(v != null && v <= condition.$lte)) return false;
        if ("$lt" in condition && !(v != null && v < condition.$lt)) return false;
        return true;
      }
      return String(v) === String(condition);
    };
    return values.some(test);
  });
}
