import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FriendService } from './friend.service';
import { FriendsOverview } from '../models/friend.model';

describe('FriendService', () => {
  let service: FriendService;
  let httpMock: HttpTestingController;

  const overview: FriendsOverview = {
    friends: [{ friendshipId: 'f1', user: { id: 'u1', name: 'Bob' }, since: null }],
    incoming: [
      { friendshipId: 'f2', user: { id: 'u2', name: 'Carol' }, createdAt: null },
      { friendshipId: 'f3', user: { id: 'u3', name: 'Dave' }, createdAt: null },
    ],
    outgoing: [],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FriendService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FriendService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('refresh() appelle GET /api/friends et met à jour le compteur d’invitations', () => {
    expect(service.incomingCount()).toBe(0);

    service.refresh().subscribe();
    const req = httpMock.expectOne('/api/friends');
    expect(req.request.method).toBe('GET');
    req.flush(overview);

    expect(service.overview()).toEqual(overview);
    expect(service.incomingCount()).toBe(2);
  });

  it('clear() vide la vue mise en cache', () => {
    service.refresh().subscribe();
    httpMock.expectOne('/api/friends').flush(overview);

    service.clear();

    expect(service.incomingCount()).toBe(0);
    expect(service.overview().friends).toEqual([]);
  });

  it('searchUsers() appelle GET /api/users/search?q=…', () => {
    service.searchUsers('bo').subscribe((users) => expect(users).toEqual([{ id: 'u1', name: 'Bob' }]));

    const req = httpMock.expectOne('/api/users/search?q=bo');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'u1', name: 'Bob' }]);
  });

  it('invite() appelle POST /api/friends/requests avec userId', () => {
    service.invite('u9').subscribe();

    const req = httpMock.expectOne('/api/friends/requests');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 'u9' });
    req.flush({ friendshipId: 'f9', status: 'pending' });
  });

  it('accept(), deleteRequest() et removeFriend() appellent les bonnes routes', () => {
    service.accept('f2').subscribe();
    const accept = httpMock.expectOne('/api/friends/requests/f2/accept');
    expect(accept.request.method).toBe('POST');
    accept.flush({ friendshipId: 'f2', status: 'accepted' });

    service.deleteRequest('f3').subscribe();
    const decline = httpMock.expectOne('/api/friends/requests/f3');
    expect(decline.request.method).toBe('DELETE');
    decline.flush(null, { status: 204, statusText: 'No Content' });

    service.removeFriend('u1').subscribe();
    const remove = httpMock.expectOne('/api/friends/u1');
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null, { status: 204, statusText: 'No Content' });
  });
});
