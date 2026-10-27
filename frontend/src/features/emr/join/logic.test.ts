import { describe, expect, it } from "vitest";
import { codeDigits, errorLines, invitationProblem, signupProblem } from "./logic";

const ok = { firstName: "Sara", lastName: "Mahmoud", phone: "01012345678", password: "longenough", confirm: "longenough" };

describe("invitationProblem", () => {
  it("lets a pending invitation through and explains the rest", () => {
    expect(invitationProblem("PENDING")).toBeNull();
    expect(invitationProblem("ACCEPTED")?.title).toMatch(/already used/);
    expect(invitationProblem("DECLINED")?.title).toMatch(/withdrawn/);
    expect(invitationProblem("EXPIRED")?.title).toMatch(/expired/);
    expect(invitationProblem("NOT_FOUND")?.title).toMatch(/not valid/);
  });
});

describe("signupProblem", () => {
  it("checks names, phone and password before sending", () => {
    expect(signupProblem(ok)).toBeNull();
    expect(signupProblem({ ...ok, firstName: " " })).toMatch(/first name/);
    expect(signupProblem({ ...ok, phone: "" })).toMatch(/WhatsApp/);
    expect(signupProblem({ ...ok, password: "short", confirm: "short" })).toMatch(/8 characters/);
    expect(signupProblem({ ...ok, confirm: "different!" })).toMatch(/do not match/);
  });
});

describe("errorLines", () => {
  it("lists form-wide errors first, then field errors", () => {
    expect(errorLines({
      message: "Please correct the highlighted fields.",
      fields: { phone: ["Invalid phone."], non_field_errors: ["An account with this email address already exists."] },
    })).toEqual(["An account with this email address already exists.", "Invalid phone."]);
  });
  it("falls back to the message", () => {
    expect(errorLines({ message: "Too many requests.", fields: {} })).toEqual(["Too many requests."]);
  });
});

describe("codeDigits", () => {
  it("keeps digits only", () => {
    expect(codeDigits(" 12-34 56 ")).toBe("123456");
    expect(codeDigits("1234567890")).toBe("12345678");
  });
});
