"""
Feature flags system for progressive SQLite migration.

This module provides a centralized feature flag system that allows
for progressive activation of SQLite features with automatic fallback
to JSON storage when issues are detected.
"""

import logging
import os
from enum import Enum
from typing import Dict, Optional, Set
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class FeatureFlag(Enum):
    """Available feature flags for the SQLite migration."""
    
    # Core SQLite features
    SQLITE_STORAGE = "sqlite_storage"
    SQLITE_MIGRATION = "sqlite_migration"
    SQLITE_SCHEDULER = "sqlite_scheduler"
    
    # Advanced features
    SQLITE_CONCURRENCY = "sqlite_concurrency"
    SQLITE_MONITORING = "sqlite_monitoring"
    SQLITE_BACKUP = "sqlite_backup"
    
    # Fallback and safety features
    AUTO_FALLBACK = "auto_fallback"
    DEGRADED_MODE = "degraded_mode"
    STRICT_VALIDATION = "strict_validation"


class FeatureFlagManager:
    """
    Manages feature flags for progressive SQLite activation.
    
    This class handles feature flag states, automatic fallback logic,
    and provides a safe way to enable SQLite features progressively.
    """
    
    def __init__(self):
        self._flags: Dict[FeatureFlag, bool] = {}
        self._fallback_reasons: Dict[FeatureFlag, str] = {}
        self._fallback_timestamps: Dict[FeatureFlag, datetime] = {}
        self._load_from_environment()
    
    def _load_from_environment(self) -> None:
        """Load feature flag states from environment variables."""
        
        # Core SQLite features - controlled by main USE_SQLITE flag
        use_sqlite = os.getenv("USE_SQLITE", "false").lower() == "true"
        
        self._flags[FeatureFlag.SQLITE_STORAGE] = use_sqlite and self._get_env_flag(
            "SQLITE_STORAGE_ENABLED", "true"
        )
        
        self._flags[FeatureFlag.SQLITE_MIGRATION] = use_sqlite and self._get_env_flag(
            "SQLITE_MIGRATION_ENABLED", "true"
        )
        
        self._flags[FeatureFlag.SQLITE_SCHEDULER] = use_sqlite and self._get_env_flag(
            "SQLITE_SCHEDULER_ENABLED", "true"
        )
        
        # Advanced features - more conservative defaults
        self._flags[FeatureFlag.SQLITE_CONCURRENCY] = use_sqlite and self._get_env_flag(
            "SQLITE_CONCURRENCY_ENABLED", "true"
        )
        
        self._flags[FeatureFlag.SQLITE_MONITORING] = use_sqlite and self._get_env_flag(
            "SQLITE_MONITORING_ENABLED", "true"
        )
        
        self._flags[FeatureFlag.SQLITE_BACKUP] = use_sqlite and self._get_env_flag(
            "SQLITE_BACKUP_ENABLED", "true"
        )
        
        # Safety features - enabled by default when SQLite is used
        self._flags[FeatureFlag.AUTO_FALLBACK] = self._get_env_flag(
            "AUTO_FALLBACK_ENABLED", "true"
        )
        
        self._flags[FeatureFlag.DEGRADED_MODE] = self._get_env_flag(
            "DEGRADED_MODE_ENABLED", "false"
        )
        
        self._flags[FeatureFlag.STRICT_VALIDATION] = self._get_env_flag(
            "STRICT_VALIDATION_ENABLED", "true"
        )
        
        logger.info("Feature flags loaded from environment")
        self._log_flag_states()
    
    def _get_env_flag(self, env_var: str, default: str) -> bool:
        """Get a boolean flag from environment variable."""
        return os.getenv(env_var, default).lower() == "true"
    
    def _log_flag_states(self) -> None:
        """Log current feature flag states."""
        logger.info("=== Feature Flag States ===")
        for flag, enabled in self._flags.items():
            status = "ENABLED" if enabled else "DISABLED"
            if flag in self._fallback_reasons:
                status += f" (FALLBACK: {self._fallback_reasons[flag]})"
            logger.info(f"{flag.value}: {status}")
        logger.info("===========================")
    
    def is_enabled(self, flag: FeatureFlag) -> bool:
        """
        Check if a feature flag is enabled.
        
        Args:
            flag: The feature flag to check
            
        Returns:
            bool: True if the flag is enabled and not in fallback mode
        """
        return self._flags.get(flag, False) and flag not in self._fallback_reasons
    
    def enable_flag(self, flag: FeatureFlag, reason: str = "Manual activation") -> None:
        """
        Enable a feature flag.
        
        Args:
            flag: The feature flag to enable
            reason: Reason for enabling the flag
        """
        self._flags[flag] = True
        if flag in self._fallback_reasons:
            del self._fallback_reasons[flag]
        if flag in self._fallback_timestamps:
            del self._fallback_timestamps[flag]
        
        logger.info(f"Feature flag {flag.value} ENABLED: {reason}")
    
    def disable_flag(self, flag: FeatureFlag, reason: str = "Manual deactivation") -> None:
        """
        Disable a feature flag.
        
        Args:
            flag: The feature flag to disable
            reason: Reason for disabling the flag
        """
        self._flags[flag] = False
        self._fallback_reasons[flag] = reason
        self._fallback_timestamps[flag] = datetime.now()
        
        logger.warning(f"Feature flag {flag.value} DISABLED: {reason}")
    
    def trigger_fallback(self, flag: FeatureFlag, reason: str) -> None:
        """
        Trigger automatic fallback for a feature flag.
        
        Args:
            flag: The feature flag to put in fallback mode
            reason: Reason for the fallback
        """
        if not self.is_enabled(FeatureFlag.AUTO_FALLBACK):
            logger.warning(f"Auto-fallback disabled, cannot fallback {flag.value}")
            return
        
        self._fallback_reasons[flag] = reason
        self._fallback_timestamps[flag] = datetime.now()
        
        logger.error(f"FALLBACK TRIGGERED for {flag.value}: {reason}")
        
        # Trigger cascading fallbacks for dependent features
        self._handle_cascading_fallbacks(flag)
    
    def _handle_cascading_fallbacks(self, failed_flag: FeatureFlag) -> None:
        """Handle cascading fallbacks when a core feature fails."""
        
        if failed_flag == FeatureFlag.SQLITE_STORAGE:
            # If storage fails, disable all SQLite features
            dependent_flags = [
                FeatureFlag.SQLITE_SCHEDULER,
                FeatureFlag.SQLITE_CONCURRENCY,
                FeatureFlag.SQLITE_MONITORING,
                FeatureFlag.SQLITE_BACKUP
            ]
            
            for dep_flag in dependent_flags:
                if self.is_enabled(dep_flag):
                    self.trigger_fallback(dep_flag, f"Cascading fallback from {failed_flag.value}")
        
        elif failed_flag == FeatureFlag.SQLITE_MIGRATION:
            # If migration fails, enable degraded mode
            self.enable_flag(FeatureFlag.DEGRADED_MODE, "Migration failure fallback")
    
    def can_retry_flag(self, flag: FeatureFlag, retry_delay_minutes: int = 30) -> bool:
        """
        Check if a flag in fallback mode can be retried.
        
        Args:
            flag: The feature flag to check
            retry_delay_minutes: Minimum delay before retry is allowed
            
        Returns:
            bool: True if the flag can be retried
        """
        if flag not in self._fallback_timestamps:
            return True
        
        fallback_time = self._fallback_timestamps[flag]
        retry_time = fallback_time + timedelta(minutes=retry_delay_minutes)
        
        return datetime.now() >= retry_time
    
    def get_fallback_reason(self, flag: FeatureFlag) -> Optional[str]:
        """
        Get the reason why a flag is in fallback mode.
        
        Args:
            flag: The feature flag to check
            
        Returns:
            Optional[str]: The fallback reason, or None if not in fallback
        """
        return self._fallback_reasons.get(flag)
    
    def get_enabled_flags(self) -> Set[FeatureFlag]:
        """
        Get all currently enabled feature flags.
        
        Returns:
            Set[FeatureFlag]: Set of enabled flags
        """
        return {flag for flag, enabled in self._flags.items() if enabled and self.is_enabled(flag)}
    
    def get_fallback_flags(self) -> Set[FeatureFlag]:
        """
        Get all feature flags currently in fallback mode.
        
        Returns:
            Set[FeatureFlag]: Set of flags in fallback mode
        """
        return set(self._fallback_reasons.keys())
    
    def is_sqlite_fully_enabled(self) -> bool:
        """
        Check if all core SQLite features are enabled.
        
        Returns:
            bool: True if all core SQLite features are enabled
        """
        core_flags = [
            FeatureFlag.SQLITE_STORAGE,
            FeatureFlag.SQLITE_MIGRATION,
            FeatureFlag.SQLITE_SCHEDULER
        ]
        
        return all(self.is_enabled(flag) for flag in core_flags)
    
    def is_degraded_mode(self) -> bool:
        """
        Check if the system is running in degraded mode.
        
        Returns:
            bool: True if degraded mode is active
        """
        return self.is_enabled(FeatureFlag.DEGRADED_MODE)
    
    def get_status_summary(self) -> Dict[str, any]:
        """
        Get a summary of the current feature flag status.
        
        Returns:
            Dict[str, any]: Status summary
        """
        enabled_flags = self.get_enabled_flags()
        fallback_flags = self.get_fallback_flags()
        
        return {
            "sqlite_fully_enabled": self.is_sqlite_fully_enabled(),
            "degraded_mode": self.is_degraded_mode(),
            "enabled_flags": [flag.value for flag in enabled_flags],
            "fallback_flags": [
                {
                    "flag": flag.value,
                    "reason": self._fallback_reasons[flag],
                    "timestamp": self._fallback_timestamps[flag].isoformat()
                }
                for flag in fallback_flags
            ],
            "total_enabled": len(enabled_flags),
            "total_fallback": len(fallback_flags)
        }


# Global feature flag manager instance
feature_flags = FeatureFlagManager()