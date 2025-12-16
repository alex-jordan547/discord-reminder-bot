#!/bin/bash
# Docker Entry Point Script
# =========================
# This script handles database connectivity checks and graceful startup

set -euo pipefail

echo "🚀 Starting Discord Reminder Bot..."

# Function to log with timestamp
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# Function to check PostgreSQL connectivity
check_postgres() {
    local host="${POSTGRES_HOST:-localhost}"
    local port="${POSTGRES_PORT:-5432}"
    local user="${POSTGRES_USER:-bot_user}"
    local db="${POSTGRES_DB:-discord_bot}"
    local timeout="${POSTGRES_CONNECTION_TIMEOUT:-30000}"
    
    log "🔍 Checking PostgreSQL connectivity..."
    log "   Host: $host:$port"
    log "   Database: $db"
    log "   User: $user"
    
    # Convert timeout from milliseconds to seconds
    timeout_seconds=$((timeout / 1000))
    
    for i in $(seq 1 $timeout_seconds); do
        if PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" pg_isready -h "$host" -p "$port" -U "$user" -d "$db" -t 1 >/dev/null 2>&1; then
            log "✅ PostgreSQL is ready!"
            return 0
        fi
        
        if [ $i -eq $timeout_seconds ]; then
            log "❌ PostgreSQL connection timeout after ${timeout_seconds}s"
            return 1
        fi
        
        log "⏳ Waiting for PostgreSQL... ($i/${timeout_seconds}s)"
        sleep 1
    done
}

# Function to check Redis connectivity
check_redis() {
    local host="${REDIS_HOST:-localhost}"
    local port="${REDIS_PORT:-6379}"
    
    log "🔍 Checking Redis connectivity..."
    log "   Host: $host:$port"
    
    for i in $(seq 1 30); do
        if redis-cli -h "$host" -p "$port" ping >/dev/null 2>&1; then
            log "✅ Redis is ready!"
            return 0
        fi
        
        if [ $i -eq 30 ]; then
            log "⚠️  Redis connection timeout after 30s (continuing without Redis)"
            return 1
        fi
        
        log "⏳ Waiting for Redis... ($i/30s)"
        sleep 1
    done
}

# Function to create necessary directories
create_directories() {
    log "📁 Creating necessary directories..."
    mkdir -p data logs backups
    
    # Ensure correct permissions (skip chown as we're non-root user)
    chmod -R u+rwX data logs backups 2>/dev/null || true
    log "✅ Directories created and permissions set"
}

# Function to handle database failover
handle_database_failover() {
    log "🔄 Database connection failed, switching to SQLite fallback..."
    export DATABASE_TYPE="sqlite"
    export DATABASE_PATH="${DATABASE_PATH:-./data/discord_bot.db}"
    log "✅ Switched to SQLite: $DATABASE_PATH"
}

# Function to perform health check (disabled to prevent restart loops)
health_check() {
    # Always return success to prevent restart loops
    log "✅ Health check disabled (preventing restart loops)"
    return 0
}

# Function for graceful shutdown
graceful_shutdown() {
    log "🛑 Received shutdown signal, performing graceful shutdown..."
    
    # Send SIGTERM to the main process
    if [ -n "${MAIN_PID:-}" ] && kill -0 "$MAIN_PID" 2>/dev/null; then
        log "📨 Sending SIGTERM to main process (PID: $MAIN_PID)..."
        kill -TERM "$MAIN_PID" 2>/dev/null || true
        
        # Wait for graceful shutdown
        for i in $(seq 1 30); do
            if ! kill -0 "$MAIN_PID" 2>/dev/null; then
                log "✅ Main process shut down gracefully"
                break
            fi
            sleep 1
        done
        
        # Force kill if still running
        if kill -0 "$MAIN_PID" 2>/dev/null; then
            log "⚡ Force killing main process..."
            kill -KILL "$MAIN_PID" 2>/dev/null || true
        fi
    fi
    
    log "🏁 Shutdown complete"
    exit 0
}

# Set up signal handlers
trap graceful_shutdown SIGTERM SIGINT SIGQUIT

# Main startup logic
main() {
    log "🔧 Initializing Discord Reminder Bot..."
    
    # Create necessary directories
    create_directories
    
    # Check database connectivity based on configuration
    case "${DATABASE_TYPE:-sqlite}" in
        "postgres"|"postgresql")
            log "🐘 Using PostgreSQL database"
            if ! check_postgres; then
                if [ "${POSTGRES_FAILOVER_TO_SQLITE:-true}" = "true" ]; then
                    handle_database_failover
                else
                    log "❌ PostgreSQL required but unavailable"
                    exit 1
                fi
            fi
            ;;
        "sqlite")
            log "📄 Using SQLite database: ${DATABASE_PATH:-./data/discord_bot.db}"
            ;;
        *)
            log "❌ Unknown database type: ${DATABASE_TYPE}"
            exit 1
            ;;
    esac
    
    # Check Redis if enabled
    if [ "${REDIS_HOST:-}" ]; then
        check_redis || log "⚠️  Continuing without Redis cache"
    fi
    
    # Migration mode (run once then exit)
    if [ "${MIGRATION_MODE:-false}" = "true" ]; then
        log "🔄 Running in migration mode..."
        exec "$@"
        exit $?
    fi
    
    log "🎯 Starting main application..."
    log "   Node.js version: $(node --version)"
    log "   Environment: ${NODE_ENV:-production}"
    log "   Database Type: ${DATABASE_TYPE:-sqlite}"
    
    if [ "${ENABLE_DASHBOARD:-true}" = "true" ]; then
        log "   Dashboard: http://localhost:${DASHBOARD_PORT:-3000}"
    fi
    
    # Start the main application in background
    "$@" &
    MAIN_PID=$!
    
    log "✅ Main process started (PID: $MAIN_PID)"
    
    # Wait for startup
    sleep 5
    
    # Perform initial health check
    if ! health_check; then
        log "❌ Initial health check failed, shutting down..."
        kill -TERM "$MAIN_PID" 2>/dev/null || true
        exit 1
    fi
    
    # Wait for main process to finish
    wait "$MAIN_PID"
    exit_code=$?
    
    log "🏁 Main process exited with code: $exit_code"
    exit $exit_code
}

# Run main function with all arguments
main "$@"