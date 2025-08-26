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
