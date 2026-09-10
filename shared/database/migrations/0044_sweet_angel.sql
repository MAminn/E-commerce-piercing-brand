ALTER TYPE "public"."order_log_action" ADD VALUE 'payment_confirmed';--> statement-breakpoint
ALTER TYPE "public"."order_log_action" ADD VALUE 'payment_failed';--> statement-breakpoint
ALTER TYPE "public"."order_log_action" ADD VALUE 'bosta_sent';--> statement-breakpoint
ALTER TYPE "public"."order_log_action" ADD VALUE 'bosta_send_failed';--> statement-breakpoint
ALTER TYPE "public"."order_log_action" ADD VALUE 'bosta_skipped';--> statement-breakpoint
ALTER TYPE "public"."order_log_action" ADD VALUE 'bosta_cancelled';--> statement-breakpoint
ALTER TYPE "public"."order_log_action" ADD VALUE 'bosta_status_updated';