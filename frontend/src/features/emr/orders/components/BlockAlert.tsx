import Link from "next/link";
import { Pill } from "@/features/emr/ui/Pill";
import { emrRoutes } from "@/features/emr/routes";
import type { PrescriptionBlock } from "../data";

export function BlockAlert({ block }: { block: PrescriptionBlock }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-danger-tint px-4 py-3.5">
      <Pill tone="red" size="xs" className="flex-none">{block.tag}</Pill>
      <div className="flex flex-col gap-1 text-[13px] leading-relaxed">
        <strong className="text-sm font-semibold">{block.title}</strong>
        <span className="text-ink-3">{block.text}</span>
      </div>
      <Link
        href={emrRoutes[block.target]}
        className="ms-auto inline-flex min-h-[34px] flex-none items-center rounded-full border border-ink bg-white px-3 text-xs font-semibold text-ink no-underline"
      >
        {block.action}
      </Link>
    </div>
  );
}
