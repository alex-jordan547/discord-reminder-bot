vi.mock('#/models/GuildConfig', () => ({
  GuildConfig: {
    findByGuildId: vi.fn(),
  },
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MessageReaction, User } from 'discord.js';
import { ReactionTracker } from '#/services/reactionTracker';
import { GuildConfig } from '#/models/GuildConfig';

// Mocks
const mockEventManager = {
  getEvent: vi.fn(),
  updateUserReactions: vi.fn(),
};

const makeReaction = (emojiName: string, messageId = 'msg1'): MessageReaction =>
  ({
    emoji: { name: emojiName },
    message: { id: messageId },
  }) as unknown as MessageReaction;

const makeUser = (id: string, tag = 'user'): User => ({ id, tag }) as unknown as User;

describe('ReactionTracker - Filtrage des réactions valides', () => {
  let tracker: ReactionTracker;
  const defaultEvent = { usersWhoReacted: [], guildId: 'guild1' };

  beforeEach(() => {
    mockEventManager.getEvent.mockReset();
    mockEventManager.updateUserReactions.mockReset();
    mockEventManager.updateUserReactions.mockResolvedValue(true);
    (GuildConfig.findByGuildId as any).mockReset();
    tracker = new ReactionTracker(mockEventManager as any);
  });

  it('ignore les réactions non valides (❓)', async () => {
    mockEventManager.getEvent.mockResolvedValueOnce(defaultEvent);
    vi.spyOn(ReactionTracker.prototype as any, 'getValidReactionsForEvent').mockResolvedValueOnce([
      '✅',
      '❌',
    ]);

    await tracker.handleReactionAdd(makeReaction('❓'), makeUser('u1'));

    expect(mockEventManager.updateUserReactions).not.toHaveBeenCalled();

    // restore spy
    (ReactionTracker.prototype as any).getValidReactionsForEvent.mockRestore?.();
  });

  it('accepte les réactions valides (✅, ❌)', async () => {
    mockEventManager.getEvent.mockResolvedValueOnce(defaultEvent);
    vi.spyOn(ReactionTracker.prototype as any, 'getValidReactionsForEvent').mockResolvedValue([
      '✅',
      '❌',
    ]);

    await tracker.handleReactionAdd(makeReaction('✅'), makeUser('u2'));
    await tracker.handleReactionAdd(makeReaction('❌'), makeUser('u3'));

    expect(mockEventManager.updateUserReactions).toHaveBeenCalled();

    // restore spy
    (ReactionTracker.prototype as any).getValidReactionsForEvent.mockRestore?.();
  });
});
