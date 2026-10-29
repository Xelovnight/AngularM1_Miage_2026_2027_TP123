import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Activity } from '../../shared/models/activity.model';
import { Track } from '../../shared/models/track.model';
import { ActivityService } from '../../shared/services/activity.service';
import { FriendService } from '../../shared/services/friend.service';
import { TrackCardComponent } from '../../shared/components/track-card/track-card.component';
import { AudioPlayerComponent } from '../../shared/components/audio-player/audio-player.component';
import { activityIcon, describeActivity, relativeTime } from '../../shared/utils/activity-format';

/** Nombre d'événements demandés à chaque chargement. */
export const ACTIVITY_PAGE_SIZE = 10;

/**
 * Page Activité : ce que mes amis ont fait récemment (pistes publiées,
 * pistes partagées avec moi, invitations acceptées), du plus récent au plus
 * ancien, avec un bouton « Voir plus » qui suit le curseur du backend.
 */
@Component({
  imports: [RouterLink, TrackCardComponent, AudioPlayerComponent],
  templateUrl: './activity-page.html',
  styleUrl: './activity-page.css',
})
export class ActivityPageComponent {
  private readonly service = inject(ActivityService);
  private readonly friendService = inject(FriendService);

  readonly items = signal<Activity[]>([]);
  readonly nextBefore = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly currentTrack = signal<Track | null>(null);

  readonly hasFriends = computed(() => this.friendService.overview().friends.length > 0);

  readonly describe = describeActivity;
  readonly icon = activityIcon;
  readonly relativeTime = relativeTime;

  // Requête en cours : annulée si l'utilisateur actualise avant sa réponse
  private request?: Subscription;

  constructor() {
    this.load();
    // Liste d'amis à jour pour choisir le bon message quand le fil est vide
    this.friendService.refresh().subscribe({
      error: (err) => console.error('[ActivityPage] Amis indisponibles', err),
    });
  }

  /** Recharge le fil depuis les événements les plus récents. */
  load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.loadingMore.set(false);
    this.error.set('');

    this.request = this.service.feed(null, ACTIVITY_PAGE_SIZE).subscribe({
      next: (feed) => {
        console.debug('[ActivityPage] Événements chargés :', feed.items.length);
        this.items.set(feed.items);
        this.nextBefore.set(feed.nextBefore);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        console.error('[ActivityPage] Chargement impossible', err);
        this.error.set(err.error?.message ?? "Impossible de charger l'activité de vos amis.");
        this.loading.set(false);
      },
    });
  }

  /** Ajoute les événements plus anciens à la suite de la liste. */
  loadMore(): void {
    const before = this.nextBefore();
    if (!before || this.loading() || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.error.set('');

    this.request = this.service.feed(before, ACTIVITY_PAGE_SIZE).subscribe({
      next: (feed) => {
        console.debug('[ActivityPage] Événements plus anciens :', feed.items.length);
        // Un événement déjà affiché (même date que le curseur) n'est pas dupliqué
        const known = new Set(this.items().map((item) => item.id));
        this.items.update((list) => [...list, ...feed.items.filter((item) => !known.has(item.id))]);
        this.nextBefore.set(feed.nextBefore);
        this.loadingMore.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        console.error('[ActivityPage] Chargement de la suite impossible', err);
        this.error.set(err.error?.message ?? "Impossible de charger la suite de l'activité.");
        this.loadingMore.set(false);
      },
    });
  }

  play(track: Track): void {
    this.currentTrack.set(track);
  }
}
