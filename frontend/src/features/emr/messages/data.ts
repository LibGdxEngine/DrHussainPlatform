export interface Message {
  from: "doc" | "pt";
  who: string;
  when: string;
  text: string;
  att: string[];
}

export const initialMessages: Message[] = [
  {
    from: "doc",
    who: "Dr. Gohar → Laila",
    when: "3 Oct 2026 14:10",
    text: "Your blood results are back. Your iron stores are a little low; details attached. Everything else is in a good range.",
    att: ["Lab results 3 Oct.pdf"],
  },
  { from: "pt", who: "Laila → Dr. Gohar", when: "4 Oct 2026 08:32", text: "Thank you. Should I start an iron supplement?", att: [] },
  {
    from: "pt",
    who: "Laila → Dr. Gohar",
    when: "12 Oct 2026 21:05",
    text: "Here is the lipid panel you asked for before Visit 2.",
    att: ["Lipid panel 11-10.jpg"],
  },
];

export const initialDraft =
  "Yes. Start ferrous sulfate 200 mg every other day with orange juice. We will recheck your ferritin in 3 months. Prescription attached.";

export const attachmentOptions = [
  { id: "rx", name: "Prescription 13 Oct" },
  { id: "lab", name: "Results 3 Oct" },
  { id: "letter", name: "Results letter" },
] as const;

export type AttachmentId = (typeof attachmentOptions)[number]["id"];

export const initialAttachments: Partial<Record<AttachmentId, boolean>> = { rx: true };

export const SENT_WHO = "Dr. Gohar → Laila";
export const SENT_WHEN = "13 Oct 2026 · just now";

export type AvatarTone = "brand" | "warn" | "neutral";

export interface Conversation {
  initial: string;
  name: string;
  date: string;
  preview: string;
  tone: AvatarTone;
  unread?: boolean;
  active?: boolean;
}

export const conversations: Conversation[] = [
  { initial: "L", name: "Laila Ahmed", date: "12 Oct", preview: "Should I start an iron supplement?", tone: "brand", unread: true, active: true },
  { initial: "N", name: "Nour Saleh", date: "11 Oct", preview: "The patch keeps falling off at night.", tone: "warn", unread: true },
  { initial: "R", name: "Rania Mostafa", date: "8 Oct", preview: "You: DEXA report attached.", tone: "neutral" },
  { initial: "M", name: "Mona Adel", date: "2 Oct", preview: "You: Your smear result is normal.", tone: "neutral" },
];
