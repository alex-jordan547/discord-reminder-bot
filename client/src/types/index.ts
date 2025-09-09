// Dashboard-specific types for monitoring system

export interface MonitoringMetrics {
  timestamp: string;
  system: SystemMetrics;
  bot: BotMetrics;
  database: DatabaseMetrics;
  security: SecurityMetrics;
  performance: PerformanceMetrics;
}

export interface SystemMetrics {
  uptime: number;
  memory: MemoryUsage;
  cpu: CPUUsage;
  disk: DiskUsage;
  network: NetworkStats;
}

export interface MemoryUsage {
  used: number;
  total: number;
  percentage: number;
}

export interface CPUUsage {
  percentage: number;
  cores?: number;
  loadAverage?: number[];
}

export interface DiskUsage {
  used: number;
  total: number;
  percentage: number;
}

export interface NetworkStats {
  bytesIn: number;
  bytesOut: number;
  packetsIn?: number;
  packetsOut?: number;
}

export interface BotMetrics {
  connected: boolean;
  guilds: number;
  users: number;
  events: number;
  commands: CommandStats;
  errors: ErrorStats;
}

export interface CommandStats {
  total: number;
  successful: number;
  failed: number;
  averageResponseTime: number;
}

export interface ErrorStats {
  total?: number;
  critical: number;
  warnings: number;
  info: number;
}

export interface DatabaseMetrics {
  connectionStatus: 'connected' | 'disconnected' | 'error';
  queryCount: number;
  averageQueryTime: number;
  activeConnections: number;
  tableStats: TableStats[];
}

export interface TableStats {
  name: string;
  rowCount: number;
  size: number;
}

export interface SecurityMetrics {
  blockedUsers: number;
  suspiciousActivity: number;
  threats: ThreatInfo[];
}

export interface ThreatInfo {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  count: number;
  lastOccurrence: string;
}

export interface PerformanceMetrics {
  responseTime: number;
  throughput: number;
  errorRate: number;
  availability: number;
}

export interface Alert {
  id: string;
  type: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  source: string;
}

export interface Activity {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error';
  metadata?: Record<string, any>;
}

export interface DashboardConfig {
  refreshInterval: number;
  theme: 'light' | 'dark' | 'auto';
  notifications: NotificationConfig;
  charts: ChartConfig;
}

export interface NotificationConfig {
  enabled: boolean;
  types: string[];
  maxVisible: number;
  autoHide: boolean;
  hideDelay: number;
}

export interface ChartConfig {
  animationDuration: number;
  showLegend: boolean;
  showTooltips: boolean;
  timeRange: '1h' | '6h' | '24h' | '7d';
}

export interface WebSocketMessage {
  type: 'metrics' | 'alert' | 'activity' | 'config';
  data: any;
  timestamp: string;
}

export interface ConnectionStatus {
  status: 'connected' | 'disconnected' | 'reconnecting';
  lastConnected?: string;
  reconnectAttempts: number;
}

// Export/Import types (will be used in later tasks)
export interface ExportResult {
  success: boolean;
  filename: string;
  size: number;
  format: ExportFormat;
  recordCount: number;
  timestamp: string;
}

export interface ImportResult {
  success: boolean;
  recordsImported: number;
  recordsSkipped: number;
  errors: ImportError[];
  backupCreated: string;
  duration: number;
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
  value: any;
}

export type ExportFormat = 'sqlite' | 'json' | 'csv';
export type ImportFormat = 'sqlite' | 'json' | 'csv';

// Notification system types
export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  persistent?: boolean;
  autoHide?: boolean;
  hideDelay?: number;
  actions?: NotificationAction[];
  metadata?: Record<string, any>;
  acknowledged?: boolean;
  category?: string;
  duration?: number;
}

export interface NotificationAction {
  id: string;
  label: string;
  action: () => void;
  style?: 'primary' | 'secondary' | 'danger';
}

export interface NotificationSettings {
  enabled?: {
    system: boolean;
    alerts: boolean;
    database: boolean;
    security: boolean;
  };
  types?: string[];
  maxVisible?: number;
  autoHide?: boolean;
  hideDelay?: number;
  priority?: {
    low: boolean;
    medium: boolean;
    high: boolean;
    critical: boolean;
  };
  sound?: {
    enabled: boolean;
    volume: number;
  };
  desktop?: boolean;
  display?: {
    duration: number;
    maxVisible: number;
    position: string;
  };
}

export interface NotificationQueue {
  notifications: Notification[];
  maxSize: number;
  deduplication: boolean;
}