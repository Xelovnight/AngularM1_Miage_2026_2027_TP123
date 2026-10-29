import { FriendRelation, FriendsOverview } from '../models/friend.model';

/**
 * Relation entre l'utilisateur connecté et `userId`, d'après la vue
 * d'ensemble des amitiés : sert à choisir le bouton à afficher dans les
 * résultats de recherche (Inviter, Accepter, Invitation envoyée, Ami).
 */
export function relationOf(userId: string, overview: FriendsOverview): FriendRelation {
  if (overview.friends.some((f) => f.user.id === userId)) return 'friend';
  if (overview.incoming.some((r) => r.user.id === userId)) return 'incoming';
  if (overview.outgoing.some((r) => r.user.id === userId)) return 'outgoing';
  return 'none';
}
