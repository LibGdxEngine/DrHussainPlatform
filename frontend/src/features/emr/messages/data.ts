/** "doc" = sent from the doctor's mailbox; "pt" = received (patient, lab, referring doctor...). */
export interface Message {
  from: "doc" | "pt";
  who: string;
  when: string;
  text: string;
  att: string[];
}

export type MailProvider = "google" | "microsoft" | "imap";

/** The doctor's own mailbox, synced into the platform. */
export interface MailboxAccount {
  address: string;
  provider: MailProvider;
  lastSync: string;
  connectedSince: string;
}

export const mailProviders: { id: MailProvider; label: string; hint: string }[] = [
  { id: "google", label: "Google (Gmail)", hint: "Sign in with Google. No password is stored in the platform." },
  { id: "microsoft", label: "Microsoft (Outlook / 365)", hint: "Sign in with Microsoft. No password is stored in the platform." },
  { id: "imap", label: "Other (IMAP)", hint: "Any mailbox that supports IMAP, using an app password." },
];

export const initialMailbox: MailboxAccount = {
  address: "hsgohar@gmail.com",
  provider: "google",
  lastSync: "2 min ago",
  connectedSince: "1 Oct 2026",
};

export type FolderId = "inbox" | "sent" | "drafts" | "archive" | "spam";

export const folders: { id: FolderId; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "sent", label: "Sent" },
  { id: "drafts", label: "Drafts" },
  { id: "archive", label: "Archive" },
  { id: "spam", label: "Spam" },
];

export type InboxFilter = "all" | "unread" | "patients" | "unmatched";

export const inboxFilters: { id: InboxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "patients", label: "Patients" },
  { id: "unmatched", label: "Not matched" },
];

export interface PatientRef {
  mrn: string;
  name: string;
}

export interface EmailThread {
  id: string;
  folder: FolderId;
  subject: string;
  contact: { name: string; email: string; initial: string };
  /** Set when the sender's address matches a patient file (or staff matched it by hand). */
  patient?: PatientRef;
  /** Likely patient when the address is unknown (name or MRN found in the email). */
  suggestion?: PatientRef;
  date: string;
  preview: string;
  unread?: boolean;
  messages: Message[];
}

const laila: PatientRef = { mrn: "VC-000142", name: "Laila Ahmed" };
const heba: PatientRef = { mrn: "VC-000131", name: "Heba Youssef" };

