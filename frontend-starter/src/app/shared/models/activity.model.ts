import { PublicUser } from './friend.model';
import { Track } from './track.model';

/** Kinds of events in the friends' activity feed. */
export type ActivityType = 'track_published' | 'track_shared' | 'friend_accepted';

/** One event of GET /api/activity. */
export interface Activity {
  id: string;
  type: ActivityType;
  createdAt: string;
  actor: PublicUser;
  /** Present for track_published and track_shared. */
  track?: Track;
}

/** Response of GET /api/activity: `nextBefore` is the cursor of the next page, or null at the end. */
export interface ActivityFeed {
  items: Activity[];
  nextBefore: string | null;
}
