import { useState, useEffect, useCallback } from "react";
import { trpc } from "#root/shared/trpc/client";
import { getStoreOwnerId } from "#root/shared/config/store";
import { toast } from "sonner";
import { Button } from "#root/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "#root/components/ui/card";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Switch } from "#root/components/ui/switch";
import { Textarea } from "#root/components/ui/textarea";
import { Separator } from "#root/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import {
  DEFAULT_LAYOUT_SETTINGS,
  DEFAULT_LOGO_SIZE,
  DEFAULT_FOOTER_LOGO_SIZE,
  type LayoutSettings,
  type NavigationLink,
  type FooterLinkGroup,
  type SocialLink,
  type SocialPlatform,
  type NavbarStyle,
} from "#root/shared/types/layout-settings";
import {
  Trash2,
  Plus,
  Save,
  RotateCcw,
  Upload,
  Image as ImageIcon,
  GripVertical,
  Languages,
} from "lucide-react";
import { usePageContext } from "vike-react/usePageContext";
import { v7 as uuidv7 } from "uuid";
import {
  templateConfig,
} from "#root/components/template-system/templateConfig";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";

const SOCIAL_PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "twitter", label: "Twitter / X" },
  { value: "youtube", label: "YouTube" },
  { value: "pinterest", label: "Pinterest" },
  { value: "linkedin", label: "LinkedIn" },
];

