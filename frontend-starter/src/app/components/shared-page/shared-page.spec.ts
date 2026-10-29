import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { SharedPageComponent } from './shared-page';
import { TrackService } from '../../shared/services/track.service';
import { Track } from '../../shared/models/track.model';
import { Page } from '../../shared/models/page.model';

describe('SharedPageComponent', () => {
  let trackServiceMock: { listSharedWithMe: ReturnType<typeof vi.fn> };

  const sharedTrack: Track = {
    id: 'track-1',
    ownerId: 'bob',
    ownerName: 'Bob',
    title: 'Funk en Mi',
    originalName: 'funk.mp3',
    mimeType: 'audio/mpeg',
    size: 2048,
    createdAt: '2026-10-01T00:00:00.000Z',
    visibility: 'private',
    sharedWithMe: true,
  };

  const page = (items: Track[], pageNumber = 1, pages = 1): Page<Track> => ({
    items,
    page: pageNumber,
    limit: 10,
    total: items.length,
    pages,
  });

  function create(): SharedPageComponent {
    TestBed.configureTestingModule({
      providers: [SharedPageComponent, { provide: TrackService, useValue: trackServiceMock }],
    });
    return TestBed.inject(SharedPageComponent);
  }

  beforeEach(() => {
    trackServiceMock = { listSharedWithMe: vi.fn().mockReturnValue(of(page([sharedTrack]))) };
  });

  it('charge les pistes partagées avec moi dès la création', () => {
    const component = create();

    expect(trackServiceMock.listSharedWithMe).toHaveBeenCalledWith(1, 10);
    expect(component.tracks()).toEqual([sharedTrack]);
    expect(component.total()).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('affiche le message du backend en cas d’erreur', () => {
    trackServiceMock.listSharedWithMe.mockReturnValue(
      throwError(() => ({ error: { message: 'Erreur serveur' } })),
    );
    const component = create();

    expect(component.error()).toBe('Erreur serveur');
    expect(component.loading()).toBe(false);
  });

  it('pagine et ignore une page hors limites', () => {
    trackServiceMock.listSharedWithMe.mockReturnValue(of(page([sharedTrack], 1, 2)));
    const component = create();

    component.go(2);
    expect(trackServiceMock.listSharedWithMe).toHaveBeenLastCalledWith(2, 10);

    component.go(3);
    component.go(0);
    expect(trackServiceMock.listSharedWithMe).toHaveBeenCalledTimes(2);
  });

  it('annule la requête précédente lors d’un nouveau chargement', () => {
    const slow = new Subject<Page<Track>>();
    trackServiceMock.listSharedWithMe.mockReturnValueOnce(slow);
    const component = create();

    component.load();
    expect(slow.observed).toBe(false);
    expect(component.tracks()).toEqual([sharedTrack]);
  });

  it('play() choisit la piste du lecteur', () => {
    const component = create();
    component.play(sharedTrack);
    expect(component.currentTrack()).toBe(sharedTrack);
  });
});
