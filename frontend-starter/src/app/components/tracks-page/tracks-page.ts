import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import {
  BPM_MAX,
  BPM_MIN,
  MUSICAL_KEYS,
  Track,
  TrackMetadata,
  Visibility,
  VISIBILITY_OPTIONS,
} from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { FriendService } from '../../shared/services/friend.service';
import { PublicUser } from '../../shared/models/friend.model';
import { ShareDialogComponent } from '../../shared/components/share-dialog/share-dialog.component';
import { TrackCardComponent } from '../../shared/components/track-card/track-card.component';
import { AudioPlayerComponent } from '../../shared/components/audio-player/audio-player.component';
import { toTrackMetadata } from '../../shared/utils/track-format';

/** Erreur HTTP telle que l'utilise la page : statut et message du backend. */
type ApiError = Pick<HttpErrorResponse, 'status'> & { error?: { message?: string } | null };

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 Mo
// Même liste que le fileFilter Multer du backend (backend/src/middlewares/upload.js) :
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
  imports: [ReactiveFormsModule, TrackCardComponent, AudioPlayerComponent, ShareDialogComponent],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent {
  private readonly service = inject(TrackService);
  private readonly snackbar = inject(SnackbarService);
  private readonly friendService = inject(FriendService);

  // État réactif de la bibliothèque (Mission 2)
  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');

  // État réactif de suppression (Mission 5)
  readonly deletingId = signal<string | null>(null);

  // État réactif de modification des métadonnées (TP4)
  readonly editingId = signal<string | null>(null);
  readonly savingId = signal<string | null>(null);

  // Partage nominatif (TP4) : piste dont la fenêtre de partage est ouverte
  readonly sharingTrack = signal<Track | null>(null);
  /** Amis confirmés, triés par nom par le backend. */
  readonly friends = computed(() => this.friendService.overview().friends.map((f) => f.user));
  private readonly friendNames = computed(
    () => new Map(this.friends().map((friend) => [friend.id, friend.name])),
  );

  // État réactif de l'upload et de sa progression (Missions 3 & 6)
  readonly uploadState = signal<'idle' | 'uploading' | 'success' | 'error'>('idle');
  readonly uploadProgress = signal<number | null>(null);
  readonly uploading = signal(false);
  readonly uploadSuccess = signal('');
  readonly uploadError = signal('');
  readonly fileError = signal('');

  // Piste affichée dans le lecteur audio partagé
  readonly currentTrack = signal<Track | null>(null);

  // Formulaire d'envoi
  readonly title = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly metadata = new FormGroup({
    visibility: new FormControl<Visibility>('private', { nonNullable: true }),
    bpm: new FormControl<number | null>(null, [
      Validators.min(BPM_MIN),
      Validators.max(BPM_MAX),
    ]),
    key: new FormControl<string | null>(null),
    genre: new FormControl('', { nonNullable: true }),
    tags: new FormControl('', { nonNullable: true }),
  });
  file?: File;

  readonly visibilityOptions = VISIBILITY_OPTIONS;
  readonly musicalKeys = MUSICAL_KEYS;

  constructor() {
    this.load();
    // Noms des amis pour la fenêtre de partage et la ligne « Partagée avec »
    this.friendService.refresh().subscribe({
      error: (err) => console.error('[TracksPage] Amis indisponibles', err),
    });
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
    if (!this.file || this.uploadState() === 'uploading' || this.metadata.invalid) return;

    const trackTitle = this.title.value.trim() || this.file.name;
    const metadata: TrackMetadata = {
      ...toTrackMetadata(this.metadata.getRawValue()),
      title: trackTitle,
    };
    this.uploadState.set('uploading');
    this.uploading.set(true);
    this.uploadProgress.set(0);
    this.uploadError.set('');
    this.uploadSuccess.set('');
    this.title.disable();
    this.metadata.disable();

    this.service.upload(this.file, metadata).subscribe({
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
          this.metadata.enable();

          const message = `Morceau « ${track.title} » importé avec succès !`;
          this.uploadSuccess.set(message);
          this.snackbar.showSuccess(message);

          this.title.reset('');
          this.metadata.reset();
          this.file = undefined;
          if (fileInput) fileInput.value = '';

          // Revenir en page 1 et recharger la bibliothèque pour afficher le nouveau morceau
          this.page.set(1);
          this.load();
        }
      },
      error: (err: ApiError) => {
        console.error('[TracksPage] Envoi impossible', err);
        this.uploadState.set('error');
        this.uploading.set(false);
        this.uploadProgress.set(null);
        this.title.enable();
        this.metadata.enable();

        const errorMsg = err.error?.message ?? "Erreur lors de l'envoi du fichier.";
        this.uploadError.set(errorMsg);
        this.snackbar.showError(errorMsg);
      },
    });
  }

  /** Affiche la piste dans le lecteur partagé, qui charge lui-même le flux audio */
  play(track: Track): void {
    this.currentTrack.set(track);
  }

  /**
   * Modifie la visibilité ou les métadonnées d'une piste (PATCH).
   * La piste renvoyée par le backend remplace celle affichée.
   */
  updateTrack(track: Track, changes: TrackMetadata): void {
    if (this.savingId()) return;
    this.savingId.set(track.id);

    this.service.update(track.id, changes).subscribe({
      next: (updated) => {
        console.debug('[TracksPage] Piste modifiée :', updated.id, Object.keys(changes));
        this.savingId.set(null);
        this.editingId.set(null);
        this.tracks.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
        if (this.currentTrack()?.id === updated.id) this.currentTrack.set(updated);

        this.snackbar.showSuccess(
          changes.visibility && Object.keys(changes).length === 1
            ? `« ${updated.title} » est maintenant ${this.visibilityLabel(updated.visibility)}.`
            : `Morceau « ${updated.title} » mis à jour.`,
        );
      },
      error: (err: ApiError) => {
        console.error('[TracksPage] Modification impossible', err);
        this.savingId.set(null);

        if (err.status === 404) {
          this.snackbar.showError("Cette piste n'existe plus ou ne vous appartient pas.");
          this.editingId.set(null);
          this.load();
        } else {
          this.snackbar.showError(err.error?.message ?? 'Erreur lors de la modification.');
        }
      },
    });
  }

  /**
   * Destinataires d'une piste avec leur nom. Un identifiant qui n'est plus
   * un ami (amitié retirée dans un autre onglet) est affiché comme tel.
   */
  shareTargetsOf(track: Track): PublicUser[] {
    const names = this.friendNames();
    return (track.sharedWith ?? []).map((id) => ({ id, name: names.get(id) ?? 'Ancien ami' }));
  }

  /** Enregistre la liste complète des destinataires de la piste ouverte. */
  saveShares(userIds: string[]): void {
    const track = this.sharingTrack();
    if (!track) return;
    this.applyShareChange(track, () => this.service.setShares(track.id, userIds), (updated) => {
      this.sharingTrack.set(null);
      const count = updated.sharedWith?.length ?? 0;
      return count
        ? `« ${updated.title} » est partagée avec ${count} ami${count > 1 ? 's' : ''}.`
        : `« ${updated.title} » n'est plus partagée.`;
    });
  }

  /** Arrête le partage d'une piste avec un seul ami (bouton ✕ de la carte). */
  unshare(track: Track, friend: PublicUser): void {
    this.applyShareChange(
      track,
      () => this.service.unshare(track.id, friend.id),
      (updated) => `« ${updated.title} » n'est plus partagée avec ${friend.name}.`,
    );
  }

  private applyShareChange(
    track: Track,
    request: () => ReturnType<TrackService['setShares']>,
    successMessage: (updated: Track) => string,
  ): void {
    if (this.savingId()) return;
    this.savingId.set(track.id);

    request().subscribe({
      next: (updated) => {
        console.debug('[TracksPage] Partages modifiés :', updated.id, updated.sharedWith);
        this.savingId.set(null);
        this.tracks.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
        this.snackbar.showSuccess(successMessage(updated));
      },
      error: (err: ApiError) => {
        console.error('[TracksPage] Partage impossible', err);
        this.savingId.set(null);

        if (err.status === 404) {
          this.snackbar.showError("Cette piste ou ce partage n'existe plus.");
          this.sharingTrack.set(null);
          this.load();
        } else {
          this.snackbar.showError(err.error?.message ?? 'Erreur lors du partage.');
        }
      },
    });
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

        // Si la piste supprimée était en cours de lecture, fermer le lecteur
        // (sa destruction révoque l'ObjectURL)
        if (this.currentTrack()?.id === track.id) {
          this.currentTrack.set(null);
        }

        // Si la seule piste d'une page > 1 est supprimée, revenir à la page précédente
        if (this.tracks().length === 1 && this.page() > 1) {
          this.page.set(this.page() - 1);
        }

        // Rafraîchir la bibliothèque depuis le backend
        this.load();
      },
      error: (err: ApiError) => {
        console.error('[TracksPage] Suppression impossible', err);
        this.deletingId.set(null);

        // Le backend filtre par propriétaire (findOneAndDelete({ _id, ownerId })) : une piste
        // supprimée entre-temps et une piste d'un autre utilisateur renvoient toutes deux 404.
        if (err.status === 404) {
          this.snackbar.showError(
            "Cette piste n'existe plus (déjà supprimée, par exemple dans un autre onglet) ou ne vous appartient pas.",
          );
          // Piste obsolète à l'écran : recharger la bibliothèque pour synchroniser l'affichage
          this.load();
        } else {
          this.snackbar.showError(err.error?.message ?? 'Erreur lors de la suppression.');
        }
      },
    });
  }

  private visibilityLabel(visibility: Visibility | undefined): string {
    switch (visibility) {
      case 'public':
        return 'publique';
      case 'friends':
        return 'visible par vos amis';
      default:
        return 'privée';
    }
  }
}
