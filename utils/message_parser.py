"""
Message parsing utilities for Discord Reminder Bot.

This module provides functions to parse Discord message links and extract
relevant IDs and information.
"""

import re
import logging
from typing import Optional, Tuple, NamedTuple

# Get logger for this module
logger = logging.getLogger(__name__)


class MessageLinkInfo(NamedTuple):
    """
    Named tuple containing information extracted from a Discord message link.

    Attributes:
        guild_id: The Discord guild (server) ID
        channel_id: The Discord channel ID
        message_id: The Discord message ID
    """

    guild_id: int
    channel_id: int
    message_id: int


# Regex pattern for Discord message links
# Matches: https://discord.com/channels/GUILD_ID/CHANNEL_ID/MESSAGE_ID
# Also matches: https://discordapp.com/channels/... (legacy format)
MESSAGE_LINK_PATTERN = re.compile(
    r"(?:https?://)?(?:discord(?:app)?\.com/channels/|discord://channels/)(\d+)/(\d+)/(\d+)",
    re.IGNORECASE,
)


def parse_message_link(message_link: str) -> Optional[MessageLinkInfo]:
    """
    Parse a Discord message link to extract guild, channel, and message IDs.

    Supports various Discord message link formats:
    - https://discord.com/channels/123456789/987654321/555666777
    - https://discordapp.com/channels/123456789/987654321/555666777
    - discord://channels/123456789/987654321/555666777

    Args:
        message_link: Discord message link URL or string containing the link

    Returns:
        MessageLinkInfo if parsing successful, None if invalid format
    """
    if not message_link:
        logger.warning("Message link is None or empty")
        return None
        
    # Clean the input string
    message_link = message_link.strip()

    logger.debug(f"Attempting to parse message link: {message_link}")

    match = MESSAGE_LINK_PATTERN.search(message_link)

    if not match:
        logger.warning(f"Failed to parse message link: {message_link}")
        return None

    try:
        guild_id, channel_id, message_id = map(int, match.groups())

        link_info = MessageLinkInfo(guild_id=guild_id, channel_id=channel_id, message_id=message_id)

        logger.debug(f"Successfully parsed message link: {link_info}")
        return link_info

    except ValueError as e:
        logger.error(f"Failed to convert IDs to integers: {e}")
        return None


def validate_message_link_format(message_link: str) -> bool:
    """
    Validate if a string appears to be a valid Discord message link format.

    Args:
        message_link: String to validate

    Returns:
        bool: True if format appears valid, False otherwise
    """
    return parse_message_link(message_link) is not None


def create_message_link(guild_id: int, channel_id: int, message_id: int) -> str:
    """
    Create a Discord message link from guild, channel, and message IDs.

    Args:
        guild_id: Discord guild (server) ID
        channel_id: Discord channel ID
        message_id: Discord message ID

    Returns:
        str: Formatted Discord message link
    """
    return f"https://discord.com/channels/{guild_id}/{channel_id}/{message_id}"


def get_parsing_error_message() -> str:
    """
    Get a standardized error message for invalid message link format.

    Returns:
        str: User-friendly error message with usage instructions
    """
    return (
        "❌ Format de lien invalide. Pour obtenir le lien d'un message:\n"
        "1. Faites clic droit sur le message\n"
        "2. Sélectionnez 'Copier le lien du message'\n"
        "3. Collez le lien complet dans la commande"
    )


def extract_message_title(message_content: str, max_length: int = 100) -> str:
    """
    Extract a title from Discord message content.

    Takes the first meaningful line of the message content as the title,
    ignoring bot commands and very short content.

    Args:
        message_content: The full message content
        max_length: Maximum length for the title (default: 100)

    Returns:
        str: Extracted and potentially truncated title
    """
    if not message_content:
        return "Match sans titre"

    # Split into lines and find the first meaningful line
    lines = [line.strip() for line in message_content.split("\n") if line.strip()]

    if not lines:
        return "Match sans titre"

    # Filter out bot commands and very short messages
    for line in lines:
        # Skip bot commands (starting with ! or /) and very short content
        if not line.startswith(("!", "/", "@")) and len(line) > 5:
            # Truncate if too long
            if len(line) > max_length:
                return line[: max_length - 3] + "..."
            return line

    # If no meaningful content found, create a better default title
    first_line = lines[0]
    if first_line.startswith(("!", "/")):
        # For commands, create a more user-friendly title
        command_name = first_line.split()[0] if " " in first_line else first_line
        return f"Match avec commande {command_name}"

    # For mentions or other short content, be more descriptive
    if first_line.startswith("@"):
        return "Match avec mentions"

    # Default fallback
    if len(first_line) <= 5:
        return "Match de test"

    # Truncate if too long
    if len(first_line) > max_length:
        return first_line[: max_length - 3] + "..."

    return first_line
