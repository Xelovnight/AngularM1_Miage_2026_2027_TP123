import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TrackService } from './track.service';
import { Track } from '../models/track.model';
import { Page } from '../models/page.model';

describe('TrackService', () => {
  let service: TrackService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TrackService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(TrackService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('list() transmet page et limit en paramètres de requête', () => {
    const mockPage: Page<Track> = {
      items: [
        {
          id: '123',
          title: 'Blues Backing Track',
          originalName: 'blues.mp3',
          mimeType: 'audio/mpeg',
          size: 1024,
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      page: 2,
      limit: 5,
      total: 10,
      pages: 2,
    };

    service.list(2, 5).subscribe((response) => {
      expect(response).toEqual(mockPage);
      expect(response.items.length).toBe(1);
      expect(response.page).toBe(2);
    });

    const req = httpMock.expectOne('/api/tracks?page=2&limit=5');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('5');

    req.flush(mockPage);
  });

  it('delete() appelle DELETE /api/tracks/:id', () => {
    const trackId = 'track-456';

    service.delete(trackId).subscribe((res) => {
      expect(res).toBeNull();
    });

    const req = httpMock.expectOne(`/api/tracks/${trackId}`);
    expect(req.request.method).toBe('DELETE');

    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('upload() envoie un FormData multipart avec les métadonnées et active reportProgress', () => {
    const blob = new Blob(['dummy audio content'], { type: 'audio/mp3' });
    const file = new File([blob], 'rock.mp3', { type: 'audio/mp3' });
    const title = 'Rock Solo in A';

    service
      .upload(file, {
        title,
        visibility: 'public',
        bpm: 120,
        key: 'Am',
        genre: 'Rock',
        tags: ['solo', 'rapide'],
      })
      .subscribe();

    const req = httpMock.expectOne('/api/tracks');
    expect(req.request.method).toBe('POST');
    expect(req.request.reportProgress).toBe(true);
    expect(req.request.body instanceof FormData).toBe(true);

    const formData = req.request.body as FormData;
    expect(formData.get('title')).toBe(title);
    expect(formData.get('audio')).toBeDefined();
    expect(formData.get('visibility')).toBe('public');
    expect(formData.get('bpm')).toBe('120');
    expect(formData.get('key')).toBe('Am');
    expect(formData.get('genre')).toBe('Rock');
    expect(formData.get('tags')).toBe('solo,rapide');

    req.flush({
      id: 'track-789',
      title,
      originalName: 'rock.mp3',
      mimeType: 'audio/mp3',
      size: 100,
      createdAt: new Date().toISOString(),
    });
  });

  it('upload() n’envoie pas les métadonnées vides', () => {
    const file = new File(['x'], 'a.mp3', { type: 'audio/mpeg' });

    service.upload(file, { title: 'A', bpm: null, key: null, genre: null, tags: [] }).subscribe();

    const formData = httpMock.expectOne('/api/tracks').request.body as FormData;
    expect(formData.get('title')).toBe('A');
    expect(formData.has('bpm')).toBe(false);
    expect(formData.has('key')).toBe(false);
    expect(formData.has('genre')).toBe(false);
    expect(formData.has('tags')).toBe(false);
  });

  it('update() appelle PATCH /api/tracks/:id avec les changements en JSON', () => {
    service.update('track-1', { visibility: 'friends' }).subscribe((track) => {
      expect(track.visibility).toBe('friends');
    });

    const req = httpMock.expectOne('/api/tracks/track-1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ visibility: 'friends' });
    req.flush({ id: 'track-1', visibility: 'friends' });
  });

  it('listPublic() appelle GET /api/tracks/public avec page et limit', () => {
    service.listPublic(3, 10).subscribe();

    const req = httpMock.expectOne('/api/tracks/public?page=3&limit=10');
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], page: 3, limit: 10, total: 0, pages: 1 });
  });

  it('search() appelle GET /api/tracks/search sans les critères vides', () => {
    service.search({ q: 'blues', key: 'Am', bpmMin: 80, genre: '' }, 2, 10).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/tracks/search');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('q')).toBe('blues');
    expect(req.request.params.get('key')).toBe('Am');
    expect(req.request.params.get('bpmMin')).toBe('80');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('10');
    expect(req.request.params.has('genre')).toBe(false);
    expect(req.request.params.has('bpmMax')).toBe(false);
    req.flush({ items: [], page: 2, limit: 10, total: 0, pages: 1 });
  });

  it('listSharedWithMe() appelle GET /api/tracks/shared-with-me avec page et limit', () => {
    service.listSharedWithMe(2, 10).subscribe();

    const req = httpMock.expectOne('/api/tracks/shared-with-me?page=2&limit=10');
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], page: 2, limit: 10, total: 0, pages: 1 });
  });

  it('setShares() remplace la liste des destinataires avec PUT', () => {
    service.setShares('track-1', ['bob', 'carol']).subscribe((track) => {
      expect(track.sharedWith).toEqual(['bob', 'carol']);
    });

    const req = httpMock.expectOne('/api/tracks/track-1/shares');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ userIds: ['bob', 'carol'] });
    req.flush({ id: 'track-1', sharedWith: ['bob', 'carol'] });
  });

  it('unshare() arrête le partage avec un ami via DELETE', () => {
    service.unshare('track-1', 'bob').subscribe();

    const req = httpMock.expectOne('/api/tracks/track-1/shares/bob');
    expect(req.request.method).toBe('DELETE');
    req.flush({ id: 'track-1', sharedWith: [] });
  });
});
