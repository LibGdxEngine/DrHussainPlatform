import { expect, it, vi } from "vitest";
import { inFlight } from "./inFlight";

it("shares one request between two identical concurrent calls, then fetches again", async () => {
  const start = vi.fn().mockResolvedValue("rows");
  const [a, b] = await Promise.all([inFlight("k", start), inFlight("k", start)]);
  expect(start).toHaveBeenCalledTimes(1);
  expect([a, b]).toEqual(["rows", "rows"]);
  await inFlight("k", start);
  expect(start).toHaveBeenCalledTimes(2);
});
