"use client";

import { useState } from "react";
import { ChipGroup } from "../../ui/ChipGroup";
import { scanTabs, type ScanTab } from "../data";
import { BulkScan } from "./BulkScan";
import { VisitScan } from "./VisitScan";

interface ScanStationProps {
  initialTab?: ScanTab;
  /** `?patient=VC-…`: open the visit scan on this patient. */
  initialFileNumber?: string;
}

export function ScanStation({ initialTab = "visit", initialFileNumber }: ScanStationProps) {
  const [tab, setTab] = useState<ScanTab>(initialTab);

  return (
    <>
      <ChipGroup label="Scan type" options={scanTabs} value={tab} onChange={setTab} />
      {/* Both stay mounted so files chosen on one tab are not lost by switching. */}
      <div hidden={tab !== "visit"}>
        <VisitScan initialFileNumber={initialFileNumber} />
      </div>
      <div hidden={tab !== "bulk"}>
        <BulkScan />
      </div>
    </>
  );
}
