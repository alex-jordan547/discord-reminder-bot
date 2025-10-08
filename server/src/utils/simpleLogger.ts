/**
 * Ultra-simple console-only logger for Docker compatibility
 */

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  fatal(message: string, ...args: any[]): void;
  child(options: any): Logger;
  level: string;
}

function formatTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function formatMessage(level: string, name: string, message: string, ...args: any[]): string {
  const timestamp = formatTimestamp();
  const emoji = {
    DEBUG: '🔧',
    INFO: 'ℹ️',
    WARN: '⚠️',
    ERROR: '❌',
    FATAL: '🚨'
  }[level] || '📝';

  let formatted = `${timestamp} | ${emoji} ${level.padEnd(5)} | ${name.padEnd(20)} | ${message}`;

  if (args.length > 0) {
    formatted += ' ' + args.map(arg =>
      typeof arg === 'object' && arg !== null ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
  }

  return formatted;
}

export function createLogger(name: string): Logger {
  return {
    debug(message: string, ...args: any[]) {
      console.log(formatMessage('DEBUG', name, message, ...args));
    },
    info(message: string, ...args: any[]) {
      console.log(formatMessage('INFO', name, message, ...args));
    },
    warn(message: string, ...args: any[]) {
      console.warn(formatMessage('WARN', name, message, ...args));
    },
    error(message: string, ...args: any[]) {
      console.error(formatMessage('ERROR', name, message, ...args));
    },
    fatal(message: string, ...args: any[]) {
      console.error(formatMessage('FATAL', name, message, ...args));
    },
    child(options: any) {
      const childName = options.name ? `${name}:${options.name}` : name;
      return createLogger(childName);
    },
    level: 'info'
  };
}

export function closeLogging(): Promise<void> {
  return Promise.resolve();
}