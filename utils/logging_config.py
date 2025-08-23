"""
Logging configuration for Discord Reminder Bot.

This module sets up centralized logging configuration for the entire application.
"""

import logging
import logging.handlers
import os
from datetime import datetime
from typing import Optional


def setup_logging(
    log_level: str = "INFO",
    log_to_file: bool = True,
    log_file_path: Optional[str] = None,
    max_file_size_mb: int = 10,
    backup_count: int = 5
) -> None:
    """
    Configure logging for the Discord Reminder Bot.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_to_file: Whether to log to a file in addition to console
        log_file_path: Path to log file (defaults to logs/bot_YYYYMMDD.log)
        max_file_size_mb: Maximum log file size in MB before rotation
        backup_count: Number of backup log files to keep
    """
    # Convert log level string to logging constant
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    # Create logs directory if it doesn't exist
    if log_to_file:
        os.makedirs("logs", exist_ok=True)

        if log_file_path is None:
            date_str = datetime.now().strftime("%Y%m%d")
            log_file_path = f"logs/bot_{date_str}.log"

    # Create formatter
    formatter = logging.Formatter(
        fmt='%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Remove existing handlers to avoid duplicates
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(numeric_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # File handler with rotation
    if log_to_file and log_file_path:
        file_handler = logging.handlers.RotatingFileHandler(
            filename=log_file_path,
            maxBytes=max_file_size_mb * 1024 * 1024,  # Convert MB to bytes
            backupCount=backup_count,
            encoding='utf-8'
        )
        file_handler.setLevel(numeric_level)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    # Configure discord.py logging to be less verbose
    discord_logger = logging.getLogger('discord')
    discord_logger.setLevel(logging.WARNING)

    # Configure urllib3 logging to be less verbose (used by discord.py)
    urllib3_logger = logging.getLogger('urllib3')
    urllib3_logger.setLevel(logging.WARNING)

    # Log the logging configuration
    logger = logging.getLogger(__name__)
    logger.info("=" * 50)
    logger.info("Discord Reminder Bot - Logging Initialized")
    logger.info(f"Log Level: {log_level.upper()}")
    logger.info(f"Console Logging: Enabled")
    logger.info(f"File Logging: {'Enabled' if log_to_file else 'Disabled'}")
    if log_to_file and log_file_path:
        logger.info(f"Log File: {log_file_path}")
        logger.info(f"Max File Size: {max_file_size_mb}MB")
        logger.info(f"Backup Count: {backup_count}")
    logger.info("=" * 50)


def get_log_level_from_env() -> str:
    """
    Get the log level from environment variable with fallback to INFO.

    Returns:
        str: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    return os.getenv('LOG_LEVEL', 'INFO').upper()


def should_log_to_file() -> bool:
    """
    Determine if logging to file should be enabled from environment.

    Returns:
        bool: True if file logging should be enabled
    """
    return os.getenv('LOG_TO_FILE', 'true').lower() == 'true'