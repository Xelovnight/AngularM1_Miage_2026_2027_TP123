import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { ACTIVITY_PAGE_SIZE, ActivityPageComponent } from './activity-page';
import { ActivityService } from '../../shared/services/activity.service';
import { FriendService } from '../../shared/services/friend.service';
import { Activity, ActivityFeed } from '../../shared/models/activity.model';
import { FriendsOverview } from '../../shared/models/friend.model';

describe('ActivityPageComponent', () => {
  let activityServiceMock: { feed: ReturnType<typeof vi.fn> };
  let overview: ReturnType<typeof signal<FriendsOverview>>;
  let friendRefresh: ReturnType<typeof vi.fn>;

  const event = (id: string, createdAt = '2026-10-28T10:00:00.000Z'): Activity => ({
    id,
    type: 'friend_accepted',
    createdAt,
    actor: { id: 'bob', name: 'Bob' },
  });

  const feed = (items: Activity[], nextBefore: string | null = null): ActivityFeed => ({
    items,
    nextBefore,
  });

  function create(): ActivityPageComponent {
    TestBed.configureTestingModule({
      providers: [
        ActivityPageComponent,
        { provide: ActivityService, useValue: activityServiceMock },
        { provide: FriendService, useValue: { overview, refresh: friendRefresh } },
      ],
    });
    return TestBed.inject(ActivityPageComponent);
  }

  beforeEach(() => {
    activityServiceMock = { feed: vi.fn().mockReturnValue(of(feed([event('a-1')]))) };
    overview = signal<FriendsOverview>({ friends: [], incoming: [], outgoing: [] });
    friendRefresh = vi.fn().mockReturnValue(of(undefined));
  });

  it('charge les événements les plus récents dès la création', () => {
    const component = create();

    expect(activityServiceMock.feed).toHaveBeenCalledWith(null, ACTIVITY_PAGE_SIZE);
    expect(component.items().map((a) => a.id)).toEqual(['a-1']);
    expect(component.nextBefore()).toBeNull();
    expect(component.loading()).toBe(false);
  });

  it('affiche le message du backend en cas d’erreur', () => {
    activityServiceMock.feed.mockReturnValue(throwError(() => ({ error: { message: 'Erreur serveur' } })));
    const component = create();

    expect(component.error()).toBe('Erreur serveur');
    expect(component.loading()).toBe(false);
  });

  it('loadMore() suit le curseur, ajoute la suite et ignore un doublon', () => {
    activityServiceMock.feed.mockReturnValueOnce(of(feed([event('a-1'), event('a-2')], 'cursor-1')));
    const component = create();

    activityServiceMock.feed.mockReturnValueOnce(of(feed([event('a-2'), event('a-3')], null)));
    component.loadMore();

    expect(activityServiceMock.feed).toHaveBeenLastCalledWith('cursor-1', ACTIVITY_PAGE_SIZE);
    expect(component.items().map((a) => a.id)).toEqual(['a-1', 'a-2', 'a-3']);
    expect(component.nextBefore()).toBeNull();
  });

  it('loadMore() ne fait rien à la fin du fil ou pendant un chargement', () => {
    const component = create();
    component.loadMore(); // nextBefore = null
    expect(activityServiceMock.feed).toHaveBeenCalledTimes(1);

    component.nextBefore.set('cursor-1');
    activityServiceMock.feed.mockReturnValue(new Subject<ActivityFeed>());
    component.loadMore();
    component.loadMore(); // second clic ignoré
    expect(activityServiceMock.feed).toHaveBeenCalledTimes(2);
  });

  it('load() repart des événements récents et annule la requête précédente', () => {
    const slow = new Subject<ActivityFeed>();
    activityServiceMock.feed.mockReturnValueOnce(slow);
    const component = create();

    activityServiceMock.feed.mockReturnValueOnce(of(feed([event('a-9')])));
    component.load();

    expect(slow.observed).toBe(false);
    expect(component.items().map((a) => a.id)).toEqual(['a-9']);
  });

  it('hasFriends suit la liste d’amis partagée par FriendService, rafraîchie à l’ouverture', () => {
    const component = create();
    expect(friendRefresh).toHaveBeenCalled();
    expect(component.hasFriends()).toBe(false);

    overview.set({
      friends: [{ friendshipId: 'f-1', user: { id: 'bob', name: 'Bob' }, since: null }],
      incoming: [],
      outgoing: [],
    });
    expect(component.hasFriends()).toBe(true);
  });
});
