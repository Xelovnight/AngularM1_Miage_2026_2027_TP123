import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 Mo
const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
]);

@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent implements OnDestroy {
  private readonly service = inject(TrackService);

  // État réactif de la bibliothèque (Mission 2)
  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');

  // État réactif de l'upload (Mission 3)
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

    // 1. Contrôle du type audio
    const isExtensionValid = /\.(mp3|wav|ogg|m4a)$/i.test(selected.name);
    const isMimeValid = ALLOWED_MIME_TYPES.has(selected.type) || selected.type.startsWith('audio/');
    if (!isMimeValid && !isExtensionValid) {
      this.fileError.set('Format non supporté. Formats acceptés : MP3, WAV, OGG, M4A.');
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

  /** Upload multipart avec FormData */
  upload(fileInput?: HTMLInputElement): void {
    if (!this.file || this.uploading()) return;

    const trackTitle = this.title.value.trim() || this.file.name;
    this.uploading.set(true);
    this.uploadError.set('');
    this.uploadSuccess.set('');

    this.service.upload(this.file, trackTitle).subscribe({
      next: (track) => {
        console.debug('[TracksPage] Piste envoyée :', track.id);
        this.uploadSuccess.set(`Morceau « ${track.title} » importé avec succès !`);
        this.uploading.set(false);
        this.title.reset('');
        this.file = undefined;
        if (fileInput) fileInput.value = '';

        // Revenir en page 1 et recharger la liste pour voir le nouveau morceau
        this.page.set(1);
        this.load();
      },
      error: (err: { error?: { message?: string } }) => {
        console.error('[TracksPage] Envoi impossible', err);
        this.uploadError.set(err.error?.message ?? "Erreur lors de l'envoi du fichier.");
        this.uploading.set(false);
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
      error: (err: { error?: { message?: string } }) => {
        console.error('[TracksPage] Lecture impossible', err);
        this.audioError.set(err.error?.message ?? 'Impossible de lire ce morceau.');
        this.audioLoading.set(false);
      },
    });
  }

  /** Suppression avec confirmation utilisateur */
  deleteTrack(track: Track): void {
    const confirmed = window.confirm(`Voulez-vous vraiment supprimer « ${track.title} » ?`);
    if (!confirmed) return;

    this.service.delete(track.id).subscribe({
      next: () => {
        console.debug('[TracksPage] Piste supprimée :', track.id);
        // Si la piste supprimée était en cours de lecture, couper la lecture
        if (this.currentTrack()?.id === track.id) {
          const previousUrl = this.audioUrl();
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          this.audioUrl.set('');
          this.currentTrack.set(null);
        }
        // Rafraîchir la page actuelle
        this.load();
      },
      error: (err: { error?: { message?: string } }) => {
        console.error('[TracksPage] Suppression impossible', err);
        alert(err.error?.message ?? 'Erreur lors de la suppression.');
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
