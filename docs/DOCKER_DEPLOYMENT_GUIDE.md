# Docker Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the Discord Reminder Bot with its monitoring dashboard using Docker and Docker Compose. The deployment includes PostgreSQL, Redis, automated database migration, and monitoring capabilities.

## Architecture Overview

### Container Services

The Docker deployment consists of four main services:

1. **discord-reminder-bot**: Main application with monitoring dashboard
2. **postgres**: PostgreSQL database for data persistence
3. **redis**: Redis cache for session management and performance
4. **db-migration**: One-time database migration service

### Network Architecture

- **Isolated Network**: All services communicate through a dedicated bridge network (`bot-network`)
- **Internal Communication**: Services use internal hostnames (postgres, redis)
- **External Access**: Only the main application exposes ports to the host
- **Security**: Database and cache are not directly accessible from outside

## Prerequisites

### System Requirements

#### Minimum Requirements
- **OS**: Linux (Ubuntu 20.04+, CentOS 8+, or similar)
- **Docker**: 24.0.0 or later
- **Docker Compose**: 2.20.0 or later
- **Memory**: 2GB RAM minimum, 4GB recommended
- **Storage**: 5GB available disk space
- **Network**: Internet connectivity for image downloads

#### Recommended Requirements
- **Memory**: 8GB RAM for production workloads
- **Storage**: 20GB SSD for database and logs
- **CPU**: 2+ cores for optimal performance
- **Monitoring**: External monitoring system for production

### Software Installation

#### Install Docker (Ubuntu/Debian)
```bash
# Update package index
sudo apt update

# Install required packages
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add Docker repository
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker
```

#### Install Docker (CentOS/RHEL)
```bash
# Install required packages
sudo yum install -y yum-utils

# Add Docker repository
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# Install Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group
sudo usermod -aG docker $USER
```

#### Verify Installation
```bash
# Check Docker version
docker --version
docker compose version

# Test Docker installation
docker run hello-world
```

## Configuration

### 1. Environment Configuration

#### Production Environment Setup
```bash
# Copy the Docker environment template
cp .env.docker .env

# Edit configuration with your values
nano .env
```

#### Essential Configuration Variables

**Discord Configuration:**
```env
# Required: Your Discord bot token
DISCORD_TOKEN=your_actual_discord_bot_token_here
```

**Database Configuration:**
```env
# Database type (postgres for production, sqlite for development)
DATABASE_TYPE=postgres

# PostgreSQL settings (change passwords in production!)
POSTGRES_DB=discord_bot
POSTGRES_USER=bot_user
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_SSL=false
POSTGRES_CONNECTION_TIMEOUT=30000
POSTGRES_MAX_CONNECTIONS=10
POSTGRES_FAILOVER_TO_SQLITE=true
```

**Security Configuration:**
```env
# Change these in production!
POSTGRES_PASSWORD=very_secure_password_here
REDIS_PASSWORD=redis_password_here

# Admin roles for dashboard access
ADMIN_ROLES=Admin,Moderateur,Coach
```

**Dashboard Configuration:**
```env
# Enable monitoring dashboard
ENABLE_DASHBOARD=true
DASHBOARD_PORT=3000
DASHBOARD_HOST=0.0.0.0
```

### 2. Volume Preparation

#### Create Required Directories
```bash
# Create volume directories with proper permissions
mkdir -p volumes/postgres volumes/redis data logs backups

# Set ownership (adjust UID/GID as needed)
sudo chown -R 1001:1001 volumes data logs backups

# Set permissions
chmod 755 volumes/postgres volumes/redis
chmod 775 data logs backups
```

#### Volume Structure
```
project-root/
├── volumes/
│   ├── postgres/     # PostgreSQL data files
│   └── redis/        # Redis persistence files
├── data/             # SQLite fallback and shared data
├── logs/             # Application and service logs
└── backups/          # Database backups
```

### 3. Network Configuration

#### Firewall Configuration
```bash
# Allow dashboard access (adjust as needed)
sudo ufw allow 3000/tcp

# For remote database access (not recommended in production)
# sudo ufw allow 5432/tcp

# Check firewall status
sudo ufw status
```

#### Docker Network
The compose file automatically creates an isolated network:
- **Network Name**: `bot-network`
- **Subnet**: `172.20.0.0/16`
- **Driver**: Bridge
- **Isolation**: Services communicate internally only

## Deployment Procedures

### 1. Quick Start Deployment

