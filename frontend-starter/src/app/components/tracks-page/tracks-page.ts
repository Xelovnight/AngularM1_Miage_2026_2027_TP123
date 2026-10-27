import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';
import { SnackbarService } from '../../shared/services/snackbar.service';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 Mo
// Même liste que le fileFilter Multer du backend (backend/src/app.js) :
// le navigateur envoie `file.type` comme Content-Type de la partie multipart.
const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
]);

@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent implements OnDestroy {
  private readonly service = inject(TrackService);
  private readonly snackbar = inject(SnackbarService);

  // État réactif de la bibliothèque (Mission 2)
  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');

  // État réactif de suppression (Mission 5)
  readonly deletingId = signal<string | null>(null);

  // État réactif de l'upload et de sa progression (Missions 3 & 6)
  readonly uploadState = signal<'idle' | 'uploading' | 'success' | 'error'>('idle');
  readonly uploadProgress = signal<number | null>(null);
  readonly uploading = signal(false);
  readonly uploadSuccess = signal('');
  readonly uploadError = signal('');
  readonly fileError = signal('');

  // État réactif du lecteur audio (Mission 3)
  readonly currentTrack = signal<Track | null>(null);
  readonly audioLoading = signal(false);
  readonly audioError = signal('');
  readonly audioUrl = signal('');

  // Formulaire d'envoi
  readonly title = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  file?: File;

  constructor() {
    this.load();
  }

  ngOnDestroy(): void {
    // Révocation de l'ObjectURL pour éviter les fuites de mémoire (Memory Leak)
    const currentUrl = this.audioUrl();
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      console.debug('[TracksPage] ObjectURL révoquée à la destruction du composant');
    }
  }

  /** Sélection et validation préventive du fichier côté frontend */
  choose(event: Event): void {
    this.fileError.set('');
    this.uploadError.set('');
    this.uploadSuccess.set('');

    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0];

    if (!selected) {
      this.file = undefined;
      return;
    }

    // 1. Contrôle du type MIME, identique à celui du backend
    if (!ALLOWED_MIME_TYPES.has(selected.type)) {
      this.fileError.set(
        `Format non supporté (${selected.type || 'type inconnu'}). Formats acceptés : MP3, WAV, OGG, M4A.`,
      );
      this.file = undefined;
      input.value = '';
      return;
    }

    // 2. Contrôle de la taille maximale (25 Mo)
    if (selected.size > MAX_FILE_SIZE) {
      this.fileError.set(
        `Fichier trop volumineux (${(selected.size / (1024 * 1024)).toFixed(1)} Mo). Limite : 25 Mo.`,
      );
      this.file = undefined;
      input.value = '';
      return;
    }

    this.file = selected;

    // Pré-remplir le titre si l'utilisateur ne l'a pas encore saisi
    if (!this.title.value.trim()) {
      const cleanName = selected.name.replace(/\.[^/.]+$/, '');
      this.title.setValue(cleanName);
    }

    console.debug('[TracksPage] Fichier sélectionné valide :', selected.name, selected.size);
  }

  /** Chargement paginé depuis le backend */
  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.service.list(this.page(), 5).subscribe({
      next: (response) => {
        console.debug('[TracksPage] Pistes chargées :', response.items.length);
        this.tracks.set(response.items);
        this.pages.set(Math.max(1, response.pages));
        this.total.set(response.total);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        console.error('[TracksPage] Chargement impossible', err);
        this.error.set(err.error?.message ?? 'Impossible de charger la bibliothèque.');
        this.loading.set(false);
      },
    });
  }

  /** Navigation de page */
  go(targetPage: number): void {
    if (targetPage < 1 || targetPage > this.pages() || targetPage === this.page()) {
      return;
    }
    this.page.set(targetPage);
    this.load();
  }

  /** Upload multipart avec FormData et suivi de progression en temps réel (Mission 6) */
  upload(fileInput?: HTMLInputElement): void {
    if (!this.file || this.uploadState() === 'uploading') return;

    const trackTitle = this.title.value.trim() || this.file.name;
    this.uploadState.set('uploading');
    this.uploading.set(true);
    this.uploadProgress.set(0);
    this.uploadError.set('');
    this.uploadSuccess.set('');
    this.title.disable();

    this.service.upload(this.file, trackTitle).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          const percent = Math.round((100 * event.loaded) / event.total);
          this.uploadProgress.set(percent);
          console.debug('[TracksPage] Progression upload :', percent, '%');
        } else if (event.type === HttpEventType.Response) {
          const track = event.body!;
          console.debug('[TracksPage] Piste envoyée avec succès :', track.id);
          this.uploadProgress.set(100);
          this.uploadState.set('success');
          this.uploading.set(false);
          this.title.enable();

          const message = `Morceau « ${track.title} » importé avec succès !`;
          this.uploadSuccess.set(message);
          this.snackbar.showSuccess(message);

          this.title.reset('');
          this.file = undefined;
          if (fileInput) fileInput.value = '';

          // Revenir en page 1 et recharger la bibliothèque pour afficher le nouveau morceau
          this.page.set(1);
          this.load();
        }
      },
      error: (err: HttpErrorResponse | { status?: number; error?: { message?: string } }) => {
        console.error('[TracksPage] Envoi impossible', err);
        this.uploadState.set('error');
        this.uploading.set(false);
        this.uploadProgress.set(null);
        this.title.enable();

        const errorMsg = (err as any)?.error?.message ?? "Erreur lors de l'envoi du fichier.";
        this.uploadError.set(errorMsg);
        this.snackbar.showError(errorMsg);
      },
    });
  }

  /** Lecture audio sécurisée via Blob et ObjectURL */
  play(track: Track): void {
    this.audioError.set('');
    this.audioLoading.set(true);
    this.currentTrack.set(track);

    this.service.audio(track.id).subscribe({
      next: (blob) => {
        console.debug('[TracksPage] Audio reçu (Blob) :', blob.size, 'octets');

        // Révoquer l'ancienne URL avant d'en créer une nouvelle
        const previousUrl = this.audioUrl();
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }

        const newUrl = URL.createObjectURL(blob);
        this.audioUrl.set(newUrl);
        this.audioLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        console.error('[TracksPage] Lecture impossible', err.status);
        this.audioLoading.set(false);
        void this.describeAudioError(err).then((message) => this.audioError.set(message));
      },
    });
  }

  /** Erreur du lecteur <audio> lui-même (fichier corrompu, format non décodable…) */
  onAudioError(): void {
    this.audioError.set(
      'Le navigateur ne parvient pas à décoder ce fichier audio (fichier corrompu ou format non pris en charge).',
    );
  }

  /**
   * Avec responseType: 'blob', le corps d'erreur JSON du backend arrive lui aussi sous forme
   * de Blob : il faut le lire pour récupérer `message`, sinon on retombe sur un message selon le statut.
   */
  private async describeAudioError(err: HttpErrorResponse): Promise<string> {
    if (err.error instanceof Blob) {
      try {
        const body = JSON.parse(await err.error.text()) as { message?: string };
        if (body.message && err.status !== 404) return body.message;
      } catch {
        // Corps non JSON : on utilise le message par défaut ci-dessous
      }
    }
    switch (err.status) {
      case 0:
        return 'Serveur injoignable : vérifiez que le backend est lancé.';
      case 401:
        return 'Session expirée : reconnectez-vous pour écouter ce morceau.';
      case 404:
        return "Ce morceau n'existe plus ou ne vous appartient pas.";
      default:
        return 'Impossible de lire ce morceau.';
    }
  }

  /** Suppression avec confirmation utilisateur, protection anti double-clic et SnackBar (Mission 5) */
  deleteTrack(track: Track): void {
    if (this.deletingId()) return; // Empêcher les clics multiples simultanés

    const confirmed = window.confirm(`Voulez-vous vraiment supprimer « ${track.title} » ?`);
    if (!confirmed) return;

    this.deletingId.set(track.id);

    this.service.delete(track.id).subscribe({
      next: () => {
        console.debug('[TracksPage] Piste supprimée :', track.id);
        this.deletingId.set(null);
        this.snackbar.showSuccess(`Morceau « ${track.title} » supprimé avec succès.`);

        // Si la piste supprimée était en cours de lecture, couper la lecture
        if (this.currentTrack()?.id === track.id) {
          const previousUrl = this.audioUrl();
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          this.audioUrl.set('');
          this.currentTrack.set(null);
        }

        // Si la seule piste d'une page > 1 est supprimée, revenir à la page précédente
        if (this.tracks().length === 1 && this.page() > 1) {
          this.page.set(this.page() - 1);
        }

        // Rafraîchir la bibliothèque depuis le backend
        this.load();
      },
      error: (err: HttpErrorResponse | { status?: number; error?: { message?: string } }) => {
        console.error('[TracksPage] Suppression impossible', err);
        this.deletingId.set(null);

        // Le backend filtre par propriétaire (findOneAndDelete({ _id, ownerId })) : une piste
        // supprimée entre-temps et une piste d'un autre utilisateur renvoient toutes deux 404.
        if ((err as any)?.status === 404) {
          this.snackbar.showError(
            "Cette piste n'existe plus (déjà supprimée, par exemple dans un autre onglet) ou ne vous appartient pas.",
          );
          // Piste obsolète à l'écran : recharger la bibliothèque pour synchroniser l'affichage
          this.load();
        } else {
          this.snackbar.showError((err as any)?.error?.message ?? 'Erreur lors de la suppression.');
        }
      },
    });
  }

  /** Formatage lisible de la taille en Ko ou Mo */
  formatSize(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 Ko';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) {
      return `${mb.toFixed(1)} Mo`;
    }
    const kb = Math.round(bytes / 1024);
    return `${kb} Ko`;
  }

  /** Formatage lisible de la date */
  formatDate(dateStr: string): string {
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
  formatFormat(mimeType: string, filename: string): string {
    if (mimeType.includes('mpeg') || filename.endsWith('.mp3')) return 'MP3';
    if (mimeType.includes('wav')) return 'WAV';
    if (mimeType.includes('ogg')) return 'OGG';
    if (mimeType.includes('m4a') || mimeType.includes('mp4')) return 'M4A';
    return mimeType.split('/')[1]?.toUpperCase() ?? 'AUDIO';
  }
}
