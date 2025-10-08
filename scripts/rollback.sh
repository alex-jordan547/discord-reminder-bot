#!/bin/bash

# Discord Reminder Bot - Rollback Script
# ======================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONTAINER_NAME="discord-reminder-bot"
BACKUP_DIR="$PROJECT_DIR/backups"
LOG_FILE="$PROJECT_DIR/logs/rollback.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# List available backups
list_backups() {
    log "Available backups:"
    if [[ -d "$BACKUP_DIR" ]]; then
        ls -la "$BACKUP_DIR" | grep "backup_" | awk '{print $9, $6, $7, $8}' | sort -r
    else
        warning "No backup directory found"
    fi
}

# Rollback to specific backup
rollback_to_backup() {
    local backup_name="$1"
    local backup_path="$BACKUP_DIR/$backup_name"

    if [[ ! -d "$backup_path" ]]; then
        error "Backup not found: $backup_path"
        exit 1
    fi

    log "Rolling back to backup: $backup_name"

    # Stop current container
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log "Stopping current container..."
        docker stop "$CONTAINER_NAME"
        docker rm "$CONTAINER_NAME"
    fi

    # Create emergency backup of current state
    local emergency_backup="$BACKUP_DIR/emergency_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$emergency_backup"

    if [[ -f "$PROJECT_DIR/discord_bot.db" ]]; then
        cp "$PROJECT_DIR/discord_bot.db" "$emergency_backup/"
    fi
    if [[ -d "$PROJECT_DIR/data" ]]; then
        cp -r "$PROJECT_DIR/data" "$emergency_backup/"
    fi

    log "Emergency backup created: $emergency_backup"

    # Restore from backup
    log "Restoring database..."
    if [[ -f "$backup_path/discord_bot.db" ]]; then
        cp "$backup_path/discord_bot.db" "$PROJECT_DIR/"
        success "Database restored"
    fi

    log "Restoring data directory..."
    if [[ -d "$backup_path/data" ]]; then
        rm -rf "$PROJECT_DIR/data"
        cp -r "$backup_path/data" "$PROJECT_DIR/"
        success "Data directory restored"
    fi

    # Start container with previous image
    log "Starting container with rollback configuration..."
    docker-compose up -d

    # Wait and verify
    sleep 30
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        success "Rollback completed successfully"
        log "Container is running. Monitor for the next few minutes."
    else
        error "Rollback failed - container not running"
        exit 1
    fi
}

# Quick rollback to last known good state
quick_rollback() {
    log "Performing quick rollback..."

    if [[ -f "$PROJECT_DIR/.last_backup" ]]; then
        local last_backup_path=$(cat "$PROJECT_DIR/.last_backup")
        local backup_name=$(basename "$last_backup_path")
        rollback_to_backup "$backup_name"
    else
        error "No last backup reference found"
        exit 1
    fi
}

# Main function
main() {
    case "${1:-}" in
        --list|-l)
            list_backups
            ;;
        --quick|-q)
            quick_rollback
            ;;
        --backup|-b)
            if [[ -z "${2:-}" ]]; then
                error "Please specify backup name"
                echo "Use --list to see available backups"
                exit 1
            fi
            rollback_to_backup "$2"
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --list, -l           List available backups"
            echo "  --quick, -q          Quick rollback to last backup"
            echo "  --backup, -b NAME    Rollback to specific backup"
            echo "  --help, -h           Show this help"
            ;;
        *)
            error "Unknown option: ${1:-}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
}

main "$@"
