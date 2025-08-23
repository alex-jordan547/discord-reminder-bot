"""
Tests unitaires pour le système de récupération d'erreurs.

Tests des mécanismes de retry, classification d'erreurs, et récupération.
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

import discord

from utils.error_recovery import (
    classify_discord_error, 
    ErrorSeverity,
    is_retryable_error,
    calculate_delay,
    RetryConfig,
    with_retry,
    with_retry_stats,
    safe_send_message,
    safe_fetch_message,
    retry_stats
)


class TestErrorClassification:
    """Tests de classification des erreurs Discord."""
    
    def test_classify_not_found_error(self):
        """Test classification des erreurs 404."""
        error = discord.NotFound(response=MagicMock(), message="Not Found")
        assert classify_discord_error(error) == ErrorSeverity.PERMANENT
    
    def test_classify_forbidden_error(self):
        """Test classification des erreurs 403."""
        error = discord.Forbidden(response=MagicMock(), message="Forbidden")
        assert classify_discord_error(error) == ErrorSeverity.PERMANENT
    
    def test_classify_rate_limit_error(self):
        """Test classification des erreurs de rate limiting."""
        error = discord.HTTPException(response=MagicMock(), message="Rate Limited")
        error.status = 429
        assert classify_discord_error(error) == ErrorSeverity.RATE_LIMITED
    
    def test_classify_server_error(self):
        """Test classification des erreurs serveur (5xx)."""
        error = discord.HTTPException(response=MagicMock(), message="Server Error")
        error.status = 503
        assert classify_discord_error(error) == ErrorSeverity.API_UNAVAILABLE
    
    def test_classify_timeout_error(self):
        """Test classification des timeout."""
        error = asyncio.TimeoutError()
        assert classify_discord_error(error) == ErrorSeverity.API_UNAVAILABLE
    
    def test_classify_unknown_error(self):
        """Test classification des erreurs inconnues."""
        error = ValueError("Unknown error")
        assert classify_discord_error(error) == ErrorSeverity.TRANSIENT


class TestRetryLogic:
    """Tests de logique de retry."""
    
    def test_is_retryable_error(self):
        """Test de détermination des erreurs retryables."""
        # Erreurs permanentes - non retryables
        assert not is_retryable_error(discord.NotFound(response=MagicMock(), message="Not Found"))
        assert not is_retryable_error(discord.Forbidden(response=MagicMock(), message="Forbidden"))
        
        # Erreurs retryables
        assert is_retryable_error(asyncio.TimeoutError())
        
        rate_limit_error = discord.HTTPException(response=MagicMock(), message="Rate Limited")
        rate_limit_error.status = 429
        assert is_retryable_error(rate_limit_error)
    
    @pytest.mark.asyncio
    async def test_calculate_delay_exponential_backoff(self):
        """Test du calcul de délai avec exponential backoff."""
        config = RetryConfig(base_delay=1.0, backoff_factor=2.0, max_delay=10.0)
        error = ValueError("Test error")
        
        # Premier retry
        delay1 = await calculate_delay(error, 0, config)
        assert 1.0 <= delay1 <= 1.5  # Base + jitter
        
        # Deuxième retry
        delay2 = await calculate_delay(error, 1, config)
        assert 2.0 <= delay2 <= 2.5  # Base * 2 + jitter
        
        # Troisième retry (should be capped)
        delay3 = await calculate_delay(error, 5, config)
        assert delay3 <= 11.0  # Max delay + jitter (plus de tolérance)
    
    @pytest.mark.asyncio
    async def test_calculate_delay_rate_limit(self):
        """Test du calcul de délai pour rate limiting."""
        config = RetryConfig()
        error = discord.HTTPException(response=MagicMock(), message="Rate Limited")
        error.status = 429
        error.retry_after = 5.0
        
        delay = await calculate_delay(error, 0, config)
        assert delay == 5.0  # Should use Discord's retry_after


class TestRetryDecorator:
    """Tests du décorateur de retry."""
    
    @pytest.mark.asyncio
    async def test_retry_success_on_first_attempt(self):
        """Test succès dès la première tentative."""
        @with_retry('api_call', RetryConfig(max_attempts=3))
        async def mock_function():
            return "success"
        
        result = await mock_function()
        assert result == "success"
    
    @pytest.mark.asyncio
    async def test_retry_success_after_retries(self):
        """Test succès après plusieurs retries."""
        call_count = 0
        
        @with_retry('api_call', RetryConfig(max_attempts=3, base_delay=0.01))
        async def mock_function():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ConnectionError("Temporary error")
            return "success"
        
        result = await mock_function()
        assert result == "success"
        assert call_count == 3
    
    @pytest.mark.asyncio
    async def test_retry_permanent_error_no_retry(self):
        """Test qu'une erreur permanente n'est pas retryée."""
        call_count = 0
        
        @with_retry('api_call', RetryConfig(max_attempts=3))
        async def mock_function():
            nonlocal call_count
            call_count += 1
            raise discord.NotFound(response=MagicMock(), message="Not Found")
        
        with pytest.raises(discord.NotFound):
            await mock_function()
        
        assert call_count == 1  # Pas de retry pour erreur permanente
    
    @pytest.mark.asyncio
    async def test_retry_max_attempts_exceeded(self):
        """Test dépassement du nombre max de tentatives."""
        call_count = 0
        
        @with_retry('api_call', RetryConfig(max_attempts=2, base_delay=0.01))
        async def mock_function():
            nonlocal call_count
            call_count += 1
            raise ConnectionError("Persistent error")
        
        with pytest.raises(ConnectionError):
            await mock_function()
        
        assert call_count == 2  # Max attempts reached


class TestSafeHelpers:
    """Tests des fonctions helper sécurisées."""
    
    @pytest.mark.asyncio
    async def test_safe_send_message_success(self):
        """Test d'envoi de message réussi."""
        mock_channel = AsyncMock()
        mock_message = MagicMock()
        mock_channel.send.return_value = mock_message
        
        result = await safe_send_message(mock_channel, content="test")
        
        assert result == mock_message
        mock_channel.send.assert_called_once_with(content="test")
    
    @pytest.mark.asyncio
    async def test_safe_send_message_failure(self):
        """Test d'envoi de message échoué."""
        mock_channel = AsyncMock()
        mock_channel.send.side_effect = discord.Forbidden(response=MagicMock(), message="Forbidden")
        
        result = await safe_send_message(mock_channel, content="test")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_safe_fetch_message_success(self):
        """Test de récupération de message réussie."""
        mock_channel = AsyncMock()
        mock_message = MagicMock()
        mock_channel.fetch_message.return_value = mock_message
        
        result = await safe_fetch_message(mock_channel, 123456)
        
        assert result == mock_message
        mock_channel.fetch_message.assert_called_once_with(123456)
    
    @pytest.mark.asyncio
    async def test_safe_fetch_message_not_found(self):
        """Test de récupération de message non trouvé."""
        mock_channel = AsyncMock()
        mock_channel.fetch_message.side_effect = discord.NotFound(response=MagicMock(), message="Not Found")
        
        result = await safe_fetch_message(mock_channel, 123456)
        
        assert result is None


