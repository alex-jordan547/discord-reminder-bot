#!/usr/bin/env python3
"""
Monitoring and alerting system for SQLite migration.

This script provides monitoring capabilities and alerting mechanisms
for the SQLite migration deployment and ongoing operations.
"""

import asyncio
import json
import logging
import os
import smtplib
import sys
import time
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Callable, Dict, List, Optional

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.feature_flags import FeatureFlag, feature_flags
from config.settings import Settings
from utils.system_integration import system_integrator
from utils.unified_event_manager import unified_event_manager

# Setup logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)


class AlertLevel:
    """Alert severity levels."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class Alert:
    """Represents a system alert."""

    def __init__(self, level: str, title: str, message: str, component: str = "system"):
        self.level = level
        self.title = title
        self.message = message
        self.component = component
        self.timestamp = datetime.now()
        self.id = f"{component}_{int(time.time())}"

    def to_dict(self) -> Dict:
        """Convert alert to dictionary."""
        return {
            "id": self.id,
            "level": self.level,
            "title": self.title,
            "message": self.message,
            "component": self.component,
            "timestamp": self.timestamp.isoformat(),
        }

    def __str__(self) -> str:
        return f"[{self.level.upper()}] {self.title}: {self.message}"


class AlertManager:
    """Manages system alerts and notifications."""

    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._load_default_config()
        self.alerts: List[Alert] = []
        self.alert_handlers: List[Callable] = []

        # Setup alert handlers
        self._setup_alert_handlers()

    def _load_default_config(self) -> Dict:
        """Load default alerting configuration."""
        return {
            "email": {
                "enabled": os.getenv("ALERT_EMAIL_ENABLED", "false").lower() == "true",
                "smtp_server": os.getenv("ALERT_SMTP_SERVER", "localhost"),
                "smtp_port": int(os.getenv("ALERT_SMTP_PORT", "587")),
                "username": os.getenv("ALERT_EMAIL_USERNAME", ""),
                "password": os.getenv("ALERT_EMAIL_PASSWORD", ""),
                "from_email": os.getenv("ALERT_FROM_EMAIL", "bot@example.com"),
                "to_emails": os.getenv("ALERT_TO_EMAILS", "admin@example.com").split(","),
                "use_tls": os.getenv("ALERT_EMAIL_TLS", "true").lower() == "true",
            },
            "webhook": {
                "enabled": os.getenv("ALERT_WEBHOOK_ENABLED", "false").lower() == "true",
                "url": os.getenv("ALERT_WEBHOOK_URL", ""),
                "timeout": int(os.getenv("ALERT_WEBHOOK_TIMEOUT", "10")),
            },
            "file": {"enabled": True, "path": os.getenv("ALERT_LOG_PATH", "alerts.log")},
            "console": {"enabled": True},
            "alert_levels": {
                "email": [AlertLevel.ERROR, AlertLevel.CRITICAL],
                "webhook": [AlertLevel.WARNING, AlertLevel.ERROR, AlertLevel.CRITICAL],
                "file": [
                    AlertLevel.INFO,
                    AlertLevel.WARNING,
                    AlertLevel.ERROR,
                    AlertLevel.CRITICAL,
                ],
                "console": [
                    AlertLevel.INFO,
                    AlertLevel.WARNING,
                    AlertLevel.ERROR,
                    AlertLevel.CRITICAL,
                ],
            },
        }

    def _setup_alert_handlers(self) -> None:
        """Setup alert handlers based on configuration."""
        if self.config["console"]["enabled"]:
            self.alert_handlers.append(self._handle_console_alert)

        if self.config["file"]["enabled"]:
            self.alert_handlers.append(self._handle_file_alert)

        if self.config["email"]["enabled"]:
            self.alert_handlers.append(self._handle_email_alert)

        if self.config["webhook"]["enabled"]:
            self.alert_handlers.append(self._handle_webhook_alert)

    async def send_alert(self, alert: Alert) -> None:
        """Send an alert through all configured handlers."""
        self.alerts.append(alert)

        # Limit alert history
        if len(self.alerts) > 1000:
            self.alerts = self.alerts[-500:]

        # Send through all handlers
        for handler in self.alert_handlers:
            try:
                await handler(alert)
            except Exception as e:
                logger.error(f"Alert handler failed: {e}")

    async def _handle_console_alert(self, alert: Alert) -> None:
        """Handle console alert output."""
        if alert.level in self.config["alert_levels"]["console"]:
            print(f"🚨 {alert}")

    async def _handle_file_alert(self, alert: Alert) -> None:
        """Handle file-based alert logging."""
        if alert.level in self.config["alert_levels"]["file"]:
            log_file = self.config["file"]["path"]

            try:
                with open(log_file, "a") as f:
                    f.write(f"{alert.timestamp.isoformat()} - {alert}\n")
            except Exception as e:
                logger.error(f"Failed to write alert to file: {e}")

    async def _handle_email_alert(self, alert: Alert) -> None:
        """Handle email alert notifications."""
        if alert.level not in self.config["alert_levels"]["email"]:
            return

        try:
            email_config = self.config["email"]

            # Create message
            msg = MIMEMultipart()
            msg["From"] = email_config["from_email"]
            msg["To"] = ", ".join(email_config["to_emails"])
            msg["Subject"] = f"[{alert.level.upper()}] Discord Bot Alert: {alert.title}"

            # Email body
            body = f"""
Alert Details:
- Level: {alert.level.upper()}
- Component: {alert.component}
- Time: {alert.timestamp.strftime('%Y-%m-%d %H:%M:%S')}
- Title: {alert.title}
- Message: {alert.message}

This is an automated alert from the Discord Reminder Bot monitoring system.
            """.strip()

            msg.attach(MIMEText(body, "plain"))

            # Send email
            server = smtplib.SMTP(email_config["smtp_server"], email_config["smtp_port"])

            if email_config["use_tls"]:
                server.starttls()

            if email_config["username"] and email_config["password"]:
                server.login(email_config["username"], email_config["password"])

            server.send_message(msg)
            server.quit()

            logger.info(f"Email alert sent for: {alert.title}")

        except Exception as e:
            logger.error(f"Failed to send email alert: {e}")

    async def _handle_webhook_alert(self, alert: Alert) -> None:
        """Handle webhook alert notifications."""
        if alert.level not in self.config["alert_levels"]["webhook"]:
            return

        try:
            import aiohttp

            webhook_config = self.config["webhook"]

            payload = {
                "alert": alert.to_dict(),
                "bot_info": {
                    "name": "Discord Reminder Bot",
                    "environment": "production" if not Settings.is_test_mode() else "test",
                },
            }

            timeout = aiohttp.ClientTimeout(total=webhook_config["timeout"])

            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(webhook_config["url"], json=payload) as response:
                    if response.status == 200:
                        logger.info(f"Webhook alert sent for: {alert.title}")
                    else:
                        logger.error(f"Webhook alert failed with status {response.status}")

        except ImportError:
            logger.warning("aiohttp not available for webhook alerts")
        except Exception as e:
            logger.error(f"Failed to send webhook alert: {e}")

    def get_recent_alerts(self, hours: int = 24) -> List[Alert]:
        """Get alerts from the last N hours."""
        cutoff = datetime.now() - timedelta(hours=hours)
        return [alert for alert in self.alerts if alert.timestamp >= cutoff]

    def get_alert_summary(self) -> Dict:
        """Get summary of recent alerts."""
        recent_alerts = self.get_recent_alerts()

        summary = {
            "total": len(recent_alerts),
            "by_level": {},
            "by_component": {},
            "latest": recent_alerts[-1].to_dict() if recent_alerts else None,
        }

        for alert in recent_alerts:
            # Count by level
            summary["by_level"][alert.level] = summary["by_level"].get(alert.level, 0) + 1

            # Count by component
            summary["by_component"][alert.component] = (
                summary["by_component"].get(alert.component, 0) + 1
            )

        return summary


class SystemMonitor:
    """Monitors system health and generates alerts."""

    def __init__(self, alert_manager: AlertManager):
        self.alert_manager = alert_manager
        self.monitoring_active = False
        self.last_health_check = {}

        # Monitoring configuration
        self.check_interval = 60  # seconds
        self.health_thresholds = {
            "feature_flag_fallbacks": 2,  # Max fallbacks before alert
            "consecutive_failures": 3,  # Max consecutive failures
            "response_time_ms": 5000,  # Max response time
        }

    async def start_monitoring(self) -> None:
        """Start system monitoring."""
        if self.monitoring_active:
            return

        self.monitoring_active = True
        logger.info("System monitoring started")

        await self.alert_manager.send_alert(
            Alert(
                AlertLevel.INFO,
                "Monitoring Started",
                "System monitoring has been started",
                "monitor",
            )
        )

        # Start monitoring tasks
        tasks = [
            asyncio.create_task(self._monitor_feature_flags()),
            asyncio.create_task(self._monitor_event_manager()),
            asyncio.create_task(self._monitor_system_health()),
            asyncio.create_task(self._monitor_performance()),
        ]

        try:
            await asyncio.gather(*tasks)
        except Exception as e:
            logger.error(f"Monitoring error: {e}")
            await self.alert_manager.send_alert(
                Alert(
                    AlertLevel.ERROR,
                    "Monitoring Error",
                    f"System monitoring encountered an error: {e}",
                    "monitor",
                )
            )
        finally:
            self.monitoring_active = False

    async def stop_monitoring(self) -> None:
        """Stop system monitoring."""
        self.monitoring_active = False
        logger.info("System monitoring stopped")

        await self.alert_manager.send_alert(
            Alert(
                AlertLevel.INFO,
                "Monitoring Stopped",
                "System monitoring has been stopped",
                "monitor",
            )
        )

    async def _monitor_feature_flags(self) -> None:
        """Monitor feature flags for fallbacks."""
        while self.monitoring_active:
            try:
                status = feature_flags.get_status_summary()
                fallback_count = status["total_fallback"]

                if fallback_count > self.health_thresholds["feature_flag_fallbacks"]:
                    await self.alert_manager.send_alert(
                        Alert(
                            AlertLevel.WARNING,
                            "Feature Flag Fallbacks",
                            f"{fallback_count} feature flags are in fallback mode",
                            "feature_flags",
                        )
                    )

                # Check for critical flag fallbacks
                fallback_flags = status["fallback_flags"]
                critical_flags = ["sqlite_storage", "sqlite_migration"]

                for flag_info in fallback_flags:
                    if flag_info["flag"] in critical_flags:
                        await self.alert_manager.send_alert(
                            Alert(
                                AlertLevel.ERROR,
                                "Critical Feature Flag Fallback",
                                f"Critical flag {flag_info['flag']} is in fallback: {flag_info['reason']}",
                                "feature_flags",
                            )
                        )

                await asyncio.sleep(self.check_interval)

            except Exception as e:
                logger.error(f"Feature flags monitoring error: {e}")
                await asyncio.sleep(self.check_interval)

    async def _monitor_event_manager(self) -> None:
        """Monitor event manager health."""
        while self.monitoring_active:
            try:
                if not unified_event_manager._initialized:
                    await self.alert_manager.send_alert(
                        Alert(
                            AlertLevel.CRITICAL,
                            "Event Manager Not Initialized",
                            "Unified event manager is not initialized",
                            "event_manager",
                        )
                    )
                else:
                    status = unified_event_manager.get_status()

                    # Check backend type changes
                    current_backend = status["backend_type"]
                    last_backend = self.last_health_check.get("backend_type")

                    if last_backend and last_backend != current_backend:
                        await self.alert_manager.send_alert(
                            Alert(
                                AlertLevel.WARNING,
                                "Backend Switch Detected",
                                f"Event manager switched from {last_backend} to {current_backend}",
                                "event_manager",
                            )
                        )

                    self.last_health_check["backend_type"] = current_backend

                    # Check data integrity
                    if not await unified_event_manager.validate_data_integrity():
                        await self.alert_manager.send_alert(
                            Alert(
                                AlertLevel.ERROR,
                                "Data Integrity Check Failed",
                                "Event manager data integrity validation failed",
                                "event_manager",
                            )
                        )

                await asyncio.sleep(self.check_interval)

            except Exception as e:
                logger.error(f"Event manager monitoring error: {e}")
                await asyncio.sleep(self.check_interval)

    async def _monitor_system_health(self) -> None:
        """Monitor overall system health."""
        while self.monitoring_active:
            try:
                # Check system integrator status
                system_status = system_integrator.get_system_status()

                if not system_status["initialized"]:
                    await self.alert_manager.send_alert(
                        Alert(
                            AlertLevel.CRITICAL,
                            "System Integrator Not Initialized",
                            "System integrator is not initialized",
                            "system",
                        )
                    )

                # Check health monitoring status
                health_status = system_status.get("health_status", {})
                if not health_status.get("monitoring_active", False):
                    await self.alert_manager.send_alert(
                        Alert(
                            AlertLevel.WARNING,
                            "Health Monitoring Inactive",
                            "System health monitoring is not active",
                            "system",
                        )
                    )

                # Check component health
                components = health_status.get("components", {})
                for component_name, component_status in components.items():
                    if not component_status.get("healthy", True):
                        await self.alert_manager.send_alert(
                            Alert(
                                AlertLevel.ERROR,
                                f"Component Unhealthy: {component_name}",
                                f"Component {component_name} is marked as unhealthy",
                                "system",
                            )
                        )

                await asyncio.sleep(self.check_interval)

            except Exception as e:
                logger.error(f"System health monitoring error: {e}")
                await asyncio.sleep(self.check_interval)

    async def _monitor_performance(self) -> None:
        """Monitor system performance metrics."""
        while self.monitoring_active:
            try:
                # Monitor response times (simplified)
                start_time = time.time()

                # Test event manager response time
                if unified_event_manager._initialized:
                    await unified_event_manager.get_all_events()

                response_time_ms = (time.time() - start_time) * 1000

                if response_time_ms > self.health_thresholds["response_time_ms"]:
                    await self.alert_manager.send_alert(
                        Alert(
                            AlertLevel.WARNING,
                            "High Response Time",
                            f"Event manager response time: {response_time_ms:.2f}ms",
                            "performance",
                        )
                    )

                await asyncio.sleep(self.check_interval * 2)  # Less frequent performance checks

            except Exception as e:
                logger.error(f"Performance monitoring error: {e}")
                await asyncio.sleep(self.check_interval)


async def main():
    """Main monitoring function."""
    import argparse

    parser = argparse.ArgumentParser(description="SQLite Migration Monitoring")
    parser.add_argument("--config", help="Monitoring configuration file")
    parser.add_argument("--duration", type=int, help="Monitoring duration in minutes")
    parser.add_argument("--test-alerts", action="store_true", help="Send test alerts")

    args = parser.parse_args()

    # Load configuration
    config = None
    if args.config and os.path.exists(args.config):
        with open(args.config, "r") as f:
            config = json.load(f)

    # Create alert manager and monitor
    alert_manager = AlertManager(config)
    monitor = SystemMonitor(alert_manager)

    try:
        if args.test_alerts:
            # Send test alerts
            test_alerts = [
                Alert(AlertLevel.INFO, "Test Info Alert", "This is a test info alert"),
                Alert(AlertLevel.WARNING, "Test Warning Alert", "This is a test warning alert"),
                Alert(AlertLevel.ERROR, "Test Error Alert", "This is a test error alert"),
            ]

            for alert in test_alerts:
                await alert_manager.send_alert(alert)
                await asyncio.sleep(1)

            print("Test alerts sent")
            return

        # Start monitoring
        if args.duration:
            # Monitor for specified duration
            monitoring_task = asyncio.create_task(monitor.start_monitoring())
            await asyncio.sleep(args.duration * 60)
            await monitor.stop_monitoring()
        else:
            # Monitor indefinitely
            await monitor.start_monitoring()

    except KeyboardInterrupt:
        print("\nMonitoring interrupted by user")
        await monitor.stop_monitoring()

    except Exception as e:
        print(f"Monitoring error: {e}")
        await alert_manager.send_alert(
            Alert(
                AlertLevel.CRITICAL,
                "Monitoring System Error",
                f"Monitoring system encountered a critical error: {e}",
                "monitor",
            )
        )

    finally:
        # Print alert summary
        summary = alert_manager.get_alert_summary()
        print(f"\nAlert Summary:")
        print(f"Total alerts: {summary['total']}")
        print(f"By level: {summary['by_level']}")
        print(f"By component: {summary['by_component']}")


if __name__ == "__main__":
    asyncio.run(main())
