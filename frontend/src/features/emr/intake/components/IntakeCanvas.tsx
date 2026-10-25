"use client";

import { useState } from "react";
import { defaultReasonIds } from "../data";
import { modulesFor, toggleInSet, totalSteps } from "../logic";
import { CycleStep } from "./CycleStep";
import { FollowUpStep } from "./FollowUpStep";
import { LinkStep } from "./LinkStep";
import { MrsStep } from "./MrsStep";
import { ReasonStep } from "./ReasonStep";

/**
 * The five patient phone screens. Picked reasons are shared state because they
 * decide how many steps (and what progress) the other screens show.
 */
export function IntakeCanvas() {
  const [reasons, setReasons] = useState<ReadonlySet<string>>(() => new Set(defaultReasonIds));
  const modules = modulesFor(reasons);
  const steps = totalSteps(modules);

  return (
    <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-start lg:overflow-x-auto lg:pb-4">
      <LinkStep />
      <ReasonStep
        selected={reasons}
        onToggle={(id) => setReasons((prev) => toggleInSet(prev, id))}
        modules={modules}
        totalSteps={steps}
      />
      <CycleStep totalSteps={steps} />
      <MrsStep totalSteps={steps} />
      <FollowUpStep />
    </div>
  );
}
