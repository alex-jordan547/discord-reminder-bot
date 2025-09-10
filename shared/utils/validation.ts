/**
 * Shared validation utilities
 */

import { z } from 'zod';

export const EventSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  startTime: z.date(),
  endTime: z.date().optional(),
  guildId: z.string(),
  channelId: z.string(),
});

export const GuildConfigSchema = z.object({
  guildId: z.string(),
  timezone: z.string().default('UTC'),
  defaultChannel: z.string().optional(),
  reminderSettings: z
    .object({
      enabled: z.boolean().default(true),
      defaultReminders: z.array(z.number()).default([60, 15, 5]),
    })
    .optional(),
});

export type EventInput = z.infer<typeof EventSchema>;
export type GuildConfigInput = z.infer<typeof GuildConfigSchema>;
