import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { ExplorePageComponent, SEARCH_DEBOUNCE_MS } from './explore-page';
import { TrackService } from '../../shared/services/track.service';
import { AuthService } from '../../shared/services/auth.service';
import { Track } from '../../shared/models/track.model';
import { User } from '../../shared/models/user.model';
import { Page } from '../../shared/models/page.model';

describe('ExplorePageComponent', () => {
  let component: ExplorePageComponent;
  let trackServiceMock: {
    listPublic: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
  };
  const currentUser = signal<User | null>({
    id: 'me',
    name: 'Moi',
    email: 'moi@example.com',
    createdAt: '2026-10-01',
  });

  const publicTrack: Track = {
    id: 'track-1',
    ownerId: 'alice',
    ownerName: 'Alice',
    title: 'Funk en Mi',
    originalName: 'funk.mp3',
    mimeType: 'audio/mpeg',
    size: 1024,
    createdAt: '2026-10-02T00:00:00.000Z',
    visibility: 'public',
  };

  beforeEach(() => {
    trackServiceMock = {
      listPublic: vi
        .fn()
        .mockReturnValue(of({ items: [publicTrack], page: 1, limit: 10, total: 11, pages: 2 })),
      search: vi
        .fn()
        .mockReturnValue(of({ items: [publicTrack], page: 1, limit: 10, total: 1, pages: 1 })),
    };

    TestBed.configureTestingModule({
      providers: [
        ExplorePageComponent,
        { provide: TrackService, useValue: trackServiceMock },
        { provide: AuthService, useValue: { currentUser } },
      ],
    });

    component = TestBed.inject(ExplorePageComponent);
  });

  it('charge la première page des pistes publiques au démarrage', () => {
    expect(trackServiceMock.listPublic).toHaveBeenCalledWith(1, 10);
    expect(component.tracks()).toEqual([publicTrack]);
    expect(component.total()).toBe(11);
    expect(component.pages()).toBe(2);
    expect(component.loading()).toBe(false);
  });

  it('go() charge la page demandée et ignore les pages hors bornes', () => {
    component.go(2);
    expect(trackServiceMock.listPublic).toHaveBeenLastCalledWith(2, 10);

    trackServiceMock.listPublic.mockClear();
    component.go(3);
    component.go(0);
    expect(trackServiceMock.listPublic).not.toHaveBeenCalled();
  });

  it('affiche le message d’erreur du backend', () => {
    trackServiceMock.listPublic.mockReturnValue(
      throwError(() => ({ error: { message: 'Serveur indisponible' } })),
    );

    component.load();

    expect(component.error()).toBe('Serveur indisponible');
    expect(component.loading()).toBe(false);
  });

  it('isMine() reconnaît les pistes de l’utilisateur connecté', () => {
    expect(component.isMine(publicTrack)).toBe(false);
    expect(component.isMine({ ...publicTrack, ownerId: 'me' })).toBe(true);
  });

  it('play() sélectionne la piste pour le lecteur', () => {
    component.play(publicTrack);
    expect(component.currentTrack()).toEqual(publicTrack);
  });

  describe('recherche', () => {
    afterEach(() => vi.useRealTimers());

    it('applySearch() appelle search() avec les critères nettoyés, en page 1', () => {
      component.go(2);
      component.searchForm.patchValue({ q: '  blues ', key: 'Am', bpmMin: 80, bpmMax: 120 });

      component.applySearch();

      expect(trackServiceMock.search).toHaveBeenCalledWith(
        { q: 'blues', key: 'Am', bpmMin: 80, bpmMax: 120 },
        1,
        10,
      );
      expect(component.page()).toBe(1);
      expect(component.searching()).toBe(true);
    });

    it('ne relance pas une recherche identique', () => {
      component.searchForm.patchValue({ q: 'funk' });
      component.applySearch();
      component.applySearch();

      expect(trackServiceMock.search).toHaveBeenCalledTimes(1);
    });

    it('ignore un formulaire invalide (BPM min > BPM max)', () => {
      component.searchForm.patchValue({ bpmMin: 150, bpmMax: 100 });

      component.applySearch();

      expect(component.searchForm.hasError('bpmRange')).toBe(true);
      expect(trackServiceMock.search).not.toHaveBeenCalled();
    });

    it('lance la recherche automatiquement après la pause de saisie', () => {
      vi.useFakeTimers();
      // Le composant doit être créé après l'activation des faux timers
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          ExplorePageComponent,
          { provide: TrackService, useValue: trackServiceMock },
          { provide: AuthService, useValue: { currentUser } },
        ],
      });
      const page = TestBed.inject(ExplorePageComponent);

      page.searchForm.controls.q.setValue('sh');
      page.searchForm.controls.q.setValue('shuffle');
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
      expect(trackServiceMock.search).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(trackServiceMock.search).toHaveBeenCalledTimes(1);
      expect(trackServiceMock.search).toHaveBeenCalledWith({ q: 'shuffle' }, 1, 10);
    });

    it('searchTag() recherche le tag cliqué', () => {
      component.searchTag('groove');

      expect(component.searchForm.controls.q.value).toBe('groove');
      expect(trackServiceMock.search).toHaveBeenCalledWith({ q: 'groove' }, 1, 10);
    });

    it('resetSearch() revient aux pistes publiques récentes', () => {
      component.searchTag('groove');
      trackServiceMock.listPublic.mockClear();

      component.resetSearch();

      expect(component.searching()).toBe(false);
      expect(trackServiceMock.listPublic).toHaveBeenCalledWith(1, 10);
    });

    it('le périmètre « Mes pistes » seul suffit à lancer une recherche', () => {
      component.searchForm.patchValue({ scope: 'mine' });
      component.applySearch();

      expect(trackServiceMock.search).toHaveBeenCalledWith({ scope: 'mine' }, 1, 10);
    });

    it('une nouvelle recherche annule la requête précédente encore en cours', () => {
      const first = new Subject<Page<Track>>();
      trackServiceMock.search.mockReturnValueOnce(first.asObservable());
      component.searchTag('lent');
      expect(first.observed).toBe(true);

      component.searchTag('rapide');

      expect(first.observed).toBe(false);
    });
  });
});
