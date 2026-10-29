import {
  SearchScope,
  TrackMetadata,
  TrackSearchCriteria,
  Visibility,
  VISIBILITY_OPTIONS,
} from '../models/track.model';

/** Formatage lisible de la taille en Ko ou Mo */
export function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 Ko';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1)} Mo`;
  }
  const kb = Math.round(bytes / 1024);
  return `${kb} Ko`;
}

/** Formatage lisible de la date */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr.slice(0, 10);
  }
}

/** Extraction propre du format audio */
export function formatFormat(mimeType: string, filename: string): string {
  if (mimeType.includes('mpeg') || filename.endsWith('.mp3')) return 'MP3';
  if (mimeType.includes('wav')) return 'WAV';
  if (mimeType.includes('ogg')) return 'OGG';
  if (mimeType.includes('m4a') || mimeType.includes('mp4')) return 'M4A';
  return mimeType.split('/')[1]?.toUpperCase() ?? 'AUDIO';
}

/** Libellé et icône d'un niveau de visibilité ("private" si absent). */
export function visibilityOption(visibility: Visibility | undefined) {
  return VISIBILITY_OPTIONS.find((o) => o.value === visibility) ?? VISIBILITY_OPTIONS[0];
}

/** "Blues, lent , ,blues" → ["blues", "lent"] (même règle que parseTags côté backend). */
export function parseTags(input: string): string[] {
  const tags = input
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
  return [...new Set(tags)];
}

/** Valeurs brutes d'un formulaire de métadonnées (inputs texte et select). */
export interface TrackMetadataFormValue {
  title?: string;
  visibility?: Visibility;
  bpm?: number | string | null;
  key?: string | null;
  genre?: string | null;
  tags?: string;
}

/**
 * Convertit les valeurs du formulaire en métadonnées pour l'API :
 * champs vides → null (effacement), tags en tableau, BPM en nombre.
 */
export function toTrackMetadata(form: TrackMetadataFormValue): TrackMetadata {
  const metadata: TrackMetadata = {};
  if (form.title !== undefined) metadata.title = form.title.trim();
  if (form.visibility !== undefined) metadata.visibility = form.visibility;
  if (form.bpm !== undefined) {
    metadata.bpm = form.bpm === null || form.bpm === '' ? null : Number(form.bpm);
  }
  if (form.key !== undefined) metadata.key = form.key || null;
  if (form.genre !== undefined) metadata.genre = form.genre?.trim() || null;
  if (form.tags !== undefined) metadata.tags = parseTags(form.tags);
  return metadata;
}

/** Valeurs brutes du formulaire de recherche de l'Explorer. */
export interface TrackSearchFormValue {
  q: string;
  scope: SearchScope;
  genre: string;
  key: string | null;
  bpmMin: number | string | null;
  bpmMax: number | string | null;
}

/**
 * Convertit le formulaire de recherche en critères pour l'API :
 * textes nettoyés, champs vides retirés, BPM en nombres.
 * Le périmètre "all" (valeur par défaut du backend) n'est pas envoyé.
 */
export function toSearchCriteria(form: TrackSearchFormValue): TrackSearchCriteria {
  const criteria: TrackSearchCriteria = {};
  const q = form.q.trim();
  if (q) criteria.q = q;
  if (form.scope !== 'all') criteria.scope = form.scope;
  const genre = form.genre.trim();
  if (genre) criteria.genre = genre;
  if (form.key) criteria.key = form.key;
  if (form.bpmMin !== null && form.bpmMin !== '') criteria.bpmMin = Number(form.bpmMin);
  if (form.bpmMax !== null && form.bpmMax !== '') criteria.bpmMax = Number(form.bpmMax);
  return criteria;
}

/** Vrai si au moins un critère est renseigné (sinon : pistes récentes). */
export function hasSearchCriteria(criteria: TrackSearchCriteria): boolean {
  return Object.keys(criteria).length > 0;
}

/** Compare deux jeux de critères (évite de relancer une recherche identique). */
export function sameSearchCriteria(a: TrackSearchCriteria, b: TrackSearchCriteria): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof TrackSearchCriteria>;
  return [...keys].every((key) => a[key] === b[key]);
}
