import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Track } from '../../models/track.model';
import { TrackService } from '../../services/track.service';
import { formatFormat } from '../../utils/track-format';

/**
 * Lecteur audio authentifié, partagé par la bibliothèque et l'Explorer.
 * HttpClient (avec JWT) → Blob → URL.createObjectURL → <audio>.
 * Chaque changement de piste recharge le flux et révoque l'ancienne ObjectURL.
 */
@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrl: './audio-player.component.css',
})
export class AudioPlayerComponent {
  private readonly service = inject(TrackService);

  readonly track = input.required<Track>();

  readonly loading = signal(false);
  readonly error = signal('');
  readonly url = signal('');

  readonly formatFormat = formatFormat;

  constructor() {
    effect((onCleanup) => {
      const track = this.track();
      // untracked : seuls les changements de piste doivent relancer le chargement.
      const subscription = untracked(() => this.load(track));
      onCleanup(() => subscription.unsubscribe());
    });

    // Révocation de l'ObjectURL pour éviter les fuites de mémoire (Memory Leak)
    inject(DestroyRef).onDestroy(() => {
      this.revoke();
      console.debug('[AudioPlayer] ObjectURL révoquée à la destruction du lecteur');
    });
  }

  /** Erreur du lecteur <audio> lui-même (fichier corrompu, format non décodable…) */
  onAudioError(): void {
    this.error.set(
      'Le navigateur ne parvient pas à décoder ce fichier audio (fichier corrompu ou format non pris en charge).',
    );
  }

  private load(track: Track): Subscription {
    this.error.set('');
    this.loading.set(true);

    return this.service.audio(track.id).subscribe({
      next: (blob) => {
        console.debug('[AudioPlayer] Audio reçu (Blob) :', blob.size, 'octets');
        // Révoquer l'ancienne URL avant d'en créer une nouvelle
        this.revoke();
        this.url.set(URL.createObjectURL(blob));
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        console.error('[AudioPlayer] Lecture impossible', err.status);
        this.revoke();
        this.loading.set(false);
        void this.describeError(err).then((message) => this.error.set(message));
      },
    });
  }

  private revoke(): void {
    const current = this.url();
    if (current) {
      URL.revokeObjectURL(current);
      this.url.set('');
    }
  }

  /**
   * Avec responseType: 'blob', le corps d'erreur JSON du backend arrive lui aussi sous forme
   * de Blob : il faut le lire pour récupérer `message`, sinon on retombe sur un message selon le statut.
   */
  private async describeError(err: HttpErrorResponse): Promise<string> {
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
        return "Ce morceau n'existe plus ou n'est plus accessible.";
      default:
        return 'Impossible de lire ce morceau.';
    }
  }
}
