import { z } from "zod";

export const linkTreeItemSchema = z.object({
  label: z.string().min(1).max(100),
  href: z.string().url().max(500),
  icon: z.string().max(50).default("link"),
  enabled: z.boolean().default(true),
});

export const linkTreeConfigSchema = z.object({
  brandName: z.string().max(100).default(""),
  subtitle: z.string().max(200).default(""),
  links: z.array(linkTreeItemSchema).default([]),
});

export type LinkTreeItem = z.infer<typeof linkTreeItemSchema>;
export type LinkTreeConfig = z.infer<typeof linkTreeConfigSchema>;

export const DEFAULT_LINK_TREE_CONFIG: LinkTreeConfig = {
  brandName: "",
  subtitle: "",
  links: [],
};

/** Built-in icon options for the dashboard selector */
export const LINK_ICON_OPTIONS = [
  { value: "link", label: "Link" },
  { value: "shop", label: "Shop" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "youtube", label: "YouTube" },
  { value: "x", label: "X (Twitter)" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "snapchat", label: "Snapchat" },
  { value: "pinterest", label: "Pinterest" },
  { value: "telegram", label: "Telegram" },
] as const;
