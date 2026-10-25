"use client";

import { useState } from "react";
import type { VisitKey } from "../../journey/data";
import { ChipGroup } from "../../ui/ChipGroup";
import { scanTabs, type ScanTab } from "../data";
import { BulkScan } from "./BulkScan";
import { VisitScan } from "./VisitScan";

interface ScanStationProps {
  initialTab?: ScanTab;
  initialMrn?: string;
  initialVisit?: VisitKey;
}

export function ScanStation({ initialTab = "visit", initialMrn, initialVisit }: ScanStationProps) {
  const [tab, setTab] = useState<ScanTab>(initialTab);

  return (
    <>
      <ChipGroup label="Scan type" options={scanTabs} value={tab} onChange={setTab} />
      {tab === "visit" ? <VisitScan initialMrn={initialMrn} initialVisit={initialVisit} /> : <BulkScan />}
    </>
  );
}
