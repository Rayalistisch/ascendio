import { Suspense } from "react";
import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 gap-10">
      <aside className="w-48 shrink-0">
        <Suspense>
          <SettingsNav />
        </Suspense>
      </aside>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
