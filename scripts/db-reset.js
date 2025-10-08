import fs from 'fs';
import Database from 'better-sqlite3';

const dbPath = 'server/data/discord_bot.db';

// Delete the old database file
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS events (
	message_id text PRIMARY KEY NOT NULL,
	channel_id text NOT NULL,
	guild_id text NOT NULL,
	title text NOT NULL,
	description text,
	interval_minutes integer NOT NULL,
	is_paused integer DEFAULT false NOT NULL,
	last_reminded_at integer,
	users_who_reacted text DEFAULT '[]' NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS guilds (
	guild_id text PRIMARY KEY NOT NULL,
	guild_name text NOT NULL,
	owner_id text NOT NULL,
	member_count integer DEFAULT 0 NOT NULL,
	is_active integer DEFAULT true NOT NULL,
	joined_at integer DEFAULT (unixepoch()) NOT NULL,
	left_at integer,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS guild_configs (
	guild_id text PRIMARY KEY NOT NULL,
	default_reminder_interval integer DEFAULT 60 NOT NULL,
	timezone text DEFAULT 'UTC' NOT NULL,
	date_format text DEFAULT 'YYYY-MM-DD HH:mm' NOT NULL,
	allowed_roles text DEFAULT '[]' NOT NULL,
	blocked_channels text DEFAULT '[]' NOT NULL,
	max_events_per_guild integer DEFAULT 50 NOT NULL,
	enable_auto_cleanup integer DEFAULT true NOT NULL,
	cleanup_days integer DEFAULT 30 NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON UPDATE no action ON DELETE cascade
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS reactions (
	message_id text NOT NULL,
	user_id text NOT NULL,
	guild_id text NOT NULL,
	emoji text NOT NULL,
	is_removed integer DEFAULT false NOT NULL,
	reacted_at integer DEFAULT (unixepoch()) NOT NULL,
	removed_at integer,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (message_id) REFERENCES events(message_id) ON UPDATE no action ON DELETE cascade
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS reminder_logs (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	message_id text NOT NULL,
	channel_id text NOT NULL,
	guild_id text NOT NULL,
	reminder_type text NOT NULL,
	recipient_count integer DEFAULT 0 NOT NULL,
	success_count integer DEFAULT 0 NOT NULL,
	error_count integer DEFAULT 0 NOT NULL,
	error_details text,
	execution_time_ms real,
	sent_at integer DEFAULT (unixepoch()) NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (message_id) REFERENCES events(message_id) ON UPDATE no action ON DELETE cascade
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
	user_id text NOT NULL,
	guild_id text NOT NULL,
	username text NOT NULL,
	is_bot integer DEFAULT false NOT NULL,
	last_seen integer DEFAULT (unixepoch()) NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL
);
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_events_guild_channel ON events (guild_id, channel_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_events_updated_at ON events (updated_at);');
db.exec('CREATE INDEX IF NOT EXISTS idx_guilds_active ON guilds (is_active);');
db.exec('CREATE INDEX IF NOT EXISTS idx_guilds_joined_at ON guilds (joined_at);');
db.exec('CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions (message_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_reactions_user ON reactions (user_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_reactions_guild ON reactions (guild_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_reactions_reacted_at ON reactions (reacted_at);');
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS reactions_message_id_user_id_emoji_unique ON reactions (message_id, user_id, emoji);',
);
db.exec('CREATE INDEX IF NOT EXISTS idx_reminder_logs_message ON reminder_logs (message_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_reminder_logs_guild ON reminder_logs (guild_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_reminder_logs_sent_at ON reminder_logs (sent_at);');
db.exec('CREATE INDEX IF NOT EXISTS idx_reminder_logs_type ON reminder_logs (reminder_type);');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_guild ON users (guild_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users (last_seen);');
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS users_user_id_guild_id_unique ON users (user_id, guild_id);',
);

db.exec('CREATE INDEX IF NOT EXISTS idx_events_paused ON events (is_paused);');
db.exec('CREATE INDEX IF NOT EXISTS idx_events_last_reminded_at ON events (last_reminded_at);');
db.exec('CREATE INDEX IF NOT EXISTS idx_reactions_removed ON reactions (is_removed);');

console.log('Database reset successfully!');
