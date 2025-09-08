/**
 * Mock complet de SqliteStorage pour les tests
 * Utilise la base de données en mémoire au lieu de la vraie base de données
 */

import { vi } from 'vitest';
import type { TestDatabaseInstance } from './testDatabase';
import { events, users } from '#/db/schema';
import { eq } from 'drizzle-orm';

export function createSqliteStorageMock(testDb: TestDatabaseInstance) {
  return {
    SqliteStorage: vi.fn().mockImplementation(() => ({
      db: testDb.db,
      isInitialized: false,

      async initialize() {
        this.isInitialized = true;
        return true;
      },

      async saveEvent(event: any) {
        try {
          const eventData = {
            messageId: event.messageId,
            channelId: event.channelId,
            guildId: event.guildId,
            title: event.title,
            description: event.description || null,
            intervalMinutes: event.intervalMinutes,
            isPaused: event.isPaused || false,
            lastRemindedAt: event.lastReminder || null,
            usersWhoReacted: JSON.stringify(event.usersWhoReacted || []),
            createdAt: event.createdAt || new Date(),
            updatedAt: event.updatedAt || new Date(),
          };

          await testDb.db
            .insert(events)
            .values(eventData)
            .onConflictDoUpdate({
              target: events.messageId,
              set: {
                ...eventData,
                updatedAt: new Date(),
              },
            });

          return { success: true };
        } catch (error) {
          console.error('Mock SqliteStorage saveEvent error:', error);
          return { success: false, error: (error as Error).message };
        }
      },

      async getEvent(messageId: string) {
        try {
          const result = await testDb.db
            .select()
            .from(events)
            .where(eq(events.messageId, messageId))
            .limit(1);

          if (result.length === 0) {
            return { success: false, error: 'Event not found' };
          }

          const event = result[0];
          if (!event) {
            return { success: false, error: 'Event not found' };
          }

          // Convertit null en undefined pour la description comme le fait le vrai SqliteStorage
          return {
            success: true,
            event: {
              ...event,
              description: event.description === null ? undefined : event.description,
              usersWhoReacted: JSON.parse(event.usersWhoReacted || '[]'),
            },
          };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      },

      async getAllEvents() {
        try {
          const results = await testDb.db.select().from(events);
          return {
            success: true,
            events: results.map(event => ({
              ...event,
              description: event.description === null ? undefined : event.description,
              usersWhoReacted: JSON.parse(event.usersWhoReacted || '[]'),
            })),
          };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      },

      async deleteEvent(messageId: string) {
        try {
          await testDb.db.delete(events).where(eq(events.messageId, messageId));
          return { success: true };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      },

      async saveUser(user: any) {
        try {
          const userData = {
            userId: user.userId,
            guildId: user.guildId,
            username: user.username,
            isBot: user.isBot || false,
            lastSeen: user.lastSeen || new Date(),
            createdAt: user.createdAt || new Date(),
            updatedAt: user.updatedAt || new Date(),
          };

          await testDb.db
            .insert(users)
            .values(userData)
            .onConflictDoUpdate({
              target: [users.userId, users.guildId],
              set: {
                ...userData,
                updatedAt: new Date(),
              },
            });

          return { success: true };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      },

      async getUser(userId: string, guildId: string) {
        try {
          const result = await testDb.db
            .select()
            .from(users)
            .where(eq(users.userId, userId) && eq(users.guildId, guildId))
            .limit(1);

          return result.length > 0
            ? { success: true, user: result[0] }
            : { success: false, error: 'User not found' };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      },

      close() {
        // Ne fait rien car la base de données de test est gérée par testDatabase.ts
      },
    })),
  };
}
