#!/bin/bash
# Comprehensive Backup and Disaster Recovery System
# =================================================
# This script provides automated backup and recovery capabilities for the Discord Reminder Bot

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
LOG_FILE="$PROJECT_ROOT/logs/backup-system.log"

# Backup configuration
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_COMPRESSION="${BACKUP_COMPRESSION:-true}"
BACKUP_ENCRYPTION="${BACKUP_ENCRYPTION:-false}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
BACKUP_REMOTE_ENABLED="${BACKUP_REMOTE_ENABLED:-false}"
BACKUP_REMOTE_TYPE="${BACKUP_REMOTE_TYPE:-s3}"

# Notification settings
BACKUP_NOTIFY_SUCCESS="${BACKUP_NOTIFY_SUCCESS:-false}"
BACKUP_NOTIFY_FAILURE="${BACKUP_NOTIFY_FAILURE:-true}"
BACKUP_NOTIFY_EMAIL="${BACKUP_NOTIFY_EMAIL:-}"
BACKUP_NOTIFY_WEBHOOK="${BACKUP_NOTIFY_WEBHOOK:-}"

# Create required directories
mkdir -p "$BACKUP_DIR"/{database,application,system,archives}
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

# Error handling
handle_error() {
    local exit_code=$?
    local line_number=$1
    log "ERROR" "Script failed at line $line_number with exit code $exit_code"
    send_notification "FAILURE" "Backup failed at line $line_number"
    exit $exit_code
}

trap 'handle_error $LINENO' ERR

# Notification function
send_notification() {
    local status="$1"
    local message="$2"
    
    # Email notification
    if [ "$BACKUP_NOTIFY_EMAIL" ] && [ "$status" = "FAILURE" ] || [ "$BACKUP_NOTIFY_SUCCESS" = "true" ]; then
        echo "Backup Status: $status - $message" | mail -s "Discord Bot Backup $status" "$BACKUP_NOTIFY_EMAIL" 2>/dev/null || true
    fi
    
    # Webhook notification
    if [ "$BACKUP_NOTIFY_WEBHOOK" ]; then
        local emoji="✅"
        [ "$status" = "FAILURE" ] && emoji="❌"
        
        curl -X POST "$BACKUP_NOTIFY_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"$emoji Discord Bot Backup $status: $message\"}" \
            >/dev/null 2>&1 || true
    fi
}

# Compression function
compress_file() {
    local source="$1"
    local target="$2"
    
    if [ "$BACKUP_COMPRESSION" = "true" ]; then
        log "INFO" "🗜️ Compressing: $source -> $target.gz"
        gzip -c "$source" > "$target.gz"
        rm "$source"
        echo "$target.gz"
    else
        mv "$source" "$target"
        echo "$target"
    fi
}

# Encryption function
encrypt_file() {
    local source="$1"
    local target="$2"
    
    if [ "$BACKUP_ENCRYPTION" = "true" ] && [ "$BACKUP_ENCRYPTION_KEY" ]; then
        log "INFO" "🔐 Encrypting: $source -> $target.enc"
        openssl enc -aes-256-cbc -salt -in "$source" -out "$target.enc" -k "$BACKUP_ENCRYPTION_KEY"
        rm "$source"
        echo "$target.enc"
    else
        echo "$source"
    fi
}

# Database backup functions
backup_postgresql() {
    local backup_file="$BACKUP_DIR/database/postgres-$(date +%Y%m%d-%H%M%S).sql"
    
    log "INFO" "📊 Backing up PostgreSQL database..."
    
    if docker exec discord-bot-postgres pg_dump -U bot_user -d discord_bot > "$backup_file" 2>/dev/null; then
        log "INFO" "✅ PostgreSQL backup completed: $backup_file"
        
        # Compress and encrypt
        backup_file=$(compress_file "$backup_file" "$backup_file")
        backup_file=$(encrypt_file "$backup_file" "$backup_file")
        
        echo "$backup_file"
    else
        log "ERROR" "❌ PostgreSQL backup failed"
        return 1
    fi
}

backup_sqlite() {
    local backup_file="$BACKUP_DIR/database/sqlite-$(date +%Y%m%d-%H%M%S).db"
    local source_db="$PROJECT_ROOT/data/discord_bot.db"
    
    log "INFO" "📄 Backing up SQLite database..."
    
    if [ -f "$source_db" ]; then
        # Use SQLite backup command for consistency
        if docker exec discord-reminder-bot sqlite3 "$source_db" ".backup $backup_file" 2>/dev/null; then
            log "INFO" "✅ SQLite backup completed: $backup_file"
            
            # Compress and encrypt
            backup_file=$(compress_file "$backup_file" "$backup_file")
            backup_file=$(encrypt_file "$backup_file" "$backup_file")
            
            echo "$backup_file"
        else
            # Fallback to file copy
            cp "$source_db" "$backup_file"
            log "INFO" "✅ SQLite backup completed (copy): $backup_file"
            echo "$backup_file"
        fi
    else
        log "WARN" "⚠️ SQLite database not found: $source_db"
        return 1
    fi
}

