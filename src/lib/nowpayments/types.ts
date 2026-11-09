import { z } from "zod";

export const nowPaymentsInvoiceRequestSchema = z.object({
  price_amount: z.number().positive(),
  price_currency: z.string().min(3).max(5),
  order_id: z.string().uuid(),
  order_description: z.string().min(1),
  ipn_callback_url: z.string().url(),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});

export type NowPaymentsInvoiceRequest = z.infer<typeof nowPaymentsInvoiceRequestSchema>;

export const nowPaymentsInvoiceResponseSchema = z.object({
  id: z.union([z.string().min(1), z.number().int().positive()]).transform(String),
  invoice_url: z.string().url(),
});

export const nowPaymentsCurrenciesResponseSchema = z.object({
  currencies: z.array(z.string().min(1)),
});

const providerIdSchema = z.union([
  z.string().min(1),
  z.number().int().positive(),
]).transform(String);

export const nowPaymentsWebhookPayloadSchema = z.object({
  payment_id: providerIdSchema,
  payment_status: z.string().min(1),
  order_id: z.string().uuid(),
  price_amount: z.number().positive(),
  price_currency: z.string().min(3).max(5),
  invoice_id: providerIdSchema.optional(),
  error: z.string().nullish(),
}).passthrough();

export type NowPaymentsWebhookPayload = z.infer<typeof nowPaymentsWebhookPayloadSchema>;