export const initialThreads: EmailThread[] = [
  {
    id: "t-laila",
    folder: "inbox",
    subject: "Blood results",
    contact: { name: "Laila Ahmed", email: "l.ahmed74@gmail.com", initial: "L" },
    patient: laila,
    date: "12 Oct",
    preview: "Here is the lipid panel you asked for before Visit 2.",
    unread: true,
    messages: [
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
    ],
  },
  {
    id: "t-nour",
    folder: "inbox",
    subject: "Patch problem",
    contact: { name: "Nour Saleh", email: "nour.saleh@outlook.com", initial: "N" },
    patient: { mrn: "VC-000118", name: "Nour Saleh" },
    date: "11 Oct",
    preview: "The patch keeps falling off at night.",
    unread: true,
    messages: [
      { from: "pt", who: "Nour → Dr. Gohar", when: "11 Oct 2026 22:40", text: "The patch keeps falling off at night. Is there another option?", att: [] },
    ],
  },
  {
    id: "t-salma",
    folder: "inbox",
    subject: "My old ultrasound reports",
    contact: { name: "s.nabil94", email: "s.nabil94@yahoo.com", initial: "S" },
    suggestion: { mrn: "VC-000174", name: "Salma Nabil" },
    date: "11 Oct",
    preview: "Dr. Gohar asked me to send my old reports. I'm Salma Nabil, file VC-000174.",
    unread: true,
    messages: [
      {
        from: "pt",
        who: "s.nabil94 → Dr. Gohar",
        when: "11 Oct 2026 19:12",
        text: "Dr. Gohar asked me to send my old reports before my visit. I'm Salma Nabil, file VC-000174.",
        att: ["Ultrasound 2024.pdf", "Hormones Mar 2025.jpg"],
      },
    ],
  },
  {
    id: "t-lab",
    folder: "inbox",
    subject: "Results ready · Dina Farouk",
    contact: { name: "Al Borg Lab", email: "results@alborglab.com", initial: "A" },
    suggestion: { mrn: "VC-000097", name: "Dina Farouk" },
    date: "10 Oct",
    preview: "Results for Dina Farouk (CBC, ferritin, TSH, β-hCG) are attached.",
    messages: [
      {
        from: "pt",
        who: "Al Borg Lab → Dr. Gohar",
        when: "10 Oct 2026 16:05",
        text: "Results for Dina Farouk (CBC, ferritin, TSH, β-hCG) are attached.",
        att: ["Dina Farouk results 10 Oct.pdf"],
      },
    ],
  },
  {
    id: "t-referral",
    folder: "inbox",
    subject: "Referral: Heba Youssef, HRT review",
    contact: { name: "Dr. Karim Nassar", email: "k.nassar@clinicmail.com", initial: "K" },
    patient: heba,
    date: "9 Oct",
    preview: "I'm referring Mrs Heba Youssef for her annual HRT review.",
    messages: [
      {
        from: "pt",
        who: "Dr. Karim Nassar → Dr. Gohar",
        when: "9 Oct 2026 11:20",
        text: "I'm referring Mrs Heba Youssef for her annual HRT review. Last mammogram and notes attached.",
        att: ["Referral letter.pdf"],
      },
    ],
  },
  {
    id: "t-rania",
    folder: "inbox",
    subject: "DEXA report",
    contact: { name: "Rania Mostafa", email: "rania.m@gmail.com", initial: "R" },
    patient: { mrn: "VC-000189", name: "Rania Mostafa" },
    date: "8 Oct",
    preview: "You: DEXA report attached.",
    messages: [
      { from: "pt", who: "Rania → Dr. Gohar", when: "7 Oct 2026 10:02", text: "Could you send me my DEXA report?", att: [] },
      { from: "doc", who: "Dr. Gohar → Rania", when: "8 Oct 2026 09:15", text: "DEXA report attached.", att: ["DEXA Sep 2026.pdf"] },
    ],
  },
  {
    id: "t-journal",
    folder: "inbox",
    subject: "October journal: new HRT guidance",
    contact: { name: "Menopause Society", email: "news@menopausesociety.org", initial: "M" },
    date: "5 Oct",
    preview: "This month: updated HRT guidance and a review of non-hormonal options.",
    messages: [
      {
        from: "pt",
        who: "Menopause Society → Dr. Gohar",
        when: "5 Oct 2026 07:00",
        text: "This month: updated HRT guidance and a review of non-hormonal options.",
        att: [],
      },
    ],
  },
  {
    id: "t-mona",
    folder: "sent",
    subject: "Your smear result",
    contact: { name: "Mona Adel", email: "mona.adel@gmail.com", initial: "M" },
    patient: { mrn: "VC-000156", name: "Mona Adel" },
    date: "2 Oct",
    preview: "You: Your smear result is normal.",
    messages: [
      { from: "doc", who: "Dr. Gohar → Mona", when: "2 Oct 2026 13:40", text: "Your smear result is normal. Next one in 3 years.", att: [] },
    ],
  },
  {
    id: "t-draft",
    folder: "drafts",
    subject: "Before your HRT review",
    contact: { name: "Heba Youssef", email: "heba.y@gmail.com", initial: "H" },
    patient: heba,
    date: "13 Oct",
    preview: "Draft: please fill in the form before your visit.",
    messages: [],
  },
  {
    id: "t-archive",
    folder: "archive",
    subject: "Booking a first visit",
    contact: { name: "Laila Ahmed", email: "l.ahmed74@gmail.com", initial: "L" },
    patient: laila,
    date: "2 Oct",
    preview: "I'd like to book a first visit, please.",
    messages: [
      { from: "pt", who: "Laila → Dr. Gohar", when: "2 Oct 2026 09:05", text: "I'd like to book a first visit, please.", att: [] },
    ],
  },
  {
    id: "t-spam",
    folder: "spam",
    subject: "Exclusive offer on clinic furniture",
    contact: { name: "Promo", email: "deals@promo-mail.net", initial: "P" },
    date: "6 Oct",
    preview: "Save 40% this week only.",
    messages: [{ from: "pt", who: "Promo → Dr. Gohar", when: "6 Oct 2026 03:12", text: "Save 40% this week only.", att: [] }],
  },
];

/** Pure filter for the inbox list; keeps the client components free of logic. */
export function filterThreads(
  list: EmailThread[],
  folder: FolderId,
  filter: InboxFilter,
  query: string,
  patientMrn?: string,
) {
  const q = query.trim().toLowerCase();
  return list
    .filter((t) => t.folder === folder)
    .filter((t) => !patientMrn || t.patient?.mrn === patientMrn)
    .filter((t) => {
      if (filter === "unread") return !!t.unread;
      if (filter === "patients") return !!t.patient;
      if (filter === "unmatched") return !t.patient;
      return true;
    })
    .filter(
      (t) =>
        !q ||
        `${t.subject} ${t.contact.name} ${t.contact.email} ${t.preview} ${t.patient?.name ?? ""} ${t.patient?.mrn ?? ""}`
          .toLowerCase()
          .includes(q),
    );
}

export function unreadCount(list: EmailThread[], folder: FolderId) {
  return list.filter((t) => t.folder === folder && t.unread).length;
}

export const initialDraft =
  "Yes. Start ferrous sulfate 200 mg every other day with orange juice. We will recheck your ferritin in 3 months. Prescription attached.";

export const attachmentOptions = [
  { id: "rx", name: "Prescription 13 Oct" },
  { id: "lab", name: "Results 3 Oct" },
  { id: "letter", name: "Results letter" },
] as const;

export type AttachmentId = (typeof attachmentOptions)[number]["id"];

export const initialAttachments: Partial<Record<AttachmentId, boolean>> = { rx: true };

export const SENT_WHEN = "13 Oct 2026 · just now";
