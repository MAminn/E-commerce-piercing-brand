import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Settings,
  Store,
  LayoutGrid,
  TicketPercent,
  Palette,
  Home,
  Radio,
  PanelTop,
  Link2,
  Star,
  BarChart3,
  Tag,
  Mail,
  Gift,
  Type,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "#root/components/ui/sidebar";
import { Link } from "#root/components/utils/Link";
import { useRole } from "#root/lib/context/RoleContext";
import { isSingleShopMode } from "#root/shared/config/app";
import { usePageContext } from "vike-react/usePageContext";

interface SidebarItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

interface SidebarSection {
  label: string | null;
  items: SidebarItem[];
}

export function DashboardSidebar() {
  const { toggleSidebar } = useSidebar();
  const { userRole } = useRole();
  const { urlPathname } = usePageContext();

  const catalogItems: SidebarItem[] = [
    { label: "Categories", href: "/dashboard/categories", icon: LayoutGrid },
    { label: "Products", href: "/dashboard/products", icon: Package },
    { label: "Orders", href: "/dashboard/orders", icon: ShoppingCart },
    { label: "Promo Codes", href: "/dashboard/promo-codes", icon: TicketPercent },
    { label: "Offers", href: "/dashboard/offers", icon: Tag },
    { label: "Reviews", href: "/dashboard/reviews", icon: Star },
  ];

  if (!isSingleShopMode()) {
    catalogItems.unshift({ label: "Vendors", href: "/dashboard/vendors", icon: Store });
  }

  const adminSections: SidebarSection[] = [
    {
      label: null,
      items: [{ label: "Overview", href: "/dashboard", icon: LayoutDashboard }],
    },
    { label: "Catalog", items: catalogItems },
    { label: "People", items: [{ label: "Users", href: "/dashboard/users", icon: Users }] },
    {
      label: "Storefront",
      items: [
        { label: "Homepage", href: "/dashboard/admin/homepage", icon: Home },
        { label: "Layout", href: "/dashboard/admin/layout-settings", icon: PanelTop },
        { label: "Templates", href: "/dashboard/admin/templates", icon: Palette },
        { label: "Typography", href: "/dashboard/admin/typography", icon: Type },
      ],
    },
    {
      label: "Marketing",
      items: [
        { label: "Pixels & Tracking", href: "/dashboard/admin/pixels", icon: Radio },
        { label: "Marketing Emails", href: "/dashboard/admin/marketing-emails", icon: Mail },
        { label: "Entry Popup", href: "/dashboard/admin/popup", icon: Gift },
        { label: "Analytics", href: "/dashboard/admin/analytics", icon: BarChart3 },
      ],
    },
    {
      label: "General",
      items: [
        { label: "Links Page", href: "/dashboard/settings/links", icon: Link2 },
        { label: "Settings", href: "/dashboard/settings", icon: Settings },
      ],
    },
  ];

  const defaultSections: SidebarSection[] = [
    {
      label: null,
      items: [
        { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
        { label: "Products", href: "/dashboard/products", icon: Package },
        { label: "Orders", href: "/dashboard/orders", icon: ShoppingCart },
      ],
    },
  ];

  const sections = userRole === "admin" ? adminSections : defaultSections;

  const isItemActive = (href: string) =>
    href === "/dashboard" ? urlPathname === href : urlPathname.startsWith(href);

  return (
    <Sidebar collapsible='icon' className='h-full border-none'>
      <SidebarHeader className='flex justify-between'>
        <h1 className='font-bold text-lg group-data-[state=collapsed]:w-full group-data-[state=collapsed]:text-center group-data-[state=collapsed]:py-0 group-data-[state=collapsed]:px-0 py-2 px-3 '>
          D<span className='group-data-[state=collapsed]:hidden'>ashboard</span>
        </h1>
        <SidebarTrigger className='block md:hidden' />
      </SidebarHeader>
      <SidebarContent className='gap-1 pt-2'>
        {sections.map((section, index) => (
          <SidebarGroup key={section.label ?? `section-${index}`} className='py-1'>
            {section.label && (
              <SidebarGroupLabel className='px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40'>
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className='gap-0.5 px-2'>
                {section.items.map((item) => {
                  const active = isItemActive(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <Link
                        href={item.href}
                        className='group-data-[state=collapsed]:flex group-data-[state=collapsed]:justify-center'
                        onClick={() => toggleSidebar()}>
                        <SidebarMenuButton
                          isActive={active}
                          className='group-data-[state=collapsed]:flex group-data-[state=collapsed]:items-center group-data-[state=collapsed]:justify-center rounded-lg transition-colors text-sidebar-foreground/70 data-[active=true]:font-semibold'>
                          <item.icon className='w-4 h-4 shrink-0' />
                          <span className='group-data-[state=collapsed]:hidden'>
                            {item.label}
                          </span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
