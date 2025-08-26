/**
 * Unit tests for Guild model
 * 
 * Comprehensive tests for Guild class functionality, validation,
 * serialization, and settings management.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Guild, type GuildData } from '../../src/models/Guild.js';

describe('Guild Model', () => {
  let testGuildData: GuildData;

  beforeEach(() => {
    testGuildData = {
      guildId: '123456789012345678',
      name: 'Test Guild',
      settings: {
        reminderChannel: 'reminders',
        adminRoles: ['Admin', 'Moderator'],
        enableNotifications: true,
        maxEventsPerUser: 10,
      },
      createdAt: new Date('2024-01-01T10:00:00Z'),
      updatedAt: new Date('2024-01-01T11:00:00Z'),
    };
  });

  describe('Constructor and Basic Properties', () => {
    test('should create Guild with valid data', () => {
      const guild = new Guild(testGuildData);

      expect(guild.guildId).toBe(testGuildData.guildId);
      expect(guild.name).toBe(testGuildData.name);
      expect(guild.settings).toEqual(testGuildData.settings);
      expect(guild.createdAt).toEqual(testGuildData.createdAt);
      expect(guild.updatedAt).toEqual(testGuildData.updatedAt);
    });

    test('should handle empty settings', () => {
      const dataWithEmptySettings = { ...testGuildData, settings: {} };
      const guild = new Guild(dataWithEmptySettings);

      expect(guild.settings).toEqual({});
    });

    test('should handle undefined settings', () => {
      const dataWithoutSettings = { ...testGuildData };
      delete (dataWithoutSettings as any).settings;

      const guild = new Guild(dataWithoutSettings);
      expect(guild.settings).toEqual({});
    });
  });

  describe('fromDict Static Method', () => {
    test('should create Guild from Python-style dictionary', () => {
      const pythonDict = {
        guild_id: '123456789012345678',
        name: 'Test Guild',
        settings: JSON.stringify({
          reminderChannel: 'reminders',
          adminRoles: ['Admin', 'Moderator'],
        }),
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T11:00:00Z',
      };

      const guild = Guild.fromDict(pythonDict);

      expect(guild.guildId).toBe('123456789012345678');
      expect(guild.name).toBe('Test Guild');
      expect(guild.settings).toEqual({
        reminderChannel: 'reminders',
        adminRoles: ['Admin', 'Moderator'],
      });
    });

    test('should handle TypeScript-style properties', () => {
      const tsDict = {
        guildId: '123456789012345678',
        name: 'Test Guild',
        settings: { enableNotifications: true },
        createdAt: '2024-01-01T10:00:00Z',
        updatedAt: '2024-01-01T11:00:00Z',
      };

      const guild = Guild.fromDict(tsDict);

      expect(guild.guildId).toBe('123456789012345678');
      expect(guild.settings).toEqual({ enableNotifications: true });
    });

    test('should handle invalid JSON settings gracefully', () => {
      const dictWithInvalidJson = {
        guild_id: '123456789012345678',
        name: 'Test Guild',
        settings: 'invalid json {',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T11:00:00Z',
      };

      const guild = Guild.fromDict(dictWithInvalidJson);

      expect(guild.guildId).toBe('123456789012345678');
      expect(guild.settings).toEqual({});
    });

    test('should apply defaults for missing properties', () => {
      const minimalDict = {
        guild_id: '123456789012345678',
        name: 'Minimal Guild',
      };

      const guild = Guild.fromDict(minimalDict);

      expect(guild.guildId).toBe('123456789012345678');
      expect(guild.name).toBe('Minimal Guild');
      expect(guild.settings).toEqual({});
      expect(guild.createdAt).toBeInstanceOf(Date);
      expect(guild.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Serialization Methods', () => {
    test('toDict should return Python-style dictionary', () => {
      const guild = new Guild(testGuildData);
      const dict = guild.toDict();

      expect(dict).toMatchObject({
        guild_id: testGuildData.guildId,
        name: testGuildData.name,
      });

      expect(dict.settings).toBe(JSON.stringify(testGuildData.settings));
      expect(dict.created_at).toBe(testGuildData.createdAt.toISOString());
      expect(dict.updated_at).toBe(testGuildData.updatedAt.toISOString());
    });

    test('toJSON should return TypeScript-style object', () => {
      const guild = new Guild(testGuildData);
      const json = guild.toJSON();

      expect(json).toMatchObject({
        guildId: testGuildData.guildId,
        name: testGuildData.name,
        settings: testGuildData.settings,
        createdAt: testGuildData.createdAt,
        updatedAt: testGuildData.updatedAt,
      });

      // Ensure settings is a deep copy
      expect(json.settings).not.toBe(testGuildData.settings);
      expect(json.settings).toEqual(testGuildData.settings);
    });
  });

  describe('Settings Management', () => {
    test('should get setting with default value', () => {
      const guild = new Guild(testGuildData);

      expect(guild.getSetting('reminderChannel')).toBe('reminders');
      expect(guild.getSetting('nonExistentSetting')).toBeUndefined();
      expect(guild.getSetting('nonExistentSetting', 'defaultValue')).toBe('defaultValue');
    });

    test('should set individual setting', () => {
      const guild = new Guild(testGuildData);
      const originalUpdatedAt = guild.updatedAt;

      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        guild.setSetting('newSetting', 'newValue');

        expect(guild.getSetting('newSetting')).toBe('newValue');
        expect(guild.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      }, 10);
    });

    test('should remove setting', () => {
      const guild = new Guild(testGuildData);
      
      expect(guild.getSetting('reminderChannel')).toBe('reminders');
      
      const removed = guild.removeSetting('reminderChannel');
      expect(removed).toBe(true);
      expect(guild.getSetting('reminderChannel')).toBeUndefined();

      const removedAgain = guild.removeSetting('reminderChannel');
      expect(removedAgain).toBe(false);
    });

    test('should update multiple settings at once', () => {
      const guild = new Guild(testGuildData);
      const originalUpdatedAt = guild.updatedAt;

      const newSettings = {
        reminderChannel: 'new-reminders',
        newSetting: 'newValue',
      };

      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        guild.updateSettings(newSettings);

        expect(guild.getSetting('reminderChannel')).toBe('new-reminders');
        expect(guild.getSetting('newSetting')).toBe('newValue');
        expect(guild.getSetting('adminRoles')).toEqual(['Admin', 'Moderator']); // Should preserve existing
        expect(guild.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      }, 10);
    });

    test('should clear all settings', () => {
      const guild = new Guild(testGuildData);
      const originalUpdatedAt = guild.updatedAt;

      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        guild.clearSettings();

        expect(guild.settings).toEqual({});
        expect(guild.getSetting('reminderChannel')).toBeUndefined();
        expect(guild.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      }, 10);
    });
  });

  describe('Validation', () => {
    test('should validate valid guild data', () => {
      const guild = new Guild(testGuildData);
      const errors = guild.validate();

      expect(errors).toEqual([]);
    });

    test('should detect invalid Discord ID', () => {
      const invalidData = {
        ...testGuildData,
        guildId: 'invalid_id',
      };

      const guild = new Guild(invalidData);
      const errors = guild.validate();

      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('guildId');
      expect(errors[0].message).toContain('Discord ID');
    });

    test('should detect empty name', () => {
      const invalidData = { ...testGuildData, name: '' };
      const guild = new Guild(invalidData);
      const errors = guild.validate();

      expect(errors.some(e => e.field === 'name' && e.message.includes('empty'))).toBe(true);
    });

    test('should detect name too long', () => {
      const invalidData = { ...testGuildData, name: 'a'.repeat(101) };
      const guild = new Guild(invalidData);
      const errors = guild.validate();

      expect(errors.some(e => e.field === 'name' && e.message.includes('100 characters'))).toBe(true);
    });

    test('should detect unserializable settings', () => {
      const guild = new Guild(testGuildData);
      // Create circular reference
      const circularSettings: any = { test: 'value' };
      circularSettings.self = circularSettings;
      guild.settings = circularSettings;

      const errors = guild.validate();

      expect(errors.some(e => e.field === 'settings' && e.message.includes('serializable'))).toBe(true);
    });

    test('fullClean should throw on validation errors', () => {
      const invalidData = { ...testGuildData, name: '' };
      const guild = new Guild(invalidData);

      expect(() => guild.fullClean()).toThrow('Validation failed');
    });

    test('fullClean should not throw on valid data', () => {
      const guild = new Guild(testGuildData);

      expect(() => guild.fullClean()).not.toThrow();
    });
  });

  describe('String Representation', () => {
    test('should provide meaningful string representation', () => {
      const guild = new Guild(testGuildData);
      const str = guild.toString();

      expect(str).toBe(`Guild(${testGuildData.guildId}, "${testGuildData.name}")`);
    });
  });

  describe('Settings Persistence and Isolation', () => {
    test('should maintain settings independence between instances', () => {
      const guild1 = new Guild(testGuildData);
      const guild2 = new Guild({ ...testGuildData, guildId: '999999999999999999' });

      guild1.setSetting('test', 'value1');
      guild2.setSetting('test', 'value2');

      expect(guild1.getSetting('test')).toBe('value1');
      expect(guild2.getSetting('test')).toBe('value2');
    });

    test('should handle complex nested settings', () => {
      const complexSettings = {
        notifications: {
          channels: ['general', 'reminders'],
          users: {
            admins: ['123456789', '987654321'],
            moderators: ['555666777'],
          },
        },
        limits: {
          maxEvents: 50,
          reminderInterval: {
            min: 5,
            max: 10080,
          },
        },
      };

      const guild = new Guild({ ...testGuildData, settings: complexSettings });

      expect(guild.getSetting('notifications')).toEqual(complexSettings.notifications);
      expect(guild.getSetting('limits')).toEqual(complexSettings.limits);

      // Test serialization with complex settings
      const dict = guild.toDict();
      const json = guild.toJSON();

      expect(JSON.parse(dict.settings)).toEqual(complexSettings);
      expect(json.settings).toEqual(complexSettings);
    });

    test('should handle settings with various data types', () => {
      const mixedSettings = {
        stringValue: 'test',
        numberValue: 42,
        booleanValue: true,
        arrayValue: [1, 2, 3],
        objectValue: { nested: 'value' },
        nullValue: null,
      };

      const guild = new Guild({ ...testGuildData, settings: mixedSettings });

      expect(guild.getSetting('stringValue')).toBe('test');
      expect(guild.getSetting('numberValue')).toBe(42);
      expect(guild.getSetting('booleanValue')).toBe(true);
      expect(guild.getSetting('arrayValue')).toEqual([1, 2, 3]);
      expect(guild.getSetting('objectValue')).toEqual({ nested: 'value' });
      expect(guild.getSetting('nullValue')).toBeNull();
    });
  });

  describe('Timestamp Management', () => {
    test('should update timestamp when settings change', () => {
      const guild = new Guild(testGuildData);
      const originalUpdatedAt = guild.updatedAt;

      // Ensure some time passes
      setTimeout(() => {
        guild.setSetting('newSetting', 'value');
        expect(guild.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());

        const afterFirstUpdate = guild.updatedAt;

        setTimeout(() => {
          guild.removeSetting('newSetting');
          expect(guild.updatedAt.getTime()).toBeGreaterThan(afterFirstUpdate.getTime());
        }, 10);
      }, 10);
    });

    test('should not update timestamp for non-existent setting removal', () => {
      const guild = new Guild(testGuildData);
      const originalUpdatedAt = guild.updatedAt;

      guild.removeSetting('nonExistentSetting');
      expect(guild.updatedAt).toEqual(originalUpdatedAt);
    });
  });
});