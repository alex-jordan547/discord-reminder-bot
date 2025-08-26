# SQLite Migration Staging Environment

This staging environment provides a safe, isolated space for testing the SQLite migration.

## Directory Structure

- `data/` - Staging data files
- `logs/` - Staging log files  
- `config/` - Staging configuration files
- `backups/` - Staging backup files

## Configuration

The staging environment uses `.env` for configuration. Key settings:

- `USE_SQLITE=false` - Start with JSON storage
- `TEST_MODE=true` - Enable test mode features
- `ENVIRONMENT=staging` - Identify as staging environment

## Running Tests

### Full Staging Validation
```bash
./run_staging_validation.sh
```

### Deployment Testing
```bash
./test_deployment.sh
```

### Manual Testing
```bash
# Load environment
source .env

# Run specific tests
python3 ../scripts/staging_validation.py --test-data-size 10 --skip-performance
python3 ../scripts/deploy_sqlite_migration.py --dry-run
python3 ../scripts/monitoring_alerts.py --test-alerts
```

## Cleanup

To clean up the staging environment:

```bash
./cleanup_staging.sh
```

## Safety Features

- Isolated from production data
- Automatic backups before testing
- Rollback capabilities
- Comprehensive validation

## Troubleshooting

Check logs in the `logs/` directory for detailed information about any issues.

Generated on: Mon Aug 25 18:56:31 CEST 2025