#### Single Command Deployment
```bash
# Clone the repository
git clone <repository-url>
cd discord-reminder-bot

# Set up environment
cp .env.docker .env
# Edit .env with your configuration

# Create directories
mkdir -p volumes/postgres volumes/redis data logs backups
sudo chown -R 1001:1001 volumes data logs backups

# Deploy everything
docker compose up -d

# Check status
docker compose ps
docker compose logs -f
```

### 2. Step-by-Step Deployment

#### Phase 1: Infrastructure Services
```bash
# Start database and cache services first
docker compose up -d postgres redis

# Wait for services to be healthy
docker compose ps
docker compose logs postgres
docker compose logs redis

# Verify health checks
docker inspect discord-bot-postgres | grep Status
docker inspect discord-bot-redis | grep Status
```

#### Phase 2: Database Migration (If Needed)
```bash
# Run database migration (one-time operation)
docker compose --profile migration up db-migration

# Check migration logs
docker compose logs db-migration

# Migration service will exit automatically when complete
```

#### Phase 3: Main Application
```bash
# Start the main application
docker compose up -d discord-reminder-bot

# Monitor startup
docker compose logs -f discord-reminder-bot

# Verify all services are running
docker compose ps
```

### 3. Production Deployment

#### Pre-deployment Checklist
- [ ] Environment variables configured and secured
- [ ] Firewall rules configured
- [ ] SSL certificates available (if using HTTPS)
- [ ] Monitoring systems configured
- [ ] Backup procedures tested
- [ ] Recovery procedures documented

#### Production Deployment Script
```bash
#!/bin/bash
# production-deploy.sh

set -euo pipefail

echo "🚀 Starting production deployment..."

# Backup existing data
if [ -d "volumes/postgres" ]; then
    echo "📦 Creating backup..."
    tar -czf "backup-$(date +%Y%m%d-%H%M%S).tar.gz" volumes/ data/ logs/
fi

# Pull latest images
echo "📥 Pulling latest images..."
docker compose pull

# Deploy with zero downtime
echo "🔄 Deploying services..."
docker compose up -d --remove-orphans

# Wait for health checks
echo "⏳ Waiting for services to be healthy..."
timeout 300 bash -c 'until docker compose ps | grep -q "healthy"; do sleep 5; done'

# Verify deployment
echo "✅ Verifying deployment..."
docker compose ps
curl -f http://localhost:3000/health || exit 1

echo "🎉 Deployment complete!"
```

## Service Management

### 1. Starting and Stopping Services

#### Start All Services
```bash
# Start all services
docker compose up -d

# Start specific service
docker compose up -d discord-reminder-bot

# Start with logs
docker compose up discord-reminder-bot
```

#### Stop Services
```bash
# Stop all services
docker compose down

# Stop specific service
docker compose stop discord-reminder-bot

# Stop and remove volumes (destructive!)
docker compose down -v
```

#### Restart Services
```bash
# Restart all services
docker compose restart

# Restart specific service
docker compose restart discord-reminder-bot

# Restart with rebuild
docker compose up -d --build discord-reminder-bot
```

### 2. Monitoring and Logs

#### View Logs
```bash
# View all logs
docker compose logs

# Follow logs in real-time
docker compose logs -f

# View specific service logs
docker compose logs discord-reminder-bot
docker compose logs postgres

# View logs with timestamps
docker compose logs -t discord-reminder-bot

# View last N lines
docker compose logs --tail 100 discord-reminder-bot
```

#### Service Status
```bash
# Check service status
docker compose ps

# Detailed service information
docker compose ps --services
docker compose config

# Container resource usage
docker stats

# Service health checks
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
```

### 3. Scaling and Performance

#### Resource Limits
The compose file includes production-optimized resource limits:

```yaml
# PostgreSQL limits
resources:
  limits:
    memory: 256M
    cpus: '0.3'
  reservations:
    memory: 128M
    cpus: '0.1'

# Main application limits
resources:
  limits:
    memory: 1024M
    cpus: '1.0'
  reservations:
    memory: 512M
    cpus: '0.5'
```

#### Performance Monitoring
```bash
# Monitor resource usage
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"

# Check database performance
docker exec discord-bot-postgres pg_stat_activity

# Check Redis performance
docker exec discord-bot-redis redis-cli info stats
```

## Database Management

### 1. Database Access

#### PostgreSQL Access
```bash
# Connect to PostgreSQL
docker exec -it discord-bot-postgres psql -U bot_user -d discord_bot

# Run SQL commands
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "SELECT count(*) FROM events;"

# Database dump
docker exec discord-bot-postgres pg_dump -U bot_user discord_bot > backup.sql
```

