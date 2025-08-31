/**
 * Discord Reminder Bot - Advanced Error Recovery System
 *
 * Comprehensive error recovery with:
 * - Exponential backoff retry mechanisms
 * - Circuit breaker pattern for API failures
 * - Error classification and handling strategies
 * - Performance monitoring and alerting
 * - Type-safe error handling with proper logging
 */

import { createLogger } from '@/utils/loggingConfig';
import { DiscordAPIError, HTTPError, RateLimitError, WebSocketShardEvents } from 'discord.js';

const logger = createLogger('error-recovery');

/**
 * Error severity classification for recovery strategies
 */
export enum ErrorSeverity {
  TRANSIENT = 'transient', // Retry immediately
  RATE_LIMITED = 'rate_limited', // Wait and respect rate limits
  PERMANENT = 'permanent', // Don't retry (404, 403, etc.)
  API_UNAVAILABLE = 'api_down', // Discord API unavailable, queue for later
  CRITICAL = 'critical', // System-level errors requiring intervention
}

/**
 * Retry configuration for different operation types
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffFactor: number; // exponential multiplier
  jitterFactor: number; // random variation (0-1)
  timeoutMs?: number; // operation timeout
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Blocking requests
  HALF_OPEN = 'half_open', // Testing recovery
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number; // failures before opening
  successThreshold: number; // successes before closing from half-open
  timeout: number; // milliseconds to wait before half-open
  monitorWindow: number; // milliseconds to track failures
}

/**
 * Error recovery statistics for monitoring
 */
export interface ErrorStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  retriedCalls: number;
  recoveredCalls: number;
  errorCounts: Record<string, number>;
  lastReset: Date;
  uptime: number; // milliseconds
}

/**
 * Predefined retry configurations for different operation types
 */
export const RETRY_CONFIGS: Record<string, RetryConfig> = {
  send_message: {
    maxAttempts: 3,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffFactor: 2.0,
    jitterFactor: 0.1,
    timeoutMs: 10000,
  },
  fetch_message: {
    maxAttempts: 2,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 1.5,
    jitterFactor: 0.1,
    timeoutMs: 5000,
  },
  api_call: {
    maxAttempts: 3,
    baseDelay: 1500,
    maxDelay: 45000,
    backoffFactor: 2.0,
    jitterFactor: 0.15,
    timeoutMs: 15000,
  },
  critical: {
    maxAttempts: 5,
    baseDelay: 3000,
    maxDelay: 120000,
    backoffFactor: 2.5,
    jitterFactor: 0.2,
    timeoutMs: 30000,
  },
  database: {
    maxAttempts: 3,
    baseDelay: 500,
    maxDelay: 5000,
    backoffFactor: 2.0,
    jitterFactor: 0.05,
    timeoutMs: 10000,
  },
};

/**
 * Classify Discord errors by severity and recovery strategy
 */
export function classifyError(error: Error): ErrorSeverity {
  // Discord API specific errors
  if (error instanceof DiscordAPIError) {
    const code = error.code;
    const status = error.status;

    // Permanent errors (don't retry)
    if (status === 404 || code === 10008 || code === 10003) {
      // Not found, unknown message/channel
      return ErrorSeverity.PERMANENT;
    }
    if (status === 403 || code === 50013 || code === 50001) {
      // Forbidden, missing permissions
      return ErrorSeverity.PERMANENT;
    }
    if (status === 400 && code !== 50035) {
      // Bad request (except invalid form body)
      return ErrorSeverity.PERMANENT;
    }

    // Rate limiting
    if (status === 429 || error instanceof RateLimitError) {
      return ErrorSeverity.RATE_LIMITED;
    }

    // Server errors
    if (status >= 500) {
      return ErrorSeverity.API_UNAVAILABLE;
    }

    // Other Discord API errors
    return ErrorSeverity.TRANSIENT;
  }

  // HTTP errors
  if (error instanceof HTTPError) {
    const status = error.status;
    if (status === 429) return ErrorSeverity.RATE_LIMITED;
    if (status >= 500) return ErrorSeverity.API_UNAVAILABLE;
    if (status === 403 || status === 404) return ErrorSeverity.PERMANENT;
    return ErrorSeverity.TRANSIENT;
  }

  // Network/connection errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('econnrefused')
    ) {
      return ErrorSeverity.API_UNAVAILABLE;
    }
    if (message.includes('session closed') || message.includes('websocket')) {
      return ErrorSeverity.API_UNAVAILABLE;
    }
  }

  // System-level errors
  if (error instanceof TypeError || error instanceof ReferenceError) {
    return ErrorSeverity.CRITICAL;
  }

  // Default to transient for unknown errors
  return ErrorSeverity.TRANSIENT;
}

/**
 * Check if an error should be retried
 */
export function isRetryableError(error: Error): boolean {
  const severity = classifyError(error);
  return [
    ErrorSeverity.TRANSIENT,
    ErrorSeverity.RATE_LIMITED,
    ErrorSeverity.API_UNAVAILABLE,
  ].includes(severity);
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
export function calculateRetryDelay(error: Error, attempt: number, config: RetryConfig): number {
  const severity = classifyError(error);

  // For rate limiting, use the retry_after value if available
  if (severity === ErrorSeverity.RATE_LIMITED) {
    const discordError = error as any;
    if (discordError.retryAfter) {
      return Math.min(discordError.retryAfter * 1000, config.maxDelay);
    }
  }

  // Exponential backoff with jitter
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffFactor, attempt);
  const delay = Math.min(exponentialDelay, config.maxDelay);

  // Add jitter to prevent thundering herd
  const jitter = delay * config.jitterFactor * Math.random();

  return Math.floor(delay + jitter);
}

/**
 * Circuit breaker implementation for API reliability
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures: Date[] = [];
  private successes = 0;
  private lastFailure?: Date;
  private nextAttempt?: Date;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig,
  ) {}

  /**
   * Check if the circuit breaker should allow a call
   */
  public canCall(): boolean {
    this.cleanupOldFailures();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        if (this.nextAttempt && Date.now() >= this.nextAttempt.getTime()) {
          this.state = CircuitBreakerState.HALF_OPEN;
          this.successes = 0;
          logger.info(`🔄 Circuit breaker ${this.name} entering HALF_OPEN state`);
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful call
   */
  public onSuccess(): void {
    this.successes++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitBreakerState.CLOSED;
        this.failures = [];
        delete this.lastFailure;
        delete this.nextAttempt;
        logger.info(`✅ Circuit breaker ${this.name} CLOSED after recovery`);
      }
    }
  }

  /**
   * Record a failed call
   */
  public onFailure(): void {
    const now = new Date();
    this.failures.push(now);
    this.lastFailure = now;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttempt = new Date(now.getTime() + this.config.timeout);
      logger.warn(`🔴 Circuit breaker ${this.name} OPEN after half-open failure`);
      return;
    }

    if (this.state === CircuitBreakerState.CLOSED) {
      this.cleanupOldFailures();
      if (this.failures.length >= this.config.failureThreshold) {
        this.state = CircuitBreakerState.OPEN;
        this.nextAttempt = new Date(now.getTime() + this.config.timeout);
        logger.error(
          `🚨 Circuit breaker ${this.name} OPEN due to ${this.failures.length} failures`,
        );
      }
    }
  }

  /**
   * Get current circuit breaker status
   */
  public getStatus(): {
    name: string;
    state: CircuitBreakerState;
    failures: number;
    successes: number;
    nextAttempt?: Date;
    lastFailure?: Date;
  } {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures.length,
      successes: this.successes,
      ...(this.nextAttempt && { nextAttempt: this.nextAttempt }),
      ...(this.lastFailure && { lastFailure: this.lastFailure }),
    };
  }

  private cleanupOldFailures(): void {
    const cutoff = new Date(Date.now() - this.config.monitorWindow);
    this.failures = this.failures.filter(failure => failure > cutoff);
  }
}

/**
 * Global error statistics collector
 */
class ErrorStatsCollector {
  private stats: ErrorStats = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    retriedCalls: 0,
    recoveredCalls: 0,
    errorCounts: {},
    lastReset: new Date(),
    uptime: 0,
  };

  public recordCall(
    success: boolean,
    errorType?: string,
    retries: number = 0,
    recovered: boolean = false,
  ): void {
    this.stats.totalCalls++;
    this.stats.uptime = Date.now() - this.stats.lastReset.getTime();

    if (success) {
      this.stats.successfulCalls++;
      if (recovered) {
        this.stats.recoveredCalls++;
      }
    } else {
      this.stats.failedCalls++;
      if (errorType) {
        this.stats.errorCounts[errorType] = (this.stats.errorCounts[errorType] || 0) + 1;
      }
    }

    if (retries > 0) {
      this.stats.retriedCalls++;
    }
  }

  public getStats(): ErrorStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.lastReset.getTime(),
    };
  }

  public reset(): void {
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      retriedCalls: 0,
      recoveredCalls: 0,
      errorCounts: {},
      lastReset: new Date(),
      uptime: 0,
    };
  }
}

// Global instances
const errorStats = new ErrorStatsCollector();

// Circuit breakers for different operation types
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker for an operation type
 */
function getCircuitBreaker(name: string): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    const config: CircuitBreakerConfig = {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 30000, // 30 seconds
      monitorWindow: 60000, // 1 minute
    };

    // Custom configs for specific operations
    if (name === 'discord_api') {
      config.failureThreshold = 10;
      config.timeout = 60000; // 1 minute
    } else if (name === 'database') {
      config.failureThreshold = 3;
      config.timeout = 15000; // 15 seconds
    }

    circuitBreakers.set(name, new CircuitBreaker(name, config));
  }

  return circuitBreakers.get(name)!;
}

/**
 * Enhanced retry decorator with circuit breaker protection
 */
export function withRetry<T extends any[], R>(
  configName: string = 'api_call',
  customConfig?: Partial<RetryConfig>,
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>,
  ) {
    const originalMethod = descriptor.value!;
    const baseConfig = RETRY_CONFIGS[configName] || RETRY_CONFIGS['api_call']!;
    const config: RetryConfig = {
      maxAttempts: customConfig?.maxAttempts ?? baseConfig.maxAttempts,
      baseDelay: customConfig?.baseDelay ?? baseConfig.baseDelay,
      maxDelay: customConfig?.maxDelay ?? baseConfig.maxDelay,
      backoffFactor: customConfig?.backoffFactor ?? baseConfig.backoffFactor,
      jitterFactor: customConfig?.jitterFactor ?? baseConfig.jitterFactor,
      ...(customConfig?.timeoutMs !== undefined ? { timeoutMs: customConfig.timeoutMs } : {}),
      ...(baseConfig.timeoutMs !== undefined && customConfig?.timeoutMs === undefined
        ? { timeoutMs: baseConfig.timeoutMs }
        : {}),
    };
    const circuitBreaker = getCircuitBreaker(configName);

    descriptor.value = async function (...args: T): Promise<R> {
      const methodName = `${target.constructor.name}.${propertyKey}`;
      let lastError: Error | undefined;

      for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
        try {
          // Check circuit breaker
          if (!circuitBreaker.canCall()) {
            const cbStatus = circuitBreaker.getStatus();
            throw new Error(`Circuit breaker ${cbStatus.name} is ${cbStatus.state.toUpperCase()}`);
          }

          logger.debug(`🔄 Attempting ${methodName} (${attempt + 1}/${config.maxAttempts})`);

          // Create promise with timeout
          const timeoutPromise = config.timeoutMs
            ? new Promise<R>((_, reject) =>
                setTimeout(() => reject(new Error('Operation timeout')), config.timeoutMs),
              )
            : null;

          const operationPromise = originalMethod.apply(this, args);

          const result = timeoutPromise
            ? await Promise.race([operationPromise, timeoutPromise])
            : await operationPromise;

          // Success
          circuitBreaker.onSuccess();
          errorStats.recordCall(true, undefined, attempt, attempt > 0);

          if (attempt > 0) {
            logger.info(`✅ ${methodName} succeeded on attempt ${attempt + 1}`);
          }

          return result;
        } catch (error) {
          lastError = error as Error;
          const severity = classifyError(lastError);

          logger.warn(
            `❌ ${methodName} failed (${attempt + 1}/${config.maxAttempts}): ${lastError.message} (${severity})`,
          );

          // Record failure in circuit breaker
          circuitBreaker.onFailure();

          // Don't retry permanent errors
          if (severity === ErrorSeverity.PERMANENT) {
            logger.error(`🚫 Permanent error in ${methodName}, not retrying`);
            errorStats.recordCall(false, lastError.constructor.name, attempt);
            throw lastError;
          }

          // Don't retry critical errors immediately
          if (severity === ErrorSeverity.CRITICAL) {
            logger.error(`🚨 Critical error in ${methodName}, escalating`);
            errorStats.recordCall(false, lastError.constructor.name, attempt);
            throw lastError;
          }

          // Last attempt failed
          if (attempt === config.maxAttempts - 1) {
            logger.error(`💥 ${methodName} failed after ${config.maxAttempts} attempts`);
            errorStats.recordCall(false, lastError.constructor.name, attempt);
            break;
          }

          // Calculate delay and wait
          const delay = calculateRetryDelay(lastError, attempt, config);
          logger.info(`⏳ Retrying ${methodName} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // All attempts failed
      throw lastError || new Error(`${methodName} failed without capturing error`);
    };

    return descriptor;
  };
}

/**
 * Simple function wrapper for retry logic
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  configName: string = 'api_call',
  customConfig?: Partial<RetryConfig>,
): Promise<T> {
  const baseConfig = RETRY_CONFIGS[configName] || RETRY_CONFIGS['api_call']!;
  const config: RetryConfig = {
    maxAttempts: customConfig?.maxAttempts ?? baseConfig.maxAttempts,
    baseDelay: customConfig?.baseDelay ?? baseConfig.baseDelay,
    maxDelay: customConfig?.maxDelay ?? baseConfig.maxDelay,
    backoffFactor: customConfig?.backoffFactor ?? baseConfig.backoffFactor,
    jitterFactor: customConfig?.jitterFactor ?? baseConfig.jitterFactor,
    ...(customConfig?.timeoutMs !== undefined ? { timeoutMs: customConfig.timeoutMs } : {}),
    ...(baseConfig.timeoutMs !== undefined && customConfig?.timeoutMs === undefined
      ? { timeoutMs: baseConfig.timeoutMs }
      : {}),
  };
  const circuitBreaker = getCircuitBreaker(configName);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      // Check circuit breaker
      if (!circuitBreaker.canCall()) {
        const cbStatus = circuitBreaker.getStatus();
        throw new Error(`Circuit breaker ${cbStatus.name} is ${cbStatus.state.toUpperCase()}`);
      }

      // Create timeout wrapper if specified
      const executeOperation = async (): Promise<T> => {
        if (config.timeoutMs) {
          const timeoutPromise = new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Operation timeout')), config.timeoutMs),
          );
          return await Promise.race([operation(), timeoutPromise]);
        } else {
          return await operation();
        }
      };

      const result = await executeOperation();

      // Success
      circuitBreaker.onSuccess();
      errorStats.recordCall(true, undefined, attempt, attempt > 0);

      return result;
    } catch (error) {
      lastError = error as Error;
      const severity = classifyError(lastError);

      logger.warn(
        `❌ Operation failed (${attempt + 1}/${config.maxAttempts}): ${lastError.message}`,
      );

      // Record failure
      circuitBreaker.onFailure();

      // Don't retry certain error types
      if (!isRetryableError(lastError)) {
        logger.error(`🚫 Non-retryable error: ${severity}`);
        errorStats.recordCall(false, lastError.constructor.name, attempt);
        throw lastError;
      }

      // Last attempt
      if (attempt === config.maxAttempts - 1) {
        logger.error(`💥 Operation failed after ${config.maxAttempts} attempts`);
        errorStats.recordCall(false, lastError.constructor.name, attempt);
        break;
      }

      // Wait before retry
      const delay = calculateRetryDelay(lastError, attempt, config);
      logger.info(`⏳ Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Operation failed without capturing error');
}

/**
 * Get error recovery statistics
 */
export function getErrorStats(): ErrorStats {
  return errorStats.getStats();
}

/**
 * Get all circuit breaker statuses
 */
export function getCircuitBreakerStatuses(): Array<ReturnType<CircuitBreaker['getStatus']>> {
  return Array.from(circuitBreakers.values()).map(cb => cb.getStatus());
}

/**
 * Reset error statistics (useful for monitoring)
 */
export function resetErrorStats(): void {
  errorStats.reset();
  logger.info('Error statistics reset');
}

/**
 * Health check for error recovery system
 */
export function getErrorRecoveryHealth(): {
  healthy: boolean;
  issues: string[];
  stats: ErrorStats;
  circuitBreakers: Array<ReturnType<CircuitBreaker['getStatus']>>;
} {
  const stats = getErrorStats();
  const circuitBreakerStatuses = getCircuitBreakerStatuses();
  const issues: string[] = [];

  // Check for high failure rates
  const failureRate = stats.totalCalls > 0 ? (stats.failedCalls / stats.totalCalls) * 100 : 0;
  if (failureRate > 50) {
    issues.push(`High failure rate: ${failureRate.toFixed(1)}%`);
  }

  // Check for open circuit breakers
  const openCircuitBreakers = circuitBreakerStatuses.filter(
    cb => cb.state === CircuitBreakerState.OPEN,
  );
  if (openCircuitBreakers.length > 0) {
    issues.push(`Open circuit breakers: ${openCircuitBreakers.map(cb => cb.name).join(', ')}`);
  }

  // Check for excessive retries
  const retryRate = stats.totalCalls > 0 ? (stats.retriedCalls / stats.totalCalls) * 100 : 0;
  if (retryRate > 25) {
    issues.push(`High retry rate: ${retryRate.toFixed(1)}%`);
  }

  return {
    healthy: issues.length === 0,
    issues,
    stats,
    circuitBreakers: circuitBreakerStatuses,
  };
}

/**
 * Generate error recovery report for monitoring/debugging
 */
export function generateErrorReport(): string {
  const health = getErrorRecoveryHealth();
  const stats = health.stats;

  const report = [
    '=== Error Recovery System Report ===',
    `Status: ${health.healthy ? '✅ HEALTHY' : '⚠️  ISSUES DETECTED'}`,
    '',
    '📊 Statistics:',
    `  Total Calls: ${stats.totalCalls}`,
    `  Success Rate: ${stats.totalCalls > 0 ? ((stats.successfulCalls / stats.totalCalls) * 100).toFixed(1) : 0}%`,
    `  Failed Calls: ${stats.failedCalls}`,
    `  Retried Calls: ${stats.retriedCalls}`,
    `  Recovered Calls: ${stats.recoveredCalls}`,
    `  Uptime: ${Math.floor(stats.uptime / 1000 / 60)} minutes`,
    '',
  ];

  if (health.issues.length > 0) {
    report.push('🚨 Issues:');
    health.issues.forEach(issue => report.push(`  - ${issue}`));
    report.push('');
  }

  if (Object.keys(stats.errorCounts).length > 0) {
    report.push('❌ Top Errors:');
    const sortedErrors = Object.entries(stats.errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    sortedErrors.forEach(([error, count]) => report.push(`  - ${error}: ${count}`));
    report.push('');
  }

  if (health.circuitBreakers.length > 0) {
    report.push('🔌 Circuit Breakers:');
    health.circuitBreakers.forEach(cb => {
      const statusEmoji =
        cb.state === CircuitBreakerState.CLOSED
          ? '✅'
          : cb.state === CircuitBreakerState.OPEN
            ? '🔴'
            : '🟡';
      report.push(
        `  ${statusEmoji} ${cb.name}: ${cb.state.toUpperCase()} (${cb.failures} failures, ${cb.successes} successes)`,
      );
    });
  }

  return report.join('\n');
}
