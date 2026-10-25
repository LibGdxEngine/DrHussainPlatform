import { Suspense } from "react";
import { SessionGuard } from "./SessionGuard";
import { Sidebar, type SidebarKey } from "./Sidebar";
import { Topbar } from "./Topbar";

interface AppShellProps {
  active: SidebarKey;
  /** Content of the left side of the top bar. Omit to render the screen without a top bar. */
  topbarStart?: React.ReactNode;
  showMessages?: boolean;
  showPromo?: boolean;
  doctorSubtitle?: string;
  doctorMono?: boolean;
  children: React.ReactNode;
}

/**
 * Sidebar + top bar frame used by all signed-in screens.
 * Screens render their body as children; they never repeat the chrome.
 */
export function AppShell({
  active,
  topbarStart,
  showMessages,
  showPromo = true,
  doctorSubtitle,
  doctorMono,
  children,
}: AppShellProps) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px] gap-4 bg-canvas p-4 lg:my-8 lg:min-h-[900px] lg:rounded-[32px] lg:shadow-frame">
      <Suspense fallback={null}>
        <SessionGuard />
      </Suspense>
      <Sidebar active={active} showPromo={showPromo} />
      <main className="flex min-w-0 flex-1 flex-col gap-4">
        {topbarStart ? (
          <Topbar
            start={topbarStart}
            showMessages={showMessages}
            doctorSubtitle={doctorSubtitle}
            doctorMono={doctorMono}
          />
        ) : null}
        {children}
      </main>
    </div>
  );
}
