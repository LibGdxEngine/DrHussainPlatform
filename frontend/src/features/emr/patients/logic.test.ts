import { describe, expect, it } from "vitest";
import type { SimilarPatient } from "@/lib/api/emr/patients";
import { duplicateHeading, overallMatch, unplacedErrors } from "./logic";

const similar = (match: "exact" | "near"): SimilarPatient => ({
  id: "1",
  file_number: "F-1",
  full_name: "A B",
  full_name_ar: "",
  date_of_birth: "1990-01-01",
  match,
});

describe("unplacedErrors", () => {
  it("returns non-field errors and unknown fields, not the fields the form shows", () => {
    const errors = unplacedErrors({
      mobile: ["Enter a valid number."],
      non_field_errors: ["Something general."],
      some_other_field: ["Bad."],
    });
    expect(errors).toEqual(["Something general.", "some other field: Bad."]);
  });

  it("is empty when every error has its own line", () => {
    expect(unplacedErrors({ whatsapp: ["x"], referring_doctor: ["y"], first_contact_channel: ["z"] })).toEqual([]);
  });
});

describe("overallMatch", () => {
  it("prefers the server's match", () => {
    expect(overallMatch([similar("near")], "exact")).toBe("exact");
  });

  it("is exact when any file is exact, otherwise near", () => {
    expect(overallMatch([similar("near"), similar("exact")])).toBe("exact");
    expect(overallMatch([similar("near")])).toBe("near");
  });

  it("has distinct headings", () => {
    expect(duplicateHeading.exact).not.toBe(duplicateHeading.near);
  });
});
