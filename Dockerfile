FROM python:3.11-slim

# Set working directory
WORKDIR /app

# No additional system packages required for this Discord bot

# Copy and install Python dependencies first (for better Docker layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire project structure
COPY commands/ ./commands/
COPY config/ ./config/
COPY models/ ./models/
COPY persistence/ ./persistence/
COPY utils/ ./utils/
COPY bot.py .

# Create data directory for persistence
RUN mkdir -p /app/data

# Set proper permissions
RUN chmod +x bot.py

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash app \
    && chown -R app:app /app
USER app

# Health check - verify Discord bot can import core modules and instantiate
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import discord; from bot import create_bot; bot = create_bot(); print('Health check passed'); import sys; sys.exit(0)"

# Run the bot
CMD ["python", "-u", "bot.py"]
