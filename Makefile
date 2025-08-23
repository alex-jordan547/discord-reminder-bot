# Makefile for Discord Reminder Bot
# Automates common development tasks

.PHONY: help install install-dev setup format lint type-check security test clean run docker-build docker-run pre-commit

# Default target
help:
	@echo "Discord Reminder Bot - Development Commands"
	@echo ""
	@echo "Setup Commands:"
	@echo "  install          Install production dependencies"
	@echo "  install-dev      Install development dependencies"
	@echo "  setup            Complete development setup (install-dev + pre-commit)"
	@echo ""
	@echo "Code Quality Commands:"
	@echo "  format           Format code with black and isort"
	@echo "  lint             Run flake8 linting"
	@echo "  type-check       Run mypy type checking"
	@echo "  security         Run bandit security checks"
	@echo "  pre-commit       Run all pre-commit hooks"
	@echo "  check-all        Run all quality checks (format + lint + type-check + security)"
	@echo ""
	@echo "Testing Commands:"
	@echo "  test             Run tests with pytest"
	@echo "  test-cov         Run tests with coverage report"
	@echo ""
	@echo "Run Commands:"
	@echo "  run              Run the bot locally"
	@echo "  docker-build     Build Docker image"
	@echo "  docker-run       Run bot in Docker container"
	@echo ""
	@echo "Utility Commands:"
	@echo "  clean            Clean up temporary files"
	@echo "  logs             Show recent bot logs"

# Installation commands
install:
	pip install -r requirements.txt

install-dev:
	pip install -r requirements.txt -r requirements-dev.txt

setup: install-dev
	pre-commit install
	@echo "Development environment setup complete!"

# Code quality commands
format:
	@echo "Formatting code with black..."
	black . --line-length=100
	@echo "Sorting imports with isort..."
	isort . --profile=black --line-length=100
	@echo "Code formatting complete!"

lint:
	@echo "Running flake8 linting..."
	flake8 .

type-check:
	@echo "Running mypy type checking..."
	mypy .

security:
	@echo "Running bandit security checks..."
	bandit -r . -c pyproject.toml

pre-commit:
	@echo "Running pre-commit hooks..."
	pre-commit run --all-files

check-all: format lint type-check security
	@echo "All code quality checks completed!"

# Testing commands
test:
	@echo "Running tests..."
	pytest

test-cov:
	@echo "Running tests with coverage..."
	pytest --cov=. --cov-report=term-missing --cov-report=html

# Run commands
run:
	@echo "Starting Discord Reminder Bot..."
	python bot.py

docker-build:
	@echo "Building Docker image..."
	docker-compose build

docker-run:
	@echo "Running bot in Docker container..."
	docker-compose up

docker-run-detached:
	@echo "Running bot in Docker container (detached)..."
	docker-compose up -d

docker-stop:
	@echo "Stopping Docker containers..."
	docker-compose down

# Utility commands
clean:
	@echo "Cleaning up temporary files..."
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	find . -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
	find . -name ".coverage" -delete 2>/dev/null || true
	@echo "Cleanup complete!"

logs:
	@echo "Recent bot logs (last 50 lines):"
	@if [ -d "logs" ] && [ -n "$$(ls -A logs/ 2>/dev/null)" ]; then \
		tail -n 50 logs/bot_*.log 2>/dev/null || echo "No log files found"; \
	else \
		echo "No logs directory found. Run the bot first to generate logs."; \
	fi

# Development workflow helpers
dev-setup: setup
	@echo "Creating example environment file..."
	@if [ ! -f ".env" ]; then \
		echo "# Discord Bot Configuration" > .env.example; \
		echo "DISCORD_TOKEN=your_bot_token_here" >> .env.example; \
		echo "REMINDER_INTERVAL_HOURS=24" >> .env.example; \
		echo "USE_SEPARATE_REMINDER_CHANNEL=false" >> .env.example; \
		echo "REMINDER_CHANNEL_NAME=rappels-matchs" >> .env.example; \
		echo "ADMIN_ROLES=Admin,Moderateur,Coach" >> .env.example; \
		echo "LOG_LEVEL=INFO" >> .env.example; \
		echo "LOG_TO_FILE=true" >> .env.example; \
		echo ""; \
		echo "Example environment file created: .env.example"; \
		echo "Copy it to .env and fill in your Discord token."; \
	fi

# Quick development cycle
dev: format lint
	@echo "Development checks passed! Ready to commit."

# Production deployment helpers
deploy-check: check-all test
	@echo "Pre-deployment checks completed successfully!"

# Show project status
status:
	@echo "Discord Reminder Bot - Project Status"
	@echo "======================================"
	@echo ""
	@echo "Python version: $$(python --version 2>&1)"
	@echo "Pip version: $$(pip --version 2>&1 | cut -d' ' -f2)"
	@echo ""
	@echo "Installed packages:"
	@pip list --format=columns | head -10
	@echo "... (showing first 10 packages)"
	@echo ""
	@echo "Git status:"
	@git status --porcelain | head -5 || echo "Not a git repository or no changes"
	@echo ""
	@if [ -f "watched_matches.json" ]; then \
		echo "Watched matches file exists: $$(wc -l < watched_matches.json) lines"; \
	else \
		echo "No watched matches file found"; \
	fi