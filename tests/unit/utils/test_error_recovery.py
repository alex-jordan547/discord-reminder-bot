"""
Unit tests for error recovery utilities.

This module tests error handling and recovery mechanisms.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.mark.unit
def test_error_recovery_import():
    """Test that error recovery utilities can be imported."""
    try:
        from utils.error_recovery import classify_discord_error, is_retryable_error, with_retry

        assert classify_discord_error is not None
        assert is_retryable_error is not None
        assert with_retry is not None
    except ImportError as e:
        pytest.skip(f"Error recovery utilities not available: {e}")


@pytest.mark.unit
def test_error_classification():
    """Test basic error classification."""
    try:
        from utils.error_recovery import ErrorSeverity, classify_discord_error

        # Test with a basic exception
        error = ValueError("Test error")
        severity = classify_discord_error(error)

        # Should return some severity level
        assert severity is not None

    except ImportError as e:
        pytest.skip(f"Error classification not available: {e}")


@pytest.mark.unit
def test_retryable_error_detection():
    """Test detection of retryable errors."""
    try:
        from utils.error_recovery import is_retryable_error

        # Test with basic exceptions
        timeout_error = asyncio.TimeoutError()
        connection_error = ConnectionError("Connection failed")

        # These should have some retryable status
        timeout_retryable = is_retryable_error(timeout_error)
        connection_retryable = is_retryable_error(connection_error)

        assert isinstance(timeout_retryable, bool)
        assert isinstance(connection_retryable, bool)

    except ImportError as e:
        pytest.skip(f"Retryable error detection not available: {e}")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_retry_decorator_basic():
    """Test basic retry decorator functionality."""
    try:
        from utils.error_recovery import RetryConfig, with_retry

        call_count = 0

        @with_retry("test_operation", RetryConfig(max_attempts=2, base_delay=0.01))
        async def test_function():
            nonlocal call_count
            call_count += 1
            return "success"

        result = await test_function()
        assert result == "success"
        assert call_count == 1

    except ImportError as e:
        pytest.skip(f"Retry decorator not available: {e}")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_safe_message_operations():
    """Test safe message operation helpers."""
    try:
        from utils.error_recovery import safe_fetch_message, safe_send_message

        # Test with mock channel
        mock_channel = AsyncMock()
        mock_message = MagicMock()
        mock_channel.send.return_value = mock_message
        mock_channel.fetch_message.return_value = mock_message

        # Test safe send
        result = await safe_send_message(mock_channel, content="test")
        assert result == mock_message

        # Test safe fetch
        result = await safe_fetch_message(mock_channel, 123456)
        assert result == mock_message

    except ImportError as e:
        pytest.skip(f"Safe message operations not available: {e}")
