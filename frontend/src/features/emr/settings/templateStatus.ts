import type { EmailTemplate } from "@/lib/api/emr/content";

/** Which version of a template drafts use, and whether newer wording is waiting for approval. */
export function templateStatus(template: EmailTemplate): { tone: "ok" | "amber" | "danger"; text: string } {
  if (!template.approved) return { tone: "danger", text: "Not approved" };
  if (template.latest && template.latest.number !== template.approved.number) {
    return { tone: "amber", text: `v${template.approved.number} approved · v${template.latest.number} draft` };
  }
  return { tone: "ok", text: `v${template.approved.number} approved` };
}

/** Opens one template in the templates editor. */
export const templateHref = (base: string, id: string) => `${base}?template=${encodeURIComponent(id)}`;
