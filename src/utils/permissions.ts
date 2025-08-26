/**
 * Discord Reminder Bot - Enhanced Permission & Security System
 * 
 * Advanced utilities for checking Discord permissions:
 * - Admin role validation with rate limiting
 * - Channel permission checking with security context
 * - User permission validation with suspicious activity detection
 * - Bot permission verification with multi-server isolation
 * - Rate limiting and abuse prevention
 * - Security monitoring and reporting
 */

import { GuildMember, GuildChannel, User, PermissionFlagsBits, TextChannel, Guild } from 'discord.js';
import { Settings } from '@/config/settings';
import { createLogger } from '@/utils/loggingConfig';
import { executeWithRetry } from '@/utils/errorRecovery';

const logger = createLogger('permissions');

/**
 * Rate limiter for preventing abuse
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastRequest: number;
}

/**
 * Rate limiting configuration
 */
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  blockDurationMs: number;
}

/**
 * Security context for permission checks
 */
export interface SecurityContext {
  userId: string;
  guildId?: string;
  channelId?: string;
  action: string;
  timestamp: number;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Permission validation result
 */
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  rateLimited?: boolean;
  retryAfter?: number;
  securityFlags?: string[];
}

// Rate limiting storage (in production, use Redis or similar)
const rateLimitStore = new Map<string, RateLimitEntry>();
const suspiciousActivityLog = new Map<string, SecurityContext[]>();

// Rate limiting configurations for different actions
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  'command_execution': {
    maxRequests: 10,
    windowMs: 60000, // 1 minute
    blockDurationMs: 300000, // 5 minutes
  },
  'event_creation': {
    maxRequests: 5,
    windowMs: 300000, // 5 minutes
    blockDurationMs: 600000, // 10 minutes
  },
  'event_deletion': {
    maxRequests: 10,
    windowMs: 60000, // 1 minute
    blockDurationMs: 180000, // 3 minutes
  },
  'api_access': {
    maxRequests: 100,
    windowMs: 3600000, // 1 hour
    blockDurationMs: 1800000, // 30 minutes
  },
  'list_events': {
    maxRequests: 20,
    windowMs: 60000, // 1 minute
    blockDurationMs: 60000, // 1 minute
  },
};

/**
 * Enhanced rate limiting with security monitoring
 */
export function checkRateLimit(
  userId: string,
  action: string,
  config?: RateLimitConfig
): { allowed: boolean; retryAfter?: number; isBlocked?: boolean } {
  const rateLimitConfig = config || RATE_LIMIT_CONFIGS[action] || RATE_LIMIT_CONFIGS['command_execution'];
  const key = `${userId}:${action}`;
  const now = Date.now();
  
  const entry = rateLimitStore.get(key);
  
  if (!entry) {
    // First request
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + rateLimitConfig.windowMs,
      lastRequest: now,
    });
    return { allowed: true };
  }
  
  // Check if user is currently blocked
  if (entry.resetTime > now && entry.count > rateLimitConfig.maxRequests) {
    const blockEndTime = entry.lastRequest + rateLimitConfig.blockDurationMs;
    if (now < blockEndTime) {
      logger.warn(`🚫 Rate limit blocked user ${userId} for action ${action}`);
      return {
        allowed: false,
        retryAfter: Math.ceil((blockEndTime - now) / 1000),
        isBlocked: true,
      };
    }
  }
  
  // Reset window if expired
  if (now >= entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + rateLimitConfig.windowMs;
    entry.lastRequest = now;
    rateLimitStore.set(key, entry);
    return { allowed: true };
  }
  
  // Check if within rate limit
  if (entry.count < rateLimitConfig.maxRequests) {
    entry.count++;
    entry.lastRequest = now;
    rateLimitStore.set(key, entry);
    return { allowed: true };
  }
  
  // Rate limited
  logger.warn(`⚠️ Rate limit exceeded for user ${userId} on action ${action}`);
  entry.lastRequest = now;
  rateLimitStore.set(key, entry);
  
  return {
    allowed: false,
    retryAfter: Math.ceil((entry.resetTime - now) / 1000),
  };
}

/**
 * Log suspicious activity for security monitoring
 */
function logSuspiciousActivity(context: SecurityContext, reason: string): void {
  const key = context.userId;
  const activities = suspiciousActivityLog.get(key) || [];
  
  activities.push({ ...context, action: `${context.action} - ${reason}` });
  
  // Keep only last 100 activities per user
  if (activities.length > 100) {
    activities.splice(0, activities.length - 100);
  }
  
  suspiciousActivityLog.set(key, activities);
  
  logger.warn(`🔍 Suspicious activity detected for ${context.userId}: ${reason}`, {
    userId: context.userId,
    guildId: context.guildId,
    action: context.action,
    reason,
  });
}

/**
 * Enhanced security validation
 */
export function validateSecurityContext(context: SecurityContext): PermissionResult {
  const now = Date.now();
  
  // Check for rapid-fire requests (potential bot)
  const recentActivities = suspiciousActivityLog.get(context.userId) || [];
  const recentCount = recentActivities.filter(a => (now - a.timestamp) < 10000).length; // 10 seconds
  
  if (recentCount > 20) {
    logSuspiciousActivity(context, 'Excessive request frequency');
    return {
      allowed: false,
      reason: 'Suspicious activity detected',
      securityFlags: ['rapid_requests'],
    };
  }
  
  // Check for unusual time patterns (potential automation)
  if (recentActivities.length > 10) {
    const intervals = [];
    for (let i = 1; i < Math.min(recentActivities.length, 10); i++) {
      intervals.push(recentActivities[i].timestamp - recentActivities[i-1].timestamp);
    }
    
    // Check if intervals are suspiciously regular (±100ms)
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const irregularIntervals = intervals.filter(i => Math.abs(i - avgInterval) > 100).length;
    
    if (irregularIntervals < intervals.length * 0.3) {
      logSuspiciousActivity(context, 'Regular timing pattern detected');
      return {
        allowed: false,
        reason: 'Automated behavior suspected',
        securityFlags: ['regular_timing'],
      };
    }
  }
  
  return { allowed: true };
}

/**
 * Clean up old rate limit entries
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  for (const [key, entry] of rateLimitStore.entries()) {
    // Remove entries older than 1 hour
    if ((now - entry.lastRequest) > 3600000) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => rateLimitStore.delete(key));
  
  // Clean up suspicious activity logs older than 24 hours
  for (const [userId, activities] of suspiciousActivityLog.entries()) {
    const filtered = activities.filter(a => (now - a.timestamp) < 86400000);
    if (filtered.length === 0) {
      suspiciousActivityLog.delete(userId);
    } else {
      suspiciousActivityLog.set(userId, filtered);
    }
  }
  
  logger.debug(`Cleaned up ${keysToDelete.length} rate limit entries and old activity logs`);
}

// Periodic cleanup
setInterval(cleanupRateLimits, 300000); // Every 5 minutes

/**
 * Enhanced permission check with rate limiting and security validation
 */
export function checkPermissionSecure(
  member: GuildMember,
  action: string,
  context?: Partial<SecurityContext>
): PermissionResult {
  const securityContext: SecurityContext = {
    userId: member.id,
    guildId: member.guild?.id,
    channelId: context?.channelId,
    action,
    timestamp: Date.now(),
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent,
  };
  
  // Security validation
  const securityResult = validateSecurityContext(securityContext);
  if (!securityResult.allowed) {
    return securityResult;
  }
  
  // Rate limiting
  const rateLimitResult = checkRateLimit(member.id, action);
  if (!rateLimitResult.allowed) {
    return {
      allowed: false,
      reason: rateLimitResult.isBlocked ? 'User temporarily blocked' : 'Rate limit exceeded',
      rateLimited: true,
      retryAfter: rateLimitResult.retryAfter,
    };
  }
  
  // Permission check
  const hasPermission = hasAdminRole(member);
  if (!hasPermission) {
    // Log failed permission attempts
    logSuspiciousActivity(securityContext, 'Unauthorized access attempt');
    return {
      allowed: false,
      reason: `Insufficient permissions for action: ${action}`,
    };
  }
  
  return { allowed: true };
}

/**
 * Check if a guild member has admin role based on configured admin roles
 */
export function hasAdminRole(member: GuildMember): boolean {
  try {
    const adminRoles = Settings.ADMIN_ROLES;
    
    if (!adminRoles || adminRoles.length === 0) {
      // If no admin roles configured, check for Administrator permission
      return member.permissions.has(PermissionFlagsBits.Administrator);
    }

    // Check if user has any of the configured admin roles
    const hasRole = member.roles.cache.some(role => 
      adminRoles.includes(role.name)
    );

    if (hasRole) {
      return true;
    }

    // Fallback to checking Administrator permission
    return member.permissions.has(PermissionFlagsBits.Administrator);
  } catch (error) {
    logger.error(`Error checking admin role for ${member.user.tag}: ${error}`);
    return false;
  }
}

/**
 * Check if a user has permission to use a specific command
 */
export function canUseCommand(member: GuildMember, command: string): boolean {
  try {
    // For now, all commands require admin role
    // This could be expanded to have different permission levels per command
    return hasAdminRole(member);
  } catch (error) {
    logger.error(`Error checking command permission for ${member.user.tag}: ${error}`);
    return false;
  }
}

/**
 * Validate if a user (bot) has necessary permissions in a channel
 */
export function validatePermissions(channel: GuildChannel, user: User): boolean {
  try {
    if (!channel.guild) {
      return false;
    }

    const member = channel.guild.members.cache.get(user.id);
    if (!member) {
      logger.warn(`Member not found in guild for user ${user.tag}`);
      return false;
    }

    const permissions = channel.permissionsFor(member);
    if (!permissions) {
      logger.warn(`Could not determine permissions for ${user.tag} in ${channel.name}`);
      return false;
    }

    // Check required permissions for the bot
    const requiredPermissions = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ReadMessageHistory,
    ];

    const hasAllPermissions = requiredPermissions.every(perm => 
      permissions.has(perm)
    );

    if (!hasAllPermissions) {
      const missingPerms = requiredPermissions.filter(perm => 
        !permissions.has(perm)
      );
      logger.warn(`Missing permissions in ${channel.name}: ${missingPerms.join(', ')}`);
    }

    return hasAllPermissions;
  } catch (error) {
    logger.error(`Error validating permissions: ${error}`);
    return false;
  }
}

/**
 * Check if bot can access and send messages to a channel
 */
export function canAccessChannel(channel: TextChannel, botUser: User): boolean {
  return validatePermissions(channel, botUser);
}

/**
 * Check if a member can manage events (create/delete watches)
 */
export function canManageEvents(member: GuildMember): boolean {
  return hasAdminRole(member);
}

/**
 * Check if a member can view event lists
 */
export function canViewEvents(member: GuildMember): boolean {
  // For now, anyone can view events in their server
  // This could be restricted to admin roles if needed
  return true;
}

/**
 * Get permission info for a member in a specific channel
 */
export function getPermissionInfo(member: GuildMember, channel?: GuildChannel): {
  isAdmin: boolean;
  canManageEvents: boolean;
  canViewEvents: boolean;
  channelPermissions?: {
    canView: boolean;
    canSend: boolean;
    canEmbed: boolean;
    canReadHistory: boolean;
  };
} {
  const info = {
    isAdmin: hasAdminRole(member),
    canManageEvents: canManageEvents(member),
    canViewEvents: canViewEvents(member),
  };

  if (channel) {
    const permissions = channel.permissionsFor(member);
    (info as any).channelPermissions = {
      canView: permissions?.has(PermissionFlagsBits.ViewChannel) ?? false,
      canSend: permissions?.has(PermissionFlagsBits.SendMessages) ?? false,
      canEmbed: permissions?.has(PermissionFlagsBits.EmbedLinks) ?? false,
      canReadHistory: permissions?.has(PermissionFlagsBits.ReadMessageHistory) ?? false,
    };
  }

  return info;
}

/**
 * Multi-server permission isolation check
 */
export function validateMultiServerIsolation(
  member: GuildMember,
  targetGuildId?: string
): PermissionResult {
  // Ensure user can only access data from their own guild
  if (targetGuildId && member.guild.id !== targetGuildId) {
    logger.warn(`🚫 Cross-guild access attempt by ${member.user.tag} to guild ${targetGuildId}`);
    logSuspiciousActivity({
      userId: member.id,
      guildId: member.guild.id,
      channelId: '',
      action: 'cross_guild_access',
      timestamp: Date.now(),
    }, `Attempted to access guild ${targetGuildId}`);
    
    return {
      allowed: false,
      reason: 'Cross-guild access denied',
      securityFlags: ['cross_guild_access'],
    };
  }
  
  return { allowed: true };
}

/**
 * Advanced bot permission validation with security checks
 */
export async function validateBotPermissionsSecure(
  guild: Guild,
  requiredPermissions?: bigint[]
): Promise<PermissionResult> {
  try {
    const botMember = await executeWithRetry(
      () => guild.members.fetch(guild.client.user!.id),
      'api_call'
    );
    
    if (!botMember) {
      return {
        allowed: false,
        reason: 'Bot not found in guild',
      };
    }
    
    const permissions = requiredPermissions || [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AddReactions,
    ];
    
    const missingPermissions: string[] = [];
    
    for (const permission of permissions) {
      if (!botMember.permissions.has(permission)) {
        missingPermissions.push(formatPermissionName(permission));
      }
    }
    
    if (missingPermissions.length > 0) {
      logger.error(`🚫 Bot missing permissions in ${guild.name}: ${missingPermissions.join(', ')}`);
      return {
        allowed: false,
        reason: `Missing permissions: ${missingPermissions.join(', ')}`,
      };
    }
    
    return { allowed: true };
    
  } catch (error) {
    logger.error(`Error validating bot permissions in ${guild.name}: ${error}`);
    return {
      allowed: false,
      reason: 'Failed to validate bot permissions',
    };
  }
}

/**
 * Check if bot has all required permissions in a guild
 */
export function validateBotGuildPermissions(member: GuildMember): {
  valid: boolean;
  missing: string[];
} {
  const requiredPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.UseExternalEmojis,
  ];

  const missingPermissions: string[] = [];
  
  for (const permission of requiredPermissions) {
    if (!member.permissions.has(permission)) {
      missingPermissions.push(permission.toString());
    }
  }

  return {
    valid: missingPermissions.length === 0,
    missing: missingPermissions,
  };
}

/**
 * Format permission names for user-friendly display
 */
export function formatPermissionName(permission: bigint): string {
  const permissionNames: { [key: string]: string } = {
    [PermissionFlagsBits.ViewChannel.toString()]: 'View Channel',
    [PermissionFlagsBits.SendMessages.toString()]: 'Send Messages',
    [PermissionFlagsBits.EmbedLinks.toString()]: 'Embed Links',
    [PermissionFlagsBits.ReadMessageHistory.toString()]: 'Read Message History',
    [PermissionFlagsBits.AddReactions.toString()]: 'Add Reactions',
    [PermissionFlagsBits.UseExternalEmojis.toString()]: 'Use External Emojis',
    [PermissionFlagsBits.Administrator.toString()]: 'Administrator',
    [PermissionFlagsBits.ManageGuild.toString()]: 'Manage Server',
    [PermissionFlagsBits.ManageChannels.toString()]: 'Manage Channels',
    [PermissionFlagsBits.ManageRoles.toString()]: 'Manage Roles',
  };

  return permissionNames[permission.toString()] || `Unknown Permission (${permission})`;
}

/**
 * Generate a permission report for debugging
 */
export function generatePermissionReport(member: GuildMember, channel?: GuildChannel): string {
  const report = [];
  
  report.push(`Permission Report for ${member.user.tag}:`);
  report.push(`- Is Admin: ${hasAdminRole(member)}`);
  report.push(`- Can Manage Events: ${canManageEvents(member)}`);
  report.push(`- Can View Events: ${canViewEvents(member)}`);
  
  if (channel) {
    report.push(`\nChannel Permissions (${channel.name}):`);
    const permissions = getPermissionInfo(member, channel).channelPermissions;
    if (permissions) {
      report.push(`- Can View: ${permissions.canView}`);
      report.push(`- Can Send: ${permissions.canSend}`);
      report.push(`- Can Embed: ${permissions.canEmbed}`);
      report.push(`- Can Read History: ${permissions.canReadHistory}`);
    }
  }
  
  report.push(`\nAdmin Roles Configured: ${Settings.ADMIN_ROLES.join(', ')}`);
  report.push(`User Roles: ${member.roles.cache.map(r => r.name).join(', ')}`);
  
  return report.join('\n');
}

/**
 * Get security statistics for monitoring
 */
export function getSecurityStats(): {
  rateLimitEntries: number;
  blockedUsers: number;
  suspiciousActivities: number;
  topSuspiciousUsers: Array<{ userId: string; activityCount: number }>;
} {
  const now = Date.now();
  
  // Count blocked users
  let blockedUsers = 0;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.count > 10 && entry.resetTime > now) { // Assuming blocked if exceeded limit
      blockedUsers++;
    }
  }
  
  // Count recent suspicious activities
  let suspiciousActivities = 0;
  const userActivityCounts: Record<string, number> = {};
  
  for (const [userId, activities] of suspiciousActivityLog.entries()) {
    const recentActivities = activities.filter(a => (now - a.timestamp) < 86400000); // Last 24h
    suspiciousActivities += recentActivities.length;
    userActivityCounts[userId] = recentActivities.length;
  }
  
  const topSuspiciousUsers = Object.entries(userActivityCounts)
    .filter(([_, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([userId, activityCount]) => ({ userId, activityCount }));
  
  return {
    rateLimitEntries: rateLimitStore.size,
    blockedUsers,
    suspiciousActivities,
    topSuspiciousUsers,
  };
}

/**
 * Generate security report
 */
export function generateSecurityReport(): string {
  const stats = getSecurityStats();
  
  const report = [
    '=== Security & Permissions Report ===',
    `Rate Limit Entries: ${stats.rateLimitEntries}`,
    `Blocked Users: ${stats.blockedUsers}`,
    `Suspicious Activities (24h): ${stats.suspiciousActivities}`,
    '',
  ];
  
  if (stats.topSuspiciousUsers.length > 0) {
    report.push('🔍 Top Suspicious Users:');
    stats.topSuspiciousUsers.forEach(({ userId, activityCount }, index) => {
      report.push(`  ${index + 1}. User ${userId}: ${activityCount} suspicious activities`);
    });
    report.push('');
  }
  
  // Add rate limit configurations
  report.push('⚙️ Rate Limit Configurations:');
  Object.entries(RATE_LIMIT_CONFIGS).forEach(([action, config]) => {
    report.push(`  ${action}: ${config.maxRequests} requests/${Math.floor(config.windowMs/1000)}s`);
  });
  
  return report.join('\n');
}

/**
 * Comprehensive bot setup validation with enhanced security
 */
export async function validateBotSetup(member: GuildMember): Promise<{
  valid: boolean;
  issues: string[];
  warnings: string[];
}> {
  const issues: string[] = [];
  const warnings: string[] = [];

  try {
    // Check basic guild permissions
    const guildPerms = validateBotGuildPermissions(member);
    if (!guildPerms.valid) {
      issues.push(`Missing guild permissions: ${guildPerms.missing.map(formatPermissionName).join(', ')}`);
    }

    // Check admin role configuration
    if (!Settings.ADMIN_ROLES || Settings.ADMIN_ROLES.length === 0) {
      warnings.push('No admin roles configured - using Administrator permission as fallback');
    } else {
      const guild = member.guild;
      const configuredRoles = Settings.ADMIN_ROLES;
      const existingRoles = guild.roles.cache.map(r => r.name);
      const missingRoles = configuredRoles.filter(role => !existingRoles.includes(role));
      
      if (missingRoles.length > 0) {
        warnings.push(`Configured admin roles not found in server: ${missingRoles.join(', ')}`);
      }
    }

    // Check if bot can create embeds
    if (!member.permissions.has(PermissionFlagsBits.EmbedLinks)) {
      issues.push('Bot cannot create embeds (required for reminders)');
    }

    // Security checks
    const securityStats = getSecurityStats();
    if (securityStats.blockedUsers > 5) {
      warnings.push(`High number of blocked users: ${securityStats.blockedUsers}`);
    }

    if (securityStats.suspiciousActivities > 50) {
      warnings.push(`High suspicious activity: ${securityStats.suspiciousActivities} activities in 24h`);
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
    };
  } catch (error) {
    logger.error(`Error validating bot setup: ${error}`);
    return {
      valid: false,
      issues: ['Error occurred during validation'],
      warnings: [],
    };
  }
}