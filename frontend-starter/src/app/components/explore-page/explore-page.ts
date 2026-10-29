import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { debounceTime, Subscription } from 'rxjs';
import {
  BPM_MAX,
  BPM_MIN,
  MUSICAL_KEYS,
  SEARCH_SCOPE_OPTIONS,
  SearchScope,
  Track,
  TrackSearchCriteria,
} from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';
import { AuthService } from '../../shared/services/auth.service';
import { TrackCardComponent } from '../../shared/components/track-card/track-card.component';
import { AudioPlayerComponent } from '../../shared/components/audio-player/audio-player.component';
import {
  hasSearchCriteria,
  sameSearchCriteria,
  toSearchCriteria,
} from '../../shared/utils/track-format';

/** Délai entre la dernière frappe et l'envoi de la recherche. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Le BPM minimum ne peut pas dépasser le BPM maximum. */
function bpmRangeValidator(group: AbstractControl): ValidationErrors | null {
  const { bpmMin, bpmMax } = group.value as { bpmMin: number | null; bpmMax: number | null };
  if (bpmMin == null || bpmMax == null || (bpmMin as unknown) === '' || (bpmMax as unknown) === '') {
    return null;
  }
  return Number(bpmMin) > Number(bpmMax) ? { bpmRange: true } : null;
}

/**
 * Page Explorer :
 * - sans critère : pistes publiques récemment ajoutées ;
 * - avec critères : recherche parmi les pistes que l'utilisateur peut écouter
 *   (texte libre, périmètre, genre, tonalité, intervalle de BPM).
 */
@Component({
  imports: [ReactiveFormsModule, TrackCardComponent, AudioPlayerComponent],
  templateUrl: './explore-page.html',
  styleUrl: './explore-page.css',
})
export class ExplorePageComponent {
  private readonly service = inject(TrackService);
  readonly auth = inject(AuthService);

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly currentTrack = signal<Track | null>(null);

  // Critères réellement appliqués (le formulaire peut être en cours de saisie)
  readonly criteria = signal<TrackSearchCriteria>({});
  readonly searching = computed(() => hasSearchCriteria(this.criteria()));
  readonly showFilters = signal(false);

  readonly searchForm = new FormGroup(
    {
      q: new FormControl('', { nonNullable: true }),
      scope: new FormControl<SearchScope>('all', { nonNullable: true }),
      genre: new FormControl('', { nonNullable: true }),
      key: new FormControl<string | null>(null),
      bpmMin: new FormControl<number | null>(null, [
        Validators.min(BPM_MIN),
        Validators.max(BPM_MAX),
      ]),
      bpmMax: new FormControl<number | null>(null, [
        Validators.min(BPM_MIN),
        Validators.max(BPM_MAX),
      ]),
    },
    { validators: bpmRangeValidator },
  );

  readonly scopeOptions = SEARCH_SCOPE_OPTIONS;
  readonly musicalKeys = MUSICAL_KEYS;

  // Requête HTTP en cours : annulée si une nouvelle recherche part avant sa réponse
  private request?: Subscription;

  constructor() {
    // Recherche « au fil de la frappe » : on attend une pause de saisie.
    this.searchForm.valueChanges
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.applySearch());

    this.load();
  }

  load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');

    const criteria = this.criteria();
    const source = hasSearchCriteria(criteria)
      ? this.service.search(criteria, this.page(), 10)
      : this.service.listPublic(this.page(), 10);

    this.request = source.subscribe({
      next: (response) => {
        console.debug('[ExplorePage] Pistes chargées :', response.items.length, criteria);
        this.tracks.set(response.items);
        this.pages.set(Math.max(1, response.pages));
        this.total.set(response.total);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        console.error('[ExplorePage] Chargement impossible', err);
        this.error.set(err.error?.message ?? 'Impossible de charger les pistes.');
        this.loading.set(false);
      },
    });
  }

  /**
   * Applique le formulaire : ignoré s'il est invalide ou si les critères
   * n'ont pas changé, sinon retour en page 1 et nouveau chargement.
   */
  applySearch(): void {
    if (this.searchForm.invalid) return;
    const next = toSearchCriteria(this.searchForm.getRawValue());
    if (sameSearchCriteria(next, this.criteria())) return;

    this.criteria.set(next);
    this.page.set(1);
    this.load();
  }

  /** Clic sur un tag d'une carte : recherche de ce tag. */
  searchTag(tag: string): void {
    this.searchForm.patchValue({ q: tag });
    this.applySearch();
  }

  resetSearch(): void {
    this.searchForm.reset();
    this.applySearch();
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

  /** Vrai si la piste appartient à l'utilisateur connecté (badge « vous »). */
  isMine(track: Track): boolean {
    const me = this.auth.currentUser();
    return !!me && track.ownerId === me.id;
  }
}
