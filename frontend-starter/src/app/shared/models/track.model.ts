/** Visibility levels, from most restricted to most open. */
export type Visibility = 'private' | 'friends' | 'public';

/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
  ownerId?: string;
  /** Only present on lists that include the owner (e.g. public tracks). */
  ownerName?: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  visibility?: Visibility;
  bpm?: number | null;
  key?: string | null;
  genre?: string | null;
  tags?: string[];
  /** Owner only: ids of the friends this track is shared with. */
  sharedWith?: string[];
  /** Other users only: true if the owner shared this track with me by name. */
  sharedWithMe?: boolean;
}

/** Editable fields sent on upload (multipart) or PATCH /api/tracks/:id. */
export interface TrackMetadata {
  title?: string;
  visibility?: Visibility;
  bpm?: number | null;
  key?: string | null;
  genre?: string | null;
  tags?: string[];
}

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: string }[] = [
  { value: 'private', label: 'Privé', icon: '🔒' },
  { value: 'friends', label: 'Amis', icon: '👥' },
  { value: 'public', label: 'Public', icon: '🌐' },
];

// Même liste que MUSICAL_KEYS dans backend/src/rules/tracks.js :
// 12 notes en majeur puis en mineur (suffixe "m").
const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const MUSICAL_KEYS = [...NOTES, ...NOTES.map((note) => `${note}m`)];

export const BPM_MIN = 20;
export const BPM_MAX = 300;

/** Search scope: everything I can listen to, public tracks only, or my tracks. */
export type SearchScope = 'all' | 'public' | 'mine';

/** Criteria sent to GET /api/tracks/search (empty fields are omitted). */
export interface TrackSearchCriteria {
  q?: string;
  scope?: SearchScope;
  genre?: string;
  key?: string;
  bpmMin?: number;
  bpmMax?: number;
}

export const SEARCH_SCOPE_OPTIONS: { value: SearchScope; label: string }[] = [
  { value: 'all', label: 'Tout ce que je peux écouter' },
  { value: 'public', label: 'Pistes publiques' },
  { value: 'mine', label: 'Mes pistes' },
];
