# Optimized Discord Bot Dockerfile
# ================================

FROM node:20-alpine AS builder

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache postgresql-client python3 make g++

# Copy package files (no yarn.lock for architecture independence)
COPY package.json tsconfig.json .yarnrc.yml ./

# Copy source code
COPY server/ ./server/
COPY shared/ ./shared/
COPY client/ ./client/
COPY scripts/ ./scripts/

# Architecture-agnostic install and build with pure TypeScript
ENV NODE_ENV=production
RUN yarn install && \
    yarn build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache postgresql-client curl bash tzdata redis

# Copy package.json files and lockfile for clean production install
COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./
COPY --from=builder /app/.yarnrc.yml ./
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/client/package.json ./client/
COPY --from=builder /app/shared/package.json ./shared/

# Install production dependencies - first workspace, then server-specific
RUN yarn install --production --frozen-lockfile
WORKDIR /app/server
RUN yarn install --production --frozen-lockfile
WORKDIR /app

# Copy built files
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/scripts ./scripts

# Create directories
RUN mkdir -p data logs backups

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S botuser -u 1001 -G nodejs

# Set permissions
RUN chown -R botuser:nodejs /app && chmod +x scripts/*.sh 2>/dev/null || true

USER botuser

# Environment variables
ENV NODE_ENV=production
ENV DATABASE_TYPE=sqlite
ENV DASHBOARD_PORT=3000

# Expose port
EXPOSE 3000

# Entry point
COPY --chown=botuser:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server/dist/src/index.js"]

# Development stage
FROM builder AS development

WORKDIR /app

# Install development tools
RUN yarn add -g nodemon

# Expose ports
EXPOSE 3000 5432 6379

# Environment
ENV NODE_ENV=production
ENV DATABASE_TYPE=postgres

# Start server from the server directory
WORKDIR /app/server
CMD ["node", "dist/src/index.js"]