import { Component, effect, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PublicUser } from '../../models/friend.model';
import {
  BPM_MAX,
  BPM_MIN,
  MUSICAL_KEYS,
  Track,
  TrackMetadata,
  Visibility,
  VISIBILITY_OPTIONS,
} from '../../models/track.model';
import {
  formatDate,
  formatFormat,
  formatSize,
  toTrackMetadata,
  visibilityOption,
} from '../../utils/track-format';

/**
 * Carte d'une piste : titre, métadonnées musicales, badge de visibilité.
 * Le composant n'appelle pas l'API : il émet des événements et c'est la page
 * parente qui décide quoi faire (lecture, suppression, modification).
 * Les commandes de modification ne s'affichent que si `owned` est vrai.
 */
@Component({
  selector: 'app-track-card',
  imports: [ReactiveFormsModule],
  templateUrl: './track-card.component.html',
  styleUrl: './track-card.component.css',
})
export class TrackCardComponent {
  readonly track = input.required<Track>();
  readonly playing = input(false);
  readonly owned = input(false);
  readonly showOwner = input(false);
  readonly editing = input(false);
  readonly busy = input(false);
  readonly deleting = input(false);
  /** Tags affichés comme boutons (ex. Explorer : clic = recherche par tag). */
  readonly clickableTags = input(false);
  /** Propriétaire : amis destinataires d'un partage nominatif (avec leur nom). */
  readonly shareTargets = input<PublicUser[]>([]);

  readonly play = output<Track>();
  readonly remove = output<Track>();
  readonly editStart = output<Track>();
  readonly editCancel = output<void>();
  readonly save = output<TrackMetadata>();
  readonly tagClick = output<string>();
  readonly share = output<Track>();
  readonly unshare = output<PublicUser>();

  readonly visibilityOptions = VISIBILITY_OPTIONS;
  readonly musicalKeys = MUSICAL_KEYS;
  readonly formatSize = formatSize;
  readonly formatDate = formatDate;
  readonly formatFormat = formatFormat;
  readonly visibilityOption = visibilityOption;

  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    bpm: new FormControl<number | null>(null, [
      Validators.min(BPM_MIN),
      Validators.max(BPM_MAX),
    ]),
    key: new FormControl<string | null>(null),
    genre: new FormControl('', { nonNullable: true }),
    tags: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    // À l'ouverture du mode édition, le formulaire reprend les valeurs actuelles.
    effect(() => {
      if (!this.editing()) return;
      const track = this.track();
      this.form.reset({
        title: track.title,
        bpm: track.bpm ?? null,
        key: track.key ?? null,
        genre: track.genre ?? '',
        tags: (track.tags ?? []).join(', '),
      });
    });
  }

  changeVisibility(event: Event): void {
    const visibility = (event.target as HTMLSelectElement).value as Visibility;
    if (visibility !== this.track().visibility) this.save.emit({ visibility });
  }

  submit(): void {
    if (this.form.invalid || this.busy()) return;
    this.save.emit(toTrackMetadata(this.form.getRawValue()));
  }
}
