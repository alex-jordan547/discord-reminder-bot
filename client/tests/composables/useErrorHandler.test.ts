import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useErrorHandler } from '@/composables/useErrorHandler';

describe('useErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console methods
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('Error Handling', () => {
    it('should handle generic errors', () => {
      const { handleError, lastError } = useErrorHandler();
      const testError = new Error('Test error');

      handleError(testError);

      expect(lastError.value).toBe(testError);
      expect(console.error).toHaveBeenCalledWith('Error occurred:', testError);
    });

    it('should handle API errors with status codes', () => {
      const { handleError, lastError } = useErrorHandler();
      const apiError = {
        name: 'APIError',
        message: 'Not found',
        status: 404,
        response: { data: { error: 'Resource not found' } },
      };

      handleError(apiError);

      expect(lastError.value).toBeInstanceOf(Error);
      expect(lastError.value?.message).toBe('Not found');
      expect((lastError.value as any)?.status).toBe(404);
      expect((lastError.value as any)?.name).toBe('APIError');
    });

    it('should handle network errors', () => {
      const { handleError, lastError } = useErrorHandler();
      const networkError = {
        name: 'NetworkError',
        message: 'Network request failed',
        code: 'NETWORK_ERROR',
      };

      handleError(networkError);

      expect(lastError.value).toBeInstanceOf(Error);
      expect(lastError.value?.message).toBe('Network request failed');
      expect((lastError.value as any)?.code).toBe('NETWORK_ERROR');
      expect((lastError.value as any)?.name).toBe('NetworkError');
    });
  });

  describe('User-Friendly Messages', () => {
    it('should generate user-friendly message for API errors', () => {
      const { handleError, getUserFriendlyMessage } = useErrorHandler();
      const apiError = {
        name: 'APIError',
        message: 'Internal server error',
        status: 500,
      };

      handleError(apiError);
      const message = getUserFriendlyMessage();

      expect(message).toContain('server error');
      expect(message).not.toContain('Internal server error');
    });

    it('should generate user-friendly message for network errors', () => {
      const { handleError, getUserFriendlyMessage } = useErrorHandler();
      const networkError = {
        name: 'NetworkError',
        message: 'Failed to fetch',
        code: 'NETWORK_ERROR',
      };

      handleError(networkError);
      const message = getUserFriendlyMessage();

      expect(message).toContain('connection');
      expect(message).toContain('network');
    });

    it('should provide fallback message for unknown errors', () => {
      const { handleError, getUserFriendlyMessage } = useErrorHandler();
      const unknownError = { message: 'Something weird happened' };

      handleError(unknownError);
      const message = getUserFriendlyMessage();

      expect(message).toContain('unexpected error');
    });
  });

  describe('Error Recovery', () => {
    it('should provide retry functionality', async () => {
      const { retry } = useErrorHandler();
      const mockOperation = vi
        .fn()
        .mockRejectedValueOnce(new Error('First attempt'))
        .mockResolvedValueOnce('Success');

      const result = await retry(mockOperation, { maxAttempts: 2 });

      expect(result).toBe('Success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should respect max retry attempts', async () => {
      const { retry } = useErrorHandler();
      const mockOperation = vi.fn().mockRejectedValue(new Error('Always fails'));

      await expect(retry(mockOperation, { maxAttempts: 3 })).rejects.toThrow('Always fails');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should implement exponential backoff', async () => {
      const { retry } = useErrorHandler();
      const mockOperation = vi
        .fn()
        .mockRejectedValueOnce(new Error('First'))
        .mockRejectedValueOnce(new Error('Second'))
        .mockResolvedValueOnce('Success');

      const startTime = Date.now();
      await retry(mockOperation, { maxAttempts: 3, baseDelay: 100 });
      const endTime = Date.now();

      // Should have waited at least 100ms + 200ms = 300ms
      expect(endTime - startTime).toBeGreaterThan(250);
    });
  });

  describe('Error Notifications', () => {
    it('should emit error events for external handling', () => {
      const { handleError, onError } = useErrorHandler();
      const mockCallback = vi.fn();

      onError(mockCallback);

      const testError = new Error('Test error');
      handleError(testError);

      expect(mockCallback).toHaveBeenCalledWith(testError);
    });

    it('should support multiple error listeners', () => {
      const { handleError, onError } = useErrorHandler();
      const mockCallback1 = vi.fn();
      const mockCallback2 = vi.fn();

      onError(mockCallback1);
      onError(mockCallback2);

      const testError = new Error('Test error');
      handleError(testError);

      expect(mockCallback1).toHaveBeenCalledWith(testError);
      expect(mockCallback2).toHaveBeenCalledWith(testError);
    });
  });

  describe('Error Clearing', () => {
    it('should clear last error', () => {
      const { handleError, clearError, lastError } = useErrorHandler();

      handleError(new Error('Test error'));
      expect(lastError.value).not.toBeNull();

      clearError();
      expect(lastError.value).toBeNull();
    });

    it('should auto-clear errors after timeout', async () => {
      const { handleError, lastError } = useErrorHandler({ autoClearTimeout: 100 });

      handleError(new Error('Test error'));
      expect(lastError.value).not.toBeNull();

      await new Promise(resolve => setTimeout(resolve, 150));
      expect(lastError.value).toBeNull();
    });
  });
});