class TestRetryStats:
    """Tests des statistiques de retry."""
    
    def setup_method(self):
        """Reset stats avant chaque test."""
        retry_stats.reset()
    
    def test_stats_initialization(self):
        """Test de l'initialisation des statistiques."""
        stats = retry_stats.get_summary()
        
        assert stats['total_calls'] == 0
        assert stats['success_rate_percent'] == 0
        assert stats['failed_calls'] == 0
        assert stats['retried_calls'] == 0
        assert len(stats['most_common_errors']) == 0
    
    def test_record_successful_call(self):
        """Test d'enregistrement d'appel réussi."""
        retry_stats.record_call(success=True, retries=2)
        
        stats = retry_stats.get_summary()
        assert stats['total_calls'] == 1
        assert stats['successful_calls'] == 1
        assert stats['success_rate_percent'] == 100.0
        assert stats['retried_calls'] == 1  # Had retries
    
    def test_record_failed_call(self):
        """Test d'enregistrement d'appel échoué."""
        retry_stats.record_call(success=False, error_type="HTTPException")
        
        stats = retry_stats.get_summary()
        assert stats['total_calls'] == 1
        assert stats['failed_calls'] == 1
        assert stats['success_rate_percent'] == 0.0
        assert ('HTTPException', 1) in stats['most_common_errors']
    
    def test_mixed_calls_statistics(self):
        """Test de statistiques avec appels mixtes."""
        # 3 succès, 1 échec
        retry_stats.record_call(success=True)
        retry_stats.record_call(success=True, retries=1)
        retry_stats.record_call(success=True)
        retry_stats.record_call(success=False, error_type="TimeoutError")
        
        stats = retry_stats.get_summary()
        assert stats['total_calls'] == 4
        assert stats['success_rate_percent'] == 75.0
        assert stats['retried_calls'] == 1
        assert stats['failed_calls'] == 1


@pytest.mark.asyncio
async def test_with_retry_stats_decorator():
    """Test du décorateur avec statistiques."""
    retry_stats.reset()
    
    @with_retry_stats('test', RetryConfig(max_attempts=2, base_delay=0.01))
    async def test_function():
        return "success"
    
    result = await test_function()
    
    assert result == "success"
    stats = retry_stats.get_summary()
    assert stats['total_calls'] == 1
    assert stats['success_rate_percent'] == 100.0


@pytest.mark.asyncio
async def test_integration_scenario():
    """Test d'intégration d'un scénario réaliste."""
    retry_stats.reset()
    
    # Simuler 3 appels : 1 succès immédiat, 1 succès après retry, 1 échec
    @with_retry_stats('integration', RetryConfig(max_attempts=2, base_delay=0.01))
    async def api_call(should_fail=False, retry_once=False):
        if should_fail:
            raise discord.Forbidden(response=MagicMock(), message="Forbidden")  # Permanent error
        if retry_once:
            api_call.call_count = getattr(api_call, 'call_count', 0) + 1
            if api_call.call_count == 1:
                raise ConnectionError("Temporary error")
        return "success"
    
    # Appel 1: Succès immédiat
    result1 = await api_call()
    assert result1 == "success"
    
    # Appel 2: Succès après retry
    result2 = await api_call(retry_once=True)
    assert result2 == "success"
    
    # Appel 3: Échec permanent
    with pytest.raises(discord.Forbidden):
        await api_call(should_fail=True)
    
    # Vérifier les statistiques finales
    stats = retry_stats.get_summary()
    assert stats['total_calls'] == 3
    assert stats['success_rate_percent'] == pytest.approx(66.67, abs=0.1)
    assert stats['retried_calls'] == 1
    assert stats['failed_calls'] == 1