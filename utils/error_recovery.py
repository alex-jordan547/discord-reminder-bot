"""
Discord Error Recovery and Resilience System

Ce module fournit des mécanismes de récupération d'erreur robustes pour les appels
Discord API, incluant retry avec exponential backoff, classification d'erreurs,
et stratégies de récupération adaptatives.
"""

import asyncio
import logging
import random
import threading
from datetime import datetime
from enum import Enum
from functools import wraps
from typing import Callable, Any, Optional, Dict

import discord

# Configuration du logging
logger = logging.getLogger(__name__)


class ErrorSeverity(Enum):
    """Classification des erreurs Discord par sévérité et stratégie de récupération."""

    TRANSIENT = "transient"  # Retry immédiatement
    RATE_LIMITED = "rate_limited"  # Attendre et respecter le rate limit
    PERMANENT = "permanent"  # Ne pas retry (404, 403, etc.)
    API_UNAVAILABLE = "api_down"  # API Discord indisponible, queue pour plus tard


class RetryConfig:
    """Configuration pour les mécanismes de retry."""

    def __init__(
        self,
        max_attempts: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        backoff_factor: float = 2.0,
        jitter_factor: float = 0.1,
    ):
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.backoff_factor = backoff_factor
        self.jitter_factor = jitter_factor


# Configurations prédéfinies pour différents types d'opérations
RETRY_CONFIGS = {
    "send_message": RetryConfig(max_attempts=3, base_delay=2.0, max_delay=30.0),
    "fetch_message": RetryConfig(max_attempts=2, base_delay=1.0, max_delay=10.0),
    "api_call": RetryConfig(max_attempts=3, base_delay=1.5, max_delay=45.0),
    "critical": RetryConfig(max_attempts=5, base_delay=3.0, max_delay=120.0),
}


def classify_discord_error(error: Exception) -> ErrorSeverity:
    """
    Classifie une erreur Discord selon sa sévérité et stratégie de récupération.

    Args:
        error: L'exception Discord à classifier

    Returns:
        ErrorSeverity: Classification de l'erreur
    """
    # Erreurs Discord spécifiques
    if isinstance(error, discord.NotFound):
        # 404 - Ressource non trouvée (message/canal supprimé)
        return ErrorSeverity.PERMANENT

    elif isinstance(error, discord.Forbidden):
        # 403 - Permissions insuffisantes
        return ErrorSeverity.PERMANENT

    elif isinstance(error, discord.HTTPException):
        status = getattr(error, "status", 0)

        if status == 429:
            # Rate limiting - respecter les limites Discord
            return ErrorSeverity.RATE_LIMITED

        elif status in [502, 503, 504]:
            # Gateway/Service unavailable
            return ErrorSeverity.API_UNAVAILABLE

        elif 500 <= status < 600:
            # Erreurs serveur Discord (5xx)
            return ErrorSeverity.TRANSIENT

    # Erreurs de session fermée
    elif isinstance(error, RuntimeError) and "session is closed" in str(error).lower():
        # Session Discord fermée - traiter comme une erreur d'API indisponible
        return ErrorSeverity.API_UNAVAILABLE

    # Erreurs de réseau/connexion
    elif isinstance(
        error,
        (
            asyncio.TimeoutError,
            OSError,
            ConnectionError,
            discord.ConnectionClosed,
            discord.GatewayNotFound,
        ),
    ):
        return ErrorSeverity.API_UNAVAILABLE

    # Par défaut, traiter comme transient
    return ErrorSeverity.TRANSIENT


def is_retryable_error(error: Exception) -> bool:
    """
    Détermine si une erreur peut être retryée.

    Args:
        error: L'exception à évaluer

    Returns:
        bool: True si l'erreur peut être retryée
    """
    severity = classify_discord_error(error)
    return severity in [
        ErrorSeverity.TRANSIENT,
        ErrorSeverity.RATE_LIMITED,
        ErrorSeverity.API_UNAVAILABLE,
    ]


async def calculate_delay(error: Exception, attempt: int, config: RetryConfig) -> float:
    """
    Calcule le délai d'attente avant retry basé sur le type d'erreur.

    Args:
        error: L'exception qui a causé l'échec
        attempt: Numéro de la tentative (0-based)
        config: Configuration de retry

    Returns:
        float: Délai en secondes avant le prochain retry
    """
    severity = classify_discord_error(error)

    if severity == ErrorSeverity.RATE_LIMITED:
        # Pour rate limiting, utiliser le retry_after si disponible
        retry_after = getattr(error, "retry_after", None)
        if retry_after:
            logger.warning(f"Rate limited, waiting {retry_after}s as requested by Discord")
            return float(retry_after)

    # Exponential backoff avec jitter
    delay = min(config.base_delay * (config.backoff_factor**attempt), config.max_delay)

    # Ajouter jitter pour éviter le thundering herd
    jitter = delay * config.jitter_factor * random.random()

    return delay + jitter


def with_retry(config_name: str = "api_call", config: Optional[RetryConfig] = None):
    """
    Décorateur pour ajouter retry avec exponential backoff aux fonctions async.

    Args:
        config_name: Nom de la configuration prédéfinie à utiliser
        config: Configuration personnalisée (override config_name)

    Usage:
        @with_retry('send_message')
        async def send_discord_message(channel, content):
            await channel.send(content)
    """
    if config is None:
        config = RETRY_CONFIGS.get(config_name, RETRY_CONFIGS["api_call"])

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            func_name = f"{func.__module__}.{func.__qualname__}"

            for attempt in range(config.max_attempts):
                try:
                    logger.debug(
                        f"Attempting {func_name} (attempt {attempt + 1}/{config.max_attempts})"
                    )
                    result = await func(*args, **kwargs)

                    # Log successful retry
                    if attempt > 0:
                        logger.info(f"✅ {func_name} succeeded on attempt {attempt + 1}")

                    return result

                except Exception as e:
                    last_exception = e
                    severity = classify_discord_error(e)

                    # Log l'erreur avec contexte
                    logger.warning(
                        f"❌ {func_name} failed on attempt {attempt + 1}/{config.max_attempts}: "
                        f"{type(e).__name__}: {str(e)} (severity: {severity.value})"
                    )

                    # Ne pas retry les erreurs permanentes
                    if severity == ErrorSeverity.PERMANENT:
                        logger.error(f"🚫 Permanent error in {func_name}, not retrying: {str(e)}")
                        raise e

                    # Si c'est la dernière tentative, lever l'exception
                    if attempt == config.max_attempts - 1:
                        logger.error(f"💥 {func_name} failed after {config.max_attempts} attempts")
                        break

                    # Calculer et attendre le délai avant retry
                    delay = await calculate_delay(e, attempt, config)
                    logger.info(f"⏳ Retrying {func_name} in {delay:.1f}s...")
                    await asyncio.sleep(delay)

            # Toutes les tentatives ont échoué
            if last_exception:
                raise last_exception
            else:
                raise RuntimeError(f"Function {func_name} failed but no exception was captured")

        return wrapper

    return decorator


class RetryStats:
    """Collecte des statistiques sur les retries pour monitoring."""

    def __init__(self):
        self._lock = threading.Lock()
        self.total_calls = 0
        self.successful_calls = 0
        self.failed_calls = 0
        self.retried_calls = 0
        self.recovered_calls = 0  # Pour un calcul précis du taux de récupération
        self.error_counts: Dict[str, int] = {}
        self.last_reset = datetime.now()

    def record_call(self, success: bool, error_type: Optional[str] = None, retries: int = 0):
        """Enregistre les statistiques d'un appel."""
        with self._lock:
            self.total_calls += 1

            if success:
                self.successful_calls += 1
                if retries > 0:
                    self.recovered_calls += 1
            else:
                self.failed_calls += 1
                if error_type:
                    self.error_counts[error_type] = self.error_counts.get(error_type, 0) + 1

            if retries > 0:
                self.retried_calls += 1

    def get_summary(self) -> Dict[str, Any]:
        """Retourne un résumé des statistiques."""
        with self._lock:
            uptime = datetime.now() - self.last_reset
            success_rate = (self.successful_calls / max(self.total_calls, 1)) * 100
            recovery_rate = (self.recovered_calls / max(self.retried_calls, 1)) * 100

            return {
                "uptime_hours": uptime.total_seconds() / 3600,
                "total_calls": self.total_calls,
                "successful_calls": self.successful_calls,
                "success_rate_percent": round(success_rate, 2),
                "failed_calls": self.failed_calls,
                "retried_calls": self.retried_calls,
                "recovered_calls": self.recovered_calls,
                "recovery_rate_percent": round(recovery_rate, 2),
                "most_common_errors": sorted(
                    self.error_counts.items(), key=lambda x: x[1], reverse=True
                )[:5],
            }

    def reset(self):
        """Remet à zéro les statistiques."""
        with self._lock:
            self.total_calls = 0
            self.successful_calls = 0
            self.failed_calls = 0
            self.retried_calls = 0
            self.recovered_calls = 0
            self.error_counts = {}
            self.last_reset = datetime.now()


# Instance globale pour collecter les statistiques
retry_stats = RetryStats()


def with_retry_stats(config_name: str = "api_call", config: Optional[RetryConfig] = None):
    """
    Décorateur retry avec collecte automatique de statistiques.

    Usage identique à with_retry mais collecte des métriques.
    """
    if config is None:
        config = RETRY_CONFIGS.get(config_name, RETRY_CONFIGS["api_call"])

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            func_name = f"{func.__module__}.{func.__qualname__}"

            for attempt in range(config.max_attempts):
                try:
                    logger.debug(
                        f"Attempting {func_name} (attempt {attempt + 1}/{config.max_attempts})"
                    )
                    result = await func(*args, **kwargs)

                    # Enregistrer les statistiques de succès
                    retry_stats.record_call(success=True, retries=attempt)

                    # Log successful retry
                    if attempt > 0:
                        logger.info(f"✅ {func_name} succeeded on attempt {attempt + 1}")

                    return result

                except Exception as e:
                    last_exception = e
                    severity = classify_discord_error(e)

                    # Log l'erreur avec contexte
                    logger.warning(
                        f"❌ {func_name} failed on attempt {attempt + 1}/{config.max_attempts}: "
                        f"{type(e).__name__}: {str(e)} (severity: {severity.value})"
                    )

                    # Ne pas retry les erreurs permanentes
                    if severity == ErrorSeverity.PERMANENT:
                        logger.error(f"🚫 Permanent error in {func_name}, not retrying: {str(e)}")
                        # Enregistrer les statistiques d'échec
                        retry_stats.record_call(
                            success=False, error_type=type(e).__name__, retries=attempt
                        )
                        raise e

                    # Si c'est la dernière tentative, lever l'exception
                    if attempt == config.max_attempts - 1:
                        logger.error(f"💥 {func_name} failed after {config.max_attempts} attempts")
                        # Enregistrer les statistiques d'échec
                        retry_stats.record_call(
                            success=False, error_type=type(e).__name__, retries=attempt
                        )
                        break

                    # Calculer et attendre le délai avant retry
                    delay = await calculate_delay(e, attempt, config)
                    logger.info(f"⏳ Retrying {func_name} in {delay:.1f}s...")
                    await asyncio.sleep(delay)

            # Toutes les tentatives ont échoué
            if last_exception:
                raise last_exception
            else:
                raise RuntimeError(f"Function {func_name} failed but no exception was captured")

        return wrapper

    return decorator


# Helper functions pour usage direct
async def safe_send_message(channel: discord.TextChannel, **kwargs) -> Optional[discord.Message]:
    """
    Envoie un message de manière sécurisée avec retry automatique.

    Args:
        channel: Canal Discord où envoyer le message
        **kwargs: Arguments pour channel.send()

    Returns:
        discord.Message: Message envoyé, ou None en cas d'échec
    """

    @with_retry_stats("send_message")
    async def _send():
        return await channel.send(**kwargs)

    try:
        return await _send()
    except Exception as e:
        logger.error(f"Failed to send message to {channel.name}: {str(e)}")
        return None


async def safe_fetch_message(
    channel: discord.TextChannel, message_id: int
) -> Optional[discord.Message]:
    """
    Récupère un message de manière sécurisée avec retry automatique.

    Args:
        channel: Canal Discord
        message_id: ID du message à récupérer

    Returns:
        discord.Message: Message récupéré, ou None en cas d'échec
    """

    @with_retry_stats("fetch_message")
    async def _fetch():
        return await channel.fetch_message(message_id)

    try:
        return await _fetch()
    except discord.NotFound:
        logger.warning(f"Message {message_id} not found in {channel.name}")
        return None
    except Exception as e:
        logger.error(f"Failed to fetch message {message_id} from {channel.name}: {str(e)}")
        return None
