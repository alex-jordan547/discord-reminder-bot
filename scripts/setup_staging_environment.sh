#!/bin/bash
"""
Setup script for SQLite migration staging environment.

This script sets up a complete staging environment for testing
the SQLite migration with proper isolation and safety measures.
"""

set -e  # Exit on any error

# Configuration
STAGING_DIR="staging_environment"
BACKUP_DIR="staging_backups"
LOG_FILE="staging_setup_$(date +%Y%m%d_%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
    log "SUCCESS: $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
    log "WARNING: $1"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    log "ERROR: $1"
}

print_info() {
    echo -e "${BLUE}ℹ️ $1${NC}"
    log "INFO: $1"
}

# Check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check Python version
    if ! python3 --version | grep -q "Python 3\.[9-9]\|Python 3\.1[0-9]"; then
        print_error "Python 3.9+ required"
        exit 1
    fi
    print_status "Python version check passed"
    
    # Check required Python packages
    if ! python3 -c "import sqlite3, json, asyncio" 2>/dev/null; then
        print_error "Required Python packages not available"
        exit 1
    fi
    print_status "Python packages check passed"
    
    # Check disk space (require at least 500MB)
    available_space=$(df . | tail -1 | awk '{print $4}')
    required_space=512000  # 500MB in KB
    
    if [ "$available_space" -lt "$required_space" ]; then
        print_error "Insufficient disk space. Required: 500MB, Available: $((available_space/1024))MB"
        exit 1
    fi
    print_status "Disk space check passed ($((available_space/1024))MB available)"
    
    # Check write permissions
    if ! touch test_write_permission.tmp 2>/dev/null; then
        print_error "No write permissions in current directory"
        exit 1
    fi
    rm -f test_write_permission.tmp
    print_status "Write permissions check passed"
}

# Create staging directory structure
create_staging_structure() {
    print_info "Creating staging directory structure..."
    
    # Create main staging directory
    mkdir -p "$STAGING_DIR"
    mkdir -p "$STAGING_DIR/data"
    mkdir -p "$STAGING_DIR/logs"
    mkdir -p "$STAGING_DIR/config"
    mkdir -p "$STAGING_DIR/backups"
    mkdir -p "$BACKUP_DIR"
    
    print_status "Staging directory structure created"
}

# Backup production data
backup_production_data() {
    print_info "Backing up production data..."
    
    backup_timestamp=$(date +%Y%m%d_%H%M%S)
    production_backup_dir="$BACKUP_DIR/production_backup_$backup_timestamp"
    mkdir -p "$production_backup_dir"
    
    # Backup JSON files
    if [ -f "watched_reminders.json" ]; then
        cp "watched_reminders.json" "$production_backup_dir/"
        print_status "JSON data backed up"
    else
        print_warning "No JSON data file found to backup"
    fi
    
    # Backup SQLite database
    if [ -f "discord_bot.db" ]; then
        cp "discord_bot.db" "$production_backup_dir/"
        cp "discord_bot.db-shm" "$production_backup_dir/" 2>/dev/null || true
        cp "discord_bot.db-wal" "$production_backup_dir/" 2>/dev/null || true
        print_status "SQLite database backed up"
    else
        print_warning "No SQLite database found to backup"
    fi
    
    # Backup configuration
    if [ -f ".env" ]; then
        cp ".env" "$production_backup_dir/"
        print_status "Configuration backed up"
    fi
    
    # Backup logs
    if [ -d "logs" ]; then
        cp -r "logs" "$production_backup_dir/"
        print_status "Logs backed up"
    fi
    
    echo "$production_backup_dir" > "$STAGING_DIR/.production_backup_path"
    print_status "Production data backup completed: $production_backup_dir"
}

