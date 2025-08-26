/**
 * Comprehensive tests for error recovery system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ErrorSeverity,
  classifyError,
  isRetryableError,
  calculateRetryDelay,
  executeWithRetry,
  getErrorStats,
  resetErrorStats,
  getCircuitBreakerStatuses,
  getErrorRecoveryHealth,
  CircuitBreakerState,
} from '@/utils/errorRecovery';
import { DiscordAPIError, HTTPError } from 'discord.js';

describe('Error Recovery System', () => {
  beforeEach(() => {
    resetErrorStats();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Error Classification', () => {
    it('should classify Discord API errors correctly', () => {
      const notFoundError = new DiscordAPIError('Not Found', 10008, 404, 'GET', '', {});
      const forbiddenError = new DiscordAPIError('Forbidden', 50013, 403, 'GET', '', {});
      const rateLimitError = new DiscordAPIError('Rate Limited', 0, 429, 'GET', '', {});
      const serverError = new DiscordAPIError('Server Error', 0, 500, 'GET', '', {});

      expect(classifyError(notFoundError)).toBe(ErrorSeverity.PERMANENT);
      expect(classifyError(forbiddenError)).toBe(ErrorSeverity.PERMANENT);
      expect(classifyError(rateLimitError)).toBe(ErrorSeverity.RATE_LIMITED);
      expect(classifyError(serverError)).toBe(ErrorSeverity.API_UNAVAILABLE);
    });

    it('should classify HTTP errors correctly', () => {
      const httpRateLimit = new HTTPError('Rate Limited', 'GET', 429, '');
      const httpServerError = new HTTPError('Server Error', 'GET', 500, '');
      const httpNotFound = new HTTPError('Not Found', 'GET', 404, '');

      expect(classifyError(httpRateLimit)).toBe(ErrorSeverity.RATE_LIMITED);
      expect(classifyError(httpServerError)).toBe(ErrorSeverity.API_UNAVAILABLE);
      expect(classifyError(httpNotFound)).toBe(ErrorSeverity.PERMANENT);
    });

    it('should classify network errors correctly', () => {
      const timeoutError = new Error('Request timeout');
      const connectionError = new Error('ECONNRESET');
      const systemError = new TypeError('Cannot read property');

      expect(classifyError(timeoutError)).toBe(ErrorSeverity.API_UNAVAILABLE);
      expect(classifyError(connectionError)).toBe(ErrorSeverity.API_UNAVAILABLE);
      expect(classifyError(systemError)).toBe(ErrorSeverity.CRITICAL);
    });
  });

  describe('Retry Logic', () => {
    it('should determine retryable errors correctly', () => {
      const permanentError = new DiscordAPIError('Not Found', 10008, 404, 'GET', '', {});
      const transientError = new Error('Connection lost');
      const rateLimitError = new DiscordAPIError('Rate Limited', 0, 429, 'GET', '', {});

      expect(isRetryableError(permanentError)).toBe(false);
      expect(isRetryableError(transientError)).toBe(true);
      expect(isRetryableError(rateLimitError)).toBe(true);
    });

    it('should calculate exponential backoff delays correctly', () => {
      const error = new Error('Connection lost');
      const config = {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2.0,
        jitterFactor: 0.1,
      };

      const delay1 = calculateRetryDelay(error, 0, config);
      const delay2 = calculateRetryDelay(error, 1, config);
      const delay3 = calculateRetryDelay(error, 2, config);

      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(1100); // base + 10% jitter
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThanOrEqual(2200); // 2x base + 10% jitter
      expect(delay3).toBeGreaterThanOrEqual(4000);
      expect(delay3).toBeLessThanOrEqual(4400); // 4x base + 10% jitter
    });

    it('should respect rate limit retry-after values', () => {
      const rateLimitError = {
        retryAfter: 5, // 5 seconds
      } as any;
      const config = {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2.0,
        jitterFactor: 0.1,
      };

      // Mock classifyError to return RATE_LIMITED for this specific error
      const originalClassify = classifyError;
      vi.mocked(classifyError).mockReturnValue(ErrorSeverity.RATE_LIMITED);

      const delay = calculateRetryDelay(rateLimitError as Error, 0, config);
      expect(delay).toBe(5000); // Should use retryAfter * 1000

      // Restore original function
      vi.mocked(classifyError).mockImplementation(originalClassify);
    });
  });

  describe('Execute With Retry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await executeWithRetry(operation, 'api_call');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry transient failures', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Connection lost'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue('success');

      const promise = executeWithRetry(operation, 'api_call');
      
      // Fast-forward through retry delays
      await vi.runAllTimersAsync();
      
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry permanent failures', async () => {
      const permanentError = new DiscordAPIError('Not Found', 10008, 404, 'GET', '', {});
      const operation = vi.fn().mockRejectedValue(permanentError);

      await expect(executeWithRetry(operation, 'api_call')).rejects.toThrow(permanentError);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should respect max attempts limit', async () => {
      const error = new Error('Connection lost');
      const operation = vi.fn().mockRejectedValue(error);

      const promise = executeWithRetry(operation, 'api_call', { maxAttempts: 2 });
      
      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should timeout operations when specified', async () => {
      const operation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 10000)) // 10 second delay
      );

      const promise = executeWithRetry(operation, 'api_call', { timeoutMs: 5000 });
      
      await vi.advanceTimersByTime(5000);

      await expect(promise).rejects.toThrow('Operation timeout');
    });
  });

  describe('Circuit Breaker', () => {
    it('should track success and failure statistics', async () => {
      // Simulate some successful and failed operations
      const successfulOp = vi.fn().mockResolvedValue('success');
      const failingOp = vi.fn().mockRejectedValue(new Error('Connection lost'));

      // Execute some operations
      await executeWithRetry(successfulOp, 'test_circuit');
      await executeWithRetry(successfulOp, 'test_circuit');
      
      try {
        await executeWithRetry(failingOp, 'test_circuit', { maxAttempts: 1 });
      } catch (error) {
        // Expected to fail
      }

      const stats = getErrorStats();
      expect(stats.totalCalls).toBe(3);
      expect(stats.successfulCalls).toBe(2);
      expect(stats.failedCalls).toBe(1);
    });

    it('should open circuit breaker after consecutive failures', async () => {
      vi.useFakeTimers();
      
      const failingOp = vi.fn().mockRejectedValue(new Error('Service unavailable'));

      // Generate multiple failures to trigger circuit breaker
      for (let i = 0; i < 10; i++) {
        try {
          await executeWithRetry(failingOp, 'test_circuit', { maxAttempts: 1 });
        } catch (error) {
          // Expected to fail
        }
      }

      const circuitBreakers = getCircuitBreakerStatuses();
      const testCircuitBreaker = circuitBreakers.find(cb => cb.name === 'test_circuit');
      
      expect(testCircuitBreaker).toBeDefined();
      expect(testCircuitBreaker?.state).toBe(CircuitBreakerState.OPEN);
    });

    it('should prevent calls when circuit breaker is open', async () => {
      vi.useFakeTimers();
      
      // First, trigger circuit breaker to open
      const failingOp = vi.fn().mockRejectedValue(new Error('Service unavailable'));

      for (let i = 0; i < 10; i++) {
        try {
          await executeWithRetry(failingOp, 'test_circuit', { maxAttempts: 1 });
        } catch (error) {
          // Expected to fail
        }
      }

      // Now try to execute another operation - should be blocked by circuit breaker
      const newOp = vi.fn().mockResolvedValue('success');
      
      await expect(executeWithRetry(newOp, 'test_circuit')).rejects.toThrow('Circuit breaker');
      expect(newOp).not.toHaveBeenCalled();
    });

    it('should transition to half-open after timeout', async () => {
      vi.useFakeTimers();
      
      // Trigger circuit breaker to open
      const failingOp = vi.fn().mockRejectedValue(new Error('Service unavailable'));

      for (let i = 0; i < 10; i++) {
        try {
          await executeWithRetry(failingOp, 'test_circuit', { maxAttempts: 1 });
        } catch (error) {
          // Expected to fail
        }
      }

      // Advance time past circuit breaker timeout (30 seconds default)
      await vi.advanceTimersByTime(35000);

      // Now circuit breaker should allow calls in half-open state
      const successfulOp = vi.fn().mockResolvedValue('success');
      const result = await executeWithRetry(successfulOp, 'test_circuit');
      
      expect(result).toBe('success');
      expect(successfulOp).toHaveBeenCalledTimes(1);

      // Circuit breaker should now be closed again
      const circuitBreakers = getCircuitBreakerStatuses();
      const testCircuitBreaker = circuitBreakers.find(cb => cb.name === 'test_circuit');
      expect(testCircuitBreaker?.state).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('Error Recovery Health', () => {
    it('should report healthy state when no issues', () => {
      const health = getErrorRecoveryHealth();
      
      expect(health.healthy).toBe(true);
      expect(health.issues).toHaveLength(0);
      expect(health.stats).toBeDefined();
      expect(health.circuitBreakers).toBeDefined();
    });

    it('should report unhealthy state with high failure rate', async () => {
      // Generate failures to increase failure rate
      const failingOp = vi.fn().mockRejectedValue(new Error('Service error'));

      for (let i = 0; i < 10; i++) {
        try {
          await executeWithRetry(failingOp, 'api_call', { maxAttempts: 1 });
        } catch (error) {
          // Expected to fail
        }
      }

      const health = getErrorRecoveryHealth();
      
      expect(health.healthy).toBe(false);
      expect(health.issues.length).toBeGreaterThan(0);
      expect(health.issues.some(issue => issue.includes('High failure rate'))).toBe(true);
    });

    it('should report circuit breaker issues', async () => {
      vi.useFakeTimers();
      
      // Trigger circuit breaker to open
      const failingOp = vi.fn().mockRejectedValue(new Error('Service unavailable'));

      for (let i = 0; i < 10; i++) {
        try {
          await executeWithRetry(failingOp, 'test_health', { maxAttempts: 1 });
        } catch (error) {
          // Expected to fail
        }
      }

      const health = getErrorRecoveryHealth();
      
      expect(health.healthy).toBe(false);
      expect(health.issues.some(issue => issue.includes('Open circuit breakers'))).toBe(true);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track operation statistics correctly', async () => {
      const successfulOp = vi.fn().mockResolvedValue('success');
      const failingOp = vi.fn().mockRejectedValue(new Error('Service error'));
      const retryingOp = vi.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');

      vi.useFakeTimers();

      // Execute operations
      await executeWithRetry(successfulOp, 'api_call');
      await executeWithRetry(successfulOp, 'api_call');
      
      try {
        await executeWithRetry(failingOp, 'api_call', { maxAttempts: 1 });
      } catch (error) {
        // Expected to fail
      }
      
      const promise = executeWithRetry(retryingOp, 'api_call');
      await vi.runAllTimersAsync();
      await promise;

      const stats = getErrorStats();
      
      expect(stats.totalCalls).toBe(4);
      expect(stats.successfulCalls).toBe(3);
      expect(stats.failedCalls).toBe(1);
      expect(stats.retriedCalls).toBe(1);
      expect(stats.recoveredCalls).toBe(1);
    });

    it('should track error types', async () => {
      const typeError = new TypeError('Invalid type');
      const rangeError = new RangeError('Out of range');
      
      const typeErrorOp = vi.fn().mockRejectedValue(typeError);
      const rangeErrorOp = vi.fn().mockRejectedValue(rangeError);

      try {
        await executeWithRetry(typeErrorOp, 'api_call', { maxAttempts: 1 });
      } catch (error) {
        // Expected to fail
      }
      
      try {
        await executeWithRetry(rangeErrorOp, 'api_call', { maxAttempts: 1 });
      } catch (error) {
        // Expected to fail
      }

      const stats = getErrorStats();
      
      expect(stats.errorCounts['TypeError']).toBe(1);
      expect(stats.errorCounts['RangeError']).toBe(1);
    });

    it('should reset statistics correctly', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      await executeWithRetry(operation, 'api_call');
      
      let stats = getErrorStats();
      expect(stats.totalCalls).toBe(1);
      
      resetErrorStats();
      
      stats = getErrorStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.successfulCalls).toBe(0);
      expect(stats.failedCalls).toBe(0);
      expect(stats.errorCounts).toEqual({});
    });
  });
});