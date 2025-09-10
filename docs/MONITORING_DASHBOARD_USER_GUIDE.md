# Monitoring Dashboard User Guide

## Overview

The Discord Reminder Bot Monitoring Dashboard provides real-time visibility into your bot's performance, system health, and database status. This comprehensive dashboard helps you monitor, manage, and troubleshoot your bot effectively.

## Dashboard Components

### 1. Overview Dashboard

The Overview page is your central command center, providing a quick snapshot of system health.

#### Status Cards
- **System Status**: Real-time CPU and Memory usage with color-coded status indicators
  - 🟢 **Green**: Healthy (Memory < 80%, CPU normal)
  - 🟡 **Yellow**: Warning (Memory 80-90%)
  - 🔴 **Red**: Critical (Memory > 90% or high CPU)

- **Bot Status**: Discord connection status and server information
  - Shows connection state (Connected/Disconnected)
  - Displays number of guilds (servers) and users

- **Database Status**: Database connectivity and performance
  - Connection status indicator
  - Query count and performance metrics

- **Uptime**: System uptime display in hours and minutes

#### Metrics Summary
Quick overview of key performance indicators:
- Memory and CPU usage percentages
- Guild and user counts
- Mini chart showing recent trends

#### Recent Activity
- Real-time feed of bot activities
- Shows recent events, commands, and system actions
- Timestamps for each activity

#### Alerts Summary
- Active alerts with severity levels (Critical, Warning, Info)
- Quick breakdown of alert types
- Link to detailed alerts view

#### Connection Status
Fixed position indicator showing real-time WebSocket connection:
- 🟢 **Connected**: Real-time updates active
- 🔴 **Disconnected**: Connection lost
- 🟡 **Reconnecting**: Attempting to reconnect

### 2. Metrics Dashboard

Detailed visualization of system and bot metrics with interactive charts.

#### Time Range Controls
- **Last Hour**: High-frequency recent data
- **Last 6 Hours**: Medium-term trends
- **Last 24 Hours**: Daily patterns
- **Last 7 Days**: Weekly analysis

#### Refresh Controls
- **Auto Refresh**: Toggle automatic real-time updates
- **Manual Refresh**: Force immediate data refresh
- **Pause**: Temporarily stop auto-refresh for analysis

#### System Metrics Charts
- **CPU Usage**: Real-time processor utilization
- **Memory Usage**: RAM consumption trends
- **Network Activity**: Data transfer rates
- **Disk Usage**: Storage utilization

#### Bot Metrics Charts
- **Guild Activity**: Server join/leave events
- **Command Usage**: Commands executed over time
- **Event Processing**: Reminder and reaction events
- **Error Rates**: Failed operations tracking

#### Database Metrics
- **Query Performance**: Database response times
- **Connection Pool**: Active connections
- **Storage Growth**: Database size over time

### 3. Alerts & Notifications

Comprehensive alert management system for proactive monitoring.

#### Alert Types
- **🚨 Critical**: Immediate attention required (system failures, security issues)
- **❌ Error**: Operational errors that need resolution
- **⚠️ Warning**: Performance concerns or configuration issues
- **ℹ️ Info**: General information and status updates

#### Alert Management
- **Filter by Type**: View specific alert categories
- **Acknowledge All**: Mark all alerts as acknowledged
- **Clear Acknowledged**: Remove processed alerts
- **Auto-refresh**: Real-time alert updates

#### Alert Statistics
Dashboard showing counts for each alert type with visual indicators.

#### Alert Details
Each alert includes:
- Timestamp and duration
- Source component
- Detailed description
- Recommended actions
- Acknowledgment status

### 4. Database Management

Comprehensive database administration interface.

#### Export Functionality
- **Format Options**:
  - SQLite (.db): Complete database backup
  - JSON (.json): Human-readable data export
  - CSV (.csv): Spreadsheet-compatible format

- **Export Process**:
  1. Select desired format
  2. Click "Export Database"
  3. Monitor progress with real-time updates
  4. Download generated file
  5. Cancel option available during process

- **Progress Tracking**:
  - Progress bar with percentage
  - Current table being processed
  - Records processed count
  - Estimated completion time

#### Import Functionality
- **File Upload Methods**:
  - Drag and drop interface
  - Click to browse files
  - Support for .db, .json, .csv formats

- **File Validation**:
  - Automatic file type detection
  - Size and format validation
  - Preview before import
  - Backup creation before import

- **Import Process**:
  1. Select or drop file
  2. Preview file contents
  3. Configure import options
  4. Confirm destructive operation
  5. Monitor import progress
  6. Validate imported data

#### Safety Features
- **Automatic Backups**: Created before destructive operations
- **Confirmation Dialogs**: Prevent accidental data loss
- **Validation Checks**: Ensure data integrity
- **Rollback Options**: Restore from backups if needed

## Navigation and Interface

### Main Navigation
- **Overview**: Dashboard home with summary information
- **Metrics**: Detailed performance charts and analysis
- **Alerts**: Alert management and notification center
- **Database**: Data export/import and management tools

### Theme Support
- **Light Theme**: Default bright interface
- **Dark Theme**: Dark mode for low-light environments
- Persistent theme selection across sessions

### Responsive Design
- **Desktop**: Full-featured interface with multi-column layouts
- **Tablet**: Optimized for touch interaction
- **Mobile**: Single-column responsive design
- **Touch-friendly**: Large buttons and touch targets

