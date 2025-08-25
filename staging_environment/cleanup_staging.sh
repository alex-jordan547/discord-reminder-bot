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
