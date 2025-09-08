import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDashboardStore } from '@/dashboard';
import { createMockMetrics, createMockAlert, createMockActivity } from '@/test-setup';

describe('Dashboard Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with default state', () => {
    const store = useDashboardStore();
    
    expect(store.metrics).toBeNull();
    expect(store.alerts).toEqual([]);
    expect(store.activities).toEqual([]);
    expect(store.connectionStatus.status).toBe('disconnected');
    expect(store.isConnected).toBe(false);
  });

  it('updates metrics correctly', () => {
    const store = useDashboardStore();
    const mockMetrics = createMockMetrics();
    
    store.updateMetrics(mockMetrics);
    
    expect(store.metrics).toEqual(mockMetrics);
  });

  it('adds and manages alerts', () => {
    const store = useDashboardStore();
    const mockAlert = createMockAlert();
    
    store.addAlert(mockAlert);
    
    expect(store.alerts).toHaveLength(1);
    expect(store.alerts[0]).toEqual(mockAlert);
    expect(store.unacknowledgedAlerts).toHaveLength(1);
  });

  it('acknowledges alerts correctly', () => {
    const store = useDashboardStore();
    const mockAlert = createMockAlert();
    
    store.addAlert(mockAlert);
    store.acknowledgeAlert(mockAlert.id);
    
    expect(store.alerts[0].acknowledged).toBe(true);
    expect(store.unacknowledgedAlerts).toHaveLength(0);
  });

  it('removes alerts correctly', () => {
    const store = useDashboardStore();
    const mockAlert = createMockAlert();
    
    store.addAlert(mockAlert);
    expect(store.alerts).toHaveLength(1);
    
    store.removeAlert(mockAlert.id);
    expect(store.alerts).toHaveLength(0);
  });

  it('adds and manages activities', () => {
    const store = useDashboardStore();
    const mockActivity = createMockActivity();
    
    store.addActivity(mockActivity);
    
    expect(store.activities).toHaveLength(1);
    expect(store.activities[0]).toEqual(mockActivity);
    expect(store.recentActivities).toHaveLength(1);
  });

  it('updates connection status', () => {
    const store = useDashboardStore();
    
    store.updateConnectionStatus({
      status: 'connected',
      lastConnected: new Date().toISOString(),
      reconnectAttempts: 0,
    });
    
    expect(store.connectionStatus.status).toBe('connected');
    expect(store.isConnected).toBe(true);
  });

  it('updates configuration', () => {
    const store = useDashboardStore();
    
    store.updateConfig({
      refreshInterval: 60000,
      theme: 'dark',
    });
    
    expect(store.config.refreshInterval).toBe(60000);
    expect(store.config.theme).toBe('dark');
  });

  it('clears alerts and activities', () => {
    const store = useDashboardStore();
    
    store.addAlert(createMockAlert());
    store.addActivity(createMockActivity());
    
    expect(store.alerts).toHaveLength(1);
    expect(store.activities).toHaveLength(1);
    
    store.clearAlerts();
    store.clearActivities();
    
    expect(store.alerts).toHaveLength(0);
    expect(store.activities).toHaveLength(0);
  });

  it('filters critical alerts correctly', () => {
    const store = useDashboardStore();
    
    const criticalAlert = { ...createMockAlert(), type: 'critical' as const };
    const warningAlert = { ...createMockAlert(), type: 'warning' as const, id: 'warning-1' };
    
    store.addAlert(criticalAlert);
    store.addAlert(warningAlert);
    
    expect(store.criticalAlerts).toHaveLength(1);
    expect(store.criticalAlerts[0].type).toBe('critical');
  });
});