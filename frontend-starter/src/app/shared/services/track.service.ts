import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Page } from '../models/page.model';
import { Track, TrackMetadata, TrackSearchCriteria } from '../models/track.model';

/** Encapsulates all HTTP operations for backing tracks. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 5) {
    return this.http.get<Page<Track>>('/api/tracks', {
      params: { page, limit },
    });
  }

  /** Public tracks of every user, most recent first (Explorer page). */
  listPublic(page = 1, limit = 10) {
    return this.http.get<Page<Track>>('/api/tracks/public', {
      params: { page, limit },
    });
  }

  /** Tracks my friends make available to me (friends visibility or shared by name). */
  listSharedWithMe(page = 1, limit = 10) {
    return this.http.get<Page<Track>>('/api/tracks/shared-with-me', {
      params: { page, limit },
    });
  }

  /** Search among the tracks I can listen to. Empty criteria are not sent. */
  search(criteria: TrackSearchCriteria, page = 1, limit = 10) {
    const params: Record<string, string | number> = { page, limit };
    for (const [name, value] of Object.entries(criteria)) {
      if (value !== undefined && value !== null && value !== '') params[name] = value;
    }
    return this.http.get<Page<Track>>('/api/tracks/search', { params });
  }

  upload(file: File, metadata: TrackMetadata): Observable<HttpEvent<Track>> {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', metadata.title ?? '');
    if (metadata.visibility) body.append('visibility', metadata.visibility);
    // Multipart ne transporte que du texte : les champs vides ne sont pas envoyés.
    if (metadata.bpm != null) body.append('bpm', String(metadata.bpm));
    if (metadata.key) body.append('key', metadata.key);
    if (metadata.genre) body.append('genre', metadata.genre);
    if (metadata.tags?.length) body.append('tags', metadata.tags.join(','));
    return this.http.post<Track>('/api/tracks', body, {
      reportProgress: true,
      observe: 'events',
    });
  }

  /** Partial update of visibility and/or metadata (owner only). */
  update(id: string, changes: TrackMetadata) {
    return this.http.patch<Track>(`/api/tracks/${id}`, changes);
  }

  /** Replace the full list of friends a track is shared with (owner only). */
  setShares(id: string, userIds: string[]) {
    return this.http.put<Track>(`/api/tracks/${id}/shares`, { userIds });
  }

  /** Stop sharing a track with one friend (owner only). */
  unshare(id: string, userId: string) {
    return this.http.delete<Track>(`/api/tracks/${id}/shares/${userId}`);
  }

  audio(id: string) {
    return this.http.get(`/api/tracks/${id}/audio`, {
      responseType: 'blob',
    });
  }

  delete(id: string) {
    return this.http.delete<void>(`/api/tracks/${id}`);
  }
}
