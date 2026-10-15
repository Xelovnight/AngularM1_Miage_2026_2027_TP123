/**
 * États possibles d'un upload (Mission 6).
 * Un upload avec progression émet plusieurs événements avant la réponse finale :
 * l'état doit donc évoluer dans le temps au lieu de passer directement de
 * « en cours » à « terminé ».
 */
export type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; percent: number | null }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };
