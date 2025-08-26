/**
 * Feature flags system for progressive SQLite migration.
 *
 * This module provides a centralized feature flag system that allows
 * for progressive activation of SQLite features with automatic fallback
 * to JSON storage when issues are detected.
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Available feature flags for the SQLite migration
 */
export enum FeatureFlag {
  // Core SQLite features
  SQLITE_STORAGE = 'sqlite_storage',
  SQLITE_MIGRATION = 'sqlite_migration',
  SQLITE_SCHEDULER = 'sqlite_scheduler',

  // Advanced features
  SQLITE_CONCURRENCY = 'sqlite_concurrency',
  SQLITE_MONITORING = 'sqlite_monitoring',
  SQLITE_BACKUP = 'sqlite_backup',

  // Fallback and safety features
  AUTO_FALLBACK = 'auto_fallback',
  DEGRADED_MODE = 'degraded_mode',
  STRICT_VALIDATION = 'strict_validation',
}

/**
 * Fallback information for a feature flag
 */
interface FallbackInfo {
  reason: string;
  timestamp: Date;
}

/**
 * Feature flag status summary
 */
export interface FeatureFlagStatus {
  sqliteFullyEnabled: boolean;
  degradedMode: boolean;
  enabledFlags: string[];
  fallbackFlags: Array<{
    flag: string;
    reason: string;
    timestamp: string;
  }>;
  totalEnabled: number;
  totalFallback: number;
}

/**
 * Logger interface for dependency injection
 */
interface Logger {
  info: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Manages feature flags for progressive SQLite activation.
 *
 * This class handles feature flag states, automatic fallback logic,
 * and provides a safe way to enable SQLite features progressively.
 */
export class FeatureFlagManager {
  private readonly flags = new Map<FeatureFlag, boolean>();
  private readonly fallbackReasons = new Map<FeatureFlag, string>();
  private readonly fallbackTimestamps = new Map<FeatureFlag, Date>();
  private logger: Logger | null = null;

  constructor() {
    this.loadFromEnvironment();
  }

  /**
   * Set the logger instance for this manager
   */
  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * Load feature flag states from environment variables
   */
  private loadFromEnvironment(): void {
    // Core SQLite features - controlled by main USE_SQLITE flag
    const useSqlite = this.getEnvFlag('USE_SQLITE', false);

    this.flags.set(
      FeatureFlag.SQLITE_STORAGE,
      useSqlite && this.getEnvFlag('SQLITE_STORAGE_ENABLED', true),
    );

    this.flags.set(
      FeatureFlag.SQLITE_MIGRATION,
      useSqlite && this.getEnvFlag('SQLITE_MIGRATION_ENABLED', true),
    );

    this.flags.set(
      FeatureFlag.SQLITE_SCHEDULER,
      useSqlite && this.getEnvFlag('SQLITE_SCHEDULER_ENABLED', true),
    );

    // Advanced features - more conservative defaults
    this.flags.set(
      FeatureFlag.SQLITE_CONCURRENCY,
      useSqlite && this.getEnvFlag('SQLITE_CONCURRENCY_ENABLED', true),
    );

    this.flags.set(
      FeatureFlag.SQLITE_MONITORING,
      useSqlite && this.getEnvFlag('SQLITE_MONITORING_ENABLED', true),
    );

    this.flags.set(
      FeatureFlag.SQLITE_BACKUP,
      useSqlite && this.getEnvFlag('SQLITE_BACKUP_ENABLED', true),
    );

    // Safety features - enabled by default when SQLite is used
    this.flags.set(FeatureFlag.AUTO_FALLBACK, this.getEnvFlag('AUTO_FALLBACK_ENABLED', true));

    this.flags.set(FeatureFlag.DEGRADED_MODE, this.getEnvFlag('DEGRADED_MODE_ENABLED', false));

    this.flags.set(
      FeatureFlag.STRICT_VALIDATION,
      this.getEnvFlag('STRICT_VALIDATION_ENABLED', true),
    );

    if (this.logger) {
      this.logger.info('Feature flags loaded from environment');
      this.logFlagStates();
    }
  }

  /**
   * Get a boolean flag from environment variable
   */
  private getEnvFlag(envVar: string, defaultValue: boolean): boolean {
    const value = process.env[envVar];
    if (value === undefined) {
      return defaultValue;
    }
    return value.toLowerCase() === 'true';
  }

  /**
   * Log current feature flag states
   */
  private logFlagStates(): void {
    if (!this.logger) {
      return;
    }

    this.logger.info('=== Feature Flag States ===');
    for (const [flag, enabled] of this.flags.entries()) {
      const status = enabled ? 'ENABLED' : 'DISABLED';
      const fallbackReason = this.fallbackReasons.get(flag);
      const displayStatus = fallbackReason ? `${status} (FALLBACK: ${fallbackReason})` : status;
      this.logger.info(`${flag}: ${displayStatus}`);
    }
    this.logger.info('===========================');
  }

  /**
   * Check if a feature flag is enabled.
   */
  isEnabled(flag: FeatureFlag): boolean {
    const enabled = this.flags.get(flag) ?? false;
    const hasFallback = this.fallbackReasons.has(flag);
    return enabled && !hasFallback;
  }

