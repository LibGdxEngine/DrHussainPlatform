import { DocumentsWorkspace } from "@/features/emr/documents/components/DocumentsWorkspace";
import { AppShell } from "@/features/emr/shell/AppShell";
import { PatientHeader } from "@/features/emr/shell/PatientHeader";

export default function DocsPage() {
  return (
    <AppShell active="docs" showPromo={false}>
      <PatientHeader
        tab="docs"
        meta="Staff can scan, name files and enter key values. Medical notes are doctor-only."
      />
      <DocumentsWorkspace />
    </AppShell>
  );
}
