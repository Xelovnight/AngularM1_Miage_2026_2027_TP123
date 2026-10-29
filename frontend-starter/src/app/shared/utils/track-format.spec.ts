import { describe, it, expect } from 'vitest';
import {
  formatFormat,
  formatSize,
  hasSearchCriteria,
  parseTags,
  sameSearchCriteria,
  toSearchCriteria,
  toTrackMetadata,
  visibilityOption,
} from './track-format';

describe('track-format', () => {
  it('parseTags() découpe, met en minuscules et retire doublons et vides', () => {
    expect(parseTags('Blues, lent , ,BLUES')).toEqual(['blues', 'lent']);
    expect(parseTags('')).toEqual([]);
  });

  it('toTrackMetadata() convertit les valeurs du formulaire pour l’API', () => {
    expect(
      toTrackMetadata({
        title: '  Solo  ',
        visibility: 'public',
        bpm: '92',
        key: 'Am',
        genre: ' Blues ',
        tags: 'shuffle, lent',
      }),
    ).toEqual({
      title: 'Solo',
      visibility: 'public',
      bpm: 92,
      key: 'Am',
      genre: 'Blues',
      tags: ['shuffle', 'lent'],
    });
  });

  it('toTrackMetadata() transforme les champs vides en null pour les effacer', () => {
    expect(toTrackMetadata({ bpm: '', key: '', genre: '  ', tags: '' })).toEqual({
      bpm: null,
      key: null,
      genre: null,
      tags: [],
    });
    expect(toTrackMetadata({ bpm: null })).toEqual({ bpm: null });
  });

  it('visibilityOption() renvoie le libellé, privé par défaut', () => {
    expect(visibilityOption('public').label).toBe('Public');
    expect(visibilityOption('friends').label).toBe('Amis');
    expect(visibilityOption(undefined).label).toBe('Privé');
  });

  it('formatSize() et formatFormat() restent lisibles', () => {
    expect(formatSize(0)).toBe('0 Ko');
    expect(formatSize(2048)).toBe('2 Ko');
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 Mo');
    expect(formatFormat('audio/mpeg', 'a.mp3')).toBe('MP3');
    expect(formatFormat('audio/x-wav', 'a.wav')).toBe('WAV');
  });

  it('toSearchCriteria() retire les champs vides et le périmètre par défaut', () => {
    expect(
      toSearchCriteria({ q: '  ', scope: 'all', genre: '', key: null, bpmMin: null, bpmMax: '' }),
    ).toEqual({});
    expect(
      toSearchCriteria({
        q: ' Blues ',
        scope: 'mine',
        genre: ' Funk ',
        key: 'E',
        bpmMin: '90',
        bpmMax: 120,
      }),
    ).toEqual({ q: 'Blues', scope: 'mine', genre: 'Funk', key: 'E', bpmMin: 90, bpmMax: 120 });
  });

  it('hasSearchCriteria() et sameSearchCriteria()', () => {
    expect(hasSearchCriteria({})).toBe(false);
    expect(hasSearchCriteria({ key: 'Am' })).toBe(true);
    expect(sameSearchCriteria({ q: 'a', bpmMin: 80 }, { bpmMin: 80, q: 'a' })).toBe(true);
    expect(sameSearchCriteria({ q: 'a' }, { q: 'a', key: 'E' })).toBe(false);
  });
});
