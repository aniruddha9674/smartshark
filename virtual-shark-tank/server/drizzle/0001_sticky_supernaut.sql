CREATE TYPE "public"."offer_status" AS ENUM('pending', 'accepted', 'rejected', 'countered', 'withdrawn', 'expired');--> statement-breakpoint
CREATE TYPE "public"."investment_status" AS ENUM('active', 'exited', 'written_off');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'new_offer';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'offer_accepted';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'offer_rejected';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'offer_countered';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'offer_withdrawn';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'offer_expired';--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pitch_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"initiated_by_id" uuid NOT NULL,
	"parent_offer_id" uuid,
	"amount" numeric NOT NULL,
	"equity_requested" numeric NOT NULL,
	"valuation" numeric NOT NULL,
	"conditions" jsonb,
	"message" text,
	"status" "offer_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "offer_amount_positive" CHECK ("offers"."amount" > 0),
	CONSTRAINT "offer_equity_range" CHECK ("offers"."equity_requested" > 0 AND "offers"."equity_requested" <= 100)
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"pitch_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"equity" numeric NOT NULL,
	"valuation" numeric NOT NULL,
	"status" "investment_status" DEFAULT 'active' NOT NULL,
	"invested_at" timestamp DEFAULT now() NOT NULL,
	"exit_value" numeric,
	"exited_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_pitch_id_pitches_id_fk" FOREIGN KEY ("pitch_id") REFERENCES "public"."pitches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_initiated_by_id_users_id_fk" FOREIGN KEY ("initiated_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_pitch_id_pitches_id_fk" FOREIGN KEY ("pitch_id") REFERENCES "public"."pitches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offer_pitch_status_idx" ON "offers" USING btree ("pitch_id","status","created_at");--> statement-breakpoint
CREATE INDEX "offer_investor_idx" ON "offers" USING btree ("investor_id","created_at");--> statement-breakpoint
CREATE INDEX "offer_business_idx" ON "offers" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "offer_parent_idx" ON "offers" USING btree ("parent_offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_one_pending_idx" ON "offers" USING btree ("pitch_id","investor_id") WHERE "offers"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "investment_offer_unique" ON "investments" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "investment_investor_idx" ON "investments" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investment_business_idx" ON "investments" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "investment_pitch_idx" ON "investments" USING btree ("pitch_id");