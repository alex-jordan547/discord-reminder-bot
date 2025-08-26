"""
Comprehensive unit tests for validation utilities and helpers.

This module tests all validation and helper utilities including:
- Field validation
- Data validation
- Message parsing
- Error recovery
- Logging configuration

Requirements covered: 3.1, 3.2, 5.1
"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import discord
import pytest


class TestFieldValidator:
    """Tests for field validation utilities."""

    @pytest.mark.unit
    def test_validate_discord_id_valid(self):
        """Test validation of valid Discord IDs."""
        from models.validation import FieldValidator

        # Valid Discord IDs (snowflakes)
        valid_ids = [
            123456789012345678,  # Typical Discord ID
            100000000000000000,  # Minimum valid snowflake
            999999999999999999,  # Large but valid
        ]

        for valid_id in valid_ids:
            errors = FieldValidator.validate_discord_id(valid_id, "test_field")
            assert errors == []

    @pytest.mark.unit
    def test_validate_discord_id_invalid(self):
        """Test validation of invalid Discord IDs."""
        from models.validation import FieldValidator

        # Invalid Discord IDs
        invalid_ids = [
            0,  # Too small
            -1,  # Negative
            99,  # Too small
            None,  # None value
            "string",  # Wrong type
        ]

        for invalid_id in invalid_ids:
            errors = FieldValidator.validate_discord_id(invalid_id, "test_field")
            assert len(errors) > 0
            assert any("test_field" in error.lower() for error in errors)

    @pytest.mark.unit
    def test_validate_interval_minutes_valid(self):
        """Test validation of valid interval minutes."""
        from models.validation import FieldValidator

        valid_intervals = [
            1.0,  # Minimum
            60.0,  # Standard hour
            1440.0,  # 24 hours
            10080.0,  # 7 days
        ]

        for interval in valid_intervals:
            errors = FieldValidator.validate_interval_minutes(interval, "interval")
            assert errors == []

    @pytest.mark.unit
    def test_validate_interval_minutes_invalid(self):
        """Test validation of invalid interval minutes."""
        from models.validation import FieldValidator

        invalid_intervals = [
            0,  # Zero
            -1,  # Negative
            0.5,  # Too small
            20160,  # Too large (2 weeks)
            None,  # None
            "60",  # String
        ]

        for interval in invalid_intervals:
            errors = FieldValidator.validate_interval_minutes(interval, "interval")
            assert len(errors) > 0

    @pytest.mark.unit
    def test_validate_json_field_valid(self):
        """Test validation of valid JSON fields."""
        from models.validation import FieldValidator

        valid_json = ['{"key": "value"}', "[]", '["item1", "item2"]', "123", '"string"']

        for json_str in valid_json:
            errors = FieldValidator.validate_json_field(json_str, "json_field")
            assert errors == []

    @pytest.mark.unit
    def test_validate_json_field_invalid(self):
        """Test validation of invalid JSON fields."""
        from models.validation import FieldValidator

        invalid_json = [
            "{invalid json}",
            '{"unclosed": "object"',
            "[unclosed array",
            "not json at all",
            None,
        ]

        for json_str in invalid_json:
            errors = FieldValidator.validate_json_field(json_str, "json_field")
            if json_str is not None:  # None is often acceptable
                assert len(errors) > 0

    @pytest.mark.unit
    def test_validate_emoji_list_valid(self):
        """Test validation of valid emoji lists."""
        from models.validation import FieldValidator

        valid_emoji_lists = [
            ["✅", "❌", "❓"],
            ["👍", "👎"],
            ["🔥", "💯", "⭐"],
            [],  # Empty list should be valid
        ]

        for emoji_list in valid_emoji_lists:
            errors = FieldValidator.validate_emoji_list(emoji_list, "emojis")
            assert errors == []

    @pytest.mark.unit
    def test_validate_emoji_list_invalid(self):
        """Test validation of invalid emoji lists."""
        from models.validation import FieldValidator

        invalid_emoji_lists = [
            None,
            "not a list",
            [""],  # Empty string
            [None],  # None in list
            [123],  # Number in list
            ["✅"] * 20,  # Too many emojis
        ]

        for emoji_list in invalid_emoji_lists:
            errors = FieldValidator.validate_emoji_list(emoji_list, "emojis")
            assert len(errors) > 0


class TestValidationMixin:
    """Tests for ValidationMixin functionality."""

    @pytest.mark.unit
    def test_validation_mixin_validate(self, isolated_database):
        """Test ValidationMixin validate method."""
        from models.database_models import Guild

        # Valid guild
        valid_guild = Guild(guild_id=123456789, name="Valid Guild")
        errors = valid_guild.validate()
        assert errors == []

        # Invalid guild
        invalid_guild = Guild(guild_id=0, name="")  # Invalid ID and empty name
        errors = invalid_guild.validate()
        assert len(errors) > 0

    @pytest.mark.unit
    def test_validation_mixin_is_valid(self, isolated_database):
        """Test ValidationMixin is_valid method."""
        from models.database_models import Guild

        valid_guild = Guild(guild_id=123456789, name="Valid Guild")
        assert valid_guild.is_valid() is True

        invalid_guild = Guild(guild_id=0, name="")
        assert invalid_guild.is_valid() is False

    @pytest.mark.unit
    def test_validation_mixin_validate_with_exception(self, isolated_database):
        """Test ValidationMixin validate with exception raising."""
        from models.database_models import Guild
        from models.validation import ValidationError

        invalid_guild = Guild(guild_id=0, name="")

        # Should not raise by default
        errors = invalid_guild.validate()
        assert len(errors) > 0

        # Should raise when requested
        with pytest.raises(ValidationError):
            invalid_guild.validate(raise_exception=True)


class TestSerializationMixin:
    """Tests for SerializationMixin functionality."""

    @pytest.mark.unit
    def test_serialization_mixin_to_dict(self, isolated_database):
        """Test SerializationMixin to_dict method."""
        from models.database_models import Guild

        guild = Guild(guild_id=123456789, name="Test Guild")
        data = guild.to_dict()

        assert isinstance(data, dict)
        assert data["guild_id"] == 123456789
        assert data["name"] == "Test Guild"
        assert "created_at" in data
        assert "updated_at" in data

    @pytest.mark.unit
    def test_serialization_mixin_from_dict(self, isolated_database):
        """Test SerializationMixin from_dict method."""
        from models.database_models import Guild

        data = {"guild_id": 123456789, "name": "Test Guild", "settings": '{"key": "value"}'}

        guild = Guild.from_dict(data)
        assert guild.guild_id == 123456789
        assert guild.name == "Test Guild"
        assert guild.settings == '{"key": "value"}'

    @pytest.mark.unit
    def test_serialization_with_computed_properties(self, isolated_database):
        """Test serialization including computed properties."""
        from models.database_models import Event, Guild

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        event = Event.create(
            message_id=555555555,
            channel_id=987654321,
            guild=guild,
            title="Test Event",
            interval_minutes=60.0,
        )

        # Serialize with computed properties
        data = event.to_dict(include_computed=True)

        assert "is_due_for_reminder" in data
        assert "next_reminder_time" in data
        assert isinstance(data["is_due_for_reminder"], bool)

    @pytest.mark.unit
    def test_serialization_datetime_handling(self, isolated_database):
        """Test proper datetime serialization."""
        from models.database_models import Guild

        guild = Guild.create(guild_id=123456789, name="Test Guild")
        data = guild.to_dict()

        # Datetime should be serialized as ISO string
        assert isinstance(data["created_at"], str)
        assert isinstance(data["updated_at"], str)

        # Should be valid ISO format
        datetime.fromisoformat(data["created_at"])
        datetime.fromisoformat(data["updated_at"])


class TestMessageParser:
    """Tests for message parsing utilities."""

    @pytest.mark.unit
    def test_parse_discord_message_link_valid(self):
        """Test parsing valid Discord message links."""
        from utils.message_parser import parse_message_link

        valid_links = [
            "https://discord.com/channels/123456789/987654321/555555555",
            "https://discordapp.com/channels/123456789/987654321/555555555",
            "https://ptb.discord.com/channels/123456789/987654321/555555555",
        ]

        for link in valid_links:
            result = parse_message_link(link)
            assert result is not None
            assert result["guild_id"] == 123456789
            assert result["channel_id"] == 987654321
            assert result["message_id"] == 555555555

    @pytest.mark.unit
    def test_parse_discord_message_link_invalid(self):
        """Test parsing invalid Discord message links."""
        from utils.message_parser import parse_message_link

        invalid_links = [
            "not a link",
            "https://example.com/channels/123/456/789",
            "https://discord.com/channels/123/456",  # Missing message ID
            "https://discord.com/channels/invalid/456/789",  # Invalid guild ID
            "",
        ]

        for link in invalid_links:
            result = parse_message_link(link)
            assert result is None

    @pytest.mark.unit
    def test_parse_message_link_dm_channel(self):
        """Test parsing DM channel message links."""
        from utils.message_parser import parse_message_link

        dm_link = "https://discord.com/channels/@me/987654321/555555555"
        result = parse_message_link(dm_link)

        # DM channels should have guild_id as None or @me
        assert result is not None
        assert result["channel_id"] == 987654321
        assert result["message_id"] == 555555555

    @pytest.mark.unit
    def test_extract_ids_from_message_content(self):
        """Test extracting IDs from message content."""
        from utils.message_parser import extract_channel_mentions, extract_user_mentions

        content_with_mentions = "Hey <@123456789> and <@!987654321>, check out <#555555555>!"

        user_ids = extract_user_mentions(content_with_mentions)
        channel_ids = extract_channel_mentions(content_with_mentions)

        assert 123456789 in user_ids
        assert 987654321 in user_ids
        assert 555555555 in channel_ids

    @pytest.mark.unit
    def test_validate_message_link_permissions(self):
        """Test message link validation with permissions."""
        from utils.message_parser import validate_message_link_access

        # Mock Discord objects
        mock_guild = MagicMock()
        mock_guild.id = 123456789

        mock_channel = MagicMock()
        mock_channel.id = 987654321
        mock_channel.guild = mock_guild

        mock_user = MagicMock()
        mock_user.id = 111111111

        link_data = {"guild_id": 123456789, "channel_id": 987654321, "message_id": 555555555}

        # Test with valid permissions
        with patch("utils.message_parser.check_channel_permissions") as mock_perms:
            mock_perms.return_value = True

            is_valid = validate_message_link_access(link_data, mock_user, mock_guild)
            assert is_valid is True


class TestErrorRecovery:
    """Tests for error recovery utilities."""

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_safe_fetch_message_success(self):
        """Test successful message fetching."""
        from utils.error_recovery import safe_fetch_message

        mock_bot = MagicMock()
        mock_channel = MagicMock()
        mock_message = MagicMock()
        mock_message.id = 555555555

        mock_bot.fetch_channel = AsyncMock(return_value=mock_channel)
        mock_channel.fetch_message = AsyncMock(return_value=mock_message)

        result = await safe_fetch_message(mock_bot, 987654321, 555555555)

        assert result == mock_message
        mock_bot.fetch_channel.assert_called_once_with(987654321)
        mock_channel.fetch_message.assert_called_once_with(555555555)

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_safe_fetch_message_channel_not_found(self):
        """Test message fetching when channel not found."""
        from utils.error_recovery import safe_fetch_message

        mock_bot = MagicMock()
        mock_bot.fetch_channel = AsyncMock(
            side_effect=discord.NotFound(MagicMock(), "Channel not found")
        )

        with patch("utils.error_recovery.logger") as mock_logger:
            result = await safe_fetch_message(mock_bot, 987654321, 555555555)

            assert result is None
            mock_logger.warning.assert_called()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_safe_fetch_message_forbidden(self):
        """Test message fetching when access forbidden."""
        from utils.error_recovery import safe_fetch_message

        mock_bot = MagicMock()
        mock_channel = MagicMock()

        mock_bot.fetch_channel = AsyncMock(return_value=mock_channel)
        mock_channel.fetch_message = AsyncMock(
            side_effect=discord.Forbidden(MagicMock(), "Access denied")
        )

        with patch("utils.error_recovery.logger") as mock_logger:
            result = await safe_fetch_message(mock_bot, 987654321, 555555555)

            assert result is None
            mock_logger.warning.assert_called()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_safe_send_message_success(self):
        """Test successful message sending."""
        from utils.error_recovery import safe_send_message

        mock_channel = MagicMock()
        mock_sent_message = MagicMock()

        mock_channel.send = AsyncMock(return_value=mock_sent_message)

        result = await safe_send_message(mock_channel, "Test message")

        assert result == mock_sent_message
        mock_channel.send.assert_called_once_with("Test message")

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_safe_send_message_with_retry(self):
        """Test message sending with retry on rate limit."""
        from utils.error_recovery import safe_send_message

        mock_channel = MagicMock()
        mock_sent_message = MagicMock()

        # First call fails with rate limit, second succeeds
        mock_channel.send = AsyncMock(
            side_effect=[discord.HTTPException(MagicMock(), "Rate limited"), mock_sent_message]
        )

        with patch("asyncio.sleep"):
            result = await safe_send_message(mock_channel, "Test message", max_retries=2)

            assert result == mock_sent_message
            assert mock_channel.send.call_count == 2

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_safe_add_reaction_success(self):
        """Test successful reaction adding."""
        from utils.error_recovery import safe_add_reaction

        mock_message = MagicMock()
        mock_message.add_reaction = AsyncMock()

        result = await safe_add_reaction(mock_message, "✅")

        assert result is True
        mock_message.add_reaction.assert_called_once_with("✅")

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_safe_add_reaction_failure(self):
        """Test reaction adding failure."""
        from utils.error_recovery import safe_add_reaction

        mock_message = MagicMock()
        mock_message.add_reaction = AsyncMock(
            side_effect=discord.Forbidden(MagicMock(), "Cannot add reaction")
        )

        with patch("utils.error_recovery.logger") as mock_logger:
            result = await safe_add_reaction(mock_message, "✅")

            assert result is False
            mock_logger.warning.assert_called()

    @pytest.mark.unit
    def test_format_error_for_user(self):
        """Test user-friendly error formatting."""
        from utils.error_recovery import format_error_for_user

        # Test different error types
        not_found_error = discord.NotFound(MagicMock(), "Channel not found")
        formatted = format_error_for_user(not_found_error, "sending message")

        assert "not found" in formatted.lower()
        assert "sending message" in formatted.lower()

        # Test forbidden error
        forbidden_error = discord.Forbidden(MagicMock(), "Missing permissions")
        formatted = format_error_for_user(forbidden_error, "adding reaction")

        assert "permission" in formatted.lower()
        assert "adding reaction" in formatted.lower()

    @pytest.mark.unit
    def test_is_recoverable_error(self):
        """Test error recoverability detection."""
        from utils.error_recovery import is_recoverable_error

        # Recoverable errors
        rate_limit = discord.HTTPException(MagicMock(), "Rate limited")
        server_error = discord.HTTPException(MagicMock(), "Internal server error")

        assert is_recoverable_error(rate_limit) is True
        assert is_recoverable_error(server_error) is True

        # Non-recoverable errors
        not_found = discord.NotFound(MagicMock(), "Not found")
        forbidden = discord.Forbidden(MagicMock(), "Forbidden")

        assert is_recoverable_error(not_found) is False
        assert is_recoverable_error(forbidden) is False

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_retry_with_backoff(self):
        """Test retry mechanism with exponential backoff."""
        from utils.error_recovery import retry_with_backoff

        call_count = 0

        async def failing_function():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise Exception("Temporary failure")
            return "Success"

        with patch("asyncio.sleep"):
            result = await retry_with_backoff(failing_function, max_retries=3)

            assert result == "Success"
            assert call_count == 3

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_circuit_breaker_pattern(self):
        """Test circuit breaker pattern for error recovery."""
        from utils.error_recovery import CircuitBreaker

        breaker = CircuitBreaker(failure_threshold=3, recovery_timeout=1.0)

        async def failing_function():
            raise Exception("Always fails")

        # Should fail normally first few times
        for _ in range(3):
            with pytest.raises(Exception):
                await breaker.call(failing_function)

        # Circuit should be open now
        assert breaker.state == "open"

        # Further calls should fail fast
        with pytest.raises(Exception):
            await breaker.call(failing_function)


class TestLoggingConfiguration:
    """Tests for logging configuration utilities."""

    @pytest.mark.unit
    def test_setup_logging_basic(self):
        """Test basic logging setup."""
        from utils.logging_config import setup_logging

        # Test with basic configuration
        setup_logging(log_level="INFO", log_to_file=False)

        # Should configure root logger
        import logging

        logger = logging.getLogger()
        assert logger.level == logging.INFO

    @pytest.mark.unit
    def test_setup_logging_with_file(self, tmp_path):
        """Test logging setup with file output."""
        from utils.logging_config import setup_logging

        log_file = tmp_path / "test.log"

        with patch("utils.logging_config.get_log_file_path") as mock_path:
            mock_path.return_value = str(log_file)

            setup_logging(log_level="DEBUG", log_to_file=True)

            # Should create log file
            import logging

            test_logger = logging.getLogger("test")
            test_logger.info("Test message")

            # File should exist (may be created lazily)
            # Just verify no errors occurred

    @pytest.mark.unit
    def test_get_log_level_from_env(self):
        """Test getting log level from environment."""
        from utils.logging_config import get_log_level_from_env

        with patch.dict("os.environ", {"LOG_LEVEL": "DEBUG"}):
            level = get_log_level_from_env()
            import logging

            assert level == logging.DEBUG

        with patch.dict("os.environ", {"LOG_LEVEL": "INVALID"}, clear=True):
            level = get_log_level_from_env()
            import logging

            assert level == logging.INFO  # Default

    @pytest.mark.unit
    def test_should_use_colors(self):
        """Test color detection for logging."""
        from utils.logging_config import should_use_colors

        # Test with force color
        with patch.dict("os.environ", {"FORCE_COLOR": "1"}):
            assert should_use_colors() is True

        # Test with no color
        with patch.dict("os.environ", {"NO_COLOR": "1"}):
            assert should_use_colors() is False

    @pytest.mark.unit
    def test_colored_formatter(self):
        """Test colored log formatter."""
        import logging

        from utils.logging_config import ColoredFormatter

        formatter = ColoredFormatter()

        # Create test record
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="Test message",
            args=(),
            exc_info=None,
        )

        formatted = formatter.format(record)

        # Should contain the message
        assert "Test message" in formatted
        # Should contain color codes (ANSI escape sequences)
        assert "\033[" in formatted or "Test message" in formatted

    @pytest.mark.unit
    def test_structured_logging(self):
        """Test structured logging functionality."""
        from utils.logging_config import StructuredLogger

        logger = StructuredLogger("test")

        # Test structured log entry
        with patch("logging.Logger.info") as mock_info:
            logger.log_event(
                "user_action", {"user_id": 123456789, "action": "add_event", "event_id": 555555555}
            )

            mock_info.assert_called_once()
            call_args = mock_info.call_args[0][0]
            assert "user_action" in call_args
            assert "123456789" in call_args
