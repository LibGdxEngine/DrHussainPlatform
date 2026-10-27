import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/emr/errors";
import { addTests, issueErrorMessage, orderBody, setTests, testCode, testSets, testsTitle } from "./data";

describe("test checklist", () => {
  it("adds a set once, re-ticking tests already listed", () => {
    const first = addTests([], setTests(testSets[4]));
    const unticked = first.map((t) => (t.code === "cbc" ? { ...t, checked: false } : t));
    const again = addTests(unticked, setTests(testSets[0]));
    expect(again.filter((t) => t.code === "cbc")).toEqual([{ code: "cbc", name: "CBC", checked: true }]);
    expect(again.slice(0, 5).map((t) => t.code)).toEqual(testSets[4].ids);
  });

  it("names the request after whole sets, else counts tests", () => {
    expect(testsTitle(addTests([], setTests(testSets[6])))).toBe("Lab request: Infections / STIs");
    expect(testsTitle([{ code: "tsh", name: "TSH", checked: true }, { code: "b12", name: "B12", checked: false }]))
      .toBe("Lab request: 1 test");
  });

  it("makes a slug code for a typed test", () => {
    expect(testCode("Anti-Müllerian hormone (AMH)")).toBe("anti_mullerian_hormone_amh");
    expect(testCode("  ")).toBe("other");
    expect(testCode("فيتامين د")).toMatch(/^test_[a-z0-9]+$/);
    expect(testCode("فيتامين د")).not.toBe(testCode("فيتامين ب"));
  });
});

describe("orderBody", () => {
  const tests = [{ code: "tsh", name: "TSH", checked: true }, { code: "b12", name: "B12", checked: false }];

  it("sends only ticked tests and the lab address for email to the lab", () => {
    expect(orderBody({ patient: "p1", kind: "tests", delivery: "email_lab", labEmail: " lab@x.test ", title: "T", tests }))
      .toEqual({ patient: "p1", kind: "tests", title: "T", delivery: "email", notes: "", sent_to: "lab@x.test", tests: [{ code: "tsh", name: "TSH" }] });
  });

  it("leaves sent_to out for email to the patient and keeps catalog links on medicines", () => {
    const body = orderBody({
      patient: "p1", kind: "prescription", delivery: "email_patient", title: "Prescription", labEmail: "lab@x.test",
      medicines: [{ prescription_item: "c1", drug: "Estriol ", dose: "0.5 g", directions: "nightly" }],
    });
    expect(body.delivery).toBe("email");
    expect(body.sent_to).toBeUndefined();
    expect(body.tests).toBeUndefined();
    expect(body.medicines).toEqual([{ prescription_item: "c1", drug: "Estriol", dose: "0.5 g", directions: "nightly" }]);
  });

  it("passes print and in-clinic through", () => {
    expect(orderBody({ patient: "p1", kind: "tests", delivery: "in_clinic", title: "T", tests }).delivery).toBe("in_clinic");
  });
});

describe("issueErrorMessage", () => {
  it("adds field messages and a mailbox hint", () => {
    const err = new ApiError("Check the form.", 400, "VALIDATION_ERROR", { sent_to: ["Enter a valid email address."] });
    expect(issueErrorMessage(err, "x")).toBe("Check the form. Enter a valid email address.");
    const mailbox = new ApiError("No mailbox.", 409, "MAILBOX_NOT_READY");
    expect(issueErrorMessage(mailbox, "x")).toContain("choose Print");
  });

  it("falls back for network errors", () => {
    expect(issueErrorMessage(new ApiError("offline", 0, "NETWORK"), "Try again.")).toBe("Try again.");
    expect(issueErrorMessage(new Error("boom"), "Try again.")).toBe("Try again.");
  });
});
