/**
 * Date and timezone utilities for Discord Reminder Bot
 *
 * Provides consistent date handling across the application with proper timezone support.
 */

import { Settings } from '@/config/settings';

/**
 * Get the current date and time in the configured timezone
 */
export function getCurrentDate(): Date {
  return new Date();
}

/**
 * Format a date for display in the configured timezone
 */
export function formatDateForDisplay(date: Date): string {
  return date.toLocaleString('fr-FR', { 
    timeZone: Settings.TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Format a date for ISO string storage but considering timezone
 */
export function formatDateForStorage(date: Date): string {
  return date.toISOString();
}

/**
 * Parse a stored date string back to Date object
 */
export function parseDateFromStorage(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Get a date adjusted to the configured timezone for logging
 */
export function formatDateForLogs(date: Date = new Date()): string {
  return date.toLocaleString('fr-FR', { 
    timeZone: Settings.TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Create a new Date object representing now in the configured timezone
 */
export function createTimezoneAwareDate(): Date {
  return new Date();
}

/**
 * Convert a UTC timestamp to a timezone-aware display
 */
export function utcToTimezone(utcDate: Date): string {
  return utcDate.toLocaleString('fr-FR', { 
    timeZone: Settings.TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Get timezone offset information
 */
export function getTimezoneInfo(): { timezone: string; offset: string } {
  const date = new Date();
  const offset = date.toLocaleString('fr-FR', { 
    timeZone: Settings.TIMEZONE, 
    timeZoneName: 'short' 
  });
  
  return {
    timezone: Settings.TIMEZONE,
    offset: offset.split(' ').pop() || 'CET'
  };
}