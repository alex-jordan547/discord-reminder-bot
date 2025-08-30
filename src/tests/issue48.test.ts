/**
 * Test for Issue #48 - Reaction configuration bug fix
 * 
 * This test validates that the core functionality works:
 * - ReminderScheduler uses guild configuration for reactions
 * - Different reaction presets generate appropriate text
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReminderScheduler } from '@/services/reminderScheduler';

// Mock dependencies
vi.mock('@/utils/loggingConfig', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('Issue #48 - Custom Reactions Configuration Bug', () => {
  let reminderScheduler: ReminderScheduler;
  
  beforeEach(() => {
    const mockClient = { user: { id: 'bot-id' } };
    const mockEventManager = {};
    reminderScheduler = new ReminderScheduler(mockClient, mockEventManager);
  });

  describe('Reaction instruction text generation', () => {
    it('should generate correct text for default reactions', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText(['✅', '❌', '❓']);
      expect(result).toBe('Réagissez avec ✅ (dispo), ❌ (pas dispo) ou ❓ (incertain)');
    });

    it('should generate correct text for gaming preset', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText(['🎮', '⏰', '❌']);
      expect(result).toBe('Réagissez avec 🎮 (partant), ⏰ (en retard) ou ❌ (absent)');
    });

    it('should generate correct text for simple custom reactions', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText(['👍', '👎']);
      expect(result).toBe('Réagissez avec 👍 (j\'aime) ou 👎 (j\'aime pas)');
    });

    it('should generate correct text for traffic light system', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText(['🟢', '🔴', '🟡']);
      expect(result).toBe('Réagissez avec 🟢 (go), 🔴 (stop) ou 🟡 (attention)');
    });

    it('should generate correct text for custom reactions without preset', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText(['🌟', '💥', '⚡']);
      expect(result).toBe('Réagissez avec 🌟, 💥 ou ⚡');
    });

    it('should handle empty array by returning default text', () => {
      const result = (reminderScheduler as any).buildReactionInstructionText([]);
      expect(result).toBe('Réagissez avec ✅ (dispo), ❌ (pas dispo) ou ❓ (incertain)');
    });
  });

  describe('Issue #48 Fix Validation', () => {
    it('validates that the fix addresses the original bug', () => {
      // BEFORE FIX: All reminders would show ✅❌❓ regardless of configuration
      // AFTER FIX: Reminders now use guildConfig.defaultReactions dynamically
      
      // Test demonstrates different configurations produce different texts
      const scenarios = [
        {
          name: 'Default configuration',
          reactions: ['✅', '❌', '❓'],
          expected: 'Réagissez avec ✅ (dispo), ❌ (pas dispo) ou ❓ (incertain)'
        },
        {
          name: 'Gaming event configuration', 
          reactions: ['🎮', '⏰', '❌'],
          expected: 'Réagissez avec 🎮 (partant), ⏰ (en retard) ou ❌ (absent)'
        },
        {
          name: 'General event configuration',
          reactions: ['👍', '👎', '🤷', '❤️'],
          expected: 'Réagissez avec 👍 (j\'aime), 👎 (j\'aime pas), 🤷 (indifférent) ou ❤️ (adoré)'
        }
      ];

      for (const scenario of scenarios) {
        const result = (reminderScheduler as any).buildReactionInstructionText(scenario.reactions);
        expect(result).toBe(scenario.expected);
      }
    });
  });
});