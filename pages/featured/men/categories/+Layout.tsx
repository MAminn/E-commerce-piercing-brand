import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "#root/components/ui/sidebar";
import { AppSidebar } from "#root/components/globals/Sidebar";

export { Layout };

function Layout({ children }: { children: ReactNode }) {
  return (
    <section>
      <SidebarProvider>
        <AppSidebar />
        <SidebarTrigger />
        {children}
      </SidebarProvider>
    </section>
  );
}
