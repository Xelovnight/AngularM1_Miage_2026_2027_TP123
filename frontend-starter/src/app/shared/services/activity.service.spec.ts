import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivityService } from './activity.service';

describe('ActivityService', () => {
  let service: ActivityService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ActivityService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ActivityService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('feed() demande les événements les plus récents sans curseur', () => {
    service.feed(null, 10).subscribe((feed) => expect(feed.nextBefore).toBeNull());

    const req = httpMock.expectOne('/api/activity?limit=10');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('before')).toBe(false);
    req.flush({ items: [], nextBefore: null });
  });

  it('feed(before) transmet le curseur de la page suivante', () => {
    service.feed('2026-10-28T12:00:00.000Z', 5).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/activity');
    expect(req.request.params.get('before')).toBe('2026-10-28T12:00:00.000Z');
    expect(req.request.params.get('limit')).toBe('5');
    req.flush({ items: [], nextBefore: null });
  });
});
