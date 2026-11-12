import { describe, expect, it } from "vitest";
import type { IntakeForm } from "@/lib/api/emr/intake";
import { formStatusText } from "./answers";
import { pickForms } from "./forms";

const form = (kind: "full" | "followup", status: IntakeForm["status"]) =>
  ({ id: `${kind}-${status}`, kind, status, sent_at: null, sent_via: "email", opened_at: null, submitted_at: "2026-10-12T08:00:00Z" }) as unknown as IntakeForm;

describe("pickForms", () => {
  it("keeps the newest form of any kind for the Summary status", () => {
    const forms = [form("followup", "complete"), form("full", "not_started")];
    const picked = pickForms(forms, "full");
    expect(picked.latest?.id).toBe("full-not_started");
    expect(picked.latestAny?.id).toBe("followup-complete");
    expect(formStatusText(picked.latestAny)).toBe("Completed 12 Oct 2026");
  });

  it("finds the newest completed form of the asked kind", () => {
    const picked = pickForms([form("followup", "complete"), form("full", "complete")], "full");
    expect(picked.complete?.id).toBe("full-complete");
  });
});
