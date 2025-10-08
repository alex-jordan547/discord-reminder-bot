-- PostgreSQL Database Initialization Script
-- ============================================
-- This script creates the initial database schema for the Discord Reminder Bot
-- It is automatically executed when the PostgreSQL container starts for the first time

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create schema for bot data
CREATE SCHEMA IF NOT EXISTS discord_bot;

-- Set default schema
SET search_path TO discord_bot, public;

-- Create users table for bot users
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    discord_id VARCHAR(20) UNIQUE NOT NULL,
    username VARCHAR(32) NOT NULL,
    discriminator VARCHAR(4),
    avatar_url TEXT,
    is_admin BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create guilds table for Discord servers
CREATE TABLE IF NOT EXISTS guilds (
    id BIGSERIAL PRIMARY KEY,
    discord_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    icon_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create events table for scheduled events
CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    guild_id BIGINT REFERENCES guilds(id) ON DELETE CASCADE,
    creator_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    reminder_date TIMESTAMP WITH TIME ZONE,
    location VARCHAR(255),
    max_participants INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create event_participants table for event signups
CREATE TABLE IF NOT EXISTS event_participants (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT REFERENCES events(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'registered', -- registered, confirmed, cancelled
    notes TEXT,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id)
);

-- Create reminders table for scheduled reminders
CREATE TABLE IF NOT EXISTS reminders (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT REFERENCES events(id) ON DELETE CASCADE,
    channel_id VARCHAR(20) NOT NULL,
    message_id VARCHAR(20),
    reminder_type VARCHAR(20) DEFAULT 'event', -- event, custom
    reminder_text TEXT,
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    is_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create bot_stats table for monitoring
CREATE TABLE IF NOT EXISTS bot_stats (
    id BIGSERIAL PRIMARY KEY,
    metric_name VARCHAR(50) NOT NULL,
    metric_value DECIMAL,
    metric_data JSONB DEFAULT '{}',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create sessions table for dashboard authentication
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(128) PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    session_data JSONB DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_guilds_discord_id ON guilds(discord_id);
CREATE INDEX IF NOT EXISTS idx_events_guild_id ON events(guild_id);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_reminder_date ON events(reminder_date);
CREATE INDEX IF NOT EXISTS idx_events_is_active ON events(is_active);
CREATE INDEX IF NOT EXISTS idx_event_participants_event_id ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_user_id ON event_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled_for ON reminders(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_reminders_is_sent ON reminders(is_sent);
CREATE INDEX IF NOT EXISTS idx_reminders_event_id ON reminders(event_id);
CREATE INDEX IF NOT EXISTS idx_bot_stats_metric_name ON bot_stats(metric_name);
CREATE INDEX IF NOT EXISTS idx_bot_stats_recorded_at ON bot_stats(recorded_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guilds_updated_at BEFORE UPDATE ON guilds 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default data for development
INSERT INTO guilds (discord_id, name, settings) 
VALUES ('123456789012345678', 'Test Guild', '{"reminder_channel": "general"}')
ON CONFLICT (discord_id) DO NOTHING;

INSERT INTO users (discord_id, username, is_admin) 
VALUES ('987654321098765432', 'TestAdmin', true)
ON CONFLICT (discord_id) DO NOTHING;

-- Create a view for event statistics
CREATE OR REPLACE VIEW event_stats AS
SELECT 
    g.name as guild_name,
    COUNT(e.id) as total_events,
    COUNT(CASE WHEN e.is_active THEN 1 END) as active_events,
    COUNT(CASE WHEN e.event_date > CURRENT_TIMESTAMP THEN 1 END) as upcoming_events,
    COUNT(ep.id) as total_participants
FROM guilds g
LEFT JOIN events e ON g.id = e.guild_id
LEFT JOIN event_participants ep ON e.id = ep.event_id
GROUP BY g.id, g.name;

-- Grant permissions to bot user
GRANT ALL PRIVILEGES ON SCHEMA discord_bot TO bot_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA discord_bot TO bot_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA discord_bot TO bot_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA discord_bot TO bot_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA discord_bot 
GRANT ALL ON TABLES TO bot_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA discord_bot 
GRANT ALL ON SEQUENCES TO bot_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA discord_bot 
GRANT EXECUTE ON FUNCTIONS TO bot_user;