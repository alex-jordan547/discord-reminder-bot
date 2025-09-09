CREATE TABLE "events" (
	"message_id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"interval_minutes" integer NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"last_reminded_at" timestamp,
	"users_who_reacted" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_configs" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"reminder_channel_id" text,
	"reminder_channel_name" text DEFAULT '' NOT NULL,
	"admin_role_ids" text DEFAULT '[]' NOT NULL,
	"admin_role_names" text DEFAULT '[]' NOT NULL,
	"default_interval_minutes" integer DEFAULT 60 NOT NULL,
	"auto_delete_enabled" boolean DEFAULT false NOT NULL,
	"auto_delete_delay_minutes" integer DEFAULT 5 NOT NULL,
	"delay_between_reminders_ms" integer DEFAULT 1000 NOT NULL,
	"max_mentions_per_reminder" integer DEFAULT 50 NOT NULL,
	"use_everyone_above_limit" boolean DEFAULT true NOT NULL,
	"default_reactions" text DEFAULT '["✅","❌","❓"]' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"allowed_roles" text DEFAULT '[]' NOT NULL,
	"blocked_channels" text DEFAULT '[]' NOT NULL,
	"max_events_per_guild" integer DEFAULT 50 NOT NULL,
	"enable_auto_cleanup" boolean DEFAULT true NOT NULL,
	"cleanup_days" integer DEFAULT 30 NOT NULL,
	"date_format" text DEFAULT 'YYYY-MM-DD HH:mm' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"guild_name" text NOT NULL,
	"owner_id" text NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"emoji" text NOT NULL,
	"is_removed" boolean DEFAULT false NOT NULL,
	"reacted_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_message_id_user_id_emoji_unique" UNIQUE("message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "reminder_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"reminder_type" text NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_details" text,
	"execution_time_ms" real,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"username" text NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_user_id_guild_id_unique" UNIQUE("user_id","guild_id")
);
--> statement-breakpoint
ALTER TABLE "guild_configs" ADD CONSTRAINT "guild_configs_guild_id_guilds_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("guild_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_message_id_events_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."events"("message_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_message_id_events_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."events"("message_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_events_guild_channel" ON "events" USING btree ("guild_id","channel_id");--> statement-breakpoint
CREATE INDEX "idx_events_updated_at" ON "events" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_events_paused" ON "events" USING btree ("is_paused");--> statement-breakpoint
CREATE INDEX "idx_events_last_reminded_at" ON "events" USING btree ("last_reminded_at");--> statement-breakpoint
CREATE INDEX "idx_guilds_active" ON "guilds" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_guilds_joined_at" ON "guilds" USING btree ("joined_at");--> statement-breakpoint
CREATE INDEX "idx_reactions_message" ON "reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_reactions_user" ON "reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_reactions_guild" ON "reactions" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_reactions_reacted_at" ON "reactions" USING btree ("reacted_at");--> statement-breakpoint
CREATE INDEX "idx_reactions_removed" ON "reactions" USING btree ("is_removed");--> statement-breakpoint
CREATE INDEX "idx_reminder_logs_message" ON "reminder_logs" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_reminder_logs_guild" ON "reminder_logs" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_reminder_logs_sent_at" ON "reminder_logs" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "idx_reminder_logs_type" ON "reminder_logs" USING btree ("reminder_type");--> statement-breakpoint
CREATE INDEX "idx_users_guild" ON "users" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_users_last_seen" ON "users" USING btree ("last_seen");