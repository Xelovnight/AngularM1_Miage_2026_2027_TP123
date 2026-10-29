import { Activity } from '../models/activity.model';
import { formatDate } from './track-format';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Phrase displayed after the friend's name, e.g. « a publié « Solo » ». */
export function describeActivity(activity: Activity): string {
  const title = activity.track ? `« ${activity.track.title} »` : '';
  switch (activity.type) {
    case 'track_published':
      return activity.track?.visibility === 'public'
        ? `a publié ${title} pour tout le monde`
        : `a publié ${title} pour ses amis`;
    case 'track_shared':
      return `vous a partagé ${title}`;
    case 'friend_accepted':
      return 'a accepté votre invitation, vous êtes maintenant amis';
  }
}

/** Icon shown in front of an event. */
export function activityIcon(activity: Activity): string {
  switch (activity.type) {
    case 'track_published':
      return '🎸';
    case 'track_shared':
      return '🔗';
    case 'friend_accepted':
      return '🤝';
  }
}

/** « à l'instant », « il y a 5 min », « il y a 3 h », « hier », « il y a 4 j », puis la date. */
export function relativeTime(dateStr: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(dateStr).getTime();
  if (Number.isNaN(elapsed)) return '';
  if (elapsed < MINUTE) return "à l'instant";
  if (elapsed < HOUR) return `il y a ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `il y a ${Math.floor(elapsed / HOUR)} h`;
  if (elapsed < 2 * DAY) return 'hier';
  if (elapsed < 7 * DAY) return `il y a ${Math.floor(elapsed / DAY)} j`;
  return `le ${formatDate(dateStr)}`;
}
