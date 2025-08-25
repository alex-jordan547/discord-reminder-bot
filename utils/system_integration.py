"""
System integration utilities for SQLite migration.

This module provides utilities for integrating SQLite components
with the existing system architecture, including service discovery,
dependency injection, and health monitoring.
"""

import logging
from typing import Any, Dict, List, Optional, Type, TypeVar, Union
from abc import ABC, abstractmethod
import asyncio

from config.feature_flags import FeatureFlag, feature_flags
from config.settings import Settings

logger = logging.getLogger(__name__)

T = TypeVar('T')


class ServiceRegistry:
    """
    Service registry for managing different implementations.
    
    This registry allows the system to dynamically choose between
    different service implementations based on feature flags.
    """
    
    def __init__(self):
        self._services: Dict[str, Dict[str, Any]] = {}
        self._instances: Dict[str, Any] = {}
    
    def register_service(
        self,
        service_name: str,
        implementation_name: str,
        service_class: Type[T],
        feature_flag: Optional[FeatureFlag] = None,
        priority: int = 0
    ) -> None:
        """
        Register a service implementation.
        
        Args:
            service_name: Name of the service interface
            implementation_name: Name of this implementation
            service_class: Class implementing the service
            feature_flag: Feature flag controlling this implementation
            priority: Priority (higher = preferred)
        """
        if service_name not in self._services:
            self._services[service_name] = {}
        
        self._services[service_name][implementation_name] = {
            'class': service_class,
            'feature_flag': feature_flag,
            'priority': priority,
            'instance': None
        }
        
        logger.debug(f"Registered service: {service_name}.{implementation_name}")
    
    def get_service(self, service_name: str, **kwargs) -> Optional[Any]:
        """
        Get the best available service implementation.
        
        Args:
            service_name: Name of the service to get
            **kwargs: Arguments to pass to service constructor
            
        Returns:
            Service instance or None if no implementation is available
        """
        if service_name not in self._services:
            logger.error(f"Service not found: {service_name}")
            return None
        
        implementations = self._services[service_name]
        
        # Sort by priority (highest first)
        sorted_impls = sorted(
            implementations.items(),
            key=lambda x: x[1]['priority'],
            reverse=True
        )
        
        for impl_name, impl_info in sorted_impls:
            feature_flag = impl_info['feature_flag']
            
            # Check if implementation is available
            if feature_flag and not feature_flags.is_enabled(feature_flag):
                logger.debug(f"Implementation {impl_name} disabled by feature flag")
                continue
            
            # Get or create instance
            instance_key = f"{service_name}.{impl_name}"
            if instance_key not in self._instances:
                try:
                    service_class = impl_info['class']
                    self._instances[instance_key] = service_class(**kwargs)
                    logger.info(f"Created service instance: {instance_key}")
                except Exception as e:
                    logger.error(f"Failed to create service {instance_key}: {e}")
                    continue
            
            return self._instances[instance_key]
        
        logger.error(f"No available implementation for service: {service_name}")
        return None
    
    def get_service_info(self, service_name: str) -> Dict[str, Any]:
        """Get information about available service implementations."""
        if service_name not in self._services:
            return {}
        
        info = {}
        for impl_name, impl_info in self._services[service_name].items():
            feature_flag = impl_info['feature_flag']
            available = not feature_flag or feature_flags.is_enabled(feature_flag)
            
            info[impl_name] = {
                'class': impl_info['class'].__name__,
                'priority': impl_info['priority'],
                'feature_flag': feature_flag.value if feature_flag else None,
                'available': available,
                'active': available and impl_info['priority'] == max(
                    i['priority'] for i in self._services[service_name].values()
                    if not i['feature_flag'] or feature_flags.is_enabled(i['feature_flag'])
                )
            }
        
        return info


