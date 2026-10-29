import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShareDialogComponent } from './share-dialog.component';
import { Track } from '../../models/track.model';

describe('ShareDialogComponent', () => {
  let fixture: ComponentFixture<ShareDialogComponent>;
  let component: ShareDialogComponent;
  let element: HTMLElement;
  let saved: string[] | undefined;

  const friends = [
    { id: 'bob', name: 'Bob' },
    { id: 'carol', name: 'Carol' },
  ];

  const track: Track = {
    id: 'track-1',
    title: 'Blues en La',
    originalName: 'blues.mp3',
    mimeType: 'audio/mpeg',
    size: 2048,
    createdAt: '2026-10-01T00:00:00.000Z',
    visibility: 'private',
    sharedWith: ['bob'],
  };

  function render(inputs: Record<string, unknown> = {}): void {
    fixture.componentRef.setInput('track', track);
    fixture.componentRef.setInput('friends', friends);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  const checkboxes = () =>
    Array.from(element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
  const saveButton = () =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Enregistrer'),
    )!;

  beforeEach(() => {
    fixture = TestBed.createComponent(ShareDialogComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    saved = undefined;
    component.save.subscribe((ids) => (saved = ids));
  });

  it('pré-coche les amis avec qui la piste est déjà partagée', () => {
    render();

    expect(checkboxes().map((c) => c.checked)).toEqual([true, false]);
    // Rien n'a changé : enregistrer est inutile
    expect(saveButton().disabled).toBe(true);
  });

  it('envoie la liste complète des destinataires cochés', () => {
    render();

    checkboxes()[1].click();
    fixture.detectChanges();
    saveButton().click();

    expect(saved).toEqual(['bob', 'carol']);
  });

  it('tout décocher envoie une liste vide (arrêt de tous les partages)', () => {
    render();

    checkboxes()[0].click();
    fixture.detectChanges();
    saveButton().click();

    expect(saved).toEqual([]);
  });

  it('ignore un destinataire qui n’est plus un ami', () => {
    render({ track: { ...track, sharedWith: ['bob', 'ancien'] } });

    component.toggle('carol');
    component.submit();

    expect(saved).toEqual(['bob', 'carol']);
  });

  it('invite à ajouter des amis si la liste est vide', () => {
    render({ friends: [] });

    expect(checkboxes().length).toBe(0);
    expect(element.textContent).toContain("Vous n'avez pas encore d'ami");
  });

  it('n’émet rien pendant un enregistrement en cours', () => {
    render({ busy: true });

    component.toggle('carol');
    component.submit();

    expect(saved).toBeUndefined();
  });
});
