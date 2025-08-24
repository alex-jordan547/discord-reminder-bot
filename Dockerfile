FROM python:3.13-slim

# Set working directory
WORKDIR /app

# Install system dependencies if needed (currently none required)
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies first (for better Docker layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Python 3.13 compatibility package
RUN pip install --no-cache-dir audioop-lts

# Copy the entire project structure
COPY commands/ ./commands/
COPY config/ ./config/
COPY models/ ./models/
COPY persistence/ ./persistence/
COPY utils/ ./utils/
COPY tests/ ./tests/
COPY pyproject.toml ./
COPY bot.py .

# Create necessary directories
RUN mkdir -p /app/data /app/logs

# Set proper permissions
RUN chmod +x bot.py

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash app \
    && chown -R app:app /app
USER app

# Health check - verify basic imports work
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import discord; import bot; print('Health check passed')" || exit 1

# Run the bot
CMD ["python", "-u", "bot.py"]
