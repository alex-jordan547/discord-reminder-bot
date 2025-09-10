import { execSync } from 'child_process';

/**
 * Global Teardown for Infrastructure Tests
 * =======================================
 * Cleans up the environment after Docker infrastructure testing
 */

async function globalTeardown() {
  console.log('🧹 Global Teardown: Cleaning up infrastructure test environment...');

  try {
    // Stop and remove all containers, networks, and volumes
    try {
      execSync('docker compose down --volumes --remove-orphans --timeout 30', {
        stdio: 'inherit',
        timeout: 60000,
      });
      console.log('✅ Docker containers and volumes cleaned up');
    } catch (error) {
      console.warn('⚠️  Error during Docker cleanup:', error.message);
    }

    // Remove any dangling images created during testing
    try {
      execSync('docker image prune -f --filter label=stage=builder', {
        stdio: 'pipe',
        timeout: 30000,
      });
      console.log('✅ Cleaned up dangling Docker images');
    } catch (error) {
      console.warn('⚠️  Could not clean up Docker images:', error.message);
    }

    // Clean up any test artifacts that might have been created
    try {
      const cleanupCommands = [
        'docker system prune -f --volumes --filter label=com.docker.compose.project=discord-reminder-bot',
        'docker network prune -f',
      ];

      for (const command of cleanupCommands) {
        execSync(command, { stdio: 'pipe', timeout: 15000 });
      }
      console.log('✅ Docker system cleanup completed');
    } catch (error) {
      console.warn('⚠️  System cleanup warning:', error.message);
    }

    console.log('✅ Global teardown completed successfully');
  } catch (error) {
    console.error('❌ Global teardown encountered errors:', error);
    // Don't throw here as teardown errors shouldn't fail the test run
  }
}

export default globalTeardown;