# Setup staging configuration
setup_staging_config() {
    print_info "Setting up staging configuration..."
    
    # Create staging .env file
    cat > "$STAGING_DIR/.env" << EOF
# Staging Environment Configuration
DISCORD_TOKEN=${DISCORD_TOKEN:-your_test_bot_token_here}

# SQLite Configuration
USE_SQLITE=false
DATABASE_PATH=staging_discord_bot.db
AUTO_MIGRATE=true
BACKUP_JSON_ON_MIGRATION=true

# Feature Flags
SQLITE_STORAGE_ENABLED=true
SQLITE_MIGRATION_ENABLED=true
SQLITE_SCHEDULER_ENABLED=true
SQLITE_CONCURRENCY_ENABLED=true
SQLITE_MONITORING_ENABLED=true
SQLITE_BACKUP_ENABLED=true

# Safety Features
AUTO_FALLBACK_ENABLED=true
DEGRADED_MODE_ENABLED=false
STRICT_VALIDATION_ENABLED=true

# Test Mode
TEST_MODE=true
REMINDER_INTERVAL_HOURS=0.1

# Logging
LOG_LEVEL=INFO

# Staging Identification
ENVIRONMENT=staging
STAGING_MODE=true
EOF
    
    print_status "Staging .env configuration created"
    
    # Create staging validation config
    cp "config/staging_validation_config.json" "$STAGING_DIR/config/" 2>/dev/null || {
        cat > "$STAGING_DIR/config/staging_validation_config.json" << EOF
{
  "test_data_size": 25,
  "anonymize_data": true,
  "test_migration": true,
  "test_rollback": true,
  "test_error_scenarios": false,
  "test_performance": true,
  "test_concurrency": false,
  "performance_threshold_ms": 3000,
  "concurrent_operations": 3,
  "cleanup_after_tests": true,
  "create_detailed_report": true
}
EOF
    }
    
    print_status "Staging validation configuration created"
}

# Create test data
create_test_data() {
    print_info "Creating test data..."
    
    # Create minimal test JSON data
    cat > "$STAGING_DIR/watched_reminders.json" << EOF
{
  "1000000000000000001": {
    "message_id": 1000000000000000001,
    "channel_id": 2000000000000000001,
    "guild_id": 3000000000000000001,
    "title": "Test Event 1",
    "description": "First test event for staging",
    "interval_minutes": 60,
    "is_paused": false,
    "required_reactions": ["✅", "❌", "❓"],
    "last_reminder": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
    "reactions": []
  },
  "1000000000000000002": {
    "message_id": 1000000000000000002,
    "channel_id": 2000000000000000002,
    "guild_id": 3000000000000000001,
    "title": "Test Event 2",
    "description": "Second test event for staging",
    "interval_minutes": 120,
    "is_paused": true,
    "required_reactions": ["✅", "❌"],
    "last_reminder": "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S.000Z)",
    "created_at": "$(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S.000Z)",
    "reactions": [
      {
        "user_id": 4000000000000000001,
        "emoji": "✅",
        "reacted_at": "$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%S.000Z)"
      }
    ]
  }
}
EOF
    
    print_status "Test data created"
}

# Setup staging scripts
setup_staging_scripts() {
    print_info "Setting up staging scripts..."
    
    # Create staging run script
    cat > "$STAGING_DIR/run_staging_validation.sh" << 'EOF'
#!/bin/bash
# Staging validation runner script

set -e

# Load staging environment
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Run staging validation
echo "🧪 Running SQLite Migration Staging Validation..."
python3 ../scripts/staging_validation.py \
    --config config/staging_validation_config.json \
    --test-data-size 25

echo "✅ Staging validation completed"
EOF
    
    chmod +x "$STAGING_DIR/run_staging_validation.sh"
    print_status "Staging validation runner created"
    
    # Create staging deployment test script
    cat > "$STAGING_DIR/test_deployment.sh" << 'EOF'
#!/bin/bash
# Staging deployment test script

set -e

# Load staging environment
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

echo "🚀 Testing deployment in staging environment..."

# Test deployment script
python3 ../scripts/deploy_sqlite_migration.py \
    --dry-run \
    --config config/deployment_config.json

echo "✅ Deployment test completed"
EOF
    
    chmod +x "$STAGING_DIR/test_deployment.sh"
    print_status "Staging deployment test script created"
    
    # Create cleanup script
    cat > "$STAGING_DIR/cleanup_staging.sh" << 'EOF'
#!/bin/bash
# Staging cleanup script

echo "🧹 Cleaning up staging environment..."

# Remove test databases
rm -f staging_discord_bot.db*

# Remove test logs
rm -f staging_*.log

# Remove test reports
rm -f staging_*_report_*.json

# Remove temporary files
rm -f test_*.tmp

echo "✅ Staging environment cleaned up"
EOF
    
    chmod +x "$STAGING_DIR/cleanup_staging.sh"
    print_status "Staging cleanup script created"
}

