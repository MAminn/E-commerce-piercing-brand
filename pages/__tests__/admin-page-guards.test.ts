import { describe, expect, it, vi } from "vitest";

// The dashboard's data hook loads the admin overview; it must never be reached
// by a non-admin, so a call here fails the test loudly.
vi.mock("#root/backend/dashboard/admin-overview/admin-overview", () => ({
  getAdminOverview: () => {
    throw new Error("admin overview loaded for a non-admin");
  },
}));

import { guard as dashboardGuard } from "../dashboard/+guard";
import { guard as settingsGuard } from "../dashboard/settings/+guard";
import { guard as linksGuard } from "../dashboard/settings/links/+guard";
import { guard as templatePreviewGuard } from "../template-preview/+guard";
import { data as dashboardData } from "../dashboard/+data";

type Role = "user" | "vendor" | "admin" | "superadmin";

const ctx = (role: Role | null) =>
  ({ clientSession: role ? { id: `${role}-id`, role, email: `${role}@example.test` } : undefined }) as unknown as Vike.PageContext;

/** Where the guard redirects to, or null when it lets the request through. */
async function redirectOf(run: () => unknown): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (err) {
    const url = (err as { _pageContextAbort?: { _urlRedirect?: { url: string } } })._pageContextAbort?._urlRedirect?.url;
    if (!url) throw err;
    return url;
  }
}

const ADMIN_GUARDS = {
  "/dashboard (inherited by every dashboard page)": dashboardGuard,
  "/dashboard/settings": settingsGuard,
  "/dashboard/settings/links": linksGuard,
  "/template-preview": templatePreviewGuard,
};

describe("admin page guards", () => {
  for (const [route, guard] of Object.entries(ADMIN_GUARDS)) {
    describe(route, () => {
      it("anonymous → /login", async () => {
        expect(await redirectOf(() => guard(ctx(null)))).toBe("/login");
      });
      it("customer → storefront", async () => {
        expect(await redirectOf(() => guard(ctx("user")))).toBe("/");
      });
      it("vendor → storefront", async () => {
        expect(await redirectOf(() => guard(ctx("vendor")))).toBe("/");
      });
      it("admin and superadmin → allowed", async () => {
        expect(await redirectOf(() => guard(ctx("admin")))).toBeNull();
        expect(await redirectOf(() => guard(ctx("superadmin")))).toBeNull();
      });
    });
  }

  it("the dashboard guard fails closed even if SINGLE_SHOP_MODE is off", async () => {
    vi.resetModules();
    vi.doMock("#root/shared/config/app", () => ({ isSingleShopMode: () => false, SINGLE_SHOP_MODE: false }));
    const { guard } = await import("../dashboard/+guard");
    expect(await redirectOf(() => guard(ctx("vendor")))).toBe("/");
    expect(await redirectOf(() => guard(ctx("user")))).toBe("/");
    expect(await redirectOf(() => guard(ctx("admin")))).toBeNull();
    vi.doUnmock("#root/shared/config/app");
  });

  it("the dashboard data hook never loads admin data for a customer", async () => {
    expect(await redirectOf(() => dashboardData({ ...ctx("user"), db: {} } as never))).toBe("/");
    const anonymous = await dashboardData({ ...ctx(null), db: {} } as never);
    expect(anonymous).toMatchObject({ success: false, error: "Unauthorized" });
  });
});