#### SQLite Access (Fallback)
```bash
# Access SQLite database
docker exec -it discord-reminder-bot sqlite3 data/discord_bot.db

# SQLite commands
docker exec discord-reminder-bot sqlite3 data/discord_bot.db ".tables"
docker exec discord-reminder-bot sqlite3 data/discord_bot.db ".schema events"
```

### 2. Database Migration

#### Manual Migration
```bash
# Run migration service
docker compose --profile migration up db-migration

# Check migration status
docker compose logs db-migration

# Force migration rebuild
docker compose --profile migration up db-migration --build
```

#### Migration Troubleshooting
```bash
# Check source database
docker exec discord-reminder-bot ls -la data/
docker exec discord-reminder-bot sqlite3 data/discord_bot.db ".tables"

# Check target database
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "\dt"

# Manual migration with logs
docker compose --profile migration up db-migration --no-deps 2>&1 | tee migration.log
```

## Security Considerations

### 1. Container Security

#### Security Best Practices
- **Non-root User**: All services run as non-root users
- **Read-only Filesystem**: Where possible, mount filesystems as read-only
- **Minimal Images**: Using Alpine-based images for smaller attack surface
- **Network Isolation**: Services communicate through isolated Docker network
- **Secret Management**: Sensitive data through environment variables or secrets

#### Security Hardening
```bash
# Scan images for vulnerabilities
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image discord-reminder-bot:latest

# Check container security
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  docker/docker-bench-security

# Monitor running containers
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  falcosecurity/falco falco
```

### 2. Data Protection

#### Encryption at Rest
```bash
# Encrypt volume directories
sudo cryptsetup luksFormat /dev/vdb
sudo cryptsetup luksOpen /dev/vdb discord-volumes
sudo mkfs.ext4 /dev/mapper/discord-volumes
sudo mount /dev/mapper/discord-volumes volumes/
```

#### Backup Encryption
```bash
# Encrypted backup
tar -czf - volumes/ data/ | gpg --cipher-algo AES256 --compress-algo 1 \
  --symmetric --output backup-$(date +%Y%m%d).tar.gz.gpg

# Decrypt backup
gpg --decrypt backup-20240901.tar.gz.gpg | tar -xzf -
```

## Troubleshooting

### 1. Common Issues

#### Service Won't Start
```bash
# Check Docker daemon
sudo systemctl status docker

# Check service logs
docker compose logs service-name

# Check container status
docker compose ps
docker inspect container-name

# Check resource usage
docker stats
df -h
free -h
```

#### Database Connection Issues
```bash
# Test PostgreSQL connectivity
docker exec discord-bot-postgres pg_isready -U bot_user -d discord_bot

# Check PostgreSQL logs
docker compose logs postgres

# Test from application container
docker exec discord-reminder-bot nc -zv postgres 5432

# Check network connectivity
docker network ls
docker network inspect discord-reminder-bot_bot-network
```

#### Performance Issues
```bash
# Check resource usage
docker stats

# Check disk space
df -h
docker system df

# Check database performance
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "
  SELECT query, calls, total_time, mean_time 
  FROM pg_stat_statements 
  ORDER BY total_time DESC 
  LIMIT 10;"

# Clean up unused resources
docker system prune -f
docker volume prune -f
```

### 2. Recovery Procedures

#### Service Recovery
```bash
# Restart failed service
docker compose restart service-name

# Rebuild and restart
docker compose up -d --build service-name

# Force recreate
docker compose up -d --force-recreate service-name

# Remove and recreate
docker compose down service-name
docker compose up -d service-name
```

#### Data Recovery
```bash
# Restore from backup
docker compose down
tar -xzf backup-20240901.tar.gz
docker compose up -d

# Database restore
docker exec -i discord-bot-postgres psql -U bot_user -d discord_bot < backup.sql

# Verify restoration
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "SELECT count(*) FROM events;"
```

## Maintenance Procedures

### 1. Regular Maintenance

#### Daily Tasks
```bash
#!/bin/bash
# daily-maintenance.sh

# Check service health
docker compose ps
curl -f http://localhost:3000/health

# Check logs for errors
docker compose logs --since 24h | grep -i error

# Clean up old logs
find logs/ -name "*.log" -mtime +7 -delete

# Check disk space
df -h | awk '$5 > 80 {print $0}'
```

#### Weekly Tasks
```bash
#!/bin/bash
# weekly-maintenance.sh

# Update images
docker compose pull

# Clean up unused resources
docker system prune -f

# Backup database
docker exec discord-bot-postgres pg_dump -U bot_user discord_bot > weekly-backup.sql

# Vacuum database
docker exec discord-bot-postgres psql -U bot_user -d discord_bot -c "VACUUM ANALYZE;"

# Check security updates
docker run --rm aquasec/trivy image discord-reminder-bot:latest
```

