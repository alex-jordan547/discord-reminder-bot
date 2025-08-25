# Multi-stage build for production-ready Discord bot
# ==============================================

# Builder Stage - Install dependencies and validate
# ================================================
FROM python:3.13-slim AS builder

LABEL stage=builder
LABEL maintainer="Discord Reminder Bot"

# Set build environment
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

# Install build dependencies 
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Python 3.13 compatibility package
RUN pip install --no-cache-dir audioop-lts

# Copy source code for validation
COPY commands/ ./commands/
COPY config/ ./config/
COPY models/ ./models/
COPY persistence/ ./persistence/
COPY utils/ ./utils/
COPY bot.py .
COPY healthcheck.py .

# Validate imports and basic functionality
RUN python -c "import discord; print('✓ discord.py imports successfully')"
RUN python -c "import bot; print('✓ Bot module imports successfully')"
RUN python -m py_compile bot.py && echo "✓ Bot syntax validation passed"
RUN python -m py_compile healthcheck.py && echo "✓ Health check script validation passed"
RUN python healthcheck.py && echo "✓ Health check execution successful"

# Production Stage - Minimal runtime environment
# ==============================================
FROM python:3.13-slim AS production

# Image metadata for production
LABEL org.opencontainers.image.title="Discord Reminder Bot" \
      org.opencontainers.image.description="Production-ready Discord bot for managing reminders" \
      org.opencontainers.image.version="latest" \
      org.opencontainers.image.authors="alex-jordan547" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/alex-jordan547/discord-reminder-bot"

# Set production environment
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

WORKDIR /app

# Create non-root system user for enhanced security
RUN groupadd --system --gid 1000 app \
    && useradd --system --uid 1000 --gid 1000 --no-create-home --shell /bin/false app

# Copy Python environment from builder
COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy only production code (no tests, dev files)
COPY --from=builder --chown=app:app /build/commands/ ./commands/
COPY --from=builder --chown=app:app /build/config/ ./config/
COPY --from=builder --chown=app:app /build/models/ ./models/
COPY --from=builder --chown=app:app /build/persistence/ ./persistence/
COPY --from=builder --chown=app:app /build/utils/ ./utils/
COPY --from=builder --chown=app:app /build/bot.py ./
COPY --from=builder --chown=app:app /build/healthcheck.py ./

# Create necessary directories with proper permissions
RUN mkdir -p /app/data /app/logs \
    && chown -R app:app /app

# Switch to non-root user
USER app

# Health check - verify production readiness
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD ["python", "healthcheck.py"]

# Expose common port (though bot doesn't serve HTTP)
EXPOSE 8080

# Run the bot with optimized settings
CMD ["python", "-u", "bot.py"]