  /**
   * Enable a feature flag.
   */
  enableFlag(flag: FeatureFlag, reason = 'Manual activation'): void {
    this.flags.set(flag, true);
    this.fallbackReasons.delete(flag);
    this.fallbackTimestamps.delete(flag);

    if (this.logger) {
      this.logger.info(`Feature flag ${flag} ENABLED: ${reason}`);
    }
  }

  /**
   * Disable a feature flag.
   */
  disableFlag(flag: FeatureFlag, reason = 'Manual deactivation'): void {
    this.flags.set(flag, false);
    this.fallbackReasons.set(flag, reason);
    this.fallbackTimestamps.set(flag, new Date());

    if (this.logger) {
      this.logger.warning(`Feature flag ${flag} DISABLED: ${reason}`);
    }
  }

  /**
   * Trigger automatic fallback for a feature flag.
   */
  triggerFallback(flag: FeatureFlag, reason: string): void {
    if (!this.isEnabled(FeatureFlag.AUTO_FALLBACK)) {
      if (this.logger) {
        this.logger.warning(`Auto-fallback disabled, cannot fallback ${flag}`);
      }
      return;
    }

    this.fallbackReasons.set(flag, reason);
    this.fallbackTimestamps.set(flag, new Date());

    if (this.logger) {
      this.logger.error(`FALLBACK TRIGGERED for ${flag}: ${reason}`);
    }

    // Trigger cascading fallbacks for dependent features
    this.handleCascadingFallbacks(flag);
  }

  /**
   * Handle cascading fallbacks when a core feature fails
   */
  private handleCascadingFallbacks(failedFlag: FeatureFlag): void {
    if (failedFlag === FeatureFlag.SQLITE_STORAGE) {
      // If storage fails, disable all SQLite features
      const dependentFlags = [
        FeatureFlag.SQLITE_SCHEDULER,
        FeatureFlag.SQLITE_CONCURRENCY,
        FeatureFlag.SQLITE_MONITORING,
        FeatureFlag.SQLITE_BACKUP,
      ];

      for (const depFlag of dependentFlags) {
        if (this.isEnabled(depFlag)) {
          this.triggerFallback(depFlag, `Cascading fallback from ${failedFlag}`);
        }
      }
    } else if (failedFlag === FeatureFlag.SQLITE_MIGRATION) {
      // If migration fails, enable degraded mode
      this.enableFlag(FeatureFlag.DEGRADED_MODE, 'Migration failure fallback');
    }
  }

  /**
   * Check if a flag in fallback mode can be retried.
   */
  canRetryFlag(flag: FeatureFlag, retryDelayMinutes = 30): boolean {
    const fallbackTime = this.fallbackTimestamps.get(flag);
    if (!fallbackTime) {
      return true;
    }

    const retryTime = new Date(fallbackTime.getTime() + retryDelayMinutes * 60 * 1000);
    return new Date() >= retryTime;
  }

  /**
   * Get the reason why a flag is in fallback mode.
   */
  getFallbackReason(flag: FeatureFlag): string | undefined {
    return this.fallbackReasons.get(flag);
  }

  /**
   * Get all currently enabled feature flags.
   */
  getEnabledFlags(): Set<FeatureFlag> {
    const enabledFlags = new Set<FeatureFlag>();
    for (const flag of Object.values(FeatureFlag)) {
      if (this.isEnabled(flag)) {
        enabledFlags.add(flag);
      }
    }
    return enabledFlags;
  }

  /**
   * Get all feature flags currently in fallback mode.
   */
  getFallbackFlags(): Set<FeatureFlag> {
    return new Set(this.fallbackReasons.keys());
  }

  /**
   * Check if all core SQLite features are enabled.
   */
  isSqliteFullyEnabled(): boolean {
    const coreFlags = [
      FeatureFlag.SQLITE_STORAGE,
      FeatureFlag.SQLITE_MIGRATION,
      FeatureFlag.SQLITE_SCHEDULER,
    ];

    return coreFlags.every(flag => this.isEnabled(flag));
  }

  /**
   * Check if the system is running in degraded mode.
   */
  isDegradedMode(): boolean {
    return this.isEnabled(FeatureFlag.DEGRADED_MODE);
  }

  /**
   * Get a summary of the current feature flag status.
   */
  getStatusSummary(): FeatureFlagStatus {
    const enabledFlags = this.getEnabledFlags();
    const fallbackFlags = this.getFallbackFlags();

    return {
      sqliteFullyEnabled: this.isSqliteFullyEnabled(),
      degradedMode: this.isDegradedMode(),
      enabledFlags: Array.from(enabledFlags),
      fallbackFlags: Array.from(fallbackFlags).map(flag => ({
        flag,
        reason: this.fallbackReasons.get(flag) ?? 'Unknown',
        timestamp: (this.fallbackTimestamps.get(flag) ?? new Date()).toISOString(),
      })),
      totalEnabled: enabledFlags.size,
      totalFallback: fallbackFlags.size,
    };
  }
}

// Global feature flag manager instance
export const featureFlagManager = new FeatureFlagManager();

// Export the manager as default for convenience
export default featureFlagManager;