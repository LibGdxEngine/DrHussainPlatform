import { formatDay } from "@/features/emr/format";
import type { Order } from "@/lib/api/emr/orders";

interface PrintPatient {
  full_name: string;
  file_number: string;
  date_of_birth: string;
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** A standalone, print-friendly page for one lab request or prescription. */
export function printableOrderHtml(order: Order, patient: PrintPatient, clinic: string): string {
  const lines = order.kind === "tests"
    ? order.tests.map((t) => `<li>${escape(t.name)}</li>`)
    : order.medicines.map((m) => [
      `<li><strong>${escape(m.drug)}</strong>${m.dose ? ` ${escape(m.dose)}` : ""}`,
      m.directions ? `<br><span>${escape(m.directions)}</span>` : "",
      "</li>",
    ].join(""));
  const heading = order.kind === "tests" ? "Tests requested" : "Prescription";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escape(order.title)}</title>
<style>
body{font:14px/1.6 system-ui,sans-serif;color:#111;margin:32px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px}
.meta{color:#555;font-size:13px}ul{padding-left:20px}li{margin:6px 0}li span{color:#444}
.notes{white-space:pre-wrap;border-top:1px solid #ccc;padding-top:12px;margin-top:24px}
footer{margin-top:48px;font-size:13px;color:#555}
</style></head><body>
<h1>${escape(clinic)}</h1>
<p class="meta">${escape(order.title)} · ${escape(formatDay(order.created_at))}</p>
<p><strong>${escape(patient.full_name)}</strong> · ${escape(patient.file_number)} · born ${escape(formatDay(patient.date_of_birth))}</p>
<h2>${heading}</h2>
<ul>${lines.join("")}</ul>
${order.notes ? `<p class="notes">${escape(order.notes)}</p>` : ""}
<footer>${order.issued_by_name ? escape(order.issued_by_name) : ""}</footer>
</body></html>`;
}

/** Prints the page from a hidden frame, so the EMR around it is not printed and no pop-up is needed. */
export function printHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Leave time for the print dialog before removing the frame.
    setTimeout(() => frame.remove(), 60_000);
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}