# Validate staging environment
validate_staging_environment() {
    print_info "Validating staging environment..."
    
    # Check directory structure
    required_dirs=("$STAGING_DIR" "$STAGING_DIR/data" "$STAGING_DIR/logs" "$STAGING_DIR/config" "$STAGING_DIR/backups")
    for dir in "${required_dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            print_error "Required directory missing: $dir"
            exit 1
        fi
    done
    print_status "Directory structure validation passed"
    
    # Check configuration files
    if [ ! -f "$STAGING_DIR/.env" ]; then
        print_error "Staging .env file missing"
        exit 1
    fi
    print_status "Configuration files validation passed"
    
    # Check scripts
    required_scripts=("$STAGING_DIR/run_staging_validation.sh" "$STAGING_DIR/test_deployment.sh" "$STAGING_DIR/cleanup_staging.sh")
    for script in "${required_scripts[@]}"; do
        if [ ! -x "$script" ]; then
            print_error "Required script missing or not executable: $script"
            exit 1
        fi
    done
    print_status "Scripts validation passed"
    
    # Test Python imports in staging context
    cd "$STAGING_DIR"
    if ! python3 -c "
import sys
sys.path.insert(0, '..')
try:
    from config.feature_flags import feature_flags
    from utils.unified_event_manager import unified_event_manager
    print('✅ Python imports successful')
except Exception as e:
    print(f'❌ Python import failed: {e}')
    exit(1)
" 2>/dev/null; then
        print_error "Python imports validation failed"
        cd ..
        exit 1
    fi
    cd ..
    print_status "Python imports validation passed"
}

# Generate staging documentation
generate_staging_docs() {
    print_info "Generating staging documentation..."
    
    cat > "$STAGING_DIR/README.md" << EOF
# SQLite Migration Staging Environment

This staging environment provides a safe, isolated space for testing the SQLite migration.

## Directory Structure

- \`data/\` - Staging data files
- \`logs/\` - Staging log files  
- \`config/\` - Staging configuration files
- \`backups/\` - Staging backup files

## Configuration

The staging environment uses \`.env\` for configuration. Key settings:

- \`USE_SQLITE=false\` - Start with JSON storage
- \`TEST_MODE=true\` - Enable test mode features
- \`ENVIRONMENT=staging\` - Identify as staging environment

## Running Tests

### Full Staging Validation
\`\`\`bash
./run_staging_validation.sh
\`\`\`

### Deployment Testing
\`\`\`bash
./test_deployment.sh
\`\`\`

### Manual Testing
\`\`\`bash
# Load environment
source .env

# Run specific tests
python3 ../scripts/staging_validation.py --test-data-size 10 --skip-performance
python3 ../scripts/deploy_sqlite_migration.py --dry-run
python3 ../scripts/monitoring_alerts.py --test-alerts
\`\`\`

## Cleanup

To clean up the staging environment:

\`\`\`bash
./cleanup_staging.sh
\`\`\`

## Safety Features

- Isolated from production data
- Automatic backups before testing
- Rollback capabilities
- Comprehensive validation

## Troubleshooting

Check logs in the \`logs/\` directory for detailed information about any issues.

Generated on: $(date)
EOF
    
    print_status "Staging documentation generated"
}

# Main execution
main() {
    print_info "Starting SQLite Migration Staging Environment Setup"
    print_info "Log file: $LOG_FILE"
    
    check_prerequisites
    create_staging_structure
    backup_production_data
    setup_staging_config
    create_test_data
    setup_staging_scripts
    validate_staging_environment
    generate_staging_docs
    
    print_status "Staging environment setup completed successfully!"
    print_info "Staging directory: $STAGING_DIR"
    print_info "Production backup: $(cat $STAGING_DIR/.production_backup_path 2>/dev/null || echo 'None')"
    
    echo ""
    echo -e "${GREEN}🎉 Staging Environment Ready!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. cd $STAGING_DIR"
    echo "2. Review and update .env configuration if needed"
    echo "3. Run ./run_staging_validation.sh to test the migration"
    echo "4. Run ./test_deployment.sh to test deployment procedures"
    echo ""
    echo "For more information, see $STAGING_DIR/README.md"
}

# Run main function
main "$@"