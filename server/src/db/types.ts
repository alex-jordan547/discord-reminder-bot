/**
 * Database types and interfaces for PostgreSQL and SQLite support
 */

export type DatabaseType = 'postgresql' | 'sqlite';

export interface DatabaseConfig {
  type: DatabaseType;

  // PostgreSQL specific
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  sslMode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';

  // SQLite specific
  path?: string;

  // Connection pooling
  poolSize?: number;
  connectionTimeout?: number;
  idleTimeout?: number;
  maxLifetime?: number;

  // Retry configuration
  retryAttempts?: number;
  retryDelay?: number;

  // Circuit breaker configuration
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  details: string;
  timestamp: Date;
  responseTime?: number;
  error?: Error;
}

export interface ConnectionStats {
  totalAttempts: number;
  successfulConnections: number;
  failedAttempts: number;
  consecutiveFailures: number;
  lastError?: Error;
  lastSuccessfulConnection?: Date;
  lastFailedConnection?: Date;
}

export interface PoolInfo {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  maxConnections: number;
  waitingClients: number;
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
}

export interface DatabaseManager {
  connect(): Promise<void>;
  connectWithRetry(): Promise<void>;
  close(): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
  getConfig(): DatabaseConfig;
  getConnectionStats(): ConnectionStats;
  getPoolInfo(): Promise<PoolInfo>;
  getCircuitBreakerState(): CircuitBreakerState;
}

export interface MigrationOptions {
  batchSize?: number;
  validateData?: boolean;
  createBackup?: boolean;
  skipExisting?: boolean;
  onProgress?: (progress: MigrationProgress) => void;
}

export interface MigrationProgress {
  stage: 'backup' | 'schema' | 'data' | 'validation' | 'complete';
  percentage: number;
  recordsProcessed: number;
  totalRecords: number;
  currentTable?: string;
  message?: string;
}

export interface MigrationResult {
  success: boolean;
  sourceType: DatabaseType;
  targetType: DatabaseType;
  recordsMigrated: number;
  duration: number;
  errors: MigrationError[];
  batchesProcessed?: number;
  validationResults?: ValidationResults;
  backupPath?: string;
}

export interface MigrationError {
  table?: string;
  record?: any;
  message: string;
  error: Error;
  timestamp: Date;
}

export interface ValidationResults {
  sourceRecordCount: number;
  targetRecordCount: number;
  checksumMatch: boolean;
  missingRecords: any[];
  corruptedRecords: any[];
}

export interface SchemaMapping {
  tables: TableMapping[];
  transformations: DataTransformation[];
}

export interface TableMapping {
  sourceName: string;
  targetName: string;
  columns: ColumnMapping[];
}

export interface ColumnMapping {
  sourceName: string;
  targetName: string;
  sourceType: string;
  targetType: string;
  transformation?: string;
}

export interface DataTransformation {
  field: string;
  sourceType: string;
  targetType: string;
  transform: (value: any) => any;
}

export interface BackupResult {
  success: boolean;
  backupPath: string;
  backupSize: number;
  timestamp: Date;
  checksum?: string;
  errors?: Error[];
}

export interface RollbackResult {
  success: boolean;
  restoredRecords: number;
  duration: number;
  errors: Error[];
  integrityCheck?: IntegrityCheck;
}

export interface RollbackOptions {
  validateIntegrity?: boolean;
  originalChecksum?: string;
}

export interface IntegrityCheck {
  checksumMatch: boolean;
  recordCountMatch: boolean;
  originalChecksum: string;
  currentChecksum: string;
}

export interface MigrationStatistics {
  totalMigrations: number;
  successfulMigrations: number;
  failedMigrations: number;
  averageDuration: number;
  totalRecordsMigrated: number;
  lastMigration?: Date;
}

export interface MigrationLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: any;
}

export type ExportFormat = 'sqlite' | 'json' | 'csv' | 'sql';
export type ImportFormat = 'sqlite' | 'json' | 'csv' | 'sql';

export interface ExportOptions {
  format: ExportFormat;
  outputPath: string;
  includeSchema?: boolean;
  includeData?: boolean;
  tables?: string[];
  where?: string;
  whereParams?: any[];
  batchSize?: number;
  onProgress?: ProgressCallback;
  delimiter?: string; // For CSV
  includeHeaders?: boolean; // For CSV
  prettyPrint?: boolean; // For JSON
  streamOutput?: boolean; // For large datasets
}

export interface ImportOptions {
  filePath: string;
  format: ImportFormat;
  validateData?: boolean;
  sanitizeData?: boolean;
  createBackup?: boolean;
  skipDuplicates?: boolean;
  targetTable?: string; // For CSV
  delimiter?: string; // For CSV
  hasHeaders?: boolean; // For CSV
  batchSize?: number;
  onProgress?: ProgressCallback;
  strictValidation?: boolean;
  continueOnError?: boolean;
  maxErrors?: number;
  detailedErrorReporting?: boolean;
  sanitizationRules?: SanitizationRules;
}

export interface SanitizationRules {
  removeHtml?: boolean;
  trimWhitespace?: boolean;
  validateEmails?: boolean;
  escapeSpecialChars?: boolean;
  maxStringLength?: number;
  allowedCharsets?: string[];
}

export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  outputPath: string;
  recordCount: number;
  fileSize: number;
  duration: number;
  errors: ExportError[];
  tablesExported?: string[];
  batchesProcessed?: number;
  metadata?: ExportMetadata;
  memoryUsage?: MemoryUsage;
}

export interface ImportResult {
  success: boolean;
  format: ImportFormat;
  recordsImported: number;
  recordsSkipped: number;
  recordsFailed?: number;
  duration: number;
  errors: ImportError[];
  backupCreated?: string;
  validationResults?: ImportValidationResults;
  sanitizationResults?: SanitizationResults;
  targetTable?: string;
  batchesProcessed?: number;
}

export interface ExportError {
  table?: string;
  message: string;
  error: Error;
  timestamp: Date;
  context?: any;
}

export interface ImportError {
  record?: any;
  recordIndex?: number;
  message: string;
  error: Error;
  timestamp: Date;
  context?: any;
}

export interface ExportMetadata {
  delimiter?: string;
  includeHeaders?: boolean;
  prettyPrint?: boolean;
  streamOutput?: boolean;
  compression?: string;
}

export interface ImportValidationResults {
  validRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
  validationErrors: ValidationError[];
}

export interface ValidationError {
  recordIndex: number;
  field: string;
  value: any;
  message: string;
  rule: string;
}

export interface SanitizationResults {
  recordsSanitized: number;
  fieldsModified: number;
  sanitizationActions: SanitizationAction[];
}

export interface SanitizationAction {
  recordIndex: number;
  field: string;
  originalValue: any;
  sanitizedValue: any;
  action: string;
}

export interface BackupIntegrityResult {
  isValid: boolean;
  currentChecksum: string;
  originalChecksum: string;
  fileExists: boolean;
  fileSize: number;
  errors?: Error[];
}

export interface RestoreResult {
  success: boolean;
  recordsRestored: number;
  duration: number;
  errors: Error[];
}

export interface MemoryUsage {
  peakMemoryMB: number;
  averageMemoryMB: number;
  gcCollections: number;
}

export type ProgressCallback = (progress: ExportImportProgress) => void;

export interface ExportImportProgress {
  stage: 'validation' | 'backup' | 'export' | 'import' | 'sanitization' | 'complete';
  percentage: number;
  recordsProcessed: number;
  totalRecords: number;
  currentTable?: string;
  message?: string;
}
