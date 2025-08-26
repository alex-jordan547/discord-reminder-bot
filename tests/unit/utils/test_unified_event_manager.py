"""
Comprehensive unit tests for unified_event_manager.py.

This module tests the unified event manager that bridges between
different storage backends and provides a single interface.

Requirements covered: 3.1, 3.2, 5.1
"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestUnifiedEventManager:
    """Comprehensive tests for UnifiedEventManager."""

    @pytest.fixture
    def unified_manager(self):
        """Create a UnifiedEventManager instance."""
        from utils.unified_event_manager import UnifiedEventManager

        return UnifiedEventManager()

    @pytest.fixture
    def mock_backend(self):
        """Create a mock storage backend."""
        backend = MagicMock()
        backend.load_events = AsyncMock(return_value=[])
        backend.save_events = AsyncMock()
        backend.add_event = AsyncMock()
        backend.remove_event = AsyncMock(return_value=True)
        backend.get_events_for_guild = AsyncMock(return_value=[])
        backend.get_due_events = AsyncMock(return_value=[])
        backend.pause_event = AsyncMock(return_value=True)
        backend.resume_event = AsyncMock(return_value=True)
        backend.get_stats = AsyncMock(return_value={})
        return backend

    @pytest.fixture
    def sample_event(self):
        """Create a sample event for testing."""
        from models.reminder import Event

        event = Event()
        event.message_id = 555555555
        event.channel_id = 987654321
        event.guild_id = 123456789
        event.title = "Test Event"
        event.interval_minutes = 60.0
        event.is_paused = False
        event.last_reminder = datetime.now() - timedelta(minutes=30)
        return event

    @pytest.mark.unit
    def test_unified_manager_initialization(self, unified_manager):
        """Test UnifiedEventManager initialization."""
        assert unified_manager is not None
        assert hasattr(unified_manager, "current_backend")
        assert hasattr(unified_manager, "fallback_backend")

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_auto_backend_selection(self, unified_manager):
        """Test automatic backend selection based on feature flags."""
        with patch("utils.unified_event_manager.FeatureFlagManager") as mock_flag_manager:
            # Test SQLite backend selection
            mock_flag_manager.return_value.is_enabled.return_value = True

            await unified_manager.initialize()

            # Should select SQLite backend
            assert unified_manager.current_backend is not None

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_fallback_to_json_backend(self, unified_manager):
        """Test fallback to JSON backend when SQLite fails."""
        with patch("utils.unified_event_manager.FeatureFlagManager") as mock_flag_manager, patch(
            "utils.unified_event_manager.logger"
        ) as mock_logger:

            # SQLite enabled but fails to initialize
            mock_flag_manager.return_value.is_enabled.return_value = True

            # Mock SQLite backend that fails
            with patch("utils.unified_event_manager.EventManagerSQLite") as mock_sqlite:
                mock_sqlite.side_effect = Exception("SQLite initialization failed")

                await unified_manager.initialize()

                # Should log the failure and use fallback
                mock_logger.error.assert_called()
                assert unified_manager.current_backend is not None

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_load_events_success(self, unified_manager, mock_backend, sample_event):
        """Test successful event loading."""
        unified_manager.current_backend = mock_backend
        mock_backend.load_events.return_value = [sample_event]

        events = await unified_manager.load_events()

        assert len(events) == 1
        assert events[0] == sample_event
        mock_backend.load_events.assert_called_once()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_load_events_with_fallback(self, unified_manager, sample_event):
        """Test event loading with backend fallback."""
        # Mock primary backend that fails
        failing_backend = MagicMock()
        failing_backend.load_events = AsyncMock(side_effect=Exception("Backend error"))

        # Mock fallback backend that succeeds
        fallback_backend = MagicMock()
        fallback_backend.load_events = AsyncMock(return_value=[sample_event])

        unified_manager.current_backend = failing_backend
        unified_manager.fallback_backend = fallback_backend

        with patch("utils.unified_event_manager.logger") as mock_logger:
            events = await unified_manager.load_events()

            assert len(events) == 1
            assert events[0] == sample_event
            mock_logger.error.assert_called()
            fallback_backend.load_events.assert_called_once()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_save_events_success(self, unified_manager, mock_backend, sample_event):
        """Test successful event saving."""
        unified_manager.current_backend = mock_backend

        await unified_manager.save_events([sample_event])

        mock_backend.save_events.assert_called_once_with([sample_event])

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_save_events_with_sync(self, unified_manager, sample_event):
        """Test event saving with backend synchronization."""
        # Mock both backends
        primary_backend = MagicMock()
        primary_backend.save_events = AsyncMock()

        fallback_backend = MagicMock()
        fallback_backend.save_events = AsyncMock()

        unified_manager.current_backend = primary_backend
        unified_manager.fallback_backend = fallback_backend
        unified_manager.sync_backends = True

        await unified_manager.save_events([sample_event])

        # Both backends should be called
        primary_backend.save_events.assert_called_once()
        fallback_backend.save_events.assert_called_once()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_add_event(self, unified_manager, mock_backend, sample_event):
        """Test adding an event."""
        unified_manager.current_backend = mock_backend

        await unified_manager.add_event(sample_event)

        mock_backend.add_event.assert_called_once_with(sample_event)

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_remove_event(self, unified_manager, mock_backend):
        """Test removing an event."""
        unified_manager.current_backend = mock_backend

        result = await unified_manager.remove_event(555555555)

        assert result is True
        mock_backend.remove_event.assert_called_once_with(555555555)

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_events_for_guild(self, unified_manager, mock_backend, sample_event):
        """Test getting events for a guild."""
        unified_manager.current_backend = mock_backend
        mock_backend.get_events_for_guild.return_value = [sample_event]

        events = await unified_manager.get_events_for_guild(123456789)

        assert len(events) == 1
        assert events[0] == sample_event
        mock_backend.get_events_for_guild.assert_called_once_with(123456789)

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_due_events(self, unified_manager, mock_backend, sample_event):
        """Test getting due events."""
        unified_manager.current_backend = mock_backend
        mock_backend.get_due_events.return_value = [sample_event]

        events = await unified_manager.get_due_events()

        assert len(events) == 1
        assert events[0] == sample_event
        mock_backend.get_due_events.assert_called_once()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_pause_event(self, unified_manager, mock_backend):
        """Test pausing an event."""
        unified_manager.current_backend = mock_backend

        result = await unified_manager.pause_event(555555555)

        assert result is True
        mock_backend.pause_event.assert_called_once_with(555555555)

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_resume_event(self, unified_manager, mock_backend):
        """Test resuming an event."""
        unified_manager.current_backend = mock_backend

        result = await unified_manager.resume_event(555555555)

        assert result is True
        mock_backend.resume_event.assert_called_once_with(555555555)

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_stats(self, unified_manager, mock_backend):
        """Test getting statistics."""
        expected_stats = {
            "total_events": 10,
            "active_events": 8,
            "paused_events": 2,
            "backend": "test_backend",
        }

        unified_manager.current_backend = mock_backend
        mock_backend.get_stats.return_value = expected_stats

        stats = await unified_manager.get_stats()

        assert stats == expected_stats
        mock_backend.get_stats.assert_called_once()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_health_check_healthy(self, unified_manager, mock_backend):
        """Test health check with healthy backend."""
        unified_manager.current_backend = mock_backend
        mock_backend.load_events = AsyncMock(return_value=[])

        is_healthy = await unified_manager.health_check()

        assert is_healthy is True

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_health_check_unhealthy(self, unified_manager):
        """Test health check with unhealthy backend."""
        failing_backend = MagicMock()
        failing_backend.load_events = AsyncMock(side_effect=Exception("Backend down"))

        unified_manager.current_backend = failing_backend

        with patch("utils.unified_event_manager.logger"):
            is_healthy = await unified_manager.health_check()

            assert is_healthy is False

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_switch_backend(self, unified_manager):
        """Test switching between backends."""
        # Mock both backends
        backend1 = MagicMock()
        backend1.load_events = AsyncMock(return_value=[])

        backend2 = MagicMock()
        backend2.load_events = AsyncMock(return_value=[])

        unified_manager.current_backend = backend1
        unified_manager.fallback_backend = backend2

        # Switch to fallback
        await unified_manager.switch_to_fallback()

        assert unified_manager.current_backend == backend2

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_data_migration(self, unified_manager, sample_event):
        """Test data migration between backends."""
        # Mock source and target backends
        source_backend = MagicMock()
        source_backend.load_events = AsyncMock(return_value=[sample_event])

        target_backend = MagicMock()
        target_backend.save_events = AsyncMock()
        target_backend.load_events = AsyncMock(return_value=[])

        unified_manager.current_backend = source_backend
        unified_manager.fallback_backend = target_backend

        await unified_manager.migrate_data_to_fallback()

        # Should load from current and save to fallback
        source_backend.load_events.assert_called_once()
        target_backend.save_events.assert_called_once_with([sample_event])

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_concurrent_operations(self, unified_manager, mock_backend):
        """Test concurrent operations safety."""
        import asyncio

        unified_manager.current_backend = mock_backend

        # Mock events
        events = []
        for i in range(10):
            event = MagicMock()
            event.message_id = 1000 + i
            events.append(event)

        # Concurrent adds and removes
        async def add_events():
            for event in events[:5]:
                await unified_manager.add_event(event)

        async def remove_events():
            for i in range(5):
                await unified_manager.remove_event(1000 + i)

        # Run concurrently
        await asyncio.gather(add_events(), remove_events())

        # Should have called backend methods
        assert mock_backend.add_event.call_count == 5
        assert mock_backend.remove_event.call_count == 5

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_error_recovery_and_logging(self, unified_manager):
        """Test error recovery and logging functionality."""
        # Mock backend that always fails
        failing_backend = MagicMock()
        failing_backend.load_events = AsyncMock(side_effect=Exception("Always fails"))
        failing_backend.save_events = AsyncMock(side_effect=Exception("Always fails"))

        unified_manager.current_backend = failing_backend
        unified_manager.fallback_backend = None  # No fallback

        with patch("utils.unified_event_manager.logger") as mock_logger:
            # Operations should handle errors gracefully
            events = await unified_manager.load_events()
            assert events == []

            await unified_manager.save_events([])

            # Should log errors
            assert mock_logger.error.call_count >= 2

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_backend_synchronization(self, unified_manager, sample_event):
        """Test synchronization between primary and fallback backends."""
        # Mock both backends
        primary = MagicMock()
        primary.save_events = AsyncMock()
        primary.load_events = AsyncMock(return_value=[sample_event])

        fallback = MagicMock()
        fallback.save_events = AsyncMock()
        fallback.load_events = AsyncMock(return_value=[])

        unified_manager.current_backend = primary
        unified_manager.fallback_backend = fallback
        unified_manager.sync_backends = True

        # Test sync on save
        await unified_manager.save_events([sample_event])

        primary.save_events.assert_called_once()
        fallback.save_events.assert_called_once()

        # Test periodic sync
        await unified_manager.sync_backends_data()

        primary.load_events.assert_called()
        fallback.save_events.assert_called()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_performance_monitoring(self, unified_manager, mock_backend):
        """Test performance monitoring and metrics."""
        unified_manager.current_backend = mock_backend

        # Mock timing
        with patch("time.time") as mock_time:
            mock_time.side_effect = [1000.0, 1000.5]  # 0.5 second operation

            await unified_manager.load_events()

            stats = await unified_manager.get_performance_stats()

            assert "last_operation_time" in stats
            assert "average_response_time" in stats
            assert "total_operations" in stats

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_cache_management(self, unified_manager, mock_backend, sample_event):
        """Test cache management functionality."""
        unified_manager.current_backend = mock_backend
        unified_manager.cache_enabled = True

        # First call should hit backend
        mock_backend.load_events.return_value = [sample_event]
        events1 = await unified_manager.load_events()

        # Second call should use cache
        events2 = await unified_manager.load_events()

        assert events1 == events2
        # Backend should only be called once due to caching
        mock_backend.load_events.assert_called_once()

        # Cache invalidation
        await unified_manager.invalidate_cache()
        events3 = await unified_manager.load_events()

        # Should call backend again after cache invalidation
        assert mock_backend.load_events.call_count == 2

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_feature_flag_integration(self, unified_manager):
        """Test integration with feature flag system."""
        with patch("utils.unified_event_manager.FeatureFlagManager") as mock_flag_manager:
            flag_manager = MagicMock()
            mock_flag_manager.return_value = flag_manager

            # Test with SQLite enabled
            flag_manager.is_enabled.return_value = True
            await unified_manager.initialize()

            # Test feature flag changes during runtime
            flag_manager.is_enabled.return_value = False
            await unified_manager.check_and_switch_backends()

            # Should have switched backends
            flag_manager.is_enabled.assert_called()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_cleanup_and_shutdown(self, unified_manager, mock_backend):
        """Test proper cleanup and shutdown."""
        unified_manager.current_backend = mock_backend
        unified_manager.fallback_backend = mock_backend

        # Mock cleanup methods
        mock_backend.cleanup = AsyncMock()

        await unified_manager.cleanup()

        # Should cleanup both backends
        assert mock_backend.cleanup.call_count == 2

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_context_manager_usage(self, unified_manager, mock_backend):
        """Test using unified manager as a context manager."""
        unified_manager.current_backend = mock_backend
        mock_backend.initialize = AsyncMock()
        mock_backend.cleanup = AsyncMock()

        async with unified_manager:
            await unified_manager.load_events()

        # Should initialize and cleanup
        mock_backend.initialize.assert_called_once()
        mock_backend.cleanup.assert_called_once()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_event_validation(self, unified_manager, mock_backend):
        """Test event validation before operations."""
        unified_manager.current_backend = mock_backend

        # Test with invalid event
        invalid_event = MagicMock()
        invalid_event.message_id = None  # Invalid

        with patch("utils.unified_event_manager.logger") as mock_logger:
            await unified_manager.add_event(invalid_event)

            # Should log validation error
            mock_logger.warning.assert_called()

            # Should not call backend
            mock_backend.add_event.assert_not_called()

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_transaction_support(self, unified_manager, mock_backend, sample_event):
        """Test transaction support for atomic operations."""
        unified_manager.current_backend = mock_backend

        # Mock transaction support
        mock_backend.begin_transaction = AsyncMock()
        mock_backend.commit_transaction = AsyncMock()
        mock_backend.rollback_transaction = AsyncMock()

        # Test successful transaction
        async with unified_manager.transaction():
            await unified_manager.add_event(sample_event)
            await unified_manager.remove_event(sample_event.message_id)

        mock_backend.begin_transaction.assert_called_once()
        mock_backend.commit_transaction.assert_called_once()

        # Test failed transaction
        mock_backend.add_event.side_effect = Exception("Add failed")

        try:
            async with unified_manager.transaction():
                await unified_manager.add_event(sample_event)
        except Exception:
            pass

        mock_backend.rollback_transaction.assert_called_once()
