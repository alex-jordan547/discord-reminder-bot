import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Global Setup for Infrastructure Tests
 * ====================================
 * Prepares the environment for Docker infrastructure testing
 */

async function globalSetup() {
  console.log('🔧 Global Setup: Preparing infrastructure test environment...');
  
  const projectRoot = path.resolve(__dirname, '..', '..');
  process.chdir(projectRoot);
  
  try {
    // Ensure required directories exist
    const requiredDirs = [
      'volumes',
      'volumes/postgres', 
      'volumes/redis',
      'backups',
      'logs'
    ];
    
    for (const dir of requiredDirs) {
      const dirPath = path.join(projectRoot, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
    }
    
    // Ensure Docker is available
    try {
      execSync('docker --version', { stdio: 'pipe' });
      execSync('docker compose version', { stdio: 'pipe' });
      console.log('✅ Docker and Docker Compose are available');
    } catch (error) {
      throw new Error('Docker or Docker Compose is not available. Please install Docker Desktop.');
    }
    
    // Clean up any existing containers/volumes from previous runs
    try {
      execSync('docker compose down --volumes --remove-orphans', { 
        stdio: 'pipe',
        timeout: 30000
      });
      console.log('🧹 Cleaned up any existing Docker resources');
    } catch (error) {
      console.log('ℹ️  No existing Docker resources to clean up');
    }
    
    // Ensure required files exist
    const dockerComposeFile = path.join(projectRoot, 'docker-compose.yml');
    const dockerFile = path.join(projectRoot, 'Dockerfile');
    const entryPointFile = path.join(projectRoot, 'docker-entrypoint.sh');
    
    if (!fs.existsSync(dockerComposeFile)) {
      throw new Error('docker-compose.yml not found');
    }
    if (!fs.existsSync(dockerFile)) {
      throw new Error('Dockerfile not found');
    }
    if (!fs.existsSync(entryPointFile)) {
      throw new Error('docker-entrypoint.sh not found');
    }
    
    // Make sure docker-entrypoint.sh is executable
    try {
      execSync(`chmod +x "${entryPointFile}"`);
      console.log('✅ Set docker-entrypoint.sh as executable');
    } catch (error) {
      console.warn('⚠️  Could not set docker-entrypoint.sh permissions:', error.message);
    }
    
    console.log('✅ Global setup completed successfully');
    
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  }
}

export default globalSetup;