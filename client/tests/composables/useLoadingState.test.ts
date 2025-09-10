import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLoadingState } from '@/composables/useLoadingState';

describe('useLoadingState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Loading State', () => {
    it('should initialize with not loading state', () => {
      const { isLoading, error } = useLoadingState();

      expect(isLoading.value).toBe(false);
      expect(error.value).toBeNull();
    });

    it('should set loading state correctly', () => {
      const { isLoading, setLoading } = useLoadingState();

      setLoading(true);
      expect(isLoading.value).toBe(true);

      setLoading(false);
      expect(isLoading.value).toBe(false);
    });

    it('should clear error when starting new loading operation', () => {
      const { error, setError, setLoading } = useLoadingState();

      setError(new Error('Test error'));
      expect(error.value).not.toBeNull();

      setLoading(true);
      expect(error.value).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should set error correctly', () => {
      const { error, setError } = useLoadingState();
      const testError = new Error('Test error');

      setError(testError);

      expect(error.value).toBe(testError);
    });

    it('should clear error', () => {
      const { error, setError, clearError } = useLoadingState();

      setError(new Error('Test error'));
      expect(error.value).not.toBeNull();

      clearError();
      expect(error.value).toBeNull();
    });

    it('should automatically stop loading when error occurs', () => {
      const { isLoading, setLoading, setError } = useLoadingState();

      setLoading(true);
      expect(isLoading.value).toBe(true);

      setError(new Error('Test error'));
      expect(isLoading.value).toBe(false);
    });
  });

  describe('Async Operations', () => {
    it('should handle successful async operation', async () => {
      const { isLoading, error, executeAsync } = useLoadingState();
      const mockOperation = vi.fn().mockResolvedValue('success');

      const promise = executeAsync(mockOperation);
      expect(isLoading.value).toBe(true);

      const result = await promise;
      expect(result).toBe('success');
      expect(isLoading.value).toBe(false);
      expect(error.value).toBeNull();
    });

    it('should handle failed async operation', async () => {
      const { isLoading, error, executeAsync } = useLoadingState();
      const testError = new Error('Async error');
      const mockOperation = vi.fn().mockRejectedValue(testError);

      const promise = executeAsync(mockOperation);
      expect(isLoading.value).toBe(true);

      await expect(promise).rejects.toThrow('Async error');
      expect(isLoading.value).toBe(false);
      expect(error.value).toBe(testError);
    });

    it('should prevent concurrent async operations', async () => {
      const { executeAsync } = useLoadingState();
      const mockOperation1 = vi.fn().mockResolvedValue('first');
      const mockOperation2 = vi.fn().mockResolvedValue('second');

      const promise1 = executeAsync(mockOperation1);
      const promise2 = executeAsync(mockOperation2);

      await expect(promise2).rejects.toThrow('Operation already in progress');
      await expect(promise1).resolves.toBe('first');
    });
  });

  describe('Loading States with Keys', () => {
    it('should handle multiple loading states with keys', () => {
      const { isLoading, setLoading } = useLoadingState();

      setLoading(true, 'operation1');
      setLoading(true, 'operation2');

      expect(isLoading.value).toBe(true);

      setLoading(false, 'operation1');
      expect(isLoading.value).toBe(true); // Still loading operation2

      setLoading(false, 'operation2');
      expect(isLoading.value).toBe(false);
    });

    it('should check specific loading state by key', () => {
      const { isLoadingKey, setLoading } = useLoadingState();

      setLoading(true, 'operation1');

      expect(isLoadingKey('operation1')).toBe(true);
      expect(isLoadingKey('operation2')).toBe(false);
    });
  });
});