backup_redis() {
    local backup_file="$BACKUP_DIR/database/redis-$(date +%Y%m%d-%H%M%S).rdb"
    
    log "INFO" "🗃️ Backing up Redis data..."
    
    if docker exec discord-bot-redis redis-cli BGSAVE >/dev/null 2>&1; then
        # Wait for background save to complete
        while [ "$(docker exec discord-bot-redis redis-cli LASTSAVE)" = "$(docker exec discord-bot-redis redis-cli LASTSAVE)" ]; do
            sleep 1
        done
        
        # Copy the RDB file
        docker cp discord-bot-redis:/data/dump.rdb "$backup_file"
        log "INFO" "✅ Redis backup completed: $backup_file"
        
        # Compress and encrypt
        backup_file=$(compress_file "$backup_file" "$backup_file")
        backup_file=$(encrypt_file "$backup_file" "$backup_file")
        
        echo "$backup_file"
    else
        log "ERROR" "❌ Redis backup failed"
        return 1
    fi
}

# Application backup functions
backup_application_data() {
    local backup_file="$BACKUP_DIR/application/app-data-$(date +%Y%m%d-%H%M%S).tar"
    
    log "INFO" "📦 Backing up application data..."
    
    # Include data directory, logs, and configuration
    tar -cf "$backup_file" \
        -C "$PROJECT_ROOT" \
        data/ \
        logs/ \
        .env 2>/dev/null || true
    
    if [ -f "$backup_file" ]; then
        log "INFO" "✅ Application data backup completed: $backup_file"
        
        # Compress and encrypt
        backup_file=$(compress_file "$backup_file" "$backup_file")
        backup_file=$(encrypt_file "$backup_file" "$backup_file")
        
        echo "$backup_file"
    else
        log "ERROR" "❌ Application data backup failed"
        return 1
    fi
}

backup_docker_volumes() {
    local backup_file="$BACKUP_DIR/system/docker-volumes-$(date +%Y%m%d-%H%M%S).tar"
    
    log "INFO" "🐳 Backing up Docker volumes..."
    
    # Backup Docker volumes
    tar -cf "$backup_file" \
        -C "$PROJECT_ROOT" \
        volumes/ 2>/dev/null || true
    
    if [ -f "$backup_file" ]; then
        log "INFO" "✅ Docker volumes backup completed: $backup_file"
        
        # Compress and encrypt
        backup_file=$(compress_file "$backup_file" "$backup_file")
        backup_file=$(encrypt_file "$backup_file" "$backup_file")
        
        echo "$backup_file"
    else
        log "ERROR" "❌ Docker volumes backup failed"
        return 1
    fi
}

backup_configuration() {
    local backup_file="$BACKUP_DIR/system/config-$(date +%Y%m%d-%H%M%S).tar"
    
    log "INFO" "⚙️ Backing up configuration files..."
    
    # Backup configuration files (excluding sensitive data)
    tar -cf "$backup_file" \
        -C "$PROJECT_ROOT" \
        docker-compose.yml \
        Dockerfile \
        package.json \
        package-lock.json \
        .env.example \
        .env.docker \
        scripts/ \
        monitoring/ 2>/dev/null || true
    
    if [ -f "$backup_file" ]; then
        log "INFO" "✅ Configuration backup completed: $backup_file"
        
        # Compress and encrypt
        backup_file=$(compress_file "$backup_file" "$backup_file")
        backup_file=$(encrypt_file "$backup_file" "$backup_file")
        
        echo "$backup_file"
    else
        log "ERROR" "❌ Configuration backup failed"
        return 1
    fi
}

