import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { PublicUser } from '../../models/friend.model';
import { Track } from '../../models/track.model';

/**
 * Fenêtre de partage d'une piste : une case par ami confirmé.
 * Enregistrer envoie la liste complète des destinataires (une liste vide
 * arrête tous les partages de la piste).
 */
@Component({
  selector: 'app-share-dialog',
  templateUrl: './share-dialog.component.html',
  styleUrl: './share-dialog.component.css',
})
export class ShareDialogComponent {
  readonly track = input.required<Track>();
  readonly friends = input<PublicUser[]>([]);
  readonly busy = input(false);

  readonly save = output<string[]>();
  readonly cancel = output<void>();

  readonly selected = signal<ReadonlySet<string>>(new Set());

  /** Vrai si la sélection diffère des partages actuels de la piste. */
  readonly changed = computed(() => {
    const current = new Set(this.track().sharedWith ?? []);
    const next = this.selected();
    return current.size !== next.size || [...next].some((id) => !current.has(id));
  });

  constructor() {
    // Pré-cocher les destinataires actuels à chaque ouverture sur une piste
    effect(() => {
      const sharedWith = this.track().sharedWith ?? [];
      untracked(() => this.selected.set(new Set(sharedWith)));
    });
  }

  isSelected(userId: string): boolean {
    return this.selected().has(userId);
  }

  toggle(userId: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (!next.delete(userId)) next.add(userId);
      return next;
    });
  }

  submit(): void {
    if (this.busy() || !this.changed()) return;
    // Ne garder que des amis actuels : un ancien ami ne peut plus recevoir de partage
    const friendIds = new Set(this.friends().map((f) => f.id));
    this.save.emit([...this.selected()].filter((id) => friendIds.has(id)));
  }
}
