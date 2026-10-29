import { describe, it, expect } from 'vitest';
import { Activity } from '../models/activity.model';
import { Track } from '../models/track.model';
import { activityIcon, describeActivity, relativeTime } from './activity-format';

const track: Track = {
  id: 'track-1',
  title: 'Solo',
  originalName: 'solo.mp3',
  mimeType: 'audio/mpeg',
  size: 1024,
  createdAt: '2026-10-28T10:00:00.000Z',
  visibility: 'friends',
};

const activity = (type: Activity['type'], withTrack: Track | undefined = track): Activity => ({
  id: 'a-1',
  type,
  createdAt: '2026-10-28T10:00:00.000Z',
  actor: { id: 'bob', name: 'Bob' },
  track: withTrack,
});

describe('activity-format', () => {
  it('describeActivity() formule chaque type d’événement', () => {
    expect(describeActivity(activity('track_published'))).toBe('a publié « Solo » pour ses amis');
    expect(describeActivity(activity('track_published', { ...track, visibility: 'public' }))).toBe(
      'a publié « Solo » pour tout le monde',
    );
    expect(describeActivity(activity('track_shared'))).toBe('vous a partagé « Solo »');
    expect(describeActivity(activity('friend_accepted', undefined))).toContain('a accepté votre invitation');
  });

  it('activityIcon() associe une icône à chaque type', () => {
    expect(activityIcon(activity('track_published'))).toBe('🎸');
    expect(activityIcon(activity('track_shared'))).toBe('🔗');
    expect(activityIcon(activity('friend_accepted'))).toBe('🤝');
  });

  it('relativeTime() choisit l’unité selon l’ancienneté', () => {
    const now = new Date('2026-10-28T12:00:00.000Z');
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    const min = 60 * 1000;

    expect(relativeTime(ago(20 * 1000), now)).toBe("à l'instant");
    expect(relativeTime(ago(5 * min), now)).toBe('il y a 5 min');
    expect(relativeTime(ago(3 * 60 * min), now)).toBe('il y a 3 h');
    expect(relativeTime(ago(30 * 60 * min), now)).toBe('hier');
    expect(relativeTime(ago(4 * 24 * 60 * min), now)).toBe('il y a 4 j');
    expect(relativeTime(ago(30 * 24 * 60 * min), now)).toMatch(/^le /);
    expect(relativeTime('pas une date', now)).toBe('');
  });
});
