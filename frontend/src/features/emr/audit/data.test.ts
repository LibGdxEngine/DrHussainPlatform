import { describe, expect, it } from "vitest";
import { memberControls } from "./data";

const owner = { role: "OWNER" as const, is_lead: true };
const admin = { role: "ADMIN" as const, is_lead: true };
const staff = { role: "MEMBER" as const, is_lead: false };

describe("memberControls", () => {
  it("gives clinic staff a read-only list", () => {
    expect(memberControls(staff, { role: "MEMBER", is_me: false })).toEqual({ roleOptions: [], canRemove: false });
    expect(memberControls(null, { role: "MEMBER", is_me: false })).toEqual({ roleOptions: [], canRemove: false });
  });

  it("never offers changes to yourself", () => {
    expect(memberControls(owner, { role: "OWNER", is_me: true })).toEqual({ roleOptions: [], canRemove: false });
  });

  it("lets only owners touch owners or make owners", () => {
    expect(memberControls(admin, { role: "OWNER", is_me: false })).toEqual({ roleOptions: [], canRemove: false });
    expect(memberControls(admin, { role: "MEMBER", is_me: false })).toEqual({ roleOptions: ["ADMIN", "MEMBER"], canRemove: true });
    expect(memberControls(owner, { role: "OWNER", is_me: false })).toEqual({
      roleOptions: ["OWNER", "ADMIN", "MEMBER"], canRemove: true,
    });
  });
});