# System backup functions
backup_system_info() {
    local backup_file="$BACKUP_DIR/system/system-info-$(date +%Y%m%d-%H%M%S).txt"
    
    log "INFO" "🖥️ Collecting system information..."
    
    {
        echo "=== System Information Backup ==="
        echo "Date: $(date)"
        echo "Hostname: $(hostname)"
        echo "OS: $(uname -a)"
        echo ""
        echo "=== Docker Information ==="
        docker version 2>/dev/null || echo "Docker not available"
        docker-compose version 2>/dev/null || echo "Docker Compose not available"
        echo ""
        echo "=== Container Status ==="
        docker-compose ps 2>/dev/null || echo "No containers running"
        echo ""
        echo "=== Disk Usage ==="
        df -h
        echo ""
        echo "=== Memory Usage ==="
        free -h
        echo ""
        echo "=== Network Configuration ==="
        ip addr show 2>/dev/null || ifconfig 2>/dev/null || echo "Network info not available"
    } > "$backup_file"
    
    log "INFO" "✅ System information collected: $backup_file"
    echo "$backup_file"
}

# Remote backup functions
upload_to_s3() {
    local file="$1"
    local s3_bucket="$BACKUP_S3_BUCKET"
    local s3_path="discord-bot-backups/$(date +%Y/%m/%d)/$(basename "$file")"
    
    if [ "$BACKUP_REMOTE_ENABLED" = "true" ] && [ "$BACKUP_REMOTE_TYPE" = "s3" ] && [ "$s3_bucket" ]; then
        log "INFO" "☁️ Uploading to S3: $file -> s3://$s3_bucket/$s3_path"
        
        if aws s3 cp "$file" "s3://$s3_bucket/$s3_path" >/dev/null 2>&1; then
            log "INFO" "✅ S3 upload completed"
            return 0
        else
            log "ERROR" "❌ S3 upload failed"
            return 1
        fi
    fi
    
    return 0
}

upload_to_remote() {
    local file="$1"
    
    case "$BACKUP_REMOTE_TYPE" in
        "s3")
            upload_to_s3 "$file"
            ;;
        "rsync")
            if [ "$BACKUP_RSYNC_DESTINATION" ]; then
                rsync -avz "$file" "$BACKUP_RSYNC_DESTINATION/" >/dev/null 2>&1
            fi
            ;;
        *)
            log "WARN" "⚠️ Unknown remote backup type: $BACKUP_REMOTE_TYPE"
            ;;
    esac
}

# Cleanup old backups
cleanup_old_backups() {
    log "INFO" "🧹 Cleaning up old backups (older than $BACKUP_RETENTION_DAYS days)..."
    
    local deleted_count=0
    
    # Clean up local backups
    for dir in "$BACKUP_DIR"/{database,application,system,archives}; do
        if [ -d "$dir" ]; then
            while IFS= read -r -d '' file; do
                log "INFO" "🗑️ Deleting old backup: $file"
                rm "$file"
                ((deleted_count++))
            done < <(find "$dir" -type f -mtime +$BACKUP_RETENTION_DAYS -print0 2>/dev/null)
        fi
    done
    
    log "INFO" "✅ Cleanup completed: $deleted_count files deleted"
}

# Backup verification
verify_backup() {
    local backup_file="$1"
    local backup_type="$2"
    
    log "INFO" "🔍 Verifying backup: $backup_file"
    
    # Check file exists and is not empty
    if [ ! -f "$backup_file" ] || [ ! -s "$backup_file" ]; then
        log "ERROR" "❌ Backup verification failed: file missing or empty"
        return 1
    fi
    
    # Type-specific verification
    case "$backup_type" in
        "postgres")
            # Check if it's a valid SQL dump
            if echo "$backup_file" | grep -q "\.gz$"; then
                gunzip -t "$backup_file" 2>/dev/null
            elif echo "$backup_file" | grep -q "\.sql$"; then
                head -1 "$backup_file" | grep -q "PostgreSQL\|-- PostgreSQL" 2>/dev/null
            fi
            ;;
        "sqlite")
            # Check if it's a valid SQLite database
            if echo "$backup_file" | grep -q "\.gz$"; then
                gunzip -t "$backup_file" 2>/dev/null
            elif echo "$backup_file" | grep -q "\.db$"; then
                file "$backup_file" | grep -q "SQLite" 2>/dev/null
            fi
            ;;
        "tar")
            # Check if it's a valid tar archive
            if echo "$backup_file" | grep -q "\.gz$"; then
                gunzip -t "$backup_file" 2>/dev/null
            elif echo "$backup_file" | grep -q "\.tar$"; then
                tar -tf "$backup_file" >/dev/null 2>&1
            fi
            ;;
    esac
    
    if [ $? -eq 0 ]; then
        log "INFO" "✅ Backup verification passed"
        return 0
    else
        log "ERROR" "❌ Backup verification failed"
        return 1
    fi
}

