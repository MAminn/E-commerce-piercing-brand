import { DashboardSidebar } from "#root/components/dashboard/DashboardSidebar";
import { Link } from "#root/components/utils/Link";
import { Button } from "#root/components/ui/button.jsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card.jsx";
import {
  SidebarProvider,
  SidebarTrigger,
} from "#root/components/ui/sidebar.jsx";
import { Tabs, TabsList, TabsTrigger } from "#root/components/ui/tabs.jsx";
import { usePageContext } from "vike-react/usePageContext";
import { RoleProvider, useRole } from "#root/lib/context/RoleContext";
import { STORE_NAME } from "#root/shared/config/branding";
import { HomeIcon, Home, Menu } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleProvider>
      <Content>{children}</Content>
    </RoleProvider>
  );
}

function Content({ children }: { children: React.ReactNode }) {
  const pageContext = usePageContext();
  const pathname = pageContext.urlPathname;
  const { userRole } = useRole();

  const getActiveTab = () => {
    if (pathname === "/dashboard" || pathname === "/dashboard/overview") {
      return "overview";
    }
    if (pathname.includes("/dashboard/orders")) {
      return "orders";
    }
    if (pathname.includes("/dashboard/categories")) {
      return "categories";
    }
    if (pathname.includes("/dashboard/products")) {
      return "products";
    }
    if (pathname.includes("/dashboard/reviews")) {
      return "reviews";
    }
    if (pathname.includes("/dashboard/users")) {
      return "users";
    }
    if (pathname.includes("/dashboard/admin/homepage")) {
      return "homepage";
    }
    if (pathname.includes("/dashboard/admin/templates")) {
      return "templates";
    }
    if (pathname.includes("/dashboard/admin/pixels")) {
      return "pixels";
    }
    if (pathname.includes("/dashboard/settings")) {
      return "settings";
    }
    return "overview";
  };

  const activeTab = getActiveTab();

  const tabs = [
    {
      label: "Overview",
      href: "/dashboard",
    },
    ...(userRole === "admin"
      ? [
          {
            label: "Categories",
            href: "/dashboard/categories",
          },
          {
            label: "Homepage",
            href: "/dashboard/admin/homepage",
          },
          {
            label: "Templates",
            href: "/dashboard/admin/templates",
          },
          {
            label: "Pixels",
            href: "/dashboard/admin/pixels",
          },
          {
            label: "Settings",
            href: "/dashboard/settings",
          },
          {
            label: "Users",
            href: "/dashboard/users",
          },
        ]
      : []),
    {
      label: "Products",
      href: "/dashboard/products",
    },
    {
      label: "Orders",
      href: "/dashboard/orders",
    },
  ];

  return (
    <main className='flex-1 w-full h-full'>
      <SidebarProvider>
        <div className='flex w-full h-full'>
          <DashboardSidebar />
          <section className='h-full w-full flex-1 min-w-0 overflow-x-hidden'>
            <header className='z-50 flex flex-col bg-neutral-100 dark:bg-neutral-900 w-full p-1 sticky top-0'>
              <div className='flex items-center justify-between w-full px-4'>
                <div className='flex items-center'>
                  <SidebarTrigger />
                  <Tabs className='ml-4 hidden lg:flex ' value={activeTab}>
                    <TabsList>
                      {tabs.map((tab) => (
                        <TabsTrigger
                          key={tab.href}
                          value={tab.href.split("/").pop() || ""}
                          asChild>
                          <Link href={tab.href}>{tab.label}</Link>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
                {/* Commented out because of conflict between templates and brands Ps: ana 3mltlo comment 3shan msh mohem awe bdl ma SYNT ytl3lo Perce */}
                {/* <Link href='/' className='text-2xl font-light tracking-tight'>
                  {STORE_NAME}
                </Link> */}
                <div className='flex items-center gap-2'>
                  <Link href='/'>
                    <Button variant='outline' className='hidden lg:block'>
                      Return to Home
                    </Button>
                    <Button variant='outline' className='block lg:hidden'>
                      <HomeIcon />
                    </Button>
                  </Link>
                </div>
              </div>
              {userRole === "admin" && (
                <div className='bg-blue-50 dark:bg-blue-900 p-2 text-sm'>
                  <strong>Admin Mode:</strong> You have full access to all
                  products, categories, and orders.
                </div>
              )}
            </header>

            {children}
          </section>
        </div>
      </SidebarProvider>
    </main>
  );
}
