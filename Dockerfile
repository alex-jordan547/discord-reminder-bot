# Multi-stage build pour Discord bot avec support PostgreSQL et SQLite
# ===================================================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Installer les dépendances système nécessaires pour PostgreSQL
RUN apk add --no-cache \
    postgresql-client \
    python3 \
    make \
    g++ \
    git

# Copier les fichiers de configuration des packages
COPY package.json ./
COPY package-lock.json ./
COPY tsconfig.json ./

# Installer les dépendances
RUN npm install

# Copier le code source
COPY server/ ./server/ 
COPY shared/ ./shared/
COPY client/ ./client/

# Copier les scripts dans le builder
COPY scripts/ ./scripts/

# Build les composants
RUN npm run build || true

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Installer les dépendances système pour PostgreSQL et outils de base
RUN apk add --no-cache \
    postgresql-client \
    curl \
    bash \
    tzdata

# Copier les fichiers package et installer uniquement les dépendances de production
COPY package.json package-lock.json ./
RUN npm ci --only=production && npm cache clean --force

# Copier les fichiers buildés et le code source
COPY --from=builder /app/server ./server 
COPY --from=builder /app/client ./client
COPY --from=builder /app/shared ./shared

# Copier les scripts et configurations
COPY --from=builder /app/scripts ./scripts

# Créer les répertoires nécessaires
RUN mkdir -p data logs backups volumes/postgres volumes/redis

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S botuser -u 1001 -G nodejs

# Définir les permissions
RUN chown -R botuser:nodejs /app && \
    chmod +x scripts/*.sh scripts/*.js 2>/dev/null || true

# Créer un script de santé pour le health check
RUN echo '#!/bin/sh' > /app/healthcheck.sh && \
    echo 'if [ "$ENABLE_DASHBOARD" = "true" ]; then' >> /app/healthcheck.sh && \
    echo '  curl -f http://localhost:${DASHBOARD_PORT:-3000}/health || exit 1' >> /app/healthcheck.sh && \
    echo 'else' >> /app/healthcheck.sh && \
    echo '  node -e "process.exit(0)"' >> /app/healthcheck.sh && \
    echo 'fi' >> /app/healthcheck.sh && \
    chmod +x /app/healthcheck.sh

USER botuser

# Variables d'environnement
ENV NODE_ENV=production
ENV DATABASE_TYPE=sqlite
ENV DASHBOARD_PORT=3000
ENV DASHBOARD_HOST=0.0.0.0

# Port pour le dashboard
EXPOSE 3000

# Script de démarrage avec vérification de base de données
COPY --chown=botuser:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]

# Stage 3: Development
FROM builder AS development

WORKDIR /app

# Installer nodemon pour le développement
RUN npm install -g nodemon

# Exposer les ports pour le développement
EXPOSE 3000 5432 6379

# Variables d'environnement pour le développement
ENV NODE_ENV=development
ENV DATABASE_TYPE=sqlite

# Script de développement
CMD ["npm", "run", "dev"]