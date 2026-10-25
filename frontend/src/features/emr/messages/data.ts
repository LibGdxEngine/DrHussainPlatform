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
    who: "د. جوهر ← ليلى",
    when: "3 أكتوبر 2026 14:10",
    text: "نتايج الدم طلعت. مخزون الحديد واطي شوية؛ التفاصيل مرفقة. كل حاجة تانية في المعدل الكويس.",
    att: ["نتايج التحاليل 3 أكتوبر.pdf"],
  },
  { from: "pt", who: "ليلى ← د. جوهر", when: "4 أكتوبر 2026 08:32", text: "شكراً. أبدأ مكمّل حديد؟", att: [] },
];

export const initialDraft =
  "أيوه. ابدأي ferrous sulfate 200 مجم يوم بعد يوم مع عصير برتقان. هنعيد الفيريتين بعد 3 شهور. الروشتة مرفقة.";

export const attachmentOptions = [
  { id: "rx", name: "روشتة 13 أكتوبر" },
  { id: "lab", name: "نتايج 3 أكتوبر" },
  { id: "letter", name: "جواب النتايج" },
] as const;

export type AttachmentId = (typeof attachmentOptions)[number]["id"];

export const initialAttachments: Partial<Record<AttachmentId, boolean>> = { rx: true };

export const SENT_WHO = "د. جوهر ← ليلى";
export const SENT_WHEN = "13 أكتوبر 2026 · دلوقتي";

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
  { initial: "ل", name: "ليلى أحمد", date: "12 أكتوبر", preview: "أبدأ مكمّل حديد؟", tone: "brand", unread: true, active: true },
  { initial: "ن", name: "نور صالح", date: "11 أكتوبر", preview: "اللزقة بتقع بالليل على طول.", tone: "warn", unread: true },
  { initial: "ر", name: "رانيا مصطفى", date: "8 أكتوبر", preview: "إنت: تقرير DEXA مرفق.", tone: "neutral" },
  { initial: "م", name: "منى عادل", date: "2 أكتوبر", preview: "إنت: نتيجة المسحة طبيعية.", tone: "neutral" },
];
