# Production Configuration Guide

## Overview

This guide provides comprehensive instructions for configuring the Discord Reminder Bot and monitoring dashboard for production environments. It covers security settings, performance optimization, monitoring configuration, and operational best practices.

## Configuration Files

### Primary Configuration Files

1. **`.env.production`** - Main production environment configuration
2. **`docker-compose.prod.yml`** - Production Docker Compose configuration
3. **`ecosystem.config.js`** - PM2 process management configuration
4. **`nginx.conf`** - Reverse proxy configuration (if using nginx)

### Configuration Hierarchy

```
Environment Variables (highest priority)
↓
.env.production file
↓
.env.docker file
↓
Application defaults (lowest priority)
```

## Security Configuration

### Critical Security Settings

#### 1. Change Default Passwords
```env
# CRITICAL: Change these in production!
DISCORD_TOKEN=your_actual_bot_token_here
POSTGRES_PASSWORD=very_secure_production_password
REDIS_PASSWORD=secure_redis_password
DASHBOARD_PASSWORD=secure_dashboard_password
API_TOKEN_SECRET=very_secure_jwt_secret
SESSION_SECRET=secure_session_secret
```

#### 2. Authentication and Authorization
```env
# Dashboard Authentication
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=your_secure_password
DASHBOARD_SESSION_SECRET=32_character_random_string

# API Authentication
API_TOKEN_SECRET=64_character_jwt_secret
API_RATE_LIMIT_MAX=1000
API_RATE_LIMIT_WINDOW=900000

# Bot Permissions
ADMIN_ROLES=Admin,Moderateur,Owner
```

#### 3. Network Security
```env
# HTTPS and Security Headers
SECURITY_HSTS_ENABLED=true
SECURITY_HSTS_MAX_AGE=31536000
SECURITY_CSP_ENABLED=true
SECURITY_RATE_LIMITING=true

# CORS Configuration
CORS_ORIGIN=https://your-domain.com
CORS_CREDENTIALS=true

# Trusted Proxies
TRUSTED_PROXIES=127.0.0.1,::1,10.0.0.0/8
```

#### 4. File Upload Security
```env
# File Upload Restrictions
FILE_UPLOAD_MAX_SIZE=52428800
FILE_UPLOAD_ALLOWED_TYPES=.db,.json,.csv,.sql
FILE_UPLOAD_QUARANTINE_ENABLED=true
FILE_UPLOAD_VIRUS_SCAN_ENABLED=true
```

### Security Checklist

- [ ] All default passwords changed
- [ ] Strong passwords (minimum 16 characters)
- [ ] API tokens are cryptographically secure
- [ ] HTTPS enabled for all external access
- [ ] Rate limiting configured
- [ ] File upload restrictions in place
- [ ] Regular security updates scheduled
- [ ] Backup encryption enabled
- [ ] Audit logging configured

## Database Configuration

### PostgreSQL Production Settings

```env
# Connection Settings
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=discord_bot
POSTGRES_USER=bot_user
POSTGRES_PASSWORD=secure_password
POSTGRES_SSL=true
POSTGRES_MAX_CONNECTIONS=20
POSTGRES_CONNECTION_TIMEOUT=30000

# Failover Configuration
POSTGRES_FAILOVER_TO_SQLITE=true
DATABASE_PATH=./data/discord_bot.db
```

### Performance Tuning

```env
# Connection Pooling
DB_POOL_MIN=5
DB_POOL_MAX=20
DB_POOL_IDLE=30000
DB_QUERY_TIMEOUT=30000

# Query Optimization
DB_STATEMENT_TIMEOUT=60000
DB_IDLE_IN_TRANSACTION_SESSION_TIMEOUT=300000
```

### Backup Configuration

```env
# Automated Backups
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_COMPRESSION=true
BACKUP_ENCRYPTION_KEY=your_encryption_key

# Backup Storage
BACKUP_STORAGE_TYPE=local
BACKUP_LOCAL_PATH=./backups

# Optional: S3 Backup
# BACKUP_STORAGE_TYPE=s3
# BACKUP_S3_BUCKET=your-backup-bucket
# BACKUP_S3_REGION=us-east-1
```

## Monitoring and Alerting Configuration

### Metrics Collection

```env
# Performance Monitoring
METRICS_COLLECTION_ENABLED=true
METRICS_RETENTION_DAYS=30
METRICS_COLLECTION_INTERVAL=30000

# External Monitoring
EXTERNAL_MONITORING_ENABLED=true
EXTERNAL_MONITORING_URL=https://your-monitoring.com/api/heartbeat
EXTERNAL_MONITORING_TOKEN=your_token
EXTERNAL_MONITORING_INTERVAL=60000
```

### Alert Thresholds

