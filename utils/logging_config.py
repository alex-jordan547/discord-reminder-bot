"""
Logging configuration for Discord Reminder Bot.

This module sets up centralized logging configuration for the entire application.
"""

import logging
import logging.handlers
import os
import sys
from datetime import datetime
from typing import Optional


class ColoredFormatter(logging.Formatter):
    """
    Colored log formatter for terminal output.
    """

    # ANSI color codes
    COLORS = {
        "DEBUG": "\033[36m",  # Cyan
        "INFO": "\033[32m",  # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",  # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"
    BOLD = "\033[1m"

    # Colors for other log components
    TIMESTAMP_COLOR = "\033[90m"  # Dark gray
    LOGGER_COLOR = "\033[37m"  # Light gray/white
    SEPARATOR_COLOR = "\033[90m"  # Dark gray

    def __init__(self, fmt=None, datefmt=None, use_colors=True):
        super().__init__(fmt, datefmt)
        self.use_colors = use_colors and self._supports_color()

    def _supports_color(self):
        """
        Check if the terminal supports color output.
        """
        # Force disable colors if NO_COLOR environment variable is set
        if os.environ.get("NO_COLOR"):
            return False

        # Force enable colors if FORCE_COLOR environment variable is set
        if os.environ.get("FORCE_COLOR"):
            return True

        # Check if stdout is a terminal
        if not hasattr(sys.stdout, "isatty"):
            return False

        if not sys.stdout.isatty():
            return False

        # Check for common terminal types that support colors
        term = os.environ.get("TERM", "").lower()
        if any(term_type in term for term_type in ["color", "ansi", "xterm", "screen", "tmux"]):
            return True

        # Check for Windows terminal color support
        if sys.platform == "win32":
            try:
                import colorama

                colorama.init()  # Initialize colorama on Windows
                return True
            except ImportError:
                pass

        # Default to True for most modern Unix-like terminals
        return sys.platform != "win32"

    def format(self, record):
        if self.use_colors:
            # Get the color for this log level
            level_color = self.COLORS.get(record.levelname, "")

            if level_color:
                # Format the base message first
                formatted = super().format(record)

                # Split the formatted message to identify parts
                # Format: "timestamp | LEVEL    | logger_name | message"
                parts = formatted.split(" | ", 3)  # Split into max 4 parts

                if len(parts) >= 4:
                    timestamp, level_part, logger_part, message_part = parts

                    # Extract the level name (removing extra spaces)
                    level_name = level_part.strip()

                    # Colorize each component
                    colored_timestamp = f"{self.TIMESTAMP_COLOR}{timestamp}{self.RESET}"
                    colored_level = f"{level_color}{self.BOLD}{level_name:<8}{self.RESET}"
                    colored_logger = f"{self.LOGGER_COLOR}{logger_part}{self.RESET}"
                    colored_message = f"{level_color}{message_part}{self.RESET}"
                    colored_separator = f"{self.SEPARATOR_COLOR} | {self.RESET}"

                    # Reconstruct the formatted message with colored components
                    formatted = f"{colored_timestamp}{colored_separator}{colored_level}{colored_separator}{colored_logger}{colored_separator}{colored_message}"
                else:
                    # Fallback: color the entire message if splitting fails
                    formatted = f"{level_color}{formatted}{self.RESET}"

                return formatted
            else:
                return super().format(record)
        else:
            return super().format(record)


def setup_logging(
    log_level: str = "INFO",
    log_to_file: bool = True,
    log_file_path: Optional[str] = None,
    max_file_size_mb: int = 10,
    backup_count: int = 5,
    use_colors: Optional[bool] = None,
) -> None:
    """
    Configure logging for the Discord Reminder Bot.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_to_file: Whether to log to a file in addition to console
        log_file_path: Path to log file (defaults to logs/bot_YYYYMMDD.log)
        max_file_size_mb: Maximum log file size in MB before rotation
        backup_count: Number of backup log files to keep
        use_colors: Force enable/disable colors (None for auto-detection)
    """
    # Convert log level string to logging constant
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    # Create logs directory if it doesn't exist
    if log_to_file:
        os.makedirs("logs", exist_ok=True)

        if log_file_path is None:
            date_str = datetime.now().strftime("%Y%m%d")
            log_file_path = f"logs/bot_{date_str}.log"

    # Create formatters
    log_format = "%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    # Console formatter with colors (respect user preference)
    console_formatter = ColoredFormatter(
        fmt=log_format,
        datefmt=date_format,
        use_colors=use_colors if use_colors is not None else True,
    )

    # File formatter without colors
    file_formatter = logging.Formatter(fmt=log_format, datefmt=date_format)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Remove existing handlers to avoid duplicates
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Console handler with colors
    console_handler = logging.StreamHandler()
    console_handler.setLevel(numeric_level)
    console_handler.setFormatter(console_formatter)
    root_logger.addHandler(console_handler)

    # File handler with rotation
    if log_to_file and log_file_path:
        file_handler = logging.handlers.RotatingFileHandler(
            filename=log_file_path,
            maxBytes=max_file_size_mb * 1024 * 1024,  # Convert MB to bytes
            backupCount=backup_count,
            encoding="utf-8",
        )
        file_handler.setLevel(numeric_level)
        file_handler.setFormatter(file_formatter)
        root_logger.addHandler(file_handler)

    # Configure discord.py logging to be less verbose
    discord_logger = logging.getLogger("discord")
    discord_logger.setLevel(logging.WARNING)

    # Configure urllib3 logging to be less verbose (used by discord.py)
    urllib3_logger = logging.getLogger("urllib3")
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
    return os.getenv("LOG_LEVEL", "INFO").upper()


def should_log_to_file() -> bool:
    """
    Determine if logging to file should be enabled from environment.

    Returns:
        bool: True if file logging should be enabled
    """
    return os.getenv("LOG_TO_FILE", "true").lower() == "true"


def should_use_colors() -> Optional[bool]:
    """
    Determine if colored logging should be enabled from environment.

    Returns:
        Optional[bool]: True to force colors, False to disable, None for auto-detection
    """
    log_colors = os.getenv("LOG_COLORS", "").lower()
    if log_colors in ("true", "1", "yes", "on"):
        return True
    elif log_colors in ("false", "0", "no", "off"):
        return False
    else:
        return None  # Auto-detection
