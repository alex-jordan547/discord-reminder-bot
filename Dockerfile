# Optimized Discord Bot Dockerfile
# ================================

FROM node:20-alpine AS builder

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache postgresql-client python3 make g++

# Copy package files (including yarn.lock for reproducible builds)
COPY package.json yarn.lock tsconfig.json .yarnrc.yml docker-entrypoint.sh ./

# Copy source code
COPY server/ ./server/
COPY shared/ ./shared/
COPY client/ ./client/
COPY scripts/ ./scripts/

# Install dependencies and build
ENV NODE_ENV=production
RUN yarn install --frozen-lockfile && \
    yarn build:full

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

# Note: node_modules already copied from builder, no need to reinstall

# Copy built files, scripts and node_modules from builder
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

# Create directories
RUN mkdir -p data logs backups

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S botuser -u 1001 -G nodejs

# Set permissions
RUN chown -R botuser:nodejs /app && \
    chmod +x docker-entrypoint.sh && \
    chmod +x scripts/*.sh 2>/dev/null || true

USER botuser

# Environment variables
ENV NODE_ENV=production
ENV DATABASE_TYPE=sqlite
ENV DASHBOARD_PORT=3000

# Expose port
EXPOSE 3000

# Entry point already copied and permissions set above
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server/dist/src/index.js"]

# Development stage
FROM builder AS development

WORKDIR /app

COPY --from=builder /app/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh


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