ALTER TABLE "payments" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_id_uq" ON "payments" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "paystack_authorization_url";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "paystack_access_code";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "paystack_channel";