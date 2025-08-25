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
