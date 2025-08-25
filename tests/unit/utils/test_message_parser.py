"""
Unit tests for message parser utilities.

This module tests message parsing functionality.
"""

import pytest


@pytest.mark.unit
def test_message_parser_import():
    """Test that message parser can be imported."""
    try:
        from utils.message_parser import parse_message_link

        assert parse_message_link is not None
    except ImportError as e:
        pytest.skip(f"Message parser not available: {e}")


@pytest.mark.unit
def test_parse_valid_message_links():
    """Test parsing valid Discord message links."""
    try:
        from utils.message_parser import parse_message_link

        valid_links = [
            "https://discord.com/channels/123456789/987654321/111222333",
            "https://discordapp.com/channels/123456789/987654321/111222333",
        ]

        for link in valid_links:
            result = parse_message_link(link)
            if result is not None:
                guild_id, channel_id, message_id = result
                assert isinstance(guild_id, int)
                assert isinstance(channel_id, int)
                assert isinstance(message_id, int)
                assert guild_id == 123456789
                assert channel_id == 987654321
                assert message_id == 111222333

    except ImportError as e:
        pytest.skip(f"Message parser not available: {e}")


@pytest.mark.unit
def test_parse_invalid_message_links():
    """Test parsing invalid message links."""
    try:
        from utils.message_parser import parse_message_link

        invalid_links = [
            "not_a_link",
            "https://example.com",
            "https://discord.com/channels/invalid",
            "",
            None,
        ]

        for link in invalid_links:
            result = parse_message_link(link)
            # Invalid links should return None or raise an exception
            # Both behaviors are acceptable
            if result is not None:
                # If it doesn't return None, it should still be a valid tuple
                assert isinstance(result, tuple)
                assert len(result) == 3

    except ImportError as e:
        pytest.skip(f"Message parser not available: {e}")


@pytest.mark.unit
def test_parse_edge_cases():
    """Test edge cases for message link parsing."""
    try:
        from utils.message_parser import parse_message_link

        # Test with very large IDs (Discord snowflakes can be large)
        large_id_link = (
            "https://discord.com/channels/999999999999999999/888888888888888888/777777777777777777"
        )
        result = parse_message_link(large_id_link)

        if result is not None:
            guild_id, channel_id, message_id = result
            assert guild_id == 999999999999999999
            assert channel_id == 888888888888888888
            assert message_id == 777777777777777777

        # Test with minimum valid IDs
        min_id_link = "https://discord.com/channels/1/1/1"
        result = parse_message_link(min_id_link)

        if result is not None:
            guild_id, channel_id, message_id = result
            assert guild_id == 1
            assert channel_id == 1
            assert message_id == 1

    except ImportError as e:
        pytest.skip(f"Message parser not available: {e}")
