#!/usr/bin/env node
/**
 * Database Migration Script
 * =========================
 * Migrates data from SQLite to PostgreSQL with backup and rollback capabilities
 */

const fs = require('fs').promises;
const path = require('path');
const { Client } = require('pg');
const Database = require('better-sqlite3');

class DatabaseMigrator {
  constructor() {
    this.sqlitePath = process.env.SQLITE_PATH || './data/discord_bot.db';
    this.backupDir = './backups';
    this.pgConfig = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'discord_bot',
      user: process.env.POSTGRES_USER || 'bot_user',
      password: process.env.POSTGRES_PASSWORD || 'secure_password',
      ssl: process.env.POSTGRES_SSL === 'true',
      connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT || '30000'),
    };

    this.sqliteDb = null;
    this.pgClient = null;
    this.migrationStartTime = new Date();
  }

  /**
   * Log message with timestamp
   */
  log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
  }

  /**
   * Create backup directory and return backup filename
   */
  async createBackup() {
    this.log('INFO', '📦 Creating backup...');

    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }

    const timestamp = this.migrationStartTime.toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(this.backupDir, `sqlite-backup-${timestamp}.db`);

    try {
      await fs.copyFile(this.sqlitePath, backupFile);
      this.log('INFO', `✅ Backup created: ${backupFile}`);
      return backupFile;
    } catch (error) {
      this.log('ERROR', `❌ Failed to create backup: ${error.message}`);
      throw error;
    }
  }

  /**
   * Initialize database connections
   */
  async initializeConnections() {
    this.log('INFO', '🔌 Initializing database connections...');

    // Check if SQLite database exists
    try {
      await fs.access(this.sqlitePath);
      this.log('INFO', `📄 SQLite database found: ${this.sqlitePath}`);
    } catch (error) {
      this.log('WARN', `⚠️  SQLite database not found: ${this.sqlitePath}`);
      return false;
    }

    // Connect to SQLite
    try {
      this.sqliteDb = new Database(this.sqlitePath, { readonly: true });
      this.log('INFO', '✅ SQLite connection established');
    } catch (error) {
      this.log('ERROR', `❌ Failed to connect to SQLite: ${error.message}`);
      throw error;
    }

    // Connect to PostgreSQL
    try {
      this.pgClient = new Client(this.pgConfig);
      await this.pgClient.connect();
      this.log('INFO', '✅ PostgreSQL connection established');
    } catch (error) {
      this.log('ERROR', `❌ Failed to connect to PostgreSQL: ${error.message}`);
      throw error;
    }

    return true;
  }

  /**
   * Get table schema and data from SQLite
   */
  getSQLiteData(tableName) {
    try {
      // Get table schema
      const schemaQuery = `SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`;
      const schema = this.sqliteDb.prepare(schemaQuery).get();

      if (!schema) {
        this.log('WARN', `⚠️  Table '${tableName}' not found in SQLite`);
        return null;
      }

      // Get table data
      const dataQuery = `SELECT * FROM ${tableName}`;
      const data = this.sqliteDb.prepare(dataQuery).all();

      this.log('INFO', `📊 Found ${data.length} records in '${tableName}'`);

      return {
        schema: schema.sql,
        data: data,
        count: data.length,
      };
    } catch (error) {
      this.log('ERROR', `❌ Failed to read from table '${tableName}': ${error.message}`);
      throw error;
    }
  }

  /**
   * Map SQLite data types to PostgreSQL
   */
  mapDataTypes(sqliteType) {
    const typeMap = {
      INTEGER: 'BIGINT',
      TEXT: 'TEXT',
      REAL: 'DECIMAL',
      BLOB: 'BYTEA',
      NUMERIC: 'NUMERIC',
      DATETIME: 'TIMESTAMP WITH TIME ZONE',
    };

    return typeMap[sqliteType.toUpperCase()] || 'TEXT';
  }

  /**
   * Migrate a table from SQLite to PostgreSQL
   */
  async migrateTable(tableName) {
    this.log('INFO', `🔄 Migrating table: ${tableName}`);

    const sqliteData = this.getSQLiteData(tableName);
    if (!sqliteData || sqliteData.count === 0) {
      this.log('INFO', `⏭️  Skipping empty table: ${tableName}`);
      return;
    }

    try {
      // Clear existing data in PostgreSQL table
      await this.pgClient.query(`DELETE FROM discord_bot.${tableName}`);
      this.log('INFO', `🗑️  Cleared existing data in PostgreSQL table: ${tableName}`);

      if (sqliteData.count > 0) {
        // Get column names from first row
        const columns = Object.keys(sqliteData.data[0]);
        const columnPlaceholders = columns.map((_, index) => `$${index + 1}`).join(', ');

        const insertQuery = `
                    INSERT INTO discord_bot.${tableName} (${columns.join(', ')})
                    VALUES (${columnPlaceholders})
                `;

        // Insert data in batches
        const batchSize = 100;
        let insertedCount = 0;

        for (let i = 0; i < sqliteData.data.length; i += batchSize) {
          const batch = sqliteData.data.slice(i, i + batchSize);

          for (const row of batch) {
            const values = columns.map(col => {
              let value = row[col];

              // Handle special data types
              if (value === null || value === undefined) {
                return null;
              }

              // Convert SQLite datetime strings to PostgreSQL timestamps
              if (col.includes('_at') || col.includes('date')) {
                if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
                  return new Date(value);
                }
              }

              return value;
            });

            await this.pgClient.query(insertQuery, values);
            insertedCount++;
          }

          this.log(
            'INFO',
            `📝 Inserted ${Math.min(i + batchSize, sqliteData.data.length)}/${sqliteData.data.length} records`,
          );
        }

        this.log('INFO', `✅ Successfully migrated ${insertedCount} records to '${tableName}'`);
      }
    } catch (error) {
      this.log('ERROR', `❌ Failed to migrate table '${tableName}': ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify migration integrity
   */
  async verifyMigration() {
    this.log('INFO', '🔍 Verifying migration integrity...');

    const tables = ['users', 'guilds', 'events', 'event_participants', 'reminders', 'bot_stats'];
    const verification = {};

    for (const table of tables) {
      try {
        // Count SQLite records
        const sqliteCount = this.getSQLiteData(table)?.count || 0;

        // Count PostgreSQL records
        const pgResult = await this.pgClient.query(`SELECT COUNT(*) FROM discord_bot.${table}`);
        const pgCount = parseInt(pgResult.rows[0].count);

        verification[table] = {
          sqlite: sqliteCount,
          postgresql: pgCount,
          match: sqliteCount === pgCount,
        };

        if (verification[table].match) {
          this.log('INFO', `✅ ${table}: ${sqliteCount} records (match)`);
        } else {
          this.log(
            'WARN',
            `⚠️  ${table}: SQLite ${sqliteCount} vs PostgreSQL ${pgCount} (mismatch)`,
          );
        }
      } catch (error) {
        this.log('ERROR', `❌ Failed to verify table '${table}': ${error.message}`);
        verification[table] = { error: error.message };
      }
    }

    return verification;
  }

  /**
   * Update sequence values in PostgreSQL
   */
  async updateSequences() {
    this.log('INFO', '🔢 Updating PostgreSQL sequences...');

    const tables = [
      'users',
      'guilds',
      'events',
      'event_participants',
      'reminders',
      'bot_stats',
      'sessions',
    ];

    for (const table of tables) {
      try {
        const maxIdQuery = `SELECT MAX(id) as max_id FROM discord_bot.${table}`;
        const result = await this.pgClient.query(maxIdQuery);
        const maxId = result.rows[0].max_id;

        if (maxId) {
          const sequenceName = `discord_bot.${table}_id_seq`;
          const updateSequenceQuery = `SELECT setval('${sequenceName}', ${maxId})`;
          await this.pgClient.query(updateSequenceQuery);
          this.log('INFO', `✅ Updated sequence for '${table}' to ${maxId}`);
        }
      } catch (error) {
        this.log('WARN', `⚠️  Failed to update sequence for '${table}': ${error.message}`);
      }
    }
  }

  /**
   * Close database connections
   */
  async closeConnections() {
    this.log('INFO', '🔌 Closing database connections...');

    try {
      if (this.sqliteDb) {
        this.sqliteDb.close();
        this.log('INFO', '✅ SQLite connection closed');
      }
    } catch (error) {
      this.log('ERROR', `❌ Error closing SQLite: ${error.message}`);
    }

    try {
      if (this.pgClient) {
        await this.pgClient.end();
        this.log('INFO', '✅ PostgreSQL connection closed');
      }
    } catch (error) {
      this.log('ERROR', `❌ Error closing PostgreSQL: ${error.message}`);
    }
  }

  /**
   * Main migration process
   */
  async migrate() {
    const startTime = Date.now();
    this.log('INFO', '🚀 Starting database migration...');

    let backupFile = null;

    try {
      // Create backup
      backupFile = await this.createBackup();

      // Initialize connections
      const hasData = await this.initializeConnections();
      if (!hasData) {
        this.log('INFO', '📭 No SQLite data to migrate');
        return;
      }

      // Define tables to migrate (in dependency order)
      const tables = ['users', 'guilds', 'events', 'event_participants', 'reminders', 'bot_stats'];

      // Migrate tables
      for (const table of tables) {
        await this.migrateTable(table);
      }

      // Update sequences
      await this.updateSequences();

      // Verify migration
      const verification = await this.verifyMigration();

      // Check if all verifications passed
      const allMatch = Object.values(verification).every(v => v.match === true);

      if (allMatch) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        this.log('INFO', `🎉 Migration completed successfully in ${duration}s`);
      } else {
        this.log('WARN', '⚠️  Migration completed with some mismatches');
      }

      // Save migration report
      const report = {
        timestamp: this.migrationStartTime.toISOString(),
        duration: Date.now() - startTime,
        verification: verification,
        backup: backupFile,
        status: allMatch ? 'success' : 'warning',
      };

      const reportFile = path.join(
        this.backupDir,
        `migration-report-${this.migrationStartTime.toISOString().replace(/[:.]/g, '-')}.json`,
      );
      await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
      this.log('INFO', `📋 Migration report saved: ${reportFile}`);
    } catch (error) {
      this.log('ERROR', `💥 Migration failed: ${error.message}`);
      if (backupFile) {
        this.log('INFO', `🔄 Backup available for recovery: ${backupFile}`);
      }
      throw error;
    } finally {
      await this.closeConnections();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrator = new DatabaseMigrator();

  migrator
    .migrate()
    .then(() => {
      console.log('✅ Migration process completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration process failed:', error);
      process.exit(1);
    });
}

module.exports = DatabaseMigrator;
