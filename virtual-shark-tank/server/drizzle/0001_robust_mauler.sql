DO $$ BEGIN
 CREATE TYPE "public"."verification_tier" AS ENUM('unverified', 'basic', 'verified');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "investor_profiles" ALTER COLUMN "investment_focus" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "sector" varchar(100);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "city" varchar(100);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "udyam_number" varchar(50);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "shop_act_license" varchar(50);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "verification_tier" "verification_tier" DEFAULT 'unverified';--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "funding_ask" numeric;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "years_operating" integer;--> statement-breakpoint
ALTER TABLE "investor_profiles" ADD COLUMN "pan_number" varchar(20);--> statement-breakpoint
ALTER TABLE "investor_profiles" ADD COLUMN "preferred_geography" varchar(255);--> statement-breakpoint
ALTER TABLE "investor_profiles" ADD COLUMN "max_ticket_size" numeric;--> statement-breakpoint
ALTER TABLE "investor_profiles" ADD COLUMN "is_identity_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "business_profiles" DROP COLUMN IF EXISTS "bio";