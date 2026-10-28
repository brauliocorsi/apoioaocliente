import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTicketSlaStatus, calcRemaining } from "@/components/ticket/SlaDashboard";
describe("SLA risk alerts", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-28T12:00:00Z")); });
  afterEach(() => vi.useRealTimers());
  const base = { resolved_at: null, sla_paused_at: null, sla_paused_total_seconds: 0 };
  it("warns within the existing two-hour notification window", () => {
    expect(getTicketSlaStatus({ ...base, sla_resolution_at: "2026-10-28T14:00:00Z" })).toBe("at_risk");
    expect(getTicketSlaStatus({ ...base, sla_resolution_at: "2026-10-28T14:00:01Z" })).toBe("on_track");
  });
  it("recognizes overdue and resolved tickets", () => {
    expect(getTicketSlaStatus({ ...base, sla_resolution_at: "2026-10-28T11:59:00Z" })).toBe("breached");
    expect(getTicketSlaStatus({ ...base, resolved_at: "2026-10-28T11:00:00Z", sla_resolution_at: "2026-10-28T11:59:00Z" })).toBe("completed");
  });
  it("freezes remaining time while waiting for the customer", () => {
    expect(calcRemaining("2026-10-28T14:00:00Z", 0, "2026-10-28T11:00:00Z")).toBe(10800000);
    vi.advanceTimersByTime(3600000);
    expect(calcRemaining("2026-10-28T14:00:00Z", 0, "2026-10-28T11:00:00Z")).toBe(10800000);
  });
});