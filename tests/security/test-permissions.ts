/**
 * Comprehensive tests for enhanced permissions and security system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GuildMember, Guild, PermissionFlagsBits, Role, User } from 'discord.js';
import {
  checkRateLimit,
  validateSecurityContext,
  checkPermissionSecure,
  validateMultiServerIsolation,
  getSecurityStats,
  generateSecurityReport,
  cleanupRateLimits,
  hasAdminRole,
  SecurityContext,
} from '@/utils/permissions';

// Mock Discord.js classes
vi.mock('discord.js');

// Mock Settings
vi.mock('@/config/settings', () => ({
  Settings: {
    ADMIN_ROLES: ['Admin', 'Moderator'],
  },
}));

describe('Enhanced Permissions & Security System', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clean up any existing rate limits
    cleanupRateLimits();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limits', () => {
      const userId = 'user123';
      const action = 'command_execution';

      // First few requests should be allowed
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit(userId, action);
        expect(result.allowed).toBe(true);
        expect(result.retryAfter).toBeUndefined();
        expect(result.isBlocked).toBeUndefined();
      }
    });

    it('should block requests exceeding rate limits', () => {
      const userId = 'user123';
      const action = 'command_execution';

      // Exceed rate limit (default is 10 requests per minute)
      for (let i = 0; i < 10; i++) {
        checkRateLimit(userId, action);
      }

      // Next request should be rate limited
      const result = checkRateLimit(userId, action);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.isBlocked).toBeFalsy();
    });

    it('should block users temporarily after exceeding limits', () => {
      const userId = 'user123';
      const action = 'command_execution';

      // Exceed rate limit significantly to trigger blocking
      for (let i = 0; i < 15; i++) {
        checkRateLimit(userId, action);
      }

      // Should be blocked
      const result = checkRateLimit(userId, action);
      expect(result.allowed).toBe(false);
      expect(result.isBlocked).toBeTruthy();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should reset rate limits after time window', () => {
      const userId = 'user123';
      const action = 'command_execution';

      // Exceed rate limit
      for (let i = 0; i < 10; i++) {
        checkRateLimit(userId, action);
      }

      // Should be rate limited
      let result = checkRateLimit(userId, action);
      expect(result.allowed).toBe(false);

      // Advance time past window (1 minute for command_execution)
      vi.advanceTimersByTime(65000);

      // Should be allowed again
      result = checkRateLimit(userId, action);
      expect(result.allowed).toBe(true);
    });

    it('should have different limits for different actions', () => {
      const userId = 'user123';

      // Event creation has lower limits (5 per 5 minutes)
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit(userId, 'event_creation');
        expect(result.allowed).toBe(true);
      }

      const result = checkRateLimit(userId, 'event_creation');
      expect(result.allowed).toBe(false);

      // But command execution should still work
      const commandResult = checkRateLimit(userId, 'command_execution');
      expect(commandResult.allowed).toBe(true);
    });

    it('should track rate limits per user', () => {
      const action = 'command_execution';

      // User1 exceeds limit
      for (let i = 0; i < 10; i++) {
        checkRateLimit('user1', action);
      }
      const user1Result = checkRateLimit('user1', action);
      expect(user1Result.allowed).toBe(false);

      // User2 should still be allowed
      const user2Result = checkRateLimit('user2', action);
      expect(user2Result.allowed).toBe(true);
    });
  });

  describe('Security Context Validation', () => {
    it('should allow normal activity patterns', () => {
      const context: SecurityContext = {
        userId: 'user123',
        guildId: 'guild456',
        action: 'command_execution',
        timestamp: Date.now(),
      };

      const result = validateSecurityContext(context);
      expect(result.allowed).toBe(true);
    });

    it('should detect rapid-fire requests', () => {
      const userId = 'user123';
      const now = Date.now();

      // Simulate rapid requests (more than 20 in 10 seconds)
      for (let i = 0; i < 25; i++) {
        const context: SecurityContext = {
          userId,
          guildId: 'guild456',
          action: 'command_execution',
          timestamp: now + i * 100, // 100ms apart
        };

        if (i < 20) {
          // First 20 should pass
          const result = validateSecurityContext(context);
          if (i < 19) expect(result.allowed).toBe(true);
        } else {
          // Should detect suspicious activity
          const result = validateSecurityContext(context);
          expect(result.allowed).toBe(false);
          expect(result.securityFlags).toContain('rapid_requests');
        }
      }
    });

    it('should detect regular timing patterns (automation)', () => {
      const userId = 'user123';
      const baseTime = Date.now();
      const interval = 1000; // Exactly 1 second apart

      // Simulate very regular timing (automation)
      for (let i = 0; i < 15; i++) {
        const context: SecurityContext = {
          userId,
          guildId: 'guild456',
          action: 'command_execution',
          timestamp: baseTime + i * interval,
        };

        const result = validateSecurityContext(context);
        
        if (i > 10) {
          // Should detect automation after enough samples
          expect(result.allowed).toBe(false);
          expect(result.securityFlags).toContain('regular_timing');
          break;
        }
      }
    });

    it('should allow irregular human-like patterns', () => {
      const userId = 'user123';
      const baseTime = Date.now();

      // Simulate irregular human timing
      const delays = [1200, 2300, 800, 1800, 3200, 1000, 4500, 900];

      for (let i = 0; i < delays.length; i++) {
        const timestamp = delays.slice(0, i + 1).reduce((sum, delay) => sum + delay, baseTime);
        
        const context: SecurityContext = {
          userId,
          guildId: 'guild456',
          action: 'command_execution',
          timestamp,
        };

        const result = validateSecurityContext(context);
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('Permission Validation', () => {
    let mockMember: Partial<GuildMember>;
    let mockGuild: Partial<Guild>;
    let mockRole: Partial<Role>;

    beforeEach(() => {
      mockRole = {
        name: 'Admin',
      };

      mockGuild = {
        id: 'guild123',
      };

      mockMember = {
        id: 'user123',
        guild: mockGuild as Guild,
        roles: {
          cache: {
            some: vi.fn().mockReturnValue(true), // Has admin role
          },
        } as any,
        permissions: {
          has: vi.fn().mockReturnValue(false), // No direct admin permission
        } as any,
        user: {
          tag: 'TestUser#1234',
        } as User,
      };
    });

    it('should allow admin users through permission checks', () => {
      const result = checkPermissionSecure(
        mockMember as GuildMember,
        'command_execution'
      );

      expect(result.allowed).toBe(true);
    });

    it('should block non-admin users', () => {
      // Mock no admin role and no admin permission
      mockMember.roles = {
        cache: {
          some: vi.fn().mockReturnValue(false),
        },
      } as any;
      mockMember.permissions = {
        has: vi.fn().mockReturnValue(false),
      } as any;

      const result = checkPermissionSecure(
        mockMember as GuildMember,
        'command_execution'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient permissions');
    });

    it('should combine rate limiting with permission checks', () => {
      // First exhaust rate limit
      for (let i = 0; i < 10; i++) {
        checkPermissionSecure(mockMember as GuildMember, 'command_execution');
      }

      // Should be rate limited even though user has permissions
      const result = checkPermissionSecure(
        mockMember as GuildMember,
        'command_execution'
      );

      expect(result.allowed).toBe(false);
      expect(result.rateLimited).toBe(true);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should block users with suspicious activity even if they have permissions', () => {
      // Simulate rapid requests to trigger security block
      for (let i = 0; i < 25; i++) {
        checkPermissionSecure(mockMember as GuildMember, 'command_execution');
      }

      // Should be blocked due to suspicious activity
      const result = checkPermissionSecure(
        mockMember as GuildMember,
        'command_execution'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Suspicious activity');
    });
  });

  describe('Multi-Server Isolation', () => {
    let mockMember: Partial<GuildMember>;

    beforeEach(() => {
      mockMember = {
        id: 'user123',
        guild: {
          id: 'guild123',
        } as Guild,
        user: {
          tag: 'TestUser#1234',
        } as User,
      };
    });

    it('should allow access to same guild', () => {
      const result = validateMultiServerIsolation(
        mockMember as GuildMember,
        'guild123'
      );

      expect(result.allowed).toBe(true);
    });

    it('should block cross-guild access attempts', () => {
      const result = validateMultiServerIsolation(
        mockMember as GuildMember,
        'guild456' // Different guild
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cross-guild access denied');
      expect(result.securityFlags).toContain('cross_guild_access');
    });

    it('should allow when no target guild specified', () => {
      const result = validateMultiServerIsolation(
        mockMember as GuildMember
      );

      expect(result.allowed).toBe(true);
    });
  });

  describe('Admin Role Detection', () => {
    let mockMember: Partial<GuildMember>;

    beforeEach(() => {
      mockMember = {
        roles: {
          cache: {
            some: vi.fn(),
          },
        } as any,
        permissions: {
          has: vi.fn(),
        } as any,
        user: {
          tag: 'TestUser#1234',
        } as User,
      };
    });

    it('should detect admin role from configured roles', () => {
      vi.mocked(mockMember.roles!.cache.some).mockReturnValue(true);
      vi.mocked(mockMember.permissions!.has).mockReturnValue(false);

      const result = hasAdminRole(mockMember as GuildMember);
      expect(result).toBe(true);
    });

    it('should detect Discord Administrator permission', () => {
      vi.mocked(mockMember.roles!.cache.some).mockReturnValue(false);
      vi.mocked(mockMember.permissions!.has).mockReturnValue(true);

      const result = hasAdminRole(mockMember as GuildMember);
      expect(result).toBe(true);
    });

    it('should deny users without admin role or permission', () => {
      vi.mocked(mockMember.roles!.cache.some).mockReturnValue(false);
      vi.mocked(mockMember.permissions!.has).mockReturnValue(false);

      const result = hasAdminRole(mockMember as GuildMember);
      expect(result).toBe(false);
    });

    it('should handle errors gracefully', () => {
      vi.mocked(mockMember.roles!.cache.some).mockImplementation(() => {
        throw new Error('Discord API error');
      });

      const result = hasAdminRole(mockMember as GuildMember);
      expect(result).toBe(false);
    });
  });

  describe('Security Statistics', () => {
    it('should track security statistics', () => {
      // Generate some activity
      checkRateLimit('user1', 'command_execution');
      checkRateLimit('user1', 'command_execution');
      checkRateLimit('user2', 'event_creation');

      // Exceed limits for user1
      for (let i = 0; i < 12; i++) {
        checkRateLimit('user1', 'command_execution');
      }

      const stats = getSecurityStats();

      expect(stats.rateLimitEntries).toBeGreaterThan(0);
      expect(stats.blockedUsers).toBeGreaterThanOrEqual(0);
      expect(stats.suspiciousActivities).toBeGreaterThanOrEqual(0);
    });

    it('should generate security report', () => {
      // Generate some activity
      for (let i = 0; i < 5; i++) {
        checkRateLimit(`user${i}`, 'command_execution');
      }

      const report = generateSecurityReport();

      expect(report).toContain('Security & Permissions Report');
      expect(report).toContain('Rate Limit Entries');
      expect(report).toContain('Rate Limit Configurations');
    });

    it('should track top suspicious users', () => {
      // Create suspicious activity for specific users
      const suspiciousUser = 'user123';

      // Generate rapid requests to create suspicious activity
      for (let i = 0; i < 25; i++) {
        const context: SecurityContext = {
          userId: suspiciousUser,
          guildId: 'guild456',
          action: 'command_execution',
          timestamp: Date.now() + i * 100,
        };

        validateSecurityContext(context);
      }

      const stats = getSecurityStats();
      
      expect(stats.topSuspiciousUsers.length).toBeGreaterThan(0);
      expect(stats.topSuspiciousUsers[0].userId).toBe(suspiciousUser);
      expect(stats.topSuspiciousUsers[0].activityCount).toBeGreaterThan(0);
    });
  });

  describe('Cleanup Operations', () => {
    it('should clean up old rate limit entries', () => {
      // Create some rate limit entries
      checkRateLimit('user1', 'command_execution');
      checkRateLimit('user2', 'api_access');

      // Advance time to make entries old
      vi.advanceTimersByTime(3700000); // More than 1 hour

      // Trigger cleanup
      cleanupRateLimits();

      // Statistics should reflect cleanup
      const stats = getSecurityStats();
      expect(stats.rateLimitEntries).toBe(0);
    });

    it('should clean up old suspicious activity logs', () => {
      const oldContext: SecurityContext = {
        userId: 'user123',
        guildId: 'guild456',
        action: 'command_execution',
        timestamp: Date.now() - 86500000, // More than 24 hours ago
      };

      // Generate old suspicious activity
      for (let i = 0; i < 25; i++) {
        validateSecurityContext({ ...oldContext, timestamp: oldContext.timestamp + i * 100 });
      }

      // Advance time
      vi.advanceTimersByTime(86500000);

      // Trigger cleanup
      cleanupRateLimits();

      const stats = getSecurityStats();
      expect(stats.suspiciousActivities).toBe(0);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle high-frequency legitimate requests', () => {
      const userId = 'user123';
      
      // Generate requests at the boundary of rate limits
      for (let i = 0; i < 9; i++) {
        const result = checkRateLimit(userId, 'command_execution');
        expect(result.allowed).toBe(true);
      }

      // Last allowed request
      const result = checkRateLimit(userId, 'command_execution');
      expect(result.allowed).toBe(true);

      // First blocked request
      const blockedResult = checkRateLimit(userId, 'command_execution');
      expect(blockedResult.allowed).toBe(false);
    });

    it('should handle concurrent rate limit checks safely', () => {
      const userId = 'user123';
      const results = [];

      // Simulate concurrent requests
      for (let i = 0; i < 15; i++) {
        results.push(checkRateLimit(userId, 'command_execution'));
      }

      const allowedCount = results.filter(r => r.allowed).length;
      const blockedCount = results.filter(r => !r.allowed).length;

      expect(allowedCount).toBe(10); // Rate limit is 10
      expect(blockedCount).toBe(5);
    });

    it('should handle malformed security contexts gracefully', () => {
      const malformedContext = {
        userId: '',
        action: '',
        timestamp: NaN,
      } as SecurityContext;

      expect(() => validateSecurityContext(malformedContext)).not.toThrow();
    });
  });
});