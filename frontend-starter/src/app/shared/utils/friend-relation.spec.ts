import { describe, it, expect } from 'vitest';
import { relationOf } from './friend-relation';
import { FriendsOverview } from '../models/friend.model';

describe('relationOf', () => {
  const overview: FriendsOverview = {
    friends: [{ friendshipId: 'f1', user: { id: 'bob', name: 'Bob' }, since: null }],
    incoming: [{ friendshipId: 'f2', user: { id: 'carol', name: 'Carol' }, createdAt: null }],
    outgoing: [{ friendshipId: 'f3', user: { id: 'dave', name: 'Dave' }, createdAt: null }],
  };

  it('distingue ami, invitation reçue, invitation envoyée et aucune relation', () => {
    expect(relationOf('bob', overview)).toBe('friend');
    expect(relationOf('carol', overview)).toBe('incoming');
    expect(relationOf('dave', overview)).toBe('outgoing');
    expect(relationOf('eve', overview)).toBe('none');
  });
});
