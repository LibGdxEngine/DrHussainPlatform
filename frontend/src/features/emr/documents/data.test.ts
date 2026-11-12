import { describe, expect, it } from "vitest";
import { stillReading } from "./data";

describe("stillReading", () => {
  it("keeps files still at their upload-time version and drops the ones that changed or vanished", () => {
    const watching = { a: "t1", b: "t1", c: "t1" };
    const documents = [
      { id: "a", updated_at: "t1" },
      { id: "b", updated_at: "t2" },
    ];
    expect(stillReading(watching, documents)).toEqual({ a: "t1" });
  });
});
