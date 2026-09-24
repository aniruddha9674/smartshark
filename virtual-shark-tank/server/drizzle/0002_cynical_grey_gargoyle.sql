DROP INDEX "notif_user_unread_idx";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "event_id" varchar(255);--> statement-breakpoint
CREATE INDEX "notif_user_unread_created_idx" ON "notifications" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notif_event_id_unique" ON "notifications" USING btree ("event_id");