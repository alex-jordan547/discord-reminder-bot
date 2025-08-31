# Multi-stage build pour Discord bot avec Vite
# ============================================

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copier les fichiers de configuration des packages
COPY package.json yarn.lock ./
COPY tsconfig.json ./
COPY vite.config.ts ./

# Installer les dépendances
RUN yarn install --frozen-lockfile

# Copier le code source
COPY src/ ./src/

# Build avec Vite
RUN yarn build

# Stage 2: Production
FROM node:18-alpine AS production

WORKDIR /app

# Installer uniquement les dépendances de production
COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile && yarn cache clean

# Copier les fichiers buildés
COPY --from=builder /app/dist ./dist

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S botuser -u 1001

# Définir les permissions
RUN chown -R botuser:nodejs /app
USER botuser

# Variables d'environnement
ENV NODE_ENV=production

# Port (si utilisé pour les health checks)
EXPOSE 3000

# Commande de démarrage
CMD ["node", "dist/index.js"]
