CREATE INDEX "idx_guild_configs_active" ON "guild_configs" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_guild_configs_reminder_channel" ON "guild_configs" USING btree ("reminder_channel_id");--> statement-breakpoint
CREATE INDEX "idx_guild_configs_last_used" ON "guild_configs" USING btree ("last_used_at");