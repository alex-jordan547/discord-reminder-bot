/**
 * Unit tests for ReminderScheduler custom reactions functionality (Issue #48)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReminderScheduler } from '@/services/reminderScheduler';

// Mock logging
vi.mock('@/utils/loggingConfig', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('ReminderScheduler - Reaction Text Building (Issue #48)', () => {
  let reminderScheduler: ReminderScheduler;
  let mockClient: any;
  let mockEventManager: any;

  beforeEach(() => {
    mockClient = { user: { id: 'bot-id' } };
    mockEventManager = {};
    reminderScheduler = new ReminderScheduler(mockClient, mockEventManager);
  });

  describe('buildReactionInstructionText', () => {
    it('should return default text for empty reactions array', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText([]);
      expect(result).toBe('Réagissez avec ✅ (dispo), ❌ (pas dispo) ou ❓ (incertain)');
    });

    it('should handle default reactions preset', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText(['✅', '❌', '❓']);
      expect(result).toBe('Réagissez avec ✅ (dispo), ❌ (pas dispo) ou ❓ (incertain)');
    });

    it('should handle gaming preset reactions', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText(['🎮', '⏰', '❌']);
      expect(result).toBe('Réagissez avec 🎮 (partant), ⏰ (en retard) ou ❌ (absent)');
    });

    it('should handle thumbs up/down reactions', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText(['👍', '👎']);
      expect(result).toBe('Réagissez avec 👍 (j\'aime) ou 👎 (j\'aime pas)');
    });

    it('should handle like/dislike/neutral/love preset', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText(['👍', '👎', '🤷', '❤️']);
      expect(result).toBe('Réagissez avec 👍 (j\'aime), 👎 (j\'aime pas), 🤷 (indifférent) ou ❤️ (adoré)');
    });

    it('should handle traffic light system', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText(['🟢', '🔴', '🟡']);
      expect(result).toBe('Réagissez avec 🟢 (go), 🔴 (stop) ou 🟡 (attention)');
    });

    it('should handle custom reactions without preset meanings - 2 reactions', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText(['🌟', '💥']);
      expect(result).toBe('Réagissez avec 🌟 ou 💥');
    });

    it('should handle custom reactions without preset meanings - 3 reactions', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText(['🌟', '💥', '⚡']);
      expect(result).toBe('Réagissez avec 🌟, 💥 ou ⚡');
    });

    it('should handle custom reactions without preset meanings - 4+ reactions', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText(['🌟', '💥', '⚡', '🔥', '✨']);
      expect(result).toBe('Réagissez avec 🌟, 💥, ⚡, 🔥 ou ✨');
    });
  });

  describe('getReactionMeanings', () => {
    it('should return meanings for default reactions', () => {
      const result = (reminderScheduler as any).getReactionMeanings(['✅', '❌', '❓']);
      expect(result).toEqual(['dispo', 'pas dispo', 'incertain']);
    });

    it('should return meanings for gaming preset', () => {
      const result = (reminderScheduler as any).getReactionMeanings(['🎮', '⏰', '❌']);
      expect(result).toEqual(['partant', 'en retard', 'absent']);
    });

    it('should return meanings for simple yes/no', () => {
      const result = (reminderScheduler as any).getReactionMeanings(['✅', '❌']);
      expect(result).toEqual(['oui', 'non']);
    });

    it('should return meanings for thumbs up/down', () => {
      const result = (reminderScheduler as any).getReactionMeanings(['👍', '👎']);
      expect(result).toEqual(['j\'aime', 'j\'aime pas']);
    });

    it('should return null for unknown reaction combinations', () => {
      const result = (reminderScheduler as any).getReactionMeanings(['🌟', '💥', '⚡']);
      expect(result).toBeNull();
    });
  });
});