import { DocumentsWorkspace } from "@/features/emr/documents/components/DocumentsWorkspace";
import { AppShell } from "@/features/emr/shell/AppShell";
import { PatientHeader } from "@/features/emr/shell/PatientHeader";

export default function DocsPage() {
  return (
    <AppShell active="docs" showPromo={false}>
      <PatientHeader
        tab="docs"
        meta="الموظفين يقدروا يعملوا سكان ويسمّوا الملفات ويكتبوا القيم الأساسية. الملاحظات الطبية للدكتور بس."
      />
      <DocumentsWorkspace />
    </AppShell>
  );
}
