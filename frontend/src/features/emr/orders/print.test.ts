import { expect, it } from "vitest";
import type { Order } from "@/lib/api/emr/orders";
import { printableOrderHtml } from "./print";

const base: Order = {
  id: "o1", patient: "p1", appointment: null, kind: "prescription", title: "Prescription", delivery: "print",
  sent_to: "", notes: "Review in <3> months", tests: [], issued_by_name: "Dr. Gohar", email_status: "",
  created_at: "2026-10-27T09:00:00Z",
  medicines: [{ id: "m1", drug: "Estradiol <gel>", dose: "0.06%", directions: "2 pumps daily" }],
};
const patient = { full_name: "Laila & Co", file_number: "VC-000007", date_of_birth: "1974-03-02" };

it("prints the patient, medicines and notes, escaped", () => {
  const html = printableOrderHtml(base, patient, "V-Clinic");
  expect(html).toContain("Laila &amp; Co");
  expect(html).toContain("<strong>Estradiol &lt;gel&gt;</strong> 0.06%");
  expect(html).toContain("2 pumps daily");
  expect(html).toContain("Review in &lt;3&gt; months");
  expect(html).toContain("born 2 Mar 1974");
});

it("lists tests for a lab request", () => {
  const order: Order = {
    ...base, kind: "tests", title: "Lab request: 1 test", medicines: [], notes: "",
    tests: [{ id: "t1", patient: "p1", order: "o1", order_title: "", requested_at: "", patient_name: "Test patient", file_number: "VC-000001", code: "tsh", name: "TSH", status: "pending", arrived_at: null, document: null }],
  };
  const html = printableOrderHtml(order, patient, "V-Clinic");
  expect(html).toContain("Tests requested");
  expect(html).toContain("<li>TSH</li>");
  expect(html).not.toContain('class="notes"');
});
