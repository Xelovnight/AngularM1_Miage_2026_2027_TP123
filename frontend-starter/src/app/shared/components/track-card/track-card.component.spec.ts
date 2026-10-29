import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrackCardComponent } from './track-card.component';
import { Track, TrackMetadata } from '../../models/track.model';

describe('TrackCardComponent', () => {
  let fixture: ComponentFixture<TrackCardComponent>;
  let element: HTMLElement;

  const track: Track = {
    id: 'track-1',
    ownerId: 'user-1',
    ownerName: 'Alice',
    title: 'Blues en La',
    originalName: 'blues.mp3',
    mimeType: 'audio/mpeg',
    size: 2048,
    createdAt: '2026-10-01T00:00:00.000Z',
    visibility: 'public',
    bpm: 92,
    key: 'Am',
    genre: 'Blues',
    tags: ['shuffle', 'lent'],
  };

  function render(inputs: Record<string, unknown> = {}): void {
    fixture.componentRef.setInput('track', track);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(TrackCardComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('affiche les métadonnées musicales, le badge de visibilité et le propriétaire', () => {
    render({ showOwner: true });

    const text = element.textContent ?? '';
    expect(text).toContain('92 BPM');
    expect(text).toContain('Am');
    expect(text).toContain('Blues');
    expect(text).toContain('#shuffle');
    expect(text).toContain('Alice');
    expect(element.querySelector('.badge-visibility')?.textContent).toContain('Public');
  });

  it('propose le partage uniquement pour une piste privée du propriétaire', () => {
    render({ owned: true, track: { ...track, visibility: 'private' } });
    expect(element.querySelector('.btn-share')).not.toBeNull();

    render({ owned: true, track: { ...track, visibility: 'friends' } });
    expect(element.querySelector('.btn-share')).toBeNull();

    render({ owned: false, track: { ...track, visibility: 'private' } });
    expect(element.querySelector('.btn-share')).toBeNull();
  });

  it('liste les destinataires et émet unshare au clic sur ✕', () => {
    const bob = { id: 'bob', name: 'Bob' };
    render({ owned: true, shareTargets: [bob, { id: 'carol', name: 'Carol' }] });

    const chips = element.querySelectorAll('.share-chip');
    expect(chips.length).toBe(2);
    expect(chips[0].textContent).toContain('Bob');

    let removed: unknown;
    fixture.componentInstance.unshare.subscribe((friend) => (removed = friend));
    (chips[0].querySelector('.share-remove') as HTMLButtonElement).click();
    expect(removed).toEqual(bob);
  });

  it('affiche « Partagée avec vous » au destinataire d’un partage', () => {
    render({ owned: false, track: { ...track, visibility: 'private', sharedWithMe: true } });
    expect(element.querySelector('.badge-shared')?.textContent).toContain('Partagée avec vous');

    render({ owned: false, track: { ...track, sharedWithMe: false } });
    expect(element.querySelector('.badge-shared')).toBeNull();
  });

  it('masque les commandes de modification si la piste n’appartient pas à l’utilisateur', () => {
    render({ owned: false });

    expect(element.querySelector('.visibility-select')).toBeNull();
    expect(element.querySelector('.btn-edit')).toBeNull();
    expect(element.querySelector('.btn-delete')).toBeNull();
    expect(element.querySelector('.btn-play')).not.toBeNull();
  });

  it('émet save({ visibility }) quand le propriétaire change la visibilité', () => {
    render({ owned: true });
    const emitted: TrackMetadata[] = [];
    fixture.componentInstance.save.subscribe((changes) => emitted.push(changes));

    const select = element.querySelector('.visibility-select') as HTMLSelectElement;
    select.value = 'friends';
    select.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([{ visibility: 'friends' }]);
  });

  it('n’émet rien si la visibilité choisie est déjà la visibilité actuelle', () => {
    render({ owned: true });
    const emitted: TrackMetadata[] = [];
    fixture.componentInstance.save.subscribe((changes) => emitted.push(changes));

    const select = element.querySelector('.visibility-select') as HTMLSelectElement;
    select.value = 'public';
    select.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([]);
  });

  it('pré-remplit le formulaire d’édition et émet les métadonnées converties', () => {
    render({ owned: true, editing: true });
    const card = fixture.componentInstance;
    expect(card.form.getRawValue()).toEqual({
      title: 'Blues en La',
      bpm: 92,
      key: 'Am',
      genre: 'Blues',
      tags: 'shuffle, lent',
    });

    const emitted: TrackMetadata[] = [];
    card.save.subscribe((changes) => emitted.push(changes));
    card.form.patchValue({ bpm: 100, tags: 'Funk, funk' });
    card.submit();

    expect(emitted).toEqual([
      { title: 'Blues en La', bpm: 100, key: 'Am', genre: 'Blues', tags: ['funk'] },
    ]);
  });

  it('bloque l’enregistrement avec un BPM hors bornes', () => {
    render({ owned: true, editing: true });
    const card = fixture.componentInstance;
    const emitted: TrackMetadata[] = [];
    card.save.subscribe((changes) => emitted.push(changes));

    card.form.patchValue({ bpm: 500 });
    fixture.detectChanges();
    card.submit();

    expect(emitted).toEqual([]);
    expect(element.textContent).toContain('Le BPM doit être compris entre 20 et 300.');
  });

  it('les tags cliquables émettent tagClick, les autres restent du texte', () => {
    render();
    expect(element.querySelector('.chip-button')).toBeNull();

    render({ clickableTags: true });
    const clicked: string[] = [];
    fixture.componentInstance.tagClick.subscribe((tag) => clicked.push(tag));
    (element.querySelector('.chip-button') as HTMLButtonElement).click();

    expect(clicked).toEqual(['shuffle']);
  });
});
