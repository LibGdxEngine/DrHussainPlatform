import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/emr/errors";
import { canConfirmThirdParty, isThirdPartyConfirm, replyNeedsConfirmation, threadOrigin } from "./data";

const patient = { id: "p", full_name: "A", file_number: "F-1" } as never;

describe("isThirdPartyConfirm", () => {
  it("matches only the THIRD_PARTY_CONFIRM code", () => {
    expect(isThirdPartyConfirm(new ApiError("x", 409, "THIRD_PARTY_CONFIRM"))).toBe(true);
    expect(isThirdPartyConfirm(new ApiError("x", 409, "DUPLICATE_PATIENT"))).toBe(false);
    expect(isThirdPartyConfirm(new Error("x"))).toBe(false);
  });
});

describe("canConfirmThirdParty", () => {
  it("needs both a relation and the tick", () => {
    expect(canConfirmThirdParty("sister", true)).toBe(true);
    expect(canConfirmThirdParty("  ", true)).toBe(false);
    expect(canConfirmThirdParty("sister", false)).toBe(false);
  });
});

describe("threadOrigin", () => {
  it("tells apart the unfiled, third-party, patient and sent-only threads", () => {
    expect(threadOrigin({ patient: null, third_party: false, has_inbound: true })).toBe("unfiled");
    expect(threadOrigin({ patient, third_party: true, has_inbound: true })).toBe("third_party");
    expect(threadOrigin({ patient, third_party: false, has_inbound: true })).toBe("patient");
    expect(threadOrigin({ patient, third_party: false, has_inbound: false })).toBe("sent");
  });
});

describe("replyNeedsConfirmation", () => {
  it("asks up front for a linked third party, otherwise only after the server refuses", () => {
    expect(replyNeedsConfirmation({ third_party: true, third_party_relation: "Sister" }, false)).toBe(true);
    // A relative wrote in the patient's own thread: the reply still goes to the patient's address.
    expect(replyNeedsConfirmation({ third_party: true, third_party_relation: "" }, false)).toBe(false);
    expect(replyNeedsConfirmation({ third_party: false, third_party_relation: "" }, true)).toBe(true);
  });
});
