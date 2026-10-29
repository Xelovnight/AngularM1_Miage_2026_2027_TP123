import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AudioPlayerComponent } from './audio-player.component';
import { TrackService } from '../../services/track.service';
import { Track } from '../../models/track.model';

describe('AudioPlayerComponent', () => {
  let fixture: ComponentFixture<AudioPlayerComponent>;
  let element: HTMLElement;
  let trackServiceMock: { audio: ReturnType<typeof vi.fn> };
  let revoke: ReturnType<typeof vi.fn>;

  const track: Track = {
    id: 'track-1',
    title: 'Blues en La',
    originalName: 'blues-en-la.mp3',
    mimeType: 'audio/mpeg',
    size: 2048,
    createdAt: '2026-10-01T00:00:00.000Z',
  };

  function render(): void {
    fixture = TestBed.createComponent(AudioPlayerComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('track', track);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  beforeEach(() => {
    // jsdom ne fournit pas les ObjectURL
    URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/audio-1');
    revoke = vi.fn();
    URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;

    trackServiceMock = { audio: vi.fn().mockReturnValue(of(new Blob(['abc'], { type: 'audio/mpeg' }))) };
    TestBed.configureTestingModule({
      providers: [{ provide: TrackService, useValue: trackServiceMock }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('charge le flux authentifié et propose de le télécharger sous son nom d’origine', () => {
    render();

    expect(trackServiceMock.audio).toHaveBeenCalledWith('track-1');
    const link = element.querySelector<HTMLAnchorElement>('.btn-download');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('blob:http://localhost/audio-1');
    expect(link!.getAttribute('download')).toBe('blues-en-la.mp3');
    expect(element.querySelector('audio')?.getAttribute('src')).toBe('blob:http://localhost/audio-1');
  });

  it('n’affiche ni lecteur ni téléchargement si la piste est inaccessible', async () => {
    trackServiceMock.audio.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, error: new Blob(['{}']) })),
    );
    render();
    await new Promise((resolve) => setTimeout(resolve)); // lecture asynchrone du corps d'erreur
    fixture.detectChanges();

    expect(element.querySelector('.btn-download')).toBeNull();
    expect(element.querySelector('audio')).toBeNull();
    expect(element.textContent).toContain("n'existe plus ou n'est plus accessible");
  });

  it('révoque l’ObjectURL à la destruction du lecteur', () => {
    render();
    fixture.destroy();

    expect(revoke).toHaveBeenCalledWith('blob:http://localhost/audio-1');
  });
});
