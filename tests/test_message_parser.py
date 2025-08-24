"""
Tests for message parser utility.
"""

from utils.message_parser import parse_message_link


def test_valid_message_links():
    """Test that valid Discord message links are parsed correctly."""
    valid_links = [
        "https://discord.com/channels/123456789/987654321/111222333",
        "https://discordapp.com/channels/123456789/987654321/111222333",
    ]

    for link in valid_links:
        result = parse_message_link(link)
        assert result is not None, f"Valid link should be parsed: {link}"
        guild_id, channel_id, message_id = result
        assert isinstance(guild_id, int)
        assert isinstance(channel_id, int)
        assert isinstance(message_id, int)


def test_invalid_message_links():
    """Test that invalid message links return None."""
    invalid_links = [
        "not_a_link",
        "https://example.com",
        "https://discord.com/channels/invalid",
        "https://discord.com/channels/123/456",  # Missing message ID
        "",
        None,
    ]

    for link in invalid_links:
        result = parse_message_link(link)
        assert result is None, f"Invalid link should return None: {link}"


def test_edge_cases():
    """Test edge cases for message link parsing."""
    # Test with very large IDs (Discord snowflakes can be large)
    large_id_link = "https://discord.com/channels/999999999999999999/888888888888888888/777777777777777777"
    result = parse_message_link(large_id_link)
    assert result is not None

    # Test with minimum valid IDs
    min_id_link = "https://discord.com/channels/1/1/1"
    result = parse_message_link(min_id_link)
    assert result is not None
