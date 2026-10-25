"use client";

import { useState } from "react";
import { NewPatientForm } from "./NewPatientForm";
import { PatientsBrowser } from "./PatientsBrowser";

/** List and new-patient form side by side; saving a patient reloads the list. */
export function PatientsScreen() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <PatientsBrowser refreshKey={refreshKey} />
      <NewPatientForm onCreated={() => setRefreshKey((key) => key + 1)} />
    </div>
  );
}