```env
# Resource Alerts
ALERT_MEMORY_WARNING=80
ALERT_MEMORY_CRITICAL=90
ALERT_CPU_WARNING=75
ALERT_CPU_CRITICAL=90
ALERT_DISK_WARNING=85
ALERT_DISK_CRITICAL=95

# Performance Alerts
ALERT_RESPONSE_TIME_WARNING=5000
ALERT_RESPONSE_TIME_CRITICAL=10000
```

### Notification Channels

#### Email Alerts
```env
ALERT_EMAIL_ENABLED=true
ALERT_EMAIL_SMTP_HOST=smtp.yourcompany.com
ALERT_EMAIL_SMTP_PORT=587
ALERT_EMAIL_USER=alerts@yourcompany.com
ALERT_EMAIL_PASSWORD=smtp_password
ALERT_EMAIL_TO=admin@yourcompany.com,ops@yourcompany.com
```

#### Webhook Alerts (Slack/Teams)
```env
ALERT_WEBHOOK_ENABLED=true
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
ALERT_WEBHOOK_CHANNEL=#alerts
```

## Logging Configuration

### Application Logging

```env
# Basic Logging
LOG_LEVEL=INFO
LOG_TO_FILE=true
LOG_COLORS=false
LOG_MAX_SIZE=10485760
LOG_MAX_FILES=10
LOG_DATE_PATTERN=YYYY-MM-DD

# Audit Logging
AUDIT_LOG_ENABLED=true
AUDIT_LOG_DIR=./logs/audit
AUDIT_LOG_RETENTION_DAYS=90
```

### Error Reporting

```env
# Error Reporting
ERROR_REPORTING_ENABLED=true
ERROR_REPORTING_WEBHOOK=https://your-monitoring-system.com/webhook
ERROR_REPORTING_EMAIL=admin@yourcompany.com
ERROR_RECOVERY_NOTIFY_THRESHOLD=10
```

## Performance Configuration

### Node.js Optimization

```env
# Memory Management
NODE_OPTIONS=--max-old-space-size=1024 --optimize-for-size

# Process Management
PM2_INSTANCES=max
PM2_EXEC_MODE=cluster
PM2_MAX_MEMORY_RESTART=1024M
PM2_RESTART_DELAY=5000
```

### WebSocket Configuration

```env
# WebSocket Performance
WS_MAX_CONNECTIONS=100
WS_HEARTBEAT_INTERVAL=30000
WS_COMPRESSION=true
```

### Redis Configuration

```env
# Redis Performance
REDIS_CONNECT_TIMEOUT=10000
REDIS_COMMAND_TIMEOUT=5000
REDIS_MAX_RETRIES=3
REDIS_KEY_PREFIX=discord_bot:prod:
```

## Environment-Specific Configurations

### Production Environment

```bash
# Copy production template
cp .env.production .env

# Edit with your specific values
nano .env

# Validate configuration
docker compose config
```

### Staging Environment

```bash
# Create staging configuration
cp .env.production .env.staging

# Modify for staging
sed -i 's/production/staging/g' .env.staging
sed -i 's/discord_bot/discord_bot_staging/g' .env.staging
```

### Development Environment

```bash
# Use development defaults
cp .env.example .env.development

# Enable debug features
echo "DEBUG_MODE=true" >> .env.development
echo "LOG_LEVEL=DEBUG" >> .env.development
```

## Deployment Configurations

### Docker Compose Production

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - bot-network
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: >
      redis-server 
      --requirepass ${REDIS_PASSWORD}
      --appendonly yes
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    networks:
      - bot-network
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.3'

  discord-reminder-bot:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    restart: unless-stopped
    depends_on:
      - postgres
      - redis
    env_file:
      - .env
    ports:
      - "${PORT:-3000}:3000"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - ./backups:/app/backups
    networks:
      - bot-network
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '2.0'
        reservations:
          memory: 1G
          cpus: '1.0'

volumes:
  postgres_data:
  redis_data:

networks:
  bot-network:
    driver: bridge
```

### PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'discord-reminder-bot',
    script: './dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Restart configuration
    max_memory_restart: '1024M',
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Logging
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Monitoring
    monitor: true,
    pmx: true
  }]
};
```

### Nginx Configuration

Create `nginx.conf`:

```nginx
upstream discord_bot {
    server localhost:3000;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # Proxy Configuration
    location / {
        proxy_pass http://discord_bot;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket Support
    location /socket.io/ {
        proxy_pass http://discord_bot;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static Assets (if any)
    location /static/ {
        alias /path/to/static/files/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## Configuration Validation

### Pre-deployment Validation

Create `scripts/validate-config.sh`:

```bash
#!/bin/bash
# Configuration validation script

set -euo pipefail

echo "🔍 Validating production configuration..."

