#!/usr/bin/env node
/**
 * Docker Validation Script
 * ========================
 * Quick validation that Docker setup is working before running full tests
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function validateDocker() {
    console.log('🔍 Validating Docker setup...');
    
    try {
        // Change to project directory
        const projectRoot = __dirname;
        process.chdir(projectRoot);
        console.log(`📁 Working from: ${projectRoot}`);
        
        // Check Docker is available
        console.log('🐳 Checking Docker availability...');
        execSync('docker --version', { stdio: 'inherit' });
        execSync('docker compose version', { stdio: 'inherit' });
        
        // Check required files exist
        const requiredFiles = [
            'docker-compose.yml',
            'Dockerfile',
            'docker-entrypoint.sh',
            'scripts/init-db.sql',
            'scripts/migrate-database.js',
            '.env.docker'
        ];
        
        console.log('📄 Checking required files...');
        for (const file of requiredFiles) {
            const filePath = path.join(projectRoot, file);
            try {
                fs.accessSync(filePath);
                console.log(`✅ ${file}`);
            } catch (error) {
                console.error(`❌ Missing: ${file}`);
                process.exit(1);
            }
        }
        
        // Test docker compose config
        console.log('⚙️  Validating Docker Compose configuration...');
        execSync('docker compose --env-file .env.docker config --quiet', { 
            stdio: 'pipe',
            timeout: 30000
        });
        console.log('✅ Docker Compose configuration is valid');
        
        // Clean up any existing containers
        console.log('🧹 Cleaning up any existing containers...');
        try {
            execSync('docker compose --env-file .env.docker down --volumes --remove-orphans', { 
                stdio: 'pipe',
                timeout: 30000
            });
        } catch (error) {
            console.log('ℹ️  No existing containers to clean up');
        }
        
        // Quick test: start services without waiting
        console.log('🚀 Testing service startup (quick check)...');
        execSync('docker compose --env-file .env.docker up --build --detach --no-recreate', { 
            stdio: 'inherit',
            timeout: 60000
        });
        
        // Wait a bit for startup
        console.log('⏳ Waiting for services to initialize...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Check container status
        console.log('🔍 Checking container status...');
        const psOutput = execSync('docker compose ps --format json', { 
            encoding: 'utf8'
        });
        
        const containers = JSON.parse(psOutput);
        console.log(`📊 Found ${containers.length} containers:`);
        
        containers.forEach(container => {
            console.log(`  • ${container.Service}: ${container.State} ${container.Health ? `(${container.Health})` : ''}`);
        });
        
        // Basic connectivity test
        console.log('🔌 Testing basic connectivity...');
        
        // Test PostgreSQL port
        try {
            execSync('timeout 5 bash -c "cat < /dev/null > /dev/tcp/localhost/5432"', { stdio: 'pipe' });
            console.log('✅ PostgreSQL port accessible');
        } catch (error) {
            console.log('⚠️  PostgreSQL port not accessible (may still be starting)');
        }
        
        // Test Redis port
        try {
            execSync('timeout 5 bash -c "cat < /dev/null > /dev/tcp/localhost/6379"', { stdio: 'pipe' });
            console.log('✅ Redis port accessible');
        } catch (error) {
            console.log('⚠️  Redis port not accessible (may still be starting)');
        }
        
        // Test dashboard port
        try {
            execSync('timeout 5 bash -c "cat < /dev/null > /dev/tcp/localhost/3000"', { stdio: 'pipe' });
            console.log('✅ Dashboard port accessible');
        } catch (error) {
            console.log('⚠️  Dashboard port not accessible (may still be starting)');
        }
        
        console.log('🎉 Docker validation completed successfully!');
        console.log('');
        console.log('💡 You can now run the full test suite with:');
        console.log('   npm run test:infrastructure');
        console.log('');
        console.log('🧹 To clean up test containers:');
        console.log('   docker compose down --volumes --remove-orphans');
        
    } catch (error) {
        console.error('💥 Docker validation failed:', error.message);
        
        // Try to get container logs for debugging
        try {
            console.log('\n📋 Container logs (last 20 lines):');
            execSync('docker compose logs --tail=20', { stdio: 'inherit' });
        } catch (logError) {
            console.log('Could not retrieve logs');
        }
        
        process.exit(1);
    }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
    console.log('\n🛑 Interrupted, cleaning up...');
    try {
        execSync('docker compose down --volumes --remove-orphans', { stdio: 'inherit' });
    } catch (error) {
        console.error('Cleanup error:', error.message);
    }
    process.exit(0);
});

// Run validation
validateDocker().catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
});