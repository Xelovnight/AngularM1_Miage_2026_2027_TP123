import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { of, throwError, Subject } from 'rxjs';
import { TracksPageComponent } from './tracks-page';
import { TrackService } from '../../shared/services/track.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { Track } from '../../shared/models/track.model';
import { Page } from '../../shared/models/page.model';

describe('TracksPageComponent', () => {
  let component: TracksPageComponent;
  let trackServiceMock: {
    list: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
    audio: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
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
});
