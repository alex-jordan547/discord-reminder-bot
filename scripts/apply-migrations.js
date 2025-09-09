import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import Database from 'better-sqlite3';

const db = new Database('server/data/discord_bot.db');

// Create migrations table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at BIGINT
  );
`);

const migrationsDir = path.resolve(__dirname, '../server/drizzle/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql'));

const appliedMigrations = db.prepare('SELECT hash FROM __drizzle_migrations').all().map(row => row.hash);

for (const file of migrationFiles) {
  const filePath = path.join(migrationsDir, file);
  const sql = fs.readFileSync(filePath, 'utf-8');
  const hash = Buffer.from(sql).toString('base64');

  if (!appliedMigrations.includes(hash)) {
    console.log(`Applying migration: ${file}`);
    try {
      if (sql.trim().toLowerCase().startsWith('create table')) {
        db.exec(sql);
      } else {
        db.transaction(() => {
          db.exec(sql);
        })();
      }
      db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(hash, Date.now());
    } catch (error) {
      if (error.code === 'SQLITE_ERROR' && error.message.includes('already exists')) {
        console.log(`  - Table already exists, skipping.`);
        appliedMigrations.push(hash);
      } else {
        throw error;
      }
    }
  }
}

console.log('All migrations applied successfully!');
