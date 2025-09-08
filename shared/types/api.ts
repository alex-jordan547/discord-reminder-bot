/**
 * Shared API types between client and server
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: number;
}

export interface DashboardStats {
  totalEvents: number;
  activeEvents: number;
  totalGuilds: number;
  totalUsers: number;
  uptime: number;
  memoryUsage: {
    used: number;
    total: number;
  };
}

export interface EventData {
  id: string;
  title: string;
  description: string;
  startTime: Date;
  endTime?: Date;
  guildId: string;
  channelId: string;
  createdBy: string;
  status: 'active' | 'completed' | 'cancelled';
  participants: number;
}

export interface GuildData {
  id: string;
  name: string;
  icon?: string;
  memberCount: number;
  eventCount: number;
  isActive: boolean;
}