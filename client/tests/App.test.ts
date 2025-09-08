import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import App from './App.vue';

describe('App.vue', () => {
  it('renders the dashboard header', () => {
    const wrapper = mount(App);
    
    expect(wrapper.find('.dashboard-header h1').text()).toBe('Discord Bot Monitoring Dashboard');
  });

  it('displays connection status', () => {
    const wrapper = mount(App);
    
    const connectionStatus = wrapper.find('.connection-status');
    expect(connectionStatus.exists()).toBe(true);
    expect(connectionStatus.text()).toContain('disconnected');
  });

  it('renders the dashboard grid', () => {
    const wrapper = mount(App);
    
    const grid = wrapper.find('.dashboard-grid');
    expect(grid.exists()).toBe(true);
    
    const cards = wrapper.findAll('.metrics-card, .alerts-card, .activity-card');
    expect(cards).toHaveLength(3);
  });

  it('displays placeholder content for future implementation', () => {
    const wrapper = mount(App);
    
    const metricsCard = wrapper.find('.metrics-card');
    expect(metricsCard.text()).toContain('Dashboard components will be implemented in subsequent tasks');
    
    const alertsCard = wrapper.find('.alerts-card');
    expect(alertsCard.text()).toContain('Alert system will be implemented in subsequent tasks');
    
    const activityCard = wrapper.find('.activity-card');
    expect(activityCard.text()).toContain('Activity tracking will be implemented in subsequent tasks');
  });
});