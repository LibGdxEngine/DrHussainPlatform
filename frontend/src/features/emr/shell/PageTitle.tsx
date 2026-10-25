/** Top bar title block for list screens, e.g. "المرضى · 412 ملف". */
export function PageTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-baseline gap-3 ps-2">
      <h1 className="m-0 text-[26px] font-bold">{title}</h1>
      {meta ? <span className="text-sm text-muted">{meta}</span> : null}
    </div>
  );
}