# Create comprehensive backup manifest
create_backup_manifest() {
    local manifest_file="$BACKUP_DIR/backup-manifest-$(date +%Y%m%d-%H%M%S).json"
    
    log "INFO" "📋 Creating backup manifest..."
    
    {
        echo "{"
        echo "  \"backup_date\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
        echo "  \"backup_host\": \"$(hostname)\","
        echo "  \"backup_user\": \"$(whoami)\","
        echo "  \"backup_version\": \"1.0\","
        echo "  \"project_root\": \"$PROJECT_ROOT\","
        echo "  \"files\": ["
        
        local first=true
        for file in $(find "$BACKUP_DIR" -name "*$(date +%Y%m%d)*" -type f 2>/dev/null); do
            [ "$first" = true ] && first=false || echo ","
            echo -n "    {"
            echo -n "\"path\": \"$file\", "
            echo -n "\"size\": $(stat -c%s "$file" 2>/dev/null || echo "0"), "
            echo -n "\"checksum\": \"$(md5sum "$file" 2>/dev/null | cut -d' ' -f1 || echo "unknown")\""
            echo -n "}"
        done
        
        echo ""
        echo "  ],"
        echo "  \"configuration\": {"
        echo "    \"compression\": $BACKUP_COMPRESSION,"
        echo "    \"encryption\": $BACKUP_ENCRYPTION,"
        echo "    \"remote_backup\": $BACKUP_REMOTE_ENABLED,"
        echo "    \"retention_days\": $BACKUP_RETENTION_DAYS"
        echo "  }"
        echo "}"
    } > "$manifest_file"
    
    log "INFO" "✅ Backup manifest created: $manifest_file"
    echo "$manifest_file"
}

