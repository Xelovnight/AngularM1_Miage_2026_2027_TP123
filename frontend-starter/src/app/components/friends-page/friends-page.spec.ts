import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { FriendsPageComponent, USER_SEARCH_DEBOUNCE_MS } from './friends-page';
import { FriendService } from '../../shared/services/friend.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { FriendsOverview, PublicUser } from '../../shared/models/friend.model';

describe('FriendsPageComponent', () => {
  let component: FriendsPageComponent;
  let friendServiceMock: {
    overview: ReturnType<typeof signal<FriendsOverview>>;
    refresh: ReturnType<typeof vi.fn>;
    searchUsers: ReturnType<typeof vi.fn>;
    invite: ReturnType<typeof vi.fn>;
    accept: ReturnType<typeof vi.fn>;
    deleteRequest: ReturnType<typeof vi.fn>;
    removeFriend: ReturnType<typeof vi.fn>;
  };
  let snackbarMock: { showSuccess: ReturnType<typeof vi.fn>; showError: ReturnType<typeof vi.fn> };

  const bob: PublicUser = { id: 'bob', name: 'Bob' };
  const carol: PublicUser = { id: 'carol', name: 'Carol' };
  const overview: FriendsOverview = {
    friends: [{ friendshipId: 'f-bob', user: bob, since: '2026-10-20' }],
    incoming: [{ friendshipId: 'f-carol', user: carol, createdAt: '2026-10-21' }],
    outgoing: [],
  };

  function createComponent(): FriendsPageComponent {
    TestBed.configureTestingModule({
      providers: [
        FriendsPageComponent,
        { provide: FriendService, useValue: friendServiceMock },
        { provide: SnackbarService, useValue: snackbarMock },
      ],
    });
    return TestBed.inject(FriendsPageComponent);
  }

  beforeEach(() => {
    window.confirm = vi.fn().mockReturnValue(true);
    const overviewSignal = signal<FriendsOverview>(overview);
    friendServiceMock = {
      overview: overviewSignal,
      refresh: vi.fn().mockReturnValue(of(overview)),
      searchUsers: vi.fn().mockReturnValue(of([bob, carol, { id: 'eve', name: 'Eve' }])),
      invite: vi.fn().mockReturnValue(of({ friendshipId: 'f-eve', status: 'pending' })),
      accept: vi.fn().mockReturnValue(of({ friendshipId: 'f-carol', status: 'accepted' })),
      deleteRequest: vi.fn().mockReturnValue(of(undefined)),
      removeFriend: vi.fn().mockReturnValue(of(undefined)),
    };
    snackbarMock = { showSuccess: vi.fn(), showError: vi.fn() };
    component = createComponent();
  });

  afterEach(() => vi.useRealTimers());

  it('charge la vue d’ensemble au démarrage', () => {
    expect(friendServiceMock.refresh).toHaveBeenCalledTimes(1);
    expect(component.loading()).toBe(false);
    expect(component.overview()).toEqual(overview);
  });

  it('affiche l’erreur si le chargement échoue', () => {
    friendServiceMock.refresh.mockReturnValue(
      throwError(() => ({ error: { message: 'Serveur indisponible' } })),
    );
    component.load();
    expect(component.error()).toBe('Serveur indisponible');
  });

  it('recherche des utilisateurs seulement à partir de 2 caractères', () => {
    component.userQuery.setValue('b');
    component.searchUsers();
    expect(friendServiceMock.searchUsers).not.toHaveBeenCalled();
    expect(component.results()).toEqual([]);

    component.userQuery.setValue(' bo ');
    component.searchUsers();
    expect(friendServiceMock.searchUsers).toHaveBeenCalledWith('bo');
    expect(component.results().length).toBe(3);
    expect(component.searchedFor()).toBe('bo');
  });

  it('lance la recherche d’utilisateurs après la pause de saisie', () => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    const page = createComponent();

    page.userQuery.setValue('ev');
    vi.advanceTimersByTime(USER_SEARCH_DEBOUNCE_MS - 1);
    expect(friendServiceMock.searchUsers).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(friendServiceMock.searchUsers).toHaveBeenCalledWith('ev');
  });

  it('une nouvelle recherche annule la précédente encore en cours', () => {
    const first = new Subject<PublicUser[]>();
    friendServiceMock.searchUsers.mockReturnValueOnce(first.asObservable());
    component.userQuery.setValue('bo');
    component.searchUsers();
    expect(first.observed).toBe(true);

    component.userQuery.setValue('bob');
    component.searchUsers();
    expect(first.observed).toBe(false);
  });

  it('relation() choisit le bon bouton pour chaque résultat', () => {
    expect(component.relation(bob)).toBe('friend');
    expect(component.relation(carol)).toBe('incoming');
    expect(component.relation({ id: 'eve', name: 'Eve' })).toBe('none');
  });

  it('invite() envoie l’invitation, notifie et recharge la vue', () => {
    friendServiceMock.refresh.mockClear();
    component.invite({ id: 'eve', name: 'Eve' });

    expect(friendServiceMock.invite).toHaveBeenCalledWith('eve');
    expect(snackbarMock.showSuccess).toHaveBeenCalledWith('Invitation envoyée à Eve.');
    expect(friendServiceMock.refresh).toHaveBeenCalledTimes(1);
    expect(component.busyId()).toBeNull();
  });

  it('invite() annonce une amitié immédiate en cas d’invitation croisée', () => {
    friendServiceMock.invite.mockReturnValue(of({ friendshipId: 'f-carol', status: 'accepted' }));
    component.invite(carol);
    expect(snackbarMock.showSuccess).toHaveBeenCalledWith(
      'Carol vous avait déjà invité : vous êtes maintenant amis !',
    );
  });

  it('accept(), decline() et acceptFrom() appellent le service avec l’id d’amitié', () => {
    component.accept(overview.incoming[0]);
    expect(friendServiceMock.accept).toHaveBeenCalledWith('f-carol');
    expect(snackbarMock.showSuccess).toHaveBeenCalledWith('Vous êtes maintenant ami avec Carol.');

    component.decline(overview.incoming[0]);
    expect(friendServiceMock.deleteRequest).toHaveBeenCalledWith('f-carol');

    friendServiceMock.accept.mockClear();
    component.acceptFrom(carol);
    expect(friendServiceMock.accept).toHaveBeenCalledWith('f-carol');
  });

  it('removeFriend() demande confirmation et ne fait rien si elle est refusée', () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);
    component.removeFriend(overview.friends[0]);
    expect(friendServiceMock.removeFriend).not.toHaveBeenCalled();

    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    component.removeFriend(overview.friends[0]);
    expect(friendServiceMock.removeFriend).toHaveBeenCalledWith('bob');
    expect(snackbarMock.showSuccess).toHaveBeenCalledWith('Bob a été retiré de vos amis.');
  });

  it('bloque une seconde action pendant qu’une première est en cours', () => {
    const pending = new Subject<{ friendshipId: string; status: 'pending' }>();
    friendServiceMock.invite.mockReturnValue(pending.asObservable());

    component.invite({ id: 'eve', name: 'Eve' });
    component.accept(overview.incoming[0]);

    expect(component.busyId()).toBe('eve');
    expect(friendServiceMock.accept).not.toHaveBeenCalled();
  });

  it('affiche l’erreur du backend et resynchronise la vue', () => {
    friendServiceMock.accept.mockReturnValue(
      throwError(() => ({ status: 404, error: { message: 'Invitation inconnue' } })),
    );
    friendServiceMock.refresh.mockClear();

    component.accept(overview.incoming[0]);

    expect(snackbarMock.showError).toHaveBeenCalledWith('Invitation inconnue');
    expect(friendServiceMock.refresh).toHaveBeenCalledTimes(1);
    expect(component.busyId()).toBeNull();
  });
});
