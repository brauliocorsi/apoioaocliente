import { describe, expect, it } from "vitest";
import { emailTicketSchema } from "../../supabase/functions/create-ticket-from-email/schema";

const valid = { schema_version: 1, idempotency_key: "synthetic-email-1", client_name: "Cliente sintético", order_number: "TEST-100", subject: "Reclamação", description: "Dados isolados; não enviar." };
describe("email intake contract (isolated validation only)", () => {
  it("requires an order number", () => {
    expect(emailTicketSchema.safeParse({ ...valid, order_number: "   " }).success).toBe(false);
    const { order_number, ...missing } = valid;
    expect(emailTicketSchema.safeParse(missing).success).toBe(false);
  });
  it("accepts only priorities P1, P2, P3 with P2 default", () => {
    expect(emailTicketSchema.parse(valid).priority).toBe("P2");
    expect(emailTicketSchema.safeParse({ ...valid, priority: "P4" }).success).toBe(false);
  });
  it("rejects supplied identity and ticket numbers", () => {
    expect(emailTicketSchema.safeParse({ ...valid, created_by: "other-user" }).success).toBe(false);
    expect(emailTicketSchema.safeParse({ ...valid, ticket_number: 123 }).success).toBe(false);
  });
  it("requires schema version 1", () => {
    expect(emailTicketSchema.safeParse({ ...valid, schema_version: 2 }).success).toBe(false);
  });
  it("does not invent email or phone", () => {
    const result = emailTicketSchema.parse(valid);
    expect(result.client_email).toBeUndefined();
    expect(result.client_phone).toBeUndefined();
  });
  it("bounds email data and requires an idempotency key", () => {
    expect(emailTicketSchema.safeParse({ ...valid, description: "x".repeat(60001) }).success).toBe(false);
    expect(emailTicketSchema.safeParse({ ...valid, idempotency_key: "" }).success).toBe(false);
  });
});