# Main backup function
perform_full_backup() {
    log "INFO" "🚀 Starting full backup process..."
    
    local backup_start_time=$(date +%s)
    local backup_files=()
    local failed_backups=()
    
    # Database backups
    if backup_file=$(backup_postgresql 2>/dev/null); then
        backup_files+=("$backup_file")
        verify_backup "$backup_file" "postgres" && upload_to_remote "$backup_file"
    else
        failed_backups+=("PostgreSQL")
    fi
    
    if backup_file=$(backup_sqlite 2>/dev/null); then
        backup_files+=("$backup_file")
        verify_backup "$backup_file" "sqlite" && upload_to_remote "$backup_file"
    else
        failed_backups+=("SQLite")
    fi
    
    if backup_file=$(backup_redis 2>/dev/null); then
        backup_files+=("$backup_file")
        upload_to_remote "$backup_file"
    else
        failed_backups+=("Redis")
    fi
    
    # Application backups
    if backup_file=$(backup_application_data 2>/dev/null); then
        backup_files+=("$backup_file")
        verify_backup "$backup_file" "tar" && upload_to_remote "$backup_file"
    else
        failed_backups+=("Application Data")
    fi
    
    if backup_file=$(backup_docker_volumes 2>/dev/null); then
        backup_files+=("$backup_file")
        verify_backup "$backup_file" "tar" && upload_to_remote "$backup_file"
    else
        failed_backups+=("Docker Volumes")
    fi
    
    if backup_file=$(backup_configuration 2>/dev/null); then
        backup_files+=("$backup_file")
        verify_backup "$backup_file" "tar" && upload_to_remote "$backup_file"
    else
        failed_backups+=("Configuration")
    fi
    
    # System information
    if backup_file=$(backup_system_info 2>/dev/null); then
        backup_files+=("$backup_file")
        upload_to_remote "$backup_file"
    else
        failed_backups+=("System Info")
    fi
    
    # Create manifest
    manifest_file=$(create_backup_manifest)
    backup_files+=("$manifest_file")
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Calculate backup duration
    local backup_end_time=$(date +%s)
    local backup_duration=$((backup_end_time - backup_start_time))
    
    # Summary
    log "INFO" "📊 Backup Summary:"
    log "INFO" "   Duration: ${backup_duration}s"
    log "INFO" "   Successful: ${#backup_files[@]} files"
    log "INFO" "   Failed: ${#failed_backups[@]} components"
    
    if [ ${#failed_backups[@]} -eq 0 ]; then
        log "INFO" "✅ Full backup completed successfully!"
        send_notification "SUCCESS" "Full backup completed in ${backup_duration}s"
        return 0
    else
        log "ERROR" "❌ Backup completed with failures: ${failed_backups[*]}"
        send_notification "FAILURE" "Backup completed with failures: ${failed_backups[*]}"
        return 1
    fi
}

# Recovery functions
restore_postgresql() {
    local backup_file="$1"
    
    log "INFO" "🔄 Restoring PostgreSQL from: $backup_file"
    
    # Decrypt if needed
    if [[ "$backup_file" == *.enc ]]; then
        local decrypted_file="${backup_file%.enc}"
        openssl enc -aes-256-cbc -d -in "$backup_file" -out "$decrypted_file" -k "$BACKUP_ENCRYPTION_KEY"
        backup_file="$decrypted_file"
    fi
    
    # Decompress if needed
    if [[ "$backup_file" == *.gz ]]; then
        gunzip "$backup_file"
        backup_file="${backup_file%.gz}"
    fi
    
    # Stop application to prevent connections
    docker-compose stop discord-reminder-bot
    
    # Drop and recreate database
    docker exec discord-bot-postgres dropdb -U postgres discord_bot --if-exists
    docker exec discord-bot-postgres createdb -U postgres discord_bot
    
    # Restore from backup
    if docker exec -i discord-bot-postgres psql -U bot_user -d discord_bot < "$backup_file"; then
        log "INFO" "✅ PostgreSQL restore completed"
        
        # Restart application
        docker-compose start discord-reminder-bot
        return 0
    else
        log "ERROR" "❌ PostgreSQL restore failed"
        return 1
    fi
}

restore_sqlite() {
    local backup_file="$1"
    local target_db="$PROJECT_ROOT/data/discord_bot.db"
    
    log "INFO" "🔄 Restoring SQLite from: $backup_file"
    
    # Stop application
    docker-compose stop discord-reminder-bot
    
    # Backup current database
    [ -f "$target_db" ] && cp "$target_db" "$target_db.backup.$(date +%Y%m%d-%H%M%S)"
    
    # Decrypt if needed
    if [[ "$backup_file" == *.enc ]]; then
        local decrypted_file="${backup_file%.enc}"
        openssl enc -aes-256-cbc -d -in "$backup_file" -out "$decrypted_file" -k "$BACKUP_ENCRYPTION_KEY"
        backup_file="$decrypted_file"
    fi
    
    # Decompress if needed
    if [[ "$backup_file" == *.gz ]]; then
        gunzip "$backup_file"
        backup_file="${backup_file%.gz}"
    fi
    
    # Restore database
    cp "$backup_file" "$target_db"
    
    # Verify restoration
    if sqlite3 "$target_db" "PRAGMA integrity_check;" | grep -q "ok"; then
        log "INFO" "✅ SQLite restore completed"
        
        # Restart application
        docker-compose start discord-reminder-bot
        return 0
    else
        log "ERROR" "❌ SQLite restore failed"
        return 1
    fi
}

# Command line interface
case "${1:-help}" in
    "backup"|"full")
        perform_full_backup
        ;;
    "restore-postgres")
        [ -z "${2:-}" ] && { echo "Usage: $0 restore-postgres <backup-file>"; exit 1; }
        restore_postgresql "$2"
        ;;
    "restore-sqlite")
        [ -z "${2:-}" ] && { echo "Usage: $0 restore-sqlite <backup-file>"; exit 1; }
        restore_sqlite "$2"
        ;;
    "cleanup")
        cleanup_old_backups
        ;;
    "verify")
        [ -z "${2:-}" ] && { echo "Usage: $0 verify <backup-file> [type]"; exit 1; }
        verify_backup "$2" "${3:-unknown}"
        ;;
    "list")
        echo "Available backups:"
        find "$BACKUP_DIR" -name "*.sql*" -o -name "*.db*" -o -name "*.tar*" | sort
        ;;
    "help"|*)
        cat << EOF
Discord Reminder Bot Backup System

Usage: $0 [command] [options]

Commands:
  backup, full          Perform full system backup
  restore-postgres FILE Restore PostgreSQL from backup file
  restore-sqlite FILE   Restore SQLite from backup file
  cleanup              Remove old backups
  verify FILE [TYPE]   Verify backup file integrity
  list                 List available backup files
  help                 Show this help message

Environment Variables:
  BACKUP_RETENTION_DAYS    Backup retention period (default: 30)
  BACKUP_COMPRESSION       Enable compression (default: true)
  BACKUP_ENCRYPTION        Enable encryption (default: false)
  BACKUP_ENCRYPTION_KEY    Encryption key for backups
  BACKUP_REMOTE_ENABLED    Enable remote backup (default: false)
  BACKUP_NOTIFY_EMAIL      Email for notifications
  BACKUP_NOTIFY_WEBHOOK    Webhook URL for notifications

Examples:
  $0 backup                    # Perform full backup
  $0 restore-postgres backup.sql  # Restore PostgreSQL
  $0 cleanup                   # Clean old backups
  $0 verify backup.sql postgres   # Verify backup

EOF
        ;;
esac