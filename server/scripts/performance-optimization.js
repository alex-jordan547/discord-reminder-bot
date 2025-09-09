#!/usr/bin/env node

/**
 * Performance Optimization Script
 * 
 * Applies database indexes, cache warming, and performance monitoring
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'discord_bot',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

const db = drizzle(pool);

async function applyPerformanceIndexes() {
  console.log('🚀 Applying performance indexes...');
  
  const performanceIndexes = [
    // Composite indexes for common query patterns
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_guild_paused_reminded 
     ON events (guild_id, is_paused, last_reminded_at) 
     WHERE is_paused = false`,
    
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reactions_active 
     ON reactions (message_id, is_removed, reacted_at) 
     WHERE is_removed = false`,
    
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reminder_logs_recent 
     ON reminder_logs (guild_id, sent_at DESC, reminder_type) 
     WHERE sent_at > NOW() - INTERVAL '7 days'`,
    
    // Partial indexes for better performance
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_next_reminder 
     ON events (last_reminded_at, interval_minutes) 
     WHERE is_paused = false AND last_reminded_at IS NOT NULL`,
    
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_guilds_active_recent 
     ON guilds (is_active, joined_at DESC) 
     WHERE is_active = true`,
    
    // Full-text search preparation
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_title_search 
     ON events USING gin(to_tsvector('english', title))`,
    
    // Analytics indexes
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reminder_logs_performance 
     ON reminder_logs (execution_time_ms, recipient_count, success_count) 
     WHERE execution_time_ms IS NOT NULL`,
  ];

  for (const indexSQL of performanceIndexes) {
    try {
      console.log(`Creating index: ${indexSQL.split('\n')[0].trim()}...`);
      await db.execute(sql.raw(indexSQL));
      console.log('✅ Index created successfully');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️ Index already exists, skipping');
      } else {
        console.error('❌ Error creating index:', error.message);
      }
    }
  }
}

async function optimizeDatabase() {
  console.log('🔧 Optimizing database configuration...');
  
  const optimizations = [
    // Update PostgreSQL configuration for better performance
    `ALTER SYSTEM SET shared_buffers = '256MB'`,
    `ALTER SYSTEM SET effective_cache_size = '1GB'`,
    `ALTER SYSTEM SET maintenance_work_mem = '64MB'`,
    `ALTER SYSTEM SET checkpoint_completion_target = 0.9`,
    `ALTER SYSTEM SET wal_buffers = '16MB'`,
    `ALTER SYSTEM SET default_statistics_target = 100`,
    `ALTER SYSTEM SET random_page_cost = 1.1`,
    `ALTER SYSTEM SET effective_io_concurrency = 200`,
  ];

  for (const optimization of optimizations) {
    try {
      await db.execute(sql.raw(optimization));
      console.log(`✅ Applied: ${optimization}`);
    } catch (error) {
      console.log(`ℹ️ Skipped (requires superuser): ${optimization.split(' ')[3]}`);
    }
  }
}

async function analyzeTableStatistics() {
  console.log('📊 Analyzing table statistics...');
  
  const tables = ['events', 'guilds', 'guild_configs', 'reactions', 'reminder_logs', 'users'];
  
  for (const table of tables) {
    try {
      await db.execute(sql.raw(`ANALYZE ${table}`));
      console.log(`✅ Analyzed table: ${table}`);
    } catch (error) {
      console.error(`❌ Error analyzing ${table}:`, error.message);
    }
  }
}

async function generatePerformanceReport() {
  console.log('📈 Generating performance report...');
  
  try {
    // Table sizes and index usage
    const tableStats = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples,
        seq_scan as sequential_scans,
        seq_tup_read as sequential_reads,
        idx_scan as index_scans,
        idx_tup_fetch as index_reads,
        CASE 
          WHEN seq_scan + idx_scan = 0 THEN 0
          ELSE ROUND((idx_scan::numeric / (seq_scan + idx_scan) * 100), 2)
        END as index_usage_percent
      FROM pg_stat_user_tables 
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `);

    // Index statistics
    const indexStats = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes 
      WHERE schemaname = 'public'
      ORDER BY idx_scan DESC
      LIMIT 20
    `);

    // Slow queries (if pg_stat_statements is available)
    let slowQueries = [];
    try {
      slowQueries = await db.execute(sql`
        SELECT 
          LEFT(query, 100) as query_snippet,
          calls,
          total_exec_time,
          mean_exec_time,
          max_exec_time,
          rows
        FROM pg_stat_statements 
        WHERE query LIKE '%events%' OR query LIKE '%reactions%' OR query LIKE '%guilds%'
        ORDER BY mean_exec_time DESC
        LIMIT 10
      `);
    } catch (error) {
      console.log('ℹ️ pg_stat_statements not available for slow query analysis');
    }

    console.log('\n📊 PERFORMANCE REPORT');
    console.log('===================');
    
    console.log('\n📋 Table Statistics:');
    tableStats.rows.forEach(row => {
      console.log(`  ${row.tablename}: ${row.size} (${row.live_tuples} rows, ${row.index_usage_percent}% index usage)`);
    });

    console.log('\n🔍 Top Indexes by Usage:');
    indexStats.rows.slice(0, 10).forEach(row => {
      console.log(`  ${row.indexname}: ${row.scans} scans (${row.index_size})`);
    });

    if (slowQueries.length > 0) {
      console.log('\n🐌 Potential Slow Queries:');
      slowQueries.forEach(row => {
        console.log(`  ${row.query_snippet}... (avg: ${Math.round(row.mean_exec_time)}ms)`);
      });
    }

    return {
      tableStats: tableStats.rows,
      indexStats: indexStats.rows,
      slowQueries
    };

  } catch (error) {
    console.error('❌ Error generating performance report:', error.message);
    return null;
  }
}

async function vacuumAndReindex() {
  console.log('🧹 Running VACUUM and REINDEX...');
  
  const tables = ['events', 'guilds', 'guild_configs', 'reactions', 'reminder_logs', 'users'];
  
  for (const table of tables) {
    try {
      await db.execute(sql.raw(`VACUUM ANALYZE ${table}`));
      console.log(`✅ Vacuumed table: ${table}`);
    } catch (error) {
      console.error(`❌ Error vacuuming ${table}:`, error.message);
    }
  }
}

async function main() {
  console.log('🎯 Starting Performance Optimization for Discord Reminder Bot');
  console.log('==============================================================\n');

  try {
    // Test database connection
    await db.execute(sql`SELECT 1`);
    console.log('✅ Database connection successful\n');

    // Apply optimizations
    await applyPerformanceIndexes();
    console.log('');
    
    await optimizeDatabase();
    console.log('');
    
    await analyzeTableStatistics();
    console.log('');
    
    await vacuumAndReindex();
    console.log('');
    
    const report = await generatePerformanceReport();
    
    console.log('\n🎉 Performance optimization completed!');
    console.log('\nNext steps:');
    console.log('1. Monitor query performance with the new indexes');
    console.log('2. Run this script periodically for maintenance');
    console.log('3. Check the performance report for potential improvements');
    
    if (process.env.NODE_ENV === 'production') {
      console.log('4. Consider enabling pg_stat_statements for query analysis');
      console.log('5. Set up automated VACUUM scheduling');
    }

  } catch (error) {
    console.error('💥 Performance optimization failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main as optimizePerformance };