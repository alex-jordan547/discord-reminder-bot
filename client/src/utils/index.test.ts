import { describe, it, expect, vi } from 'vitest';
import {
  formatBytes,
  formatDuration,
  formatPercentage,
  formatRelativeTime,
  formatDateTime,
  getStatusColor,
  debounce,
  throttle,
  generateId,
  isValidUrl,
  deepClone,
} from './index';

describe('Dashboard Utilities', () => {
  describe('formatBytes', () => {
    it('formats bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('handles decimal places', () => {
      expect(formatBytes(1536, 1)).toBe('1.5 KB');
      expect(formatBytes(1536, 0)).toBe('2 KB');
    });
  });

  describe('formatDuration', () => {
    it('formats milliseconds correctly', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(3600000)).toBe('1h 0m 0s');
      expect(formatDuration(86400000)).toBe('1d 0h 0m');
    });
  });

  describe('formatPercentage', () => {
    it('formats percentages correctly', () => {
      expect(formatPercentage(50)).toBe('50.0%');
      expect(formatPercentage(33.333, 2)).toBe('33.33%');
      expect(formatPercentage(100, 0)).toBe('100%');
    });
  });

  describe('formatRelativeTime', () => {
    it('formats relative time correctly', () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60000).toISOString();
      const oneHourAgo = new Date(now.getTime() - 3600000).toISOString();
      const oneDayAgo = new Date(now.getTime() - 86400000).toISOString();

      expect(formatRelativeTime(oneMinuteAgo)).toBe('1 minute ago');
      expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');
      expect(formatRelativeTime(oneDayAgo)).toBe('1 day ago');
    });
  });

  describe('formatDateTime', () => {
    it('formats date and time correctly', () => {
      const timestamp = '2023-01-01T12:00:00.000Z';
      const result = formatDateTime(timestamp);
      expect(result).toContain('2023');
      expect(result).toContain('1/1/2023'); // Check for date format instead of specific hour
    });
  });

  describe('getStatusColor', () => {
    it('returns correct colors based on thresholds', () => {
      expect(getStatusColor(50, 70, 90)).toBe('var(--success-text)');
      expect(getStatusColor(80, 70, 90)).toBe('var(--warning-text)');
      expect(getStatusColor(95, 70, 90)).toBe('var(--error-text)');
    });
  });

  describe('debounce', () => {
    it('debounces function calls', async () => {
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      expect(mockFn).not.toHaveBeenCalled();

      await new Promise(resolve => setTimeout(resolve, 150));
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttle', () => {
    it('throttles function calls', async () => {
      const mockFn = vi.fn();
      const throttledFn = throttle(mockFn, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      expect(mockFn).toHaveBeenCalledTimes(1);

      await new Promise(resolve => setTimeout(resolve, 150));
      throttledFn();
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateId', () => {
    it('generates unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).not.toBe(id2);
      expect(id1).toHaveLength(9);
      expect(id2).toHaveLength(9);
    });
  });

  describe('isValidUrl', () => {
    it('validates URLs correctly', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('deepClone', () => {
    it('deep clones objects correctly', () => {
      const original = {
        a: 1,
        b: { c: 2, d: [3, 4] },
        e: new Date('2023-01-01'),
      };

      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
      expect(cloned.b.d).not.toBe(original.b.d);
      expect(cloned.e).not.toBe(original.e);
    });

    it('handles primitive values', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('hello')).toBe('hello');
      expect(deepClone(null)).toBe(null);
      expect(deepClone(undefined)).toBe(undefined);
    });
  });
});