### Accessibility Features
- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Reader Support**: ARIA labels and semantic markup
- **High Contrast Mode**: Enhanced visibility options
- **Reduced Motion**: Respects user motion preferences

## Real-time Features

### WebSocket Connection
- Automatic connection establishment
- Real-time metric updates
- Live alert notifications
- Connection status monitoring

### Auto-refresh Options
- Configurable refresh intervals (15s, 30s, 1m, 5m)
- Pause/resume functionality
- Manual refresh override
- Bandwidth-conscious updating

### Live Updates
- System metrics updated every 30 seconds
- Alerts appear immediately
- Database operations show real-time progress
- Connection status changes instantly

## Performance Monitoring

### System Health Indicators
- **Memory Usage**: RAM consumption with warnings at 80% and critical at 90%
- **CPU Usage**: Processor utilization with smart averaging
- **Disk Space**: Storage availability with predictive warnings
- **Network Activity**: Bandwidth utilization and connection quality

### Bot Performance Metrics
- **Response Times**: Command execution latency
- **Success Rates**: Operation success percentages
- **Error Tracking**: Failed operations with categorization
- **Resource Usage**: Bot-specific resource consumption

### Database Performance
- **Query Times**: Average and peak database response times
- **Connection Health**: Active connections and pool status
- **Storage Growth**: Database size trends and projections
- **Backup Status**: Last backup time and size

## Alert Configuration

### Threshold Settings
Customize alert thresholds for your environment:
- **Memory Warning**: Default 80%, adjustable 60-95%
- **CPU Warning**: Default 75%, adjustable 50-95%
- **Disk Warning**: Default 85%, adjustable 70-95%
- **Response Time**: Default 5s, adjustable 1-30s

### Notification Preferences
- **Desktop Notifications**: Browser notification support
- **Email Alerts**: Configure email notifications for critical alerts
- **Webhook Integration**: Send alerts to external systems
- **Severity Filtering**: Choose which alert types to receive

## Best Practices

### Regular Monitoring
- **Check Overview Daily**: Review system status and recent activity
- **Weekly Metrics Review**: Analyze performance trends and patterns
- **Monthly Database Maintenance**: Export data and clean up old records
- **Alert Response**: Acknowledge and resolve alerts promptly

### Performance Optimization
- **Monitor Trends**: Watch for gradual performance degradation
- **Resource Planning**: Use metrics for capacity planning
- **Proactive Maintenance**: Address warnings before they become critical
- **Regular Backups**: Maintain current database backups

### Security Considerations
- **Access Control**: Ensure only authorized users access the dashboard
- **Data Sensitivity**: Be cautious with exported data containing user information
- **Network Security**: Use HTTPS and secure network connections
- **Audit Trail**: Monitor dashboard access and administrative actions

## Troubleshooting

### Common Issues

#### Dashboard Won't Load
1. Check network connectivity
2. Verify bot is running and healthy
3. Check browser console for errors
4. Try refreshing the page
5. Clear browser cache if needed

#### No Real-time Updates
1. Check WebSocket connection status (top-right indicator)
2. Verify firewall/proxy settings for WebSocket traffic
3. Try toggling auto-refresh off and on
4. Check browser WebSocket support

#### Charts Not Displaying
1. Ensure sufficient data exists for selected time range
2. Check for JavaScript errors in browser console
3. Verify Chart.js library is loading correctly
4. Try switching time ranges

#### Export/Import Failures
1. Check available disk space
2. Verify file permissions
3. Ensure database isn't locked by other processes
4. Check file format compatibility

### Getting Help

#### Log Files
Dashboard activities are logged in:
- Browser console for client-side issues
- Server logs for API and database operations
- WebSocket connection logs for real-time features

#### Support Information
When reporting issues, include:
- Browser type and version
- Dashboard page/feature affected
- Error messages or unexpected behavior
- Steps to reproduce the issue
- System configuration details

## Advanced Features

### Custom Time Ranges
While preset ranges cover most needs, you can analyze specific periods:
- Use zoom functionality on charts
- Combine multiple time ranges for comparison
- Export data for external analysis

### Bulk Operations
- **Mass Alert Management**: Acknowledge or clear multiple alerts
- **Batch Export**: Export multiple data types simultaneously
- **Scheduled Operations**: Set up automated maintenance tasks

### Integration Options
- **API Access**: REST endpoints for external monitoring tools
- **Webhook Support**: Send notifications to external systems
- **Data Export**: Regular automated backups
- **Custom Dashboards**: Build external dashboards using API data

## Security and Privacy

### Data Protection
- All data transmission uses HTTPS encryption
- WebSocket connections are secured with WSS
- No sensitive data is logged in browser console
- Database exports should be handled securely

### Access Control
- Dashboard requires authentication in production
- Role-based access controls limit administrative functions
- Session management prevents unauthorized access
- Audit logging tracks administrative actions

### Privacy Considerations
- Bot metrics may include user activity patterns
- Export files contain user IDs and guild information
- Comply with Discord ToS and applicable privacy laws
- Secure handling and storage of exported data

---

This dashboard provides comprehensive monitoring capabilities for your Discord Reminder Bot. Regular use of these tools will help ensure optimal performance, quick issue resolution, and reliable service for your Discord communities.

For technical implementation details, see the [API Reference](API_REFERENCE.md) and [Architecture Documentation](ARCHITECTURE.md).