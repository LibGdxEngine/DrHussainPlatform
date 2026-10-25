export function DropZone() {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-3xl border-2 border-dashed border-hatch bg-brand-wash p-[22px] text-center">
      {/* Upload glyph is local: the shared icon set has no equivalent. */}
      <svg
        aria-hidden="true"
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-brand"
      >
        <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </svg>
      <strong className="text-[15px] font-semibold">Drop scans here</strong>
      <span className="text-[13px] text-muted">PDF, JPG or PNG. Choose the category, date and name after uploading.</span>
    </div>
  );
}
