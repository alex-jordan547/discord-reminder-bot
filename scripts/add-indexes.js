import Database from 'better-sqlite3';

const db = new Database('server/data/discord_bot.db');

db.exec('ALTER TABLE events ADD COLUMN last_reminded_at integer;');
db.exec('ALTER TABLE reactions ADD COLUMN is_removed integer DEFAULT false NOT NULL;');

db.exec('CREATE INDEX IF NOT EXISTS idx_events_paused ON events (is_paused);');
db.exec('CREATE INDEX IF NOT EXISTS idx_events_last_reminded_at ON events (last_reminded_at);');
db.exec('CREATE INDEX IF NOT EXISTS idx_reactions_removed ON reactions (is_removed);');

console.log('Indexes added successfully!');