#### Monthly Tasks
```bash
#!/bin/bash
# monthly-maintenance.sh

# Full backup
tar -czf monthly-backup-$(date +%Y%m%d).tar.gz volumes/ data/ logs/

# Performance analysis
docker stats --no-stream

# Security audit
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  docker/docker-bench-security

# Update documentation
echo "Last maintenance: $(date)" >> maintenance.log
```

### 2. Updates and Upgrades

#### Application Updates
```bash
# Pull latest images
docker compose pull

# Backup before update
tar -czf pre-update-backup.tar.gz volumes/ data/

# Update with zero downtime
docker compose up -d --remove-orphans

# Verify update
docker compose ps
curl -f http://localhost:3000/health
```

#### System Updates
```bash
# Update Docker
sudo apt update
sudo apt upgrade docker-ce docker-ce-cli containerd.io

# Update Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Restart Docker service
sudo systemctl restart docker

# Verify services after restart
docker compose ps
```

## Production Best Practices

### 1. Monitoring and Alerting

#### External Monitoring
- **Uptime Monitoring**: Use external services to monitor dashboard availability
- **Resource Monitoring**: Set up alerts for CPU, memory, and disk usage
- **Log Monitoring**: Monitor application logs for errors and warnings
- **Database Monitoring**: Track query performance and connection counts

#### Health Checks
```bash
# Automated health check script
#!/bin/bash
# health-check.sh

services=("postgres" "redis" "discord-reminder-bot")

for service in "${services[@]}"; do
    if ! docker compose ps | grep -q "$service.*healthy\|$service.*Up"; then
        echo "ALERT: Service $service is not healthy"
        # Send alert notification here
    fi
done

# Check dashboard response
if ! curl -f http://localhost:3000/health >/dev/null 2>&1; then
    echo "ALERT: Dashboard health check failed"
    # Send alert notification here
fi
```

### 2. Backup Strategy

#### Automated Backups
```bash
#!/bin/bash
# automated-backup.sh

BACKUP_DIR="/path/to/secure/backup/location"
DATE=$(date +%Y%m%d-%H%M%S)

# Database backup
docker exec discord-bot-postgres pg_dump -U bot_user discord_bot | \
    gzip > "$BACKUP_DIR/db-backup-$DATE.sql.gz"

# Volume backup
tar -czf "$BACKUP_DIR/volumes-backup-$DATE.tar.gz" volumes/

# Application data backup
tar -czf "$BACKUP_DIR/data-backup-$DATE.tar.gz" data/ logs/

# Cleanup old backups (keep last 30 days)
find "$BACKUP_DIR" -name "*backup*" -mtime +30 -delete

# Verify backups
if [ -f "$BACKUP_DIR/db-backup-$DATE.sql.gz" ]; then
    echo "Backup successful: $DATE"
else
    echo "ALERT: Backup failed: $DATE"
fi
```

### 3. Disaster Recovery

#### Recovery Planning
1. **Document Dependencies**: List all external dependencies
2. **Test Recovery Procedures**: Regular testing of backup restoration
3. **Document Configuration**: Keep configuration documentation current
4. **Automate Recovery**: Scripts for rapid service restoration
5. **Monitor Recovery**: Verify all services after recovery

#### Recovery Automation
```bash
#!/bin/bash
# disaster-recovery.sh

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file>"
    exit 1
fi

echo "Starting disaster recovery from $BACKUP_FILE..."

# Stop services
docker compose down

# Restore data
tar -xzf "$BACKUP_FILE"

# Start services
docker compose up -d

# Wait for health checks
timeout 300 bash -c 'until docker compose ps | grep -q "healthy"; do sleep 5; done'

# Verify recovery
if curl -f http://localhost:3000/health; then
    echo "Recovery successful!"
else
    echo "Recovery verification failed!"
    exit 1
fi
```

---

This Docker deployment guide provides comprehensive procedures for deploying, managing, and maintaining the Discord Reminder Bot with its monitoring dashboard. Follow these procedures for reliable, secure, and maintainable deployments.

For additional information, refer to:
- [Database Administrator Guide](DATABASE_ADMINISTRATOR_GUIDE.md)
- [Monitoring Dashboard User Guide](MONITORING_DASHBOARD_USER_GUIDE.md)
- [Architecture Documentation](ARCHITECTURE.md)