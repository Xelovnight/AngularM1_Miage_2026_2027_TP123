import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';
import { TrackCardComponent } from '../../shared/components/track-card/track-card.component';
import { AudioPlayerComponent } from '../../shared/components/audio-player/audio-player.component';

/**
 * Page « Partagés avec moi » : pistes de mes amis que je peux écouter,
 * soit parce qu'elles sont visibles par tous leurs amis, soit parce qu'elles
 * m'ont été partagées nommément.
 */
@Component({
  imports: [RouterLink, TrackCardComponent, AudioPlayerComponent],
  templateUrl: './shared-page.html',
  styleUrl: './shared-page.css',
})
export class SharedPageComponent {
  private readonly service = inject(TrackService);

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly currentTrack = signal<Track | null>(null);

  // Requête HTTP en cours : annulée si un nouveau chargement part avant sa réponse
  private request?: Subscription;

  constructor() {
    this.load();
  }

  load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');

    this.request = this.service.listSharedWithMe(this.page(), 10).subscribe({
      next: (response) => {
        console.debug('[SharedPage] Pistes partagées chargées :', response.items.length);
        this.tracks.set(response.items);
        this.pages.set(Math.max(1, response.pages));
        this.total.set(response.total);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        console.error('[SharedPage] Chargement impossible', err);
        this.error.set(err.error?.message ?? 'Impossible de charger les pistes partagées.');
        this.loading.set(false);
      },
    });
  }

  go(targetPage: number): void {
    if (targetPage < 1 || targetPage > this.pages() || targetPage === this.page()) {
      return;
    }
    this.page.set(targetPage);
    this.load();
  }

  play(track: Track): void {
    this.currentTrack.set(track);
  }
}
