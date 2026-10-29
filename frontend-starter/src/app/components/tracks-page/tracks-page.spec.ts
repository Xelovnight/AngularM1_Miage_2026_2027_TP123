import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { of, throwError, Subject } from 'rxjs';
import { TracksPageComponent } from './tracks-page';
import { TrackService } from '../../shared/services/track.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { FriendService } from '../../shared/services/friend.service';
import { FriendsOverview } from '../../shared/models/friend.model';
import { Track } from '../../shared/models/track.model';
import { Page } from '../../shared/models/page.model';

describe('TracksPageComponent', () => {
  let component: TracksPageComponent;
  let trackServiceMock: {
    list: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
    audio: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    setShares: ReturnType<typeof vi.fn>;
    unshare: ReturnType<typeof vi.fn>;
  };
  let friendServiceMock: {
    overview: ReturnType<typeof signal<FriendsOverview>>;
    refresh: ReturnType<typeof vi.fn>;
  };
  let snackbarMock: {
    showSuccess: ReturnType<typeof vi.fn>;
    showError: ReturnType<typeof vi.fn>;
  };

  const dummyTrack: Track = {
    id: 'track-101',
    title: 'Funk Groove',
    originalName: 'funk.mp3',
    mimeType: 'audio/mpeg',
    size: 2048,
    createdAt: '2026-10-01T00:00:00.000Z',
    visibility: 'private',
  };

  const dummyPage: Page<Track> = {
    items: [dummyTrack],
    page: 1,
    limit: 5,
    total: 1,
    pages: 1,
  };

  beforeEach(() => {
    // Polyfill window.confirm pour l'environnement de test
    window.confirm = vi.fn().mockReturnValue(true);

    trackServiceMock = {
      list: vi.fn().mockReturnValue(of(dummyPage)),
      upload: vi.fn(),
      audio: vi.fn().mockReturnValue(of(new Blob())),
      delete: vi.fn().mockReturnValue(of(undefined)),
      update: vi.fn(),
      setShares: vi.fn(),
      unshare: vi.fn(),
    };

    friendServiceMock = {
      overview: signal<FriendsOverview>({
        friends: [
          { friendshipId: 'f-1', user: { id: 'bob', name: 'Bob' }, since: null },
          { friendshipId: 'f-2', user: { id: 'carol', name: 'Carol' }, since: null },
        ],
        incoming: [],
        outgoing: [],
      }),
      refresh: vi.fn().mockReturnValue(of(undefined)),
    };

    snackbarMock = {
      showSuccess: vi.fn(),
      showError: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        TracksPageComponent,
        { provide: TrackService, useValue: trackServiceMock },
        { provide: SnackbarService, useValue: snackbarMock },
        { provide: FriendService, useValue: friendServiceMock },
      ],
    });

    component = TestBed.inject(TracksPageComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche une erreur après un échec HTTP lors du chargement de la bibliothèque', () => {
    trackServiceMock.list.mockReturnValue(
      throwError(() => ({ error: { message: 'Erreur réseau backend' } })),
    );

    component.tracks.set([]);
    component.load();

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('Erreur réseau backend');
    expect(component.tracks()).toEqual([]);
  });

  it('la suppression appelle TrackService.delete() et recharge la liste', () => {
    (window.confirm as any).mockReturnValue(true);

    component.deleteTrack(dummyTrack);

    expect(trackServiceMock.delete).toHaveBeenCalledWith(dummyTrack.id);
    expect(snackbarMock.showSuccess).toHaveBeenCalledWith(
      `Morceau « ${dummyTrack.title} » supprimé avec succès.`,
    );
    expect(trackServiceMock.list).toHaveBeenCalled();
    expect(component.deletingId()).toBeNull();
  });

  it('l’upload met à jour l’état de progression et gère le succès', () => {
    const uploadSubject = new Subject<HttpEvent<Track>>();
    trackServiceMock.upload.mockReturnValue(uploadSubject.asObservable());

    component.file = new File(['fake-audio'], 'test.mp3', {
      type: 'audio/mp3',
    });
    component.title.setValue('Titre test');

    component.upload();

    expect(component.uploadState()).toBe('uploading');
    expect(component.uploading()).toBe(true);

    // Événement de progression HTTP à 50%
    uploadSubject.next({
      type: HttpEventType.UploadProgress,
      loaded: 500,
      total: 1000,
    });

    expect(component.uploadProgress()).toBe(50);

    // Réponse finale reçue
    uploadSubject.next(
      new HttpResponse<Track>({
        status: 201,
        body: dummyTrack,
      }),
    );
    uploadSubject.complete();

    expect(component.uploadProgress()).toBe(100);
    expect(component.uploadState()).toBe('success');
    expect(component.uploading()).toBe(false);
    expect(snackbarMock.showSuccess).toHaveBeenCalled();
  });

  it('l’upload traite l’erreur et rétablit les contrôles', () => {
    trackServiceMock.upload.mockReturnValue(
      throwError(() => ({ error: { message: 'Type audio refusé' } })),
    );

    component.file = new File(['fake-audio'], 'bad.mp3', {
      type: 'audio/mp3',
    });
    component.title.setValue('Titre');

    component.upload();

    expect(component.uploadState()).toBe('error');
    expect(component.uploading()).toBe(false);
    expect(component.uploadProgress()).toBeNull();
    expect(component.uploadError()).toBe('Type audio refusé');
    expect(snackbarMock.showError).toHaveBeenCalledWith('Type audio refusé');
  });

  it('l’upload transmet la visibilité et les métadonnées musicales du formulaire', () => {
    trackServiceMock.upload.mockReturnValue(new Subject<HttpEvent<Track>>().asObservable());

    component.file = new File(['fake-audio'], 'shuffle.mp3', { type: 'audio/mpeg' });
    component.title.setValue('Shuffle en Mi');
    component.metadata.setValue({
      visibility: 'friends',
      bpm: 110,
      key: 'E',
      genre: 'Blues',
      tags: 'Shuffle, rapide',
    });

    component.upload();

    expect(trackServiceMock.upload).toHaveBeenCalledWith(component.file, {
      title: 'Shuffle en Mi',
      visibility: 'friends',
      bpm: 110,
      key: 'E',
      genre: 'Blues',
      tags: ['shuffle', 'rapide'],
    });
    expect(component.metadata.disabled).toBe(true);
  });

  it('l’upload est bloqué si le BPM du formulaire est invalide', () => {
    component.file = new File(['fake-audio'], 'a.mp3', { type: 'audio/mpeg' });
    component.metadata.controls.bpm.setValue(5);

    component.upload();

    expect(trackServiceMock.upload).not.toHaveBeenCalled();
  });

  it('updateTrack() remplace la piste modifiée dans la liste et ferme l’édition', () => {
    const updated: Track = { ...dummyTrack, visibility: 'public', bpm: 95 };
    trackServiceMock.update.mockReturnValue(of(updated));
    component.editingId.set(dummyTrack.id);
    component.currentTrack.set(dummyTrack);

    component.updateTrack(dummyTrack, { visibility: 'public', bpm: 95 });

    expect(trackServiceMock.update).toHaveBeenCalledWith(dummyTrack.id, {
      visibility: 'public',
      bpm: 95,
    });
    expect(component.tracks()).toEqual([updated]);
    expect(component.currentTrack()).toEqual(updated);
    expect(component.editingId()).toBeNull();
    expect(component.savingId()).toBeNull();
    expect(snackbarMock.showSuccess).toHaveBeenCalledWith(
      `Morceau « ${dummyTrack.title} » mis à jour.`,
    );
  });

  it('updateTrack() annonce la nouvelle visibilité quand seul ce champ change', () => {
    trackServiceMock.update.mockReturnValue(of({ ...dummyTrack, visibility: 'public' }));

    component.updateTrack(dummyTrack, { visibility: 'public' });

    expect(snackbarMock.showSuccess).toHaveBeenCalledWith(
      `« ${dummyTrack.title} » est maintenant publique.`,
    );
  });

  it('updateTrack() garde le formulaire ouvert et affiche l’erreur du backend', () => {
    trackServiceMock.update.mockReturnValue(
      throwError(() => ({ status: 400, error: { message: 'Tonalité inconnue' } })),
    );
    component.editingId.set(dummyTrack.id);

    component.updateTrack(dummyTrack, { key: 'H' });

    expect(component.editingId()).toBe(dummyTrack.id);
    expect(component.savingId()).toBeNull();
    expect(component.tracks()).toEqual([dummyTrack]);
    expect(snackbarMock.showError).toHaveBeenCalledWith('Tonalité inconnue');
  });

  it('updateTrack() recharge la liste si la piste n’existe plus (404)', () => {
    trackServiceMock.update.mockReturnValue(throwError(() => ({ status: 404 })));
    trackServiceMock.list.mockClear();

    component.updateTrack(dummyTrack, { visibility: 'public' });

    expect(trackServiceMock.list).toHaveBeenCalled();
    expect(component.editingId()).toBeNull();
  });

  describe('partage nominatif', () => {
    it('rafraîchit la liste des amis à la création et expose leurs noms', () => {
      expect(friendServiceMock.refresh).toHaveBeenCalled();
      expect(component.friends()).toEqual([
        { id: 'bob', name: 'Bob' },
        { id: 'carol', name: 'Carol' },
      ]);
    });

    it('shareTargetsOf() résout les noms et signale un ancien ami', () => {
      const track = { ...dummyTrack, sharedWith: ['carol', 'ghost'] };
      expect(component.shareTargetsOf(track)).toEqual([
        { id: 'carol', name: 'Carol' },
        { id: 'ghost', name: 'Ancien ami' },
      ]);
    });

    it('saveShares() envoie la liste, met à jour la piste et ferme la fenêtre', () => {
      const updated = { ...dummyTrack, sharedWith: ['bob', 'carol'] };
      trackServiceMock.setShares.mockReturnValue(of(updated));
      component.tracks.set([dummyTrack]);
      component.sharingTrack.set(dummyTrack);

      component.saveShares(['bob', 'carol']);

      expect(trackServiceMock.setShares).toHaveBeenCalledWith('track-101', ['bob', 'carol']);
      expect(component.tracks()[0].sharedWith).toEqual(['bob', 'carol']);
      expect(component.sharingTrack()).toBeNull();
      expect(component.savingId()).toBeNull();
      expect(snackbarMock.showSuccess).toHaveBeenCalledWith('« Funk Groove » est partagée avec 2 amis.');
    });

    it('saveShares([]) annonce l’arrêt de tous les partages', () => {
      trackServiceMock.setShares.mockReturnValue(of({ ...dummyTrack, sharedWith: [] }));
      component.sharingTrack.set({ ...dummyTrack, sharedWith: ['bob'] });

      component.saveShares([]);

      expect(snackbarMock.showSuccess).toHaveBeenCalledWith("« Funk Groove » n'est plus partagée.");
    });

    it('saveShares() garde la fenêtre ouverte et affiche l’erreur du backend', () => {
      trackServiceMock.setShares.mockReturnValue(
        throwError(() => ({ status: 400, error: { message: "Une piste ne peut être partagée qu'avec vos amis" } })),
      );
      component.sharingTrack.set(dummyTrack);

      component.saveShares(['stranger']);

      expect(component.sharingTrack()).toEqual(dummyTrack);
      expect(component.savingId()).toBeNull();
      expect(snackbarMock.showError).toHaveBeenCalledWith("Une piste ne peut être partagée qu'avec vos amis");
    });

    it('unshare() retire un ami et ignore un second clic pendant la requête', () => {
      const pending = new Subject<Track>();
      trackServiceMock.unshare.mockReturnValue(pending);
      const shared = { ...dummyTrack, sharedWith: ['bob'] };
      component.tracks.set([shared]);

      component.unshare(shared, { id: 'bob', name: 'Bob' });
      component.unshare(shared, { id: 'bob', name: 'Bob' });
      expect(trackServiceMock.unshare).toHaveBeenCalledTimes(1);

      pending.next({ ...dummyTrack, sharedWith: [] });
      expect(component.tracks()[0].sharedWith).toEqual([]);
      expect(snackbarMock.showSuccess).toHaveBeenCalledWith("« Funk Groove » n'est plus partagée avec Bob.");
    });

    it('unshare() recharge la liste si la piste ou le partage n’existe plus (404)', () => {
      trackServiceMock.unshare.mockReturnValue(throwError(() => ({ status: 404 })));
      trackServiceMock.list.mockClear();

      component.unshare(dummyTrack, { id: 'bob', name: 'Bob' });

      expect(trackServiceMock.list).toHaveBeenCalled();
      expect(snackbarMock.showError).toHaveBeenCalled();
    });
  });
});
