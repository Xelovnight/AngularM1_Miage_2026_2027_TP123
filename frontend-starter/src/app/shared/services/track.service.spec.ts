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

  it('upload() envoie un FormData multipart et active reportProgress', () => {
    const blob = new Blob(['dummy audio content'], { type: 'audio/mp3' });
    const file = new File([blob], 'rock.mp3', { type: 'audio/mp3' });
    const title = 'Rock Solo in A';

    service.upload(file, title).subscribe();

    const req = httpMock.expectOne('/api/tracks');
    expect(req.request.method).toBe('POST');
    expect(req.request.reportProgress).toBe(true);
    expect(req.request.body instanceof FormData).toBe(true);

    const formData = req.request.body as FormData;
    expect(formData.get('title')).toBe(title);
    expect(formData.get('audio')).toBeDefined();

    req.flush({
      id: 'track-789',
      title,
      originalName: 'rock.mp3',
      mimeType: 'audio/mp3',
      size: 100,
      createdAt: new Date().toISOString(),
    });
  });
});