# Check required environment variables
required_vars=(
    "DISCORD_TOKEN"
    "POSTGRES_PASSWORD"
    "REDIS_PASSWORD"
    "DASHBOARD_PASSWORD"
    "API_TOKEN_SECRET"
    "SESSION_SECRET"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo "❌ ERROR: Required variable $var is not set"
        exit 1
    fi
done

# Check password strength
check_password() {
    local var_name="$1"
    local password="${!var_name:-}"
    
    if [ ${#password} -lt 16 ]; then
        echo "❌ ERROR: $var_name is too short (minimum 16 characters)"
        exit 1
    fi
    
    if [[ "$password" =~ ^[a-zA-Z]+$ ]]; then
        echo "⚠️  WARNING: $var_name should contain numbers and special characters"
    fi
}

check_password "POSTGRES_PASSWORD"
check_password "REDIS_PASSWORD"
check_password "DASHBOARD_PASSWORD"

# Validate Docker configuration
echo "🔍 Validating Docker configuration..."
docker compose -f docker-compose.prod.yml config >/dev/null
echo "✅ Docker configuration is valid"

# Check SSL certificates (if using HTTPS)
if [ "${SECURITY_HSTS_ENABLED:-false}" = "true" ]; then
    if [ ! -f "/path/to/ssl/cert.pem" ]; then
        echo "⚠️  WARNING: HTTPS enabled but SSL certificate not found"
    fi
fi

# Test database connection
echo "🔍 Testing database connection..."
if docker compose -f docker-compose.prod.yml run --rm postgres pg_isready -h postgres -p 5432; then
    echo "✅ Database connection test passed"
else
    echo "❌ ERROR: Database connection test failed"
    exit 1
fi

echo "✅ Configuration validation completed successfully!"
```

### Runtime Configuration Check

Create monitoring endpoint to validate configuration:

```bash
# Test configuration endpoint
curl -X GET http://localhost:3000/api/config/validate

# Expected response:
{
  "status": "ok",
  "checks": {
    "database": "connected",
    "redis": "connected",
    "discord": "authenticated",
    "security": "configured"
  }
}
```

## Security Hardening

### File Permissions

```bash
# Set proper file permissions
chmod 600 .env.production
chmod 700 logs/
chmod 700 backups/
chown -R app:app data/ logs/ backups/
```

### Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Regular Security Updates

```bash
#!/bin/bash
# security-updates.sh

# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Docker images
docker compose pull

# Update Node.js dependencies
npm audit fix

# Restart services
docker compose restart
```

## Compliance and Privacy

### GDPR Configuration

```env
# GDPR Compliance
GDPR_ENABLED=true
GDPR_DATA_CONTROLLER=Your Company Name
GDPR_CONTACT_EMAIL=privacy@yourcompany.com
GDPR_RETENTION_POLICY_URL=https://yourcompany.com/privacy

# Data Retention
DATA_RETENTION_ENABLED=true
DATA_RETENTION_DAYS=365
DATA_ANONYMIZATION_ENABLED=true

# Privacy Settings
PRIVACY_LOGGING_ENABLED=false
PRIVACY_IP_ANONYMIZATION=true
PRIVACY_USER_DATA_ENCRYPTION=true
```

### Audit Requirements

```env
# Audit Logging
AUDIT_LOG_ENABLED=true
AUDIT_LOG_DIR=./logs/audit
AUDIT_LOG_RETENTION_DAYS=90
AUDIT_LOG_ENCRYPTION=true
```

## Best Practices

### Configuration Management

1. **Version Control**: Store configuration templates in version control
2. **Secrets Management**: Use external secret management systems
3. **Environment Separation**: Maintain separate configurations per environment
4. **Validation**: Implement automated configuration validation
5. **Documentation**: Keep configuration documentation current

### Operational Excellence

1. **Monitoring**: Implement comprehensive monitoring and alerting
2. **Backup**: Automated backups with encryption and offsite storage
3. **Recovery**: Tested disaster recovery procedures
4. **Updates**: Regular security updates and dependency management
5. **Scaling**: Plan for horizontal and vertical scaling

### Security Practices

1. **Least Privilege**: Grant minimum required permissions
2. **Defense in Depth**: Multiple layers of security controls
3. **Regular Audits**: Periodic security assessments
4. **Incident Response**: Documented incident response procedures
5. **Training**: Security awareness training for operators

---

This production configuration guide provides comprehensive settings for secure, scalable, and maintainable deployments. Regular review and updates of these configurations ensure optimal performance and security.

For additional guidance, refer to:
- [Docker Deployment Guide](DOCKER_DEPLOYMENT_GUIDE.md)
- [Database Administrator Guide](DATABASE_ADMINISTRATOR_GUIDE.md)
- [Troubleshooting Guide](TROUBLESHOOTING_GUIDE.md)