class HealthMonitor:
    """
    Health monitoring for system components.
    
    This monitor tracks the health of various system components
    and can trigger fallbacks when issues are detected.
    """
    
    def __init__(self):
        self._health_checks: Dict[str, callable] = {}
        self._health_status: Dict[str, Dict[str, Any]] = {}
        self._monitoring_active = False
    
    def register_health_check(
        self,
        component_name: str,
        check_function: callable,
        check_interval: int = 60,
        failure_threshold: int = 3
    ) -> None:
        """
        Register a health check for a component.
        
        Args:
            component_name: Name of the component
            check_function: Async function that returns bool (healthy)
            check_interval: Check interval in seconds
            failure_threshold: Number of failures before marking unhealthy
        """
        self._health_checks[component_name] = {
            'function': check_function,
            'interval': check_interval,
            'threshold': failure_threshold,
            'last_check': None,
            'consecutive_failures': 0
        }
        
        self._health_status[component_name] = {
            'healthy': True,
            'last_check': None,
            'last_error': None,
            'consecutive_failures': 0
        }
        
        logger.info(f"Registered health check: {component_name}")
    
    async def start_monitoring(self) -> None:
        """Start health monitoring."""
        if self._monitoring_active:
            return
        
        self._monitoring_active = True
        logger.info("Health monitoring started")
        
        # Start monitoring tasks
        tasks = []
        for component_name in self._health_checks:
            task = asyncio.create_task(self._monitor_component(component_name))
            tasks.append(task)
        
        # Wait for all monitoring tasks (they run indefinitely)
        try:
            await asyncio.gather(*tasks)
        except Exception as e:
            logger.error(f"Health monitoring error: {e}")
        finally:
            self._monitoring_active = False
    
    async def stop_monitoring(self) -> None:
        """Stop health monitoring."""
        self._monitoring_active = False
        logger.info("Health monitoring stopped")
    
    async def _monitor_component(self, component_name: str) -> None:
        """Monitor a specific component."""
        check_info = self._health_checks[component_name]
        
        while self._monitoring_active:
            try:
                # Run health check
                is_healthy = await check_info['function']()
                
                if is_healthy:
                    # Component is healthy
                    if not self._health_status[component_name]['healthy']:
                        logger.info(f"Component {component_name} recovered")
                    
                    self._health_status[component_name].update({
                        'healthy': True,
                        'last_check': asyncio.get_event_loop().time(),
                        'consecutive_failures': 0
                    })
                    check_info['consecutive_failures'] = 0
                
                else:
                    # Component is unhealthy
                    check_info['consecutive_failures'] += 1
                    self._health_status[component_name]['consecutive_failures'] = check_info['consecutive_failures']
                    
                    if check_info['consecutive_failures'] >= check_info['threshold']:
                        if self._health_status[component_name]['healthy']:
                            logger.error(f"Component {component_name} marked as unhealthy")
                            await self._handle_component_failure(component_name)
                        
                        self._health_status[component_name]['healthy'] = False
            
            except Exception as e:
                logger.error(f"Health check failed for {component_name}: {e}")
                self._health_status[component_name]['last_error'] = str(e)
            
            # Wait for next check
            await asyncio.sleep(check_info['interval'])
    
    async def _handle_component_failure(self, component_name: str) -> None:
        """Handle component failure by triggering appropriate fallbacks."""
        logger.warning(f"Handling failure for component: {component_name}")
        
        # Map component names to feature flags
        component_flag_map = {
            'sqlite_storage': FeatureFlag.SQLITE_STORAGE,
            'sqlite_scheduler': FeatureFlag.SQLITE_SCHEDULER,
            'sqlite_migration': FeatureFlag.SQLITE_MIGRATION,
        }
        
        if component_name in component_flag_map:
            flag = component_flag_map[component_name]
            feature_flags.trigger_fallback(flag, f"Health check failure: {component_name}")
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get current health status of all components."""
        return {
            'monitoring_active': self._monitoring_active,
            'components': self._health_status.copy()
        }
    
    def is_component_healthy(self, component_name: str) -> bool:
        """Check if a specific component is healthy."""
        return self._health_status.get(component_name, {}).get('healthy', False)


class SystemIntegrator:
    """
    Main system integrator for SQLite migration.
    
    This class coordinates the integration of SQLite components
    with the existing system architecture.
    """
    
    def __init__(self):
        self.service_registry = ServiceRegistry()
        self.health_monitor = HealthMonitor()
        self._initialized = False
    
    async def initialize(self) -> bool:
        """Initialize the system integrator."""
        try:
            # Register core services
            await self._register_core_services()
            
            # Setup health monitoring
            await self._setup_health_monitoring()
            
            # Start health monitoring if enabled
            if feature_flags.is_enabled(FeatureFlag.SQLITE_MONITORING):
                asyncio.create_task(self.health_monitor.start_monitoring())
            
            self._initialized = True
            logger.info("System integrator initialized successfully")
            return True
        
        except Exception as e:
            logger.error(f"Failed to initialize system integrator: {e}")
            return False
    
    async def _register_core_services(self) -> None:
        """Register core service implementations."""
        
        # Event Manager implementations
        try:
            from utils.reminder_manager import ReminderManager
            self.service_registry.register_service(
                'event_manager',
                'json',
                ReminderManager,
                feature_flag=None,  # Always available
                priority=1
            )
        except ImportError:
            logger.warning("JSON ReminderManager not available")
        
        try:
            try:
                from utils.event_manager_sqlite import EventManagerSQLite
            except ImportError:
                from utils.event_manager_sqlite_stub import EventManagerSQLite
                logger.info("Using SQLite EventManager stub")
            
            self.service_registry.register_service(
                'event_manager',
                'sqlite',
                EventManagerSQLite,
                feature_flag=FeatureFlag.SQLITE_STORAGE,
                priority=2  # Higher priority when available
            )
        except ImportError:
            logger.warning("SQLite EventManager not available")
        
        # Scheduler implementations
        try:
            # Assume there's a JSON scheduler (using existing reminder manager)
            from utils.reminder_manager import ReminderManager
            self.service_registry.register_service(
                'scheduler',
                'json',
                ReminderManager,  # Uses built-in scheduling
                feature_flag=None,
                priority=1
            )
        except ImportError:
            logger.warning("JSON scheduler not available")
        
        try:
            try:
                from utils.scheduler_sqlite import SchedulerSQLite
            except ImportError:
                # Create a stub scheduler class
                class SchedulerSQLite:
                    def __init__(self, **kwargs):
                        logger.info("SQLite scheduler stub initialized")
                    
                    async def initialize(self):
                        return True
                
                logger.info("Using SQLite scheduler stub")
            
            self.service_registry.register_service(
                'scheduler',
                'sqlite',
                SchedulerSQLite,
                feature_flag=FeatureFlag.SQLITE_SCHEDULER,
                priority=2
            )
        except ImportError:
            logger.warning("SQLite scheduler not available")
        
        # Storage implementations
        from utils.storage_adapter import JSONStorageBackend, SQLiteStorageBackend
        
        self.service_registry.register_service(
            'storage',
            'json',
            JSONStorageBackend,
            feature_flag=None,
            priority=1
        )
        
        self.service_registry.register_service(
            'storage',
            'sqlite',
            SQLiteStorageBackend,
            feature_flag=FeatureFlag.SQLITE_STORAGE,
            priority=2
        )
    
    async def _setup_health_monitoring(self) -> None:
        """Setup health monitoring for system components."""
        
        # SQLite storage health check
        async def check_sqlite_storage():
            try:
                storage = self.service_registry.get_service('storage')
                if storage and hasattr(storage, 'validate_integrity'):
                    return await storage.validate_integrity()
                return True
            except Exception:
                return False
        
        self.health_monitor.register_health_check(
            'sqlite_storage',
            check_sqlite_storage,
            check_interval=300,  # 5 minutes
            failure_threshold=2
        )
        
        # Feature flags health check
        async def check_feature_flags():
            try:
                # Check if any critical flags are in fallback mode
                fallback_flags = feature_flags.get_fallback_flags()
                critical_flags = {FeatureFlag.SQLITE_STORAGE, FeatureFlag.SQLITE_MIGRATION}
                
                # If critical flags are in fallback, system is degraded but not unhealthy
                return len(fallback_flags.intersection(critical_flags)) == 0
            except Exception:
                return False
        
        self.health_monitor.register_health_check(
            'feature_flags',
            check_feature_flags,
            check_interval=60,  # 1 minute
            failure_threshold=1
        )
    
    def get_event_manager(self, **kwargs):
        """Get the best available event manager implementation."""
        return self.service_registry.get_service('event_manager', **kwargs)
    
    def get_scheduler(self, **kwargs):
        """Get the best available scheduler implementation."""
        return self.service_registry.get_service('scheduler', **kwargs)
    
    def get_storage(self, **kwargs):
        """Get the best available storage implementation."""
        return self.service_registry.get_service('storage', **kwargs)
    
    def get_system_status(self) -> Dict[str, Any]:
        """Get comprehensive system status."""
        return {
            'initialized': self._initialized,
            'feature_flags': feature_flags.get_status_summary(),
            'health_status': self.health_monitor.get_health_status(),
            'services': {
                'event_manager': self.service_registry.get_service_info('event_manager'),
                'scheduler': self.service_registry.get_service_info('scheduler'),
                'storage': self.service_registry.get_service_info('storage'),
            }
        }
    
    async def cleanup(self) -> None:
        """Cleanup system integrator resources."""
        try:
            await self.health_monitor.stop_monitoring()
            self._initialized = False
            logger.info("System integrator cleaned up")
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")


# Global system integrator instance
system_integrator = SystemIntegrator()