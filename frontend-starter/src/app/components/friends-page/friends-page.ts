import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { debounceTime, Observable, Subscription } from 'rxjs';
import { Friend, FriendRelation, FriendRequest, PublicUser } from '../../shared/models/friend.model';
import { FriendService } from '../../shared/services/friend.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { relationOf } from '../../shared/utils/friend-relation';
import { formatDate } from '../../shared/utils/track-format';

/** Délai entre la dernière frappe et la recherche d'utilisateurs. */
export const USER_SEARCH_DEBOUNCE_MS = 300;
const USER_SEARCH_MIN_LENGTH = 2;

/**
 * Page Amis : rechercher et inviter des utilisateurs, répondre aux
 * invitations reçues, annuler celles envoyées et retirer des amis.
 * Après chaque action, la vue d'ensemble est rechargée depuis le backend.
 */
@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './friends-page.html',
  styleUrl: './friends-page.css',
})
export class FriendsPageComponent {
  private readonly service = inject(FriendService);
  private readonly snackbar = inject(SnackbarService);

  // La vue d'ensemble est partagée avec la barre de navigation (badge).
  readonly overview = this.service.overview;
  readonly loading = signal(false);
  readonly error = signal('');

  // Identifiant (amitié ou utilisateur) dont une action est en cours
  readonly busyId = signal<string | null>(null);

  // Recherche d'utilisateurs à inviter
  readonly userQuery = new FormControl('', { nonNullable: true });
  readonly results = signal<PublicUser[]>([]);
  readonly searching = signal(false);
  readonly searchError = signal('');
  readonly searchedFor = signal('');
  private searchRequest?: Subscription;

  readonly formatDate = formatDate;

  constructor() {
    this.userQuery.valueChanges
      .pipe(debounceTime(USER_SEARCH_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.searchUsers());

    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.service.refresh().subscribe({
      next: (overview) => {
        console.debug(
          '[FriendsPage] Vue chargée :',
          overview.friends.length,
          'ami(s),',
          overview.incoming.length,
          'invitation(s) reçue(s)',
        );
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        console.error('[FriendsPage] Chargement impossible', err);
        this.error.set(err.error?.message ?? 'Impossible de charger vos amis.');
        this.loading.set(false);
      },
    });
  }

  /** Recherche d'utilisateurs (au moins 2 caractères) ; la requête précédente est annulée. */
  searchUsers(): void {
    const q = this.userQuery.value.trim();
    this.searchRequest?.unsubscribe();
    this.searchError.set('');

    if (q.length < USER_SEARCH_MIN_LENGTH) {
      this.results.set([]);
      this.searchedFor.set('');
      this.searching.set(false);
      return;
    }

    this.searching.set(true);
    this.searchRequest = this.service.searchUsers(q).subscribe({
      next: (users) => {
        console.debug('[FriendsPage] Utilisateurs trouvés :', users.length);
        this.results.set(users);
        this.searchedFor.set(q);
        this.searching.set(false);
      },
      error: (err: HttpErrorResponse) => {
        console.error('[FriendsPage] Recherche impossible', err);
        this.results.set([]);
        this.searchError.set(err.error?.message ?? 'Recherche impossible.');
        this.searching.set(false);
      },
    });
  }

  relation(user: PublicUser): FriendRelation {
    return relationOf(user.id, this.overview());
  }

  invite(user: PublicUser): void {
    this.run(user.id, () => this.service.invite(user.id), (result) =>
      result?.status === 'accepted'
        ? `${user.name} vous avait déjà invité : vous êtes maintenant amis !`
        : `Invitation envoyée à ${user.name}.`,
    );
  }

  /** Accepte l'invitation correspondant à un résultat de recherche. */
  acceptFrom(user: PublicUser): void {
    const request = this.overview().incoming.find((r) => r.user.id === user.id);
    if (request) this.accept(request);
  }

  accept(request: FriendRequest): void {
    this.run(
      request.friendshipId,
      () => this.service.accept(request.friendshipId),
      () => `Vous êtes maintenant ami avec ${request.user.name}.`,
    );
  }

  decline(request: FriendRequest): void {
    this.run(
      request.friendshipId,
      () => this.service.deleteRequest(request.friendshipId),
      () => `Invitation de ${request.user.name} refusée.`,
    );
  }

  cancel(request: FriendRequest): void {
    this.run(
      request.friendshipId,
      () => this.service.deleteRequest(request.friendshipId),
      () => `Invitation à ${request.user.name} annulée.`,
    );
  }

  removeFriend(friend: Friend): void {
    const confirmed = window.confirm(
      `Retirer ${friend.user.name} de vos amis ? Vous n'aurez plus accès à ses pistes réservées aux amis, et inversement.`,
    );
    if (!confirmed) return;

    this.run(
      friend.user.id,
      () => this.service.removeFriend(friend.user.id),
      () => `${friend.user.name} a été retiré de vos amis.`,
    );
  }

  /**
   * Exécute une action sur une amitié : protection anti double-clic,
   * notification, puis rechargement de la vue (même en cas d'échec, pour
   * resynchroniser une invitation déjà traitée ailleurs).
   */
  private run<T>(
    id: string,
    action: () => Observable<T>,
    successMessage: (result: T) => string,
  ): void {
    if (this.busyId()) return;
    this.busyId.set(id);

    action().subscribe({
      next: (result) => {
        console.debug('[FriendsPage] Action réussie pour', id);
        this.busyId.set(null);
        this.snackbar.showSuccess(successMessage(result));
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        console.error('[FriendsPage] Action impossible pour', id, err);
        this.busyId.set(null);
        this.snackbar.showError(err.error?.message ?? 'Action impossible.');
        this.load();
      },
    });
  }
}