export default function LayoutSettingsPage() {
  const pageContext = usePageContext();
  const session = pageContext.clientSession;
  const MERCHANT_ID = getStoreOwnerId();
  const { getTemplateId } = useTemplate();

  // Auto-select the currently active landing template
  const activeLandingTemplate = getTemplateId("landing") ?? templateConfig.landing[0]?.id ?? "landing-modern";

  const [settings, setSettings] = useState<LayoutSettings>(
    DEFAULT_LAYOUT_SETTINGS,
  );
  const [originalSettings, setOriginalSettings] = useState<LayoutSettings>(
    DEFAULT_LAYOUT_SETTINGS,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isUploadingHeaderLogo, setIsUploadingHeaderLogo] = useState(false);
  const [isUploadingFooterLogo, setIsUploadingFooterLogo] = useState(false);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const [isUploadingShareImage, setIsUploadingShareImage] = useState(false);
  const [activeTab, setActiveTab] = useState<"header" | "footer">("header");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(activeLandingTemplate);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    trpc.category.view.query().then((res) => {
      if (res.success && res.result) {
        setCategories(res.result.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setHasUnsavedChanges(
      JSON.stringify(settings) !== JSON.stringify(originalSettings),
    );
  }, [settings, originalSettings]);

  // Sync selected template when active template resolves from DB
  useEffect(() => {
    if (!hasUnsavedChanges) {
      setSelectedTemplateId(activeLandingTemplate);
    }
  }, [activeLandingTemplate]);

  useEffect(() => {
    loadSettings();
  }, [selectedTemplateId]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const result = await trpc.layout.getSettings.query({
        merchantId: MERCHANT_ID,
        templateId: selectedTemplateId,
      });
      if (result.success && result.result) {
        setSettings(result.result);
        setOriginalSettings(result.result);
      } else {
        toast.error("Failed to load layout settings");
      }
    } catch {
      toast.error("Error loading layout settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      toast.error("Only administrators can update layout settings");
      return;
    }
    setIsSaving(true);
    try {
      const result = await trpc.layout.updateSettings.mutate({
        merchantId: MERCHANT_ID,
        templateId: selectedTemplateId,
        content: settings,
      });
      if (result.success) {
        setOriginalSettings(settings);
        toast.success("Layout settings saved successfully!");
      } else {
        toast.error("Failed to save layout settings");
      }
    } catch {
      toast.error("Error saving layout settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(JSON.parse(JSON.stringify(originalSettings)));
    toast.info("Changes reverted");
  };

  const handleResetToDefaults = () => {
    setSettings(JSON.parse(JSON.stringify(DEFAULT_LAYOUT_SETTINGS)));
    toast.info("Reset to default values");
  };

  // ─── Image upload ──────────────────────────────────────────────────────

  const handleLogoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: "header" | "footer",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 2MB.");
      return;
    }

    const setUploading =
      target === "header" ? setIsUploadingHeaderLogo : setIsUploadingFooterLogo;
    setUploading(true);

    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const result = await trpc.layout.uploadImage.mutate({
        file: { name: file.name, type: file.type, buffer },
        prefix: target === "header" ? "header-logo" : "footer-logo",
      });
      if (result.success && result.data) {
        setSettings((prev) => ({
          ...prev,
          [target]: { ...prev[target], logoUrl: result.data!.url },
        }));
        toast.success(
          `${target === "header" ? "Header" : "Footer"} logo uploaded`,
        );
      } else {
        toast.error(result.success ? "Upload failed" : result.error);
      }
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      setUploading(false);
    }
  };

  const handleFaviconUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 1MB.");
      return;
    }
    setIsUploadingFavicon(true);
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const result = await trpc.layout.uploadImage.mutate({
        file: { name: file.name, type: file.type, buffer },
        prefix: "favicon",
      });
      if (result.success && result.data) {
        setSettings((prev) => ({ ...prev, faviconUrl: result.data!.url }));
        toast.success("Favicon uploaded");
      } else {
        toast.error(result.success ? "Upload failed" : result.error);
      }
    } catch {
      toast.error("Failed to upload favicon");
    } finally {
      setIsUploadingFavicon(false);
    }
  };

  const handleShareImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 2MB.");
      return;
    }
    setIsUploadingShareImage(true);
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const result = await trpc.layout.uploadImage.mutate({
        file: { name: file.name, type: file.type, buffer },
        prefix: "share-image",
      });
      if (result.success && result.data) {
        setSettings((prev) => ({ ...prev, shareImageUrl: result.data!.url }));
        toast.success("Share image uploaded");
      } else {
        toast.error(result.success ? "Upload failed" : result.error);
      }
    } catch {
      toast.error("Failed to upload share image");
    } finally {
      setIsUploadingShareImage(false);
    }
  };

  // ─── Header helpers ────────────────────────────────────────────────────

  const updateHeader = useCallback(
    <K extends keyof LayoutSettings["header"]>(
      key: K,
      value: LayoutSettings["header"][K],
    ) => {
      setSettings((prev) => ({
        ...prev,
        header: { ...prev.header, [key]: value },
      }));
    },
    [],
  );

  const addNavLink = () => {
    const newLink: NavigationLink = {
      id: uuidv7(),
      label: "New Link",
      url: "/",
    };
    updateHeader("navigationLinks", [
      ...settings.header.navigationLinks,
      newLink,
    ]);
  };

  const removeNavLink = (id: string) => {
    updateHeader(
      "navigationLinks",
      settings.header.navigationLinks.filter((l) => l.id !== id),
    );
  };

  const updateNavLink = (
    id: string,
    field: keyof NavigationLink,
    value: string | boolean | string[],
  ) => {
    updateHeader(
      "navigationLinks",
      settings.header.navigationLinks.map((l) =>
        l.id === id ? { ...l, [field]: value } : l,
      ),
    );
  };

  // ─── Footer helpers ────────────────────────────────────────────────────

  const updateFooter = useCallback(
    <K extends keyof LayoutSettings["footer"]>(
      key: K,
      value: LayoutSettings["footer"][K],
    ) => {
      setSettings((prev) => ({
        ...prev,
        footer: { ...prev.footer, [key]: value },
      }));
    },
    [],
  );

  const addLinkGroup = () => {
    const newGroup: FooterLinkGroup = {
      id: uuidv7(),
      title: "New Group",
      links: [],
    };
    updateFooter("footerLinkGroups", [
      ...settings.footer.footerLinkGroups,
      newGroup,
    ]);
  };

  const removeLinkGroup = (id: string) => {
    updateFooter(
      "footerLinkGroups",
      settings.footer.footerLinkGroups.filter((g) => g.id !== id),
    );
  };

  const updateLinkGroupTitle = (id: string, title: string) => {
    updateFooter(
      "footerLinkGroups",
      settings.footer.footerLinkGroups.map((g) =>
        g.id === id ? { ...g, title } : g,
      ),
    );
  };

  const updateLinkGroupField = (id: string, field: string, value: string) => {
    updateFooter(
      "footerLinkGroups",
      settings.footer.footerLinkGroups.map((g) =>
        g.id === id ? { ...g, [field]: value } : g,
      ),
    );
  };

  const addLinkToGroup = (groupId: string) => {
    updateFooter(
      "footerLinkGroups",
      settings.footer.footerLinkGroups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              links: [
                ...g.links,
                { id: uuidv7(), label: "New Link", url: "/" },
              ],
            }
          : g,
      ),
    );
  };

  const removeLinkFromGroup = (groupId: string, linkId: string) => {
    updateFooter(
      "footerLinkGroups",
      settings.footer.footerLinkGroups.map((g) =>
        g.id === groupId
          ? { ...g, links: g.links.filter((l) => l.id !== linkId) }
          : g,
      ),
    );
  };

  const updateLinkInGroup = (
    groupId: string,
    linkId: string,
    field: "label" | "url" | "labelAr",
    value: string,
  ) => {
    updateFooter(
      "footerLinkGroups",
      settings.footer.footerLinkGroups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              links: g.links.map((l) =>
                l.id === linkId ? { ...l, [field]: value } : l,
              ),
            }
          : g,
      ),
    );
  };

  const addSocialLink = () => {
    const newLink: SocialLink = {
      id: uuidv7(),
      platform: "facebook",
      url: "#",
    };
    updateFooter("socialLinks", [...settings.footer.socialLinks, newLink]);
  };

  const removeSocialLink = (id: string) => {
    updateFooter(
      "socialLinks",
      settings.footer.socialLinks.filter((l) => l.id !== id),
    );
  };

  const updateSocialLink = (
    id: string,
    field: keyof SocialLink,
    value: string,
  ) => {
    updateFooter(
      "socialLinks",
      settings.footer.socialLinks.map((l) =>
        l.id === id ? { ...l, [field]: value } : l,
      ),
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900' />
      </div>
    );
  }

  return (
    <div className='max-w-4xl mx-auto space-y-6 pb-24'>
      {/* Page header */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>Layout Settings</h1>
          <p className='text-sm text-muted-foreground mt-1'>
            Configure your store header and footer from here.
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {hasUnsavedChanges && (
            <span className='text-xs text-amber-600 font-medium'>
              Unsaved changes
            </span>
          )}
          <Button
            variant='outline'
            size='sm'
            onClick={handleReset}
            disabled={!hasUnsavedChanges}>
            <RotateCcw className='w-4 h-4 mr-1' />
            Revert
          </Button>
          <Button
            size='sm'
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}>
            <Save className='w-4 h-4 mr-1' />
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Template Selector */}
      <Card className='mb-6 border-blue-200 bg-blue-50/50'>
        <CardContent className='pt-6'>
          <div className='flex items-center gap-4'>
            <div className='flex-1'>
              <Label htmlFor='template-selector' className='text-sm font-semibold text-blue-900'>
                Editing Layout For Template
              </Label>
              <p className='text-xs text-blue-700 mt-0.5'>
                Each landing template can have its own navbar and footer settings. Select which template's layout you want to edit.
              </p>
            </div>
            <Select
              value={selectedTemplateId}
              onValueChange={(value) => {
                if (hasUnsavedChanges) {
                  const confirmed = confirm(
                    "You have unsaved changes. Switching templates will discard them. Continue?",
                  );
                  if (!confirmed) return;
                }
                setSelectedTemplateId(value);
                setHasUnsavedChanges(false);
              }}>
              <SelectTrigger id='template-selector' className='w-[320px] bg-white'>
                <SelectValue placeholder='Select a template' />
              </SelectTrigger>
              <SelectContent>
                {templateConfig.landing.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.label}
                    {template.id === activeLandingTemplate ? " (Active)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Site Identity — Tab title & Favicon */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Site Identity</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-sm text-muted-foreground'>
            Set the browser tab title and favicon for this template.
          </p>
          <div>
            <Label htmlFor='site-title'>Browser Tab Title</Label>
            <Input
              id='site-title'
              value={settings.siteTitle ?? ""}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, siteTitle: e.target.value }))
              }
              placeholder='e.g. MATCH Perfumes — Official Store'
              className='mt-1'
            />
            <p className='text-xs text-muted-foreground mt-1'>
              Leave empty to use the default store name.
            </p>
          </div>
          <Separator />
          <div>
            <Label>Favicon</Label>
            {settings.faviconUrl ? (
              <div className='flex items-center gap-4 mt-2'>
                <div className='h-10 w-10 bg-muted rounded flex items-center justify-center'>
                  <img
                    src={settings.faviconUrl}
                    alt='Favicon'
                    className='max-h-8 max-w-8 object-contain'
                  />
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, faviconUrl: "" }))
                  }>
                  Remove
                </Button>
              </div>
            ) : (
              <div className='flex items-center gap-2 text-sm text-muted-foreground mt-2'>
                <ImageIcon className='w-4 h-4' />
                No favicon uploaded — default icon will be used
              </div>
            )}
            <div className='mt-2'>
              <Label htmlFor='favicon-upload' className='text-sm'>
                Upload favicon (PNG, SVG, or ICO — max 1MB)
              </Label>
              <Input
                id='favicon-upload'
                type='file'
                accept='image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon'
                disabled={isUploadingFavicon}
                onChange={handleFaviconUpload}
                className='mt-1'
              />
              {isUploadingFavicon && (
                <p className='text-xs text-muted-foreground mt-1'>
                  Uploading…
                </p>
              )}
            </div>
          </div>
          <Separator />
          <div>
            <Label>Social Share Image</Label>
            <p className='text-xs text-muted-foreground mt-1 mb-2'>
              This is the image shown when the site link is shared on
              WhatsApp, Instagram, Facebook, or iMessage. Use a real banner
              (product photo + logo), not the small navbar logo — it will
              look cropped/broken there.
            </p>
            {settings.shareImageUrl ? (
              <div className='flex items-center gap-4 mt-2'>
                <div className='h-20 w-40 bg-muted rounded flex items-center justify-center overflow-hidden'>
                  <img
                    src={settings.shareImageUrl}
                    alt='Social share preview'
                    className='max-h-20 max-w-40 object-contain'
                  />
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, shareImageUrl: "" }))
                  }>
                  Remove
                </Button>
              </div>
            ) : (
              <div className='flex items-center gap-2 text-sm text-muted-foreground mt-2'>
                <ImageIcon className='w-4 h-4' />
                No share image uploaded — link previews will fall back to the
                header logo (not recommended)
              </div>
            )}
            <div className='mt-2'>
              <Label htmlFor='share-image-upload' className='text-sm'>
                Upload share image (JPG, PNG, or WebP — recommended 1200×630,
                max 2MB)
              </Label>
              <Input
                id='share-image-upload'
                type='file'
                accept='image/png,image/jpeg,image/webp'
                disabled={isUploadingShareImage}
                onChange={handleShareImageUpload}
                className='mt-1'
              />
              {isUploadingShareImage && (
                <p className='text-xs text-muted-foreground mt-1'>
                  Uploading…
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab switcher */}
      <div className='flex gap-1 bg-muted p-1 rounded-lg w-fit'>
        <button
          type='button'
          onClick={() => setActiveTab("header")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "header"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}>
          Header Settings
        </button>
        <button
          type='button'
          onClick={() => setActiveTab("footer")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "footer"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}>
          Footer Settings
        </button>
      </div>

      {/* ── HEADER TAB ── */}
      {activeTab === "header" && (
        <div className='space-y-6'>
          {/* Navbar Style */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Navbar Style</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-sm text-muted-foreground'>
                Choose the navigation bar style for this template.
              </p>
              <div className='grid grid-cols-3 gap-3'>
                {(
                  [
                    {
                      value: "default" as NavbarStyle,
                      label: "Default (Modern)",
                      desc: "Clean pill-style links, smooth scroll transitions",
                    },
                    {
                      value: "editorial" as NavbarStyle,
                      label: "Editorial (Luxury)",
                      desc: "Uppercase tracking, Framer Motion transitions",
                    },
                    {
                      value: "minimal" as NavbarStyle,
                      label: "Minimal (Clean)",
                      desc: "Centered logo, icon-based actions, wide tracking",
                    },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type='button'
                    onClick={() => updateHeader("navbarStyle", option.value)}
                    className={`text-left p-4 rounded-lg border-2 transition-colors ${
                      settings.header.navbarStyle === option.value
                        ? "border-foreground bg-muted"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}>
                    <p className='text-sm font-medium'>{option.label}</p>
                    <p className='text-xs text-muted-foreground mt-1'>
                      {option.desc}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Logo */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Header Logo</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {settings.header.logoUrl ? (
                <div className='flex items-center gap-4'>
                  <div className='h-12 bg-muted rounded flex items-center justify-center px-4'>
                    <img
                      src={settings.header.logoUrl}
                      alt='Header logo'
                      className='max-h-10 max-w-[200px] object-contain'
                    />
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => updateHeader("logoUrl", "")}>
                    Remove
                  </Button>
                </div>
              ) : (
                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <ImageIcon className='w-4 h-4' />
                  No logo uploaded — text logo or store name will be shown
                </div>
              )}
              <div>
                <Label htmlFor='header-logo-upload' className='text-sm'>
                  Upload logo image (max 2MB)
                </Label>
                <Input
                  id='header-logo-upload'
                  type='file'
                  accept='image/jpeg,image/png,image/webp,image/svg+xml'
                  disabled={isUploadingHeaderLogo}
                  onChange={(e) => handleLogoUpload(e, "header")}
                  className='mt-1'
                />
                {isUploadingHeaderLogo && (
                  <p className='text-xs text-muted-foreground mt-1'>
                    Uploading…
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Logo Sizing */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Logo Size</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-sm text-muted-foreground'>
                Control the logo dimensions on desktop and mobile. Values are in
                pixels.
              </p>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <Label htmlFor='logo-desktop-width'>Desktop width (px)</Label>
                  <Input
                    id='logo-desktop-width'
                    type='number'
                    min={20}
                    max={600}
                    value={
                      settings.header.logoSize?.desktopWidth ??
                      DEFAULT_LOGO_SIZE.desktopWidth
                    }
                    onChange={(e) =>
                      updateHeader("logoSize", {
                        ...(settings.header.logoSize ?? DEFAULT_LOGO_SIZE),
                        desktopWidth:
                          Number(e.target.value) ||
                          DEFAULT_LOGO_SIZE.desktopWidth,
                      })
                    }
                    className='mt-1'
                  />
                </div>
                <div>
                  <Label htmlFor='logo-desktop-height'>
                    Desktop max height (px)
                  </Label>
                  <Input
                    id='logo-desktop-height'
                    type='number'
                    min={16}
                    max={200}
                    value={
                      settings.header.logoSize?.desktopMaxHeight ??
                      DEFAULT_LOGO_SIZE.desktopMaxHeight
                    }
                    onChange={(e) =>
                      updateHeader("logoSize", {
                        ...(settings.header.logoSize ?? DEFAULT_LOGO_SIZE),
                        desktopMaxHeight:
                          Number(e.target.value) ||
                          DEFAULT_LOGO_SIZE.desktopMaxHeight,
                      })
                    }
                    className='mt-1'
                  />
                </div>
                <div>
                  <Label htmlFor='logo-mobile-width'>Mobile width (px)</Label>
                  <Input
                    id='logo-mobile-width'
                    type='number'
                    min={20}
                    max={400}
                    value={
                      settings.header.logoSize?.mobileWidth ??
                      DEFAULT_LOGO_SIZE.mobileWidth
                    }
                    onChange={(e) =>
                      updateHeader("logoSize", {
                        ...(settings.header.logoSize ?? DEFAULT_LOGO_SIZE),
                        mobileWidth:
                          Number(e.target.value) ||
                          DEFAULT_LOGO_SIZE.mobileWidth,
                      })
                    }
                    className='mt-1'
                  />
                </div>
                <div>
                  <Label htmlFor='logo-mobile-height'>
                    Mobile max height (px)
                  </Label>
                  <Input
                    id='logo-mobile-height'
                    type='number'
                    min={16}
                    max={120}
                    value={
                      settings.header.logoSize?.mobileMaxHeight ??
                      DEFAULT_LOGO_SIZE.mobileMaxHeight
                    }
                    onChange={(e) =>
                      updateHeader("logoSize", {
                        ...(settings.header.logoSize ?? DEFAULT_LOGO_SIZE),
                        mobileMaxHeight:
                          Number(e.target.value) ||
                          DEFAULT_LOGO_SIZE.mobileMaxHeight,
                      })
                    }
                    className='mt-1'
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tagline / Text Logo */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Text Logo</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div>
                <Label htmlFor='header-logo-text'>
                  Displayed as the logo when no image is uploaded. Falls back to
                  the store name if empty.
                </Label>
                <Input
                  id='header-logo-text'
                  value={settings.header.logoText ?? ""}
                  onChange={(e) => updateHeader("logoText", e.target.value)}
                  placeholder='e.g. LEBSY'
                  className='mt-1'
                />
              </div>
              <div>
                <Label htmlFor='header-tagline'>
                  Tagline (optional short phrase, not used as logo)
                </Label>
                <Input
                  id='header-tagline'
                  value={settings.header.tagline}
                  onChange={(e) => updateHeader("tagline", e.target.value)}
                  placeholder='e.g. Curated fashion, quiet confidence'
                  className='mt-1'
                />
              </div>
            </CardContent>
          </Card>

          {/* Announcement bar (not used in minimal template — marquee is controlled from homepage) */}
          {settings.header.navbarStyle !== "minimal" && (
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Announcement Bar</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='announcement-enabled'>
                  Enable announcement bar
                </Label>
                <Switch
                  id='announcement-enabled'
                  checked={settings.header.announcementBarEnabled}
                  onCheckedChange={(v) =>
                    updateHeader("announcementBarEnabled", v)
                  }
                />
              </div>
              {settings.header.announcementBarEnabled && (
                <div>
                  <Label htmlFor='announcement-text'>Announcement text</Label>
                  <Input
                    id='announcement-text'
                    value={settings.header.announcementBarText}
                    onChange={(e) =>
                      updateHeader("announcementBarText", e.target.value)
                    }
                    placeholder='e.g. Free shipping on all orders over $50!'
                    className='mt-1'
                  />
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Navigation links */}

          {/* Contact Email (minimal template info bar) */}
          {settings.header.navbarStyle === "minimal" && (
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Info Bar — Contact Email</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor='contact-email'>Email shown in the bar above the navbar</Label>
              <Input
                id='contact-email'
                type='email'
                value={settings.header.contactEmail ?? ""}
                onChange={(e) => updateHeader("contactEmail", e.target.value)}
                placeholder='e.g. cs@yourbrand.com'
                className='mt-1'
              />
            </CardContent>
          </Card>
          )}

          <Card>
            <CardHeader className='flex flex-row items-center justify-between'>
              <CardTitle className='text-base'>Navigation Links</CardTitle>
              <Button variant='outline' size='sm' onClick={addNavLink}>
                <Plus className='w-4 h-4 mr-1' />
                Add Link
              </Button>
            </CardHeader>
            <CardContent className='space-y-3'>
              {settings.header.navigationLinks.length === 0 && (
                <p className='text-sm text-muted-foreground'>
                  No navigation links. Add one to get started.
                </p>
              )}
              {settings.header.navigationLinks.map((link) => (
                <div
                  key={link.id}
                  className='flex flex-col gap-2 p-3 rounded-lg border bg-muted/30'>
                  <div className='flex items-center gap-2'>
                    <GripVertical className='w-4 h-4 text-muted-foreground shrink-0' />
                    <Input
                      value={link.label}
                      onChange={(e) =>
                        updateNavLink(link.id, "label", e.target.value)
                      }
                      placeholder='Label'
                      className='flex-1'
                    />
                    <Input
                      value={link.url}
                      onChange={(e) =>
                        updateNavLink(link.id, "url", e.target.value)
                      }
                      placeholder='/path'
                      className='flex-1'
                    />
                    <Button
                      variant='ghost'
                      size='icon'
                      className='shrink-0 text-destructive hover:text-destructive'
                      onClick={() => removeNavLink(link.id)}>
                      <Trash2 className='w-4 h-4' />
                    </Button>
                  </div>
                  {settings.header.navbarStyle === "minimal" && (
                    <div className='flex items-center gap-2 pl-6'>
                      <Languages className='w-3.5 h-3.5 text-muted-foreground shrink-0' />
                      <Input
                        dir='rtl'
                        value={link.labelAr ?? ""}
                        onChange={(e) =>
                          updateNavLink(link.id, "labelAr", e.target.value)
                        }
                        placeholder='Arabic label'
                        className='flex-1'
                      />
                    </div>
                  )}
                  {/* Dropdown toggle + category picker */}
                  {settings.header.navbarStyle === "minimal" && (
                    <div className='pl-6 space-y-2'>
                      <div className='flex items-center gap-2'>
                        <Switch
                          checked={link.isDropdown ?? false}
                          onCheckedChange={(v) =>
                            updateNavLink(link.id, "isDropdown", v)
                          }
                        />
                        <Label className='text-xs text-muted-foreground'>
                          Show as dropdown with categories
                        </Label>
                      </div>
                      {link.isDropdown && categories.length > 0 && (
                        <div className='grid grid-cols-2 sm:grid-cols-3 gap-1.5 rounded border p-2 bg-background max-h-48 overflow-y-auto'>
                          {categories.map((cat) => {
                            const selected = link.categoryIds?.includes(cat.id) ?? false;
                            return (
                              <label key={cat.id} className='flex items-center gap-1.5 text-xs cursor-pointer'>
                                <input
                                  type='checkbox'
                                  className='accent-stone-900'
                                  checked={selected}
                                  onChange={(e) => {
                                    const current = link.categoryIds ?? [];
                                    const next = e.target.checked
                                      ? [...current, cat.id]
                                      : current.filter((id) => id !== cat.id);
                                    updateNavLink(link.id, "categoryIds", next);
                                  }}
                                />
                                {cat.name}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── FOOTER TAB ── */}
      {activeTab === "footer" && (
        <div className='space-y-6'>
          {/* Footer Logo */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Footer Logo</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {settings.footer.logoUrl ? (
                <div className='flex items-center gap-4'>
                  <div className='h-12 bg-muted rounded flex items-center justify-center px-4'>
                    <img
                      src={settings.footer.logoUrl}
                      alt='Footer logo'
                      className='max-h-10 max-w-[200px] object-contain'
                    />
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => updateFooter("logoUrl", "")}>
                    Remove
                  </Button>
                </div>
              ) : (
                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <ImageIcon className='w-4 h-4' />
                  No logo uploaded — store name will be shown as text
                </div>
              )}
              <div>
                <Label htmlFor='footer-logo-upload' className='text-sm'>
                  Upload footer logo (max 2MB)
                </Label>
                <Input
                  id='footer-logo-upload'
                  type='file'
                  accept='image/jpeg,image/png,image/webp,image/svg+xml'
                  disabled={isUploadingFooterLogo}
                  onChange={(e) => handleLogoUpload(e, "footer")}
                  className='mt-1'
                />
                {isUploadingFooterLogo && (
                  <p className='text-xs text-muted-foreground mt-1'>
                    Uploading…
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Footer Logo Size */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Footer Logo Size</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-sm text-muted-foreground'>
                Control the footer logo dimensions. Values are in pixels.
              </p>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <Label htmlFor='footer-logo-desktop-width'>
                    Desktop width (px)
                  </Label>
                  <Input
                    id='footer-logo-desktop-width'
                    type='number'
                    min={20}
                    max={400}
                    value={
                      settings.footer.logoSize?.desktopWidth ??
                      DEFAULT_FOOTER_LOGO_SIZE.desktopWidth
                    }
                    onChange={(e) =>
                      updateFooter("logoSize", {
                        ...(settings.footer.logoSize ??
                          DEFAULT_FOOTER_LOGO_SIZE),
                        desktopWidth:
                          Number(e.target.value) ||
                          DEFAULT_FOOTER_LOGO_SIZE.desktopWidth,
                      })
                    }
                    className='mt-1'
                  />
                </div>
                <div>
                  <Label htmlFor='footer-logo-desktop-height'>
                    Desktop max height (px)
                  </Label>
                  <Input
                    id='footer-logo-desktop-height'
                    type='number'
                    min={16}
                    max={200}
                    value={
                      settings.footer.logoSize?.desktopMaxHeight ??
                      DEFAULT_FOOTER_LOGO_SIZE.desktopMaxHeight
                    }
                    onChange={(e) =>
                      updateFooter("logoSize", {
                        ...(settings.footer.logoSize ??
                          DEFAULT_FOOTER_LOGO_SIZE),
                        desktopMaxHeight:
                          Number(e.target.value) ||
                          DEFAULT_FOOTER_LOGO_SIZE.desktopMaxHeight,
                      })
                    }
                    className='mt-1'
                  />
                </div>
                <div>
                  <Label htmlFor='footer-logo-mobile-width'>
                    Mobile width (px)
                  </Label>
                  <Input
                    id='footer-logo-mobile-width'
                    type='number'
                    min={20}
                    max={300}
                    value={
                      settings.footer.logoSize?.mobileWidth ??
                      DEFAULT_FOOTER_LOGO_SIZE.mobileWidth
                    }
                    onChange={(e) =>
                      updateFooter("logoSize", {
                        ...(settings.footer.logoSize ??
                          DEFAULT_FOOTER_LOGO_SIZE),
                        mobileWidth:
                          Number(e.target.value) ||
                          DEFAULT_FOOTER_LOGO_SIZE.mobileWidth,
                      })
                    }
                    className='mt-1'
                  />
                </div>
                <div>
                  <Label htmlFor='footer-logo-mobile-height'>
                    Mobile max height (px)
                  </Label>
                  <Input
                    id='footer-logo-mobile-height'
                    type='number'
                    min={16}
                    max={120}
                    value={
                      settings.footer.logoSize?.mobileMaxHeight ??
                      DEFAULT_FOOTER_LOGO_SIZE.mobileMaxHeight
                    }
                    onChange={(e) =>
                      updateFooter("logoSize", {
                        ...(settings.footer.logoSize ??
                          DEFAULT_FOOTER_LOGO_SIZE),
                        mobileMaxHeight:
                          Number(e.target.value) ||
                          DEFAULT_FOOTER_LOGO_SIZE.mobileMaxHeight,
                      })
                    }
                    className='mt-1'
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer Text Logo */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Text Logo</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor='footer-logo-text'>
                Text shown when no footer logo image is uploaded
              </Label>
              <Input
                id='footer-logo-text'
                value={settings.footer.logoText ?? ""}
                onChange={(e) => updateFooter("logoText", e.target.value)}
                placeholder='e.g. LEBSY'
                className='mt-1'
              />
              {settings.header.navbarStyle === "minimal" && (
                <div className='mt-2'>
                  <Label className='text-xs text-muted-foreground flex items-center gap-1'>
                    <Languages className='w-3 h-3' /> Arabic
                  </Label>
                  <Input
                    dir='rtl'
                    value={settings.footer.logoTextAr ?? ""}
                    onChange={(e) => updateFooter("logoTextAr", e.target.value)}
                    placeholder='Arabic text logo'
                    className='mt-0.5'
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Footer Description</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor='footer-description'>
                Short description shown in the footer brand column
              </Label>
              <Textarea
                id='footer-description'
                value={settings.footer.description}
                onChange={(e) => updateFooter("description", e.target.value)}
                placeholder='e.g. Curated fashion, quiet confidence.'
                rows={3}
                className='mt-1'
              />
              {settings.header.navbarStyle === "minimal" && (
                <div className='mt-2'>
                  <Label className='text-xs text-muted-foreground flex items-center gap-1'>
                    <Languages className='w-3 h-3' /> Arabic
                  </Label>
                  <Textarea
                    dir='rtl'
                    value={settings.footer.descriptionAr ?? ""}
                    onChange={(e) => updateFooter("descriptionAr", e.target.value)}
                    placeholder='الوصف بالعربية'
                    rows={3}
                    className='mt-0.5'
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Copyright */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Copyright Text</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor='footer-copyright'>
                Custom copyright text (leave empty to use store name)
              </Label>
              <Input
                id='footer-copyright'
                value={settings.footer.copyright}
                onChange={(e) => updateFooter("copyright", e.target.value)}
                placeholder='e.g. My Brand Inc.'
                className='mt-1'
              />
              {settings.header.navbarStyle === "minimal" && (
                <div className='mt-2'>
                  <Label className='text-xs text-muted-foreground flex items-center gap-1'>
                    <Languages className='w-3 h-3' /> Arabic
                  </Label>
                  <Input
                    dir='rtl'
                    value={settings.footer.copyrightAr ?? ""}
                    onChange={(e) => updateFooter("copyrightAr", e.target.value)}
                    placeholder='حقوق النشر بالعربية'
                    className='mt-0.5'
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Newsletter toggle */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Newsletter Section</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='flex items-center justify-between'>
                <Label htmlFor='show-newsletter'>
                  Show newsletter signup in footer
                </Label>
                <Switch
                  id='show-newsletter'
                  checked={settings.footer.showNewsletter}
                  onCheckedChange={(v) => updateFooter("showNewsletter", v)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Footer Link Groups */}
          <Card>
            <CardHeader className='flex flex-row items-center justify-between'>
              <CardTitle className='text-base'>Footer Link Groups</CardTitle>
              <Button variant='outline' size='sm' onClick={addLinkGroup}>
                <Plus className='w-4 h-4 mr-1' />
                Add Group
              </Button>
            </CardHeader>
            <CardContent className='space-y-6'>
              {settings.footer.footerLinkGroups.length === 0 && (
                <p className='text-sm text-muted-foreground'>
                  No footer link groups configured.
                </p>
              )}
              {settings.footer.footerLinkGroups.map((group) => (
                <div key={group.id} className='border rounded-lg p-4 space-y-3'>
                  <div className='flex items-center gap-2'>
                    <Input
                      value={group.title}
                      onChange={(e) =>
                        updateLinkGroupTitle(group.id, e.target.value)
                      }
                      placeholder='Group title'
                      className='font-medium'
                    />
                    <Button
                      variant='ghost'
                      size='icon'
                      className='shrink-0 text-destructive hover:text-destructive'
                      onClick={() => removeLinkGroup(group.id)}>
                      <Trash2 className='w-4 h-4' />
                    </Button>
                  </div>
                  {settings.header.navbarStyle === "minimal" && (
                    <div className='flex items-center gap-2'>
                      <Languages className='w-3.5 h-3.5 text-muted-foreground shrink-0' />
                      <Input
                        dir='rtl'
                        value={group.titleAr ?? ""}
                        onChange={(e) =>
                          updateLinkGroupField(group.id, "titleAr", e.target.value)
                        }
                        placeholder='Arabic group title'
                        className='flex-1'
                      />
                    </div>
                  )}
                  <Separator />
                  {group.links.map((link) => (
                    <div key={link.id} className='flex flex-col gap-2 pl-4'>
                      <div className='flex items-center gap-2'>
                        <Input
                          value={link.label}
                          onChange={(e) =>
                            updateLinkInGroup(
                              group.id,
                              link.id,
                              "label",
                              e.target.value,
                            )
                          }
                          placeholder='Link label'
                          className='flex-1'
                        />
                        <Input
                          value={link.url}
                          onChange={(e) =>
                            updateLinkInGroup(
                              group.id,
                              link.id,
                              "url",
                              e.target.value,
                            )
                          }
                          placeholder='/path'
                          className='flex-1'
                        />
                        <Button
                          variant='ghost'
                          size='icon'
                          className='shrink-0 text-destructive hover:text-destructive'
                          onClick={() => removeLinkFromGroup(group.id, link.id)}>
                          <Trash2 className='w-4 h-4' />
                        </Button>
                      </div>
                      {settings.header.navbarStyle === "minimal" && (
                        <div className='flex items-center gap-2 pl-2'>
                          <Languages className='w-3 h-3 text-muted-foreground shrink-0' />
                          <Input
                            dir='rtl'
                            value={link.labelAr ?? ""}
                            onChange={(e) =>
                              updateLinkInGroup(
                                group.id,
                                link.id,
                                "labelAr",
                                e.target.value,
                              )
                            }
                            placeholder='Arabic link label'
                            className='flex-1'
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => addLinkToGroup(group.id)}
                    className='ml-4'>
                    <Plus className='w-4 h-4 mr-1' />
                    Add Link
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Footer Contact Info (minimal only) */}
          {settings.header.navbarStyle === "minimal" && (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Footer Contact Info</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <p className='text-sm text-muted-foreground'>
                  Phone number and email displayed in a "Contact us" column in the footer.
                </p>
                <div>
                  <Label htmlFor='footer-contact-phone'>Phone Number</Label>
                  <Input
                    id='footer-contact-phone'
                    value={settings.footer.contactPhone ?? ""}
                    onChange={(e) => updateFooter("contactPhone", e.target.value)}
                    placeholder='e.g. 920032057'
                    className='mt-1'
                    dir='ltr'
                  />
                </div>
                <div>
                  <Label htmlFor='footer-contact-email'>Email Address</Label>
                  <Input
                    id='footer-contact-email'
                    type='email'
                    value={settings.footer.contactEmail ?? ""}
                    onChange={(e) => updateFooter("contactEmail", e.target.value)}
                    placeholder='e.g. cs@yourstore.com'
                    className='mt-1'
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Social Links */}
          <Card>
            <CardHeader className='flex flex-row items-center justify-between'>
              <CardTitle className='text-base'>Social Links</CardTitle>
              <Button variant='outline' size='sm' onClick={addSocialLink}>
                <Plus className='w-4 h-4 mr-1' />
                Add Social Link
              </Button>
            </CardHeader>
            <CardContent className='space-y-3'>
              {settings.footer.socialLinks.length === 0 && (
                <p className='text-sm text-muted-foreground'>
                  No social links configured.
                </p>
              )}
              {settings.footer.socialLinks.map((link) => (
                <div
                  key={link.id}
                  className='flex items-center gap-2 p-3 rounded-lg border bg-muted/30'>
                  <Select
                    value={link.platform}
                    onValueChange={(v) =>
                      updateSocialLink(link.id, "platform", v)
                    }>
                    <SelectTrigger className='w-[150px]'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOCIAL_PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={link.url}
                    onChange={(e) =>
                      updateSocialLink(link.id, "url", e.target.value)
                    }
                    placeholder='https://...'
                    className='flex-1'
                  />
                  <Button
                    variant='ghost'
                    size='icon'
                    className='shrink-0 text-destructive hover:text-destructive'
                    onClick={() => removeSocialLink(link.id)}>
                    <Trash2 className='w-4 h-4' />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bottom action bar */}
      <div className='flex items-center justify-between pt-4'>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleResetToDefaults}
          className='text-muted-foreground'>
          Reset to defaults
        </Button>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleReset}
            disabled={!hasUnsavedChanges}>
            <RotateCcw className='w-4 h-4 mr-1' />
            Revert
          </Button>
          <Button
            size='sm'
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}>
            <Save className='w-4 h-4 mr-1' />
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
