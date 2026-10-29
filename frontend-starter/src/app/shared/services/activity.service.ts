import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivityFeed } from '../models/activity.model';

/** Reads the friends' activity feed, page after page (cursor `before`). */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly http = inject(HttpClient);

  /** GET /api/activity — omit `before` for the most recent events. */
  feed(before?: string | null, limit = 10) {
    const params: Record<string, string | number> = { limit };
    if (before) params['before'] = before;
    return this.http.get<ActivityFeed>('/api/activity', { params });
  }
}
