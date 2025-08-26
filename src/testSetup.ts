/**
 * Test setup for Discord Reminder Bot TypeScript configuration
 *
 * This file validates the configuration system and colorized logging
 */

import { Settings } from '@/config/settings';
import { featureFlagManager, FeatureFlag } from '@/config/featureFlags';
import { setupLogging, testColorizedLogging, createLogger } from '@/utils/loggingConfig';

/**
 * Test the configuration system
 */
function testConfiguration(): void {
  const logger = createLogger('config-test');

  logger.info('🧪 Testing configuration system...');

  // Test settings
  logger.info(`Command prefix: ${Settings.COMMAND_PREFIX}`);
  logger.info(`Test mode: ${Settings.isTestMode()}`);
  logger.info(`Admin roles: ${Settings.getAdminRolesStr()}`);

  // Test interval formatting
  const testIntervals = [0.5, 1, 60, 1440, 10080];
  testIntervals.forEach(interval => {
    const formatted = Settings.formatIntervalDisplay(interval);
    logger.info(`Interval ${interval}min = ${formatted}`);
  });

  // Test auto-delete formatting
  const testDelays = [1/60, 1, 24, 168];
  testDelays.forEach(delay => {
    const formatted = Settings.formatAutoDeleteDisplay(delay);
    logger.info(`Delay ${delay}h = ${formatted}`);
  });

  logger.info('✅ Configuration system test completed');
}

/**
 * Test the feature flags system
 */
function testFeatureFlags(): void {
  const logger = createLogger('feature-flags-test');

  logger.info('🚩 Testing feature flags system...');

  // Set logger for feature flag manager
  featureFlagManager.setLogger({
    info: (msg: string) => logger.info(msg),
    warning: (msg: string) => logger.warn(msg),
    error: (msg: string) => logger.error(msg),
  });

  // Test flag states
  logger.info(`SQLite fully enabled: ${featureFlagManager.isSqliteFullyEnabled()}`);
  logger.info(`Degraded mode: ${featureFlagManager.isDegradedMode()}`);

  // Test individual flags
  const testFlags = [
    FeatureFlag.SQLITE_STORAGE,
    FeatureFlag.AUTO_FALLBACK,
    FeatureFlag.STRICT_VALIDATION,
  ];

  testFlags.forEach(flag => {
    const enabled = featureFlagManager.isEnabled(flag);
    logger.info(`Flag ${flag}: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  });

  // Get status summary
  const status = featureFlagManager.getStatusSummary();
  logger.info(`Enabled flags: ${status.enabledFlags.length}`);
  logger.info(`Fallback flags: ${status.fallbackFlags.length}`);

  logger.info('✅ Feature flags system test completed');
}

/**
 * Test the colorized logging system
 */
function testLogging(): void {
  const logger = createLogger('logging-test');

  logger.info('🎨 Testing colorized logging system...');

  // Test all log levels with emojis and French messages
  logger.debug('🔧 DEBUG - Test du système de logs colorisés TypeScript');
  logger.info('ℹ️ INFO - Configuration chargée avec succès');
  logger.warn('⚠️ WARNING - Exemple d\'avertissement système');
  logger.error('❌ ERROR - Simulation d\'erreur pour test');
  logger.fatal('🚨 CRITICAL - Test du niveau critique');

  // Test with additional metadata
  logger.info('📊 Test avec métadonnées', {
    component: 'test',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });

  logger.info('✅ Colorized logging test completed');
}

/**
 * Main test function
 */
export function runSetupTests(): void {
  console.log('\n=== Discord Reminder Bot - TypeScript Setup Tests ===\n');

  try {
    // Initialize logging
    setupLogging({
      logLevel: 'DEBUG',
      logToFile: false,
      useColors: true,
    });

    // Run tests
    testConfiguration();
    console.log(''); // Add spacing
    testFeatureFlags();
    console.log(''); // Add spacing
    testLogging();

    console.log('\n=== All setup tests completed successfully! ===\n');
  } catch (error) {
    console.error('❌ Setup test failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runSetupTests();
}