import { useContext, useState, useEffect } from "react";
import type React from "react";
import { AuthContext } from "#root/context/AuthContext";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";
import { navigate } from "vike/client/router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import {
  User,
  Mail,
  Phone,
  Package,
  Shield,
  Pencil,
  X,
  Check,
  Heart,
  Clock,
  Truck,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  ShoppingBag,
  LogOut,
} from "lucide-react";
import { Link } from "#root/components/utils/Link";
import { useResolvedHeaderLogo } from "#root/components/globals/HeaderLogo";
import { useWishlist } from "#root/lib/hooks/useWishlist";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { getProductUrl } from "#root/lib/utils/route-helpers";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  phone: z
    .string()
    .regex(/^(\+201|01|00201)[0-2,5]{1}[0-9]{8}/, "Invalid phone number"),
});

type ProfileValues = z.infer<typeof profileSchema>;

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

type Tab = "account" | "orders" | "wishlist";

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: string;
  discountPrice: string | null;
  name: string | null;
}

interface Order {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string | null;
  subtotal: string;
  shipping: string;
  discount: string | null;
  total: string;
  status: string;
  createdAt: string;
  items: OrderItem[];
}

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  pending: { label: "Pending", icon: Clock, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  processing: { label: "Processing", icon: Package, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  shipped: { label: "Shipped", icon: Truck, color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  delivered: { label: "Delivered", icon: CheckCircle, color: "text-green-700", bg: "bg-green-50 border-green-200" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-red-700", bg: "bg-red-50 border-red-200" },
};

const AVATAR_COLORS = [
  "bg-violet-600", "bg-emerald-600", "bg-sky-600", "bg-rose-600", "bg-amber-600",
  "bg-teal-600", "bg-indigo-600", "bg-orange-600",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/* ── Tabs ────────────────────────────────────────────── */

function AccountTab({ session, onProfileUpdated }: { session: { name?: string | null; email: string; phone?: string | null; role: string }; onProfileUpdated: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isChangingPw, setIsChangingPw] = useState(false);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: session.name || "", phone: session.phone || "" },
  });

  useEffect(() => {
    form.reset({ name: session.name || "", phone: session.phone || "" });
  }, [session]);

  const pwForm = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSaveProfile = async (values: ProfileValues) => {
    setIsSubmitting(true);
    try {
      const result = await trpc.auth.updateProfile.mutate(values);
      if (!result.success) { toast.error(result.error || "Failed to update profile"); return; }
      toast.success("Profile updated");
      setIsEditing(false);
      onProfileUpdated();
    } catch { toast.error("Something went wrong"); }
    finally { setIsSubmitting(false); }
  };

  const onChangePassword = async (values: ChangePasswordValues) => {
    setIsChangingPw(true);
    try {
      const result = await trpc.auth.changePassword.mutate({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      if (!result.success) { toast.error("Failed to change password"); return; }
      toast.success("Password changed successfully");
      pwForm.reset();
    } catch { toast.error("Something went wrong"); }
    finally { setIsChangingPw(false); }
  };

  return (
    <div className="space-y-6">
      {/* Profile Info */}
      <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <h3 className="text-[15px] font-medium text-stone-900">Personal Information</h3>
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 text-[12px] text-stone-400 hover:text-stone-700 transition-colors">
              <Pencil className="w-3 h-3" /> Edit
            </button>
          ) : (
            <button onClick={() => { form.reset({ name: session.name || "", phone: session.phone || "" }); setIsEditing(false); }} className="flex items-center gap-1.5 text-[12px] text-red-400 hover:text-red-600 transition-colors">
              <X className="w-3 h-3" /> Cancel
            </button>
          )}
        </div>

        {isEditing ? (
          <form onSubmit={form.handleSubmit(onSaveProfile)} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-stone-400 mb-1.5 font-medium">Full Name</label>
              <Input {...form.register("name")} disabled={isSubmitting} className="h-10 text-[14px]" />
              {form.formState.errors.name && <p className="text-red-500 text-[11px] mt-1">{form.formState.errors.name.message}</p>}
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-stone-400 mb-1.5 font-medium">Email</label>
              <div className="flex items-center gap-2 px-3 py-2.5 bg-stone-50 rounded-md border border-stone-200 text-[14px] text-stone-400">
                <Mail className="w-4 h-4 shrink-0" />
                {session.email}
                <span className="ml-auto text-[10px] text-stone-300">read-only</span>
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-stone-400 mb-1.5 font-medium">Phone</label>
              <Input {...form.register("phone")} disabled={isSubmitting} className="h-10 text-[14px]" />
              {form.formState.errors.phone && <p className="text-red-500 text-[11px] mt-1">{form.formState.errors.phone.message}</p>}
            </div>
            <Button type="submit" disabled={isSubmitting} size="sm" className="bg-stone-900 hover:bg-stone-700 text-white gap-1.5">
              <Check className="w-3.5 h-3.5" />
              {isSubmitting ? "Saving…" : "Save Changes"}
            </Button>
          </form>
        ) : (
          <div className="px-6 py-5 space-y-4">
            {[
              { icon: User, label: "Full Name", value: session.name || "—" },
              { icon: Mail, label: "Email", value: session.email },
              { icon: Phone, label: "Phone", value: session.phone || "—" },
              // { icon: Shield, label: "Role", value: session.role === "admin" ? "Administrator" : "Customer" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-stone-50 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-stone-400" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-stone-400 font-medium">{label}</p>
                  <p className="text-[14px] text-stone-800 mt-0.5">{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-100">
          <h3 className="text-[15px] font-medium text-stone-900">Change Password</h3>
          <p className="text-[12px] text-stone-400 mt-0.5">Leave blank to keep your current password</p>
        </div>
        <form onSubmit={pwForm.handleSubmit(onChangePassword)} className="px-6 py-5 space-y-4">
          {(
            [
              { name: "currentPassword" as const, label: "Current Password", show: showCurrentPw, setShow: setShowCurrentPw },
              { name: "newPassword" as const, label: "New Password", show: showNewPw, setShow: setShowNewPw },
              { name: "confirmPassword" as const, label: "Confirm New Password", show: showConfirmPw, setShow: setShowConfirmPw },
            ] as const
          ).map(({ name, label, show, setShow }) => (
            <div key={name}>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-stone-400 mb-1.5 font-medium">{label}</label>
              <div className="relative">
                <Input
                  {...pwForm.register(name)}
                  type={show ? "text" : "password"}
                  disabled={isChangingPw}
                  className="h-10 text-[14px] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pwForm.formState.errors[name] && (
                <p className="text-red-500 text-[11px] mt-1">{pwForm.formState.errors[name]?.message}</p>
              )}
            </div>
          ))}
          <Button type="submit" disabled={isChangingPw} size="sm" className="bg-stone-900 hover:bg-stone-700 text-white gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            {isChangingPw ? "Updating…" : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function OrdersTab() {
  const { session } = useContext(AuthContext);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  useEffect(() => {
    trpc.order.view.query({ limit: 50, offset: 0 })
      .then((res: any) => {
        if (!res.success) {
          setError(res.error ?? "Failed to load orders");
          return;
        }
        const data = res.result;
        const list = Array.isArray(data) ? data : (data?.items ?? []);
        setOrders(list);
      })
      .catch((err: any) => setError(err.message ?? "Something went wrong"))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
    </div>
  );

  if (error) return (
    <div className="text-center py-16 text-stone-400 text-[14px]">{error}</div>
  );

  if (orders.length === 0) return (
    <div className="text-center py-20">
      <ShoppingBag className="w-10 h-10 text-stone-200 mx-auto mb-4" />
      <p className="text-[15px] font-medium text-stone-800 mb-1">No orders yet</p>
      <p className="text-[13px] text-stone-400 mb-6">Your order history will appear here</p>
      <Link href="/shop" className="inline-flex items-center gap-2 px-5 py-2.5 bg-stone-900 text-white text-[13px] rounded-lg hover:bg-stone-700 transition-colors">
        Start Shopping
      </Link>
    </div>
  );

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const cfg = statusConfig[order.status] ?? statusConfig["pending"]!;
        const StatusIcon = cfg.icon;
        const isExpanded = expandedOrder === order.id;
        const date = new Date(order.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

        return (
          <div key={order.id} className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <button
              type="button"
              className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-stone-50 transition-colors"
              onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border shrink-0 ${cfg.bg}`}>
                <StatusIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium text-stone-800">#{order.id.substring(0, 8).toUpperCase()}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wide ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[12px] text-stone-400">
                  <span>{date}</span>
                  <span>·</span>
                  <span>{(order.items ?? []).length} item{(order.items ?? []).length !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[14px] font-semibold text-stone-900">{Number(order.total).toFixed(2)} {STORE_CURRENCY}</p>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-stone-100 px-5 py-4 space-y-3">
                {(order.items ?? []).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] text-stone-700 truncate">{item.name || "Product"}</p>
                      <p className="text-[11px] text-stone-400">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-[13px] font-medium text-stone-800 shrink-0">
                      {(Number(item.discountPrice ?? item.price) * item.quantity).toFixed(2)} {STORE_CURRENCY}
                    </p>
                  </div>
                ))}
                <div className="border-t border-stone-100 pt-3 space-y-1">
                  <div className="flex justify-between text-[12px] text-stone-400">
                    <span>Subtotal</span><span>{Number(order.subtotal).toFixed(2)} {STORE_CURRENCY}</span>
                  </div>
                  <div className="flex justify-between text-[12px] text-stone-400">
                    <span>Shipping</span><span>{Number(order.shipping) > 0 ? `${Number(order.shipping).toFixed(2)} ${STORE_CURRENCY}` : "Free"}</span>
                  </div>
                  {order.discount && Number(order.discount) > 0 && (
                    <div className="flex justify-between text-[12px] text-green-600">
                      <span>Discount</span><span>-{Number(order.discount).toFixed(2)} {STORE_CURRENCY}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[14px] font-semibold text-stone-900 pt-1 border-t border-stone-100">
                    <span>Total</span><span>{Number(order.total).toFixed(2)} {STORE_CURRENCY}</span>
                  </div>
                </div>
                <div className="pt-1 text-[12px] text-stone-400">
                  <p>Ship to: {order.shippingAddress}, {order.shippingCity}{order.shippingState ? `, ${order.shippingState}` : ""}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WishlistTab() {
  const { items: wishlistIds, toggle } = useWishlist();
  const [products, setProducts] = useState<{ id: string; slug?: string | null; name: string; price: number; discountPrice?: number | null; imageUrl?: string; stock?: number }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (wishlistIds.length === 0) { setProducts([]); return; }
    setIsLoading(true);
    trpc.product.getByIds.query({ ids: wishlistIds })
      .then((res: any) => {
        if (res.success && res.result) {
          setProducts(res.result.map((p: any) => ({
            id: p.id,
            slug: p.slug,
            name: p.name,
            price: Number(p.price),
            discountPrice: p.discountPrice != null ? Number(p.discountPrice) : null,
            imageUrl: p.imageUrl ? `/uploads/${p.imageUrl}` : undefined,
            stock: p.stock,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [wishlistIds.join(",")]);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
    </div>
  );

  if (wishlistIds.length === 0) return (
    <div className="text-center py-20">
      <Heart className="w-10 h-10 text-stone-200 mx-auto mb-4" />
      <p className="text-[15px] font-medium text-stone-800 mb-1">Your wishlist is empty</p>
      <p className="text-[13px] text-stone-400 mb-6">Save products you love by tapping the heart icon</p>
      <Link href="/shop" className="inline-flex items-center gap-2 px-5 py-2.5 bg-stone-900 text-white text-[13px] rounded-lg hover:bg-stone-700 transition-colors">
        Browse Products
      </Link>
    </div>
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((product) => {
        const displayPrice = product.discountPrice ?? product.price;
        const hasDiscount = product.discountPrice != null && product.discountPrice < product.price;
        return (
          <div key={product.id} className="bg-white rounded-xl border border-stone-100 overflow-hidden group">
            <Link href={getProductUrl(product)} className="block relative aspect-square bg-stone-50 overflow-hidden">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="w-8 h-8 text-stone-200" />
                </div>
              )}
            </Link>
            <div className="p-3">
              <Link href={getProductUrl(product)} className="block">
                <p className="text-[13px] font-medium text-stone-800 truncate hover:text-stone-600 transition-colors">{product.name}</p>
              </Link>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[13px] font-semibold text-stone-900">{displayPrice.toFixed(2)} {STORE_CURRENCY}</span>
                {hasDiscount && <span className="text-[11px] text-stone-400 line-through">{product.price.toFixed(2)}</span>}
              </div>
              <button
                type="button"
                onClick={() => toggle(product.id)}
                className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg transition-colors">
                <X className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────── */

export default function Page() {
  const { session, logout } = useContext(AuthContext);
  const logo = useResolvedHeaderLogo("desktop");
  const [refreshKey, setRefreshKey] = useState(0);

  const getInitialTab = (): Tab => {
    if (typeof window === "undefined") return "account";
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param === "orders" || param === "wishlist") return param;
    return "account";
  };

  const [activeTab, setActiveTab] = useState<Tab>(getInitialTab);

  useEffect(() => {
    if (!session) navigate("/login");
  }, [session]);

  if (!session) return null;

  const avatarColor = getAvatarColor(session.name || session.email);
  const initials = session.name
    ? session.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : session.email.charAt(0).toUpperCase();

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "account", label: "My Account", icon: User },
    { id: "orders", label: "Orders", icon: Package },
    { id: "wishlist", label: "Wishlist", icon: Heart },
  ];

  return (
    <div className="min-h-screen bg-stone-50">

      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Profile header */}
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 mb-8">
          <div className={`w-16 h-16 rounded-full ${avatarColor} flex items-center justify-center text-white text-xl font-bold shrink-0`}>
            {initials}
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-[22px] font-semibold text-stone-900">{session.name || "My Account"}</h1>
            <p className="text-[13px] text-stone-400">{session.email}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl shadow-lg border-b border-stone-200 mb-6">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-2.5 text-[11px] sm:text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                activeTab === id
                  ? "border-stone-900 text-black"
                  : "border-transparent text-stone-400 hover:text-stone-700"
              }`}>
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "account" && (
          <AccountTab
            session={session}
            onProfileUpdated={() => { setRefreshKey((k) => k + 1); window.location.reload(); }}
          />
        )}
        {activeTab === "orders" && <OrdersTab />}
        {activeTab === "wishlist" && <WishlistTab />}
      </div>
    </div>
  );
}
