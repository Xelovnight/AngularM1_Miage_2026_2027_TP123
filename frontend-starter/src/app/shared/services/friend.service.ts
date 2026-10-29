import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import {
  FriendsOverview,
  FriendshipStatus,
  PublicUser,
} from '../models/friend.model';

const EMPTY_OVERVIEW: FriendsOverview = { friends: [], incoming: [], outgoing: [] };

/**
 * Encapsulates all HTTP operations of the friends network.
 * The last overview is kept in a Signal so that the navigation bar can show
 * the number of pending invitations without loading the Friends page.
 */
@Injectable({ providedIn: 'root' })
export class FriendService {
  private readonly http = inject(HttpClient);

  readonly overview = signal<FriendsOverview>(EMPTY_OVERVIEW);
  readonly incomingCount = computed(() => this.overview().incoming.length);

  /** GET /api/friends — also refreshes the shared `overview` Signal. */
  refresh() {
    return this.http
      .get<FriendsOverview>('/api/friends')
      .pipe(tap((overview) => this.overview.set(overview)));
  }

  /** Forget the cached overview (logout). */
  clear(): void {
    this.overview.set(EMPTY_OVERVIEW);
  }

  /** Users whose name contains `q`, or whose email is exactly `q`. */
  searchUsers(q: string) {
    return this.http.get<PublicUser[]>('/api/users/search', { params: { q } });
  }

  invite(userId: string) {
    return this.http.post<FriendshipStatus>('/api/friends/requests', { userId });
  }

  accept(friendshipId: string) {
    return this.http.post<FriendshipStatus>(`/api/friends/requests/${friendshipId}/accept`, {});
  }

  /** Decline a received invitation, or cancel a sent one. */
  deleteRequest(friendshipId: string) {
    return this.http.delete<void>(`/api/friends/requests/${friendshipId}`);
  }

  removeFriend(userId: string) {
    return this.http.delete<void>(`/api/friends/${userId}`);
  }
}
