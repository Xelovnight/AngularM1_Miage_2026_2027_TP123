/** Another user as exposed by the friends API: never their email. */
export interface PublicUser {
  id: string;
  name: string;
}

/** A confirmed friend. */
export interface Friend {
  friendshipId: string;
  user: PublicUser;
  since: string | null;
}

/** A pending invitation, received or sent. */
export interface FriendRequest {
  friendshipId: string;
  user: PublicUser;
  createdAt: string | null;
}

/** Response of GET /api/friends. */
export interface FriendsOverview {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

/** Response of POST /api/friends/requests and .../accept. */
export interface FriendshipStatus {
  friendshipId: string;
  status: 'pending' | 'accepted';
}

/** Relation between the current user and another user. */
export type FriendRelation = 'friend' | 'incoming' | 'outgoing' | 'none';
