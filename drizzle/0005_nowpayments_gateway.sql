DROP INDEX "users_transfi_user_id_uq";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "nowpayments_invoice_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_nowpayments_invoice_id_uq" ON "payments" USING btree ("nowpayments_invoice_id");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "transfi_user_id";
--> statement-breakpoint
UPDATE "payments" SET "pay_url" = NULL, "status" = 'expired', "updated_at" = now() WHERE "status" IN ('pending', 'processing', 'under_review');