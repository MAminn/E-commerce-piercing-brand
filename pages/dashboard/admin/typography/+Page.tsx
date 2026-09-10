import { useEffect, useMemo, useState } from "react";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "#root/components/ui/card";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Badge } from "#root/components/ui/badge";
import { Separator } from "#root/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#root/components/ui/dialog";
import { Loader2, Plus, Trash2, Type } from "lucide-react";

// ─── Types (mirrors backend/typography) ────────────────────────────────────

interface CustomFontFile {
  id: string;
  familyName: string;
  weight: number;
  style: "normal" | "italic";
  fileUrl: string;
  format: "woff2" | "woff" | "ttf";
}

type TypographyRoleKey =
  | "heading"
  | "body"
  | "buttons"
  | "nav"
  | "productTitle"
  | "price"
  | "formInput";

interface RoleAssignment {
  familyName: string;
  weight: number;
}

type TypographyRoles = Record<TypographyRoleKey, RoleAssignment | null>;

interface TypographySettings {
  roles: TypographyRoles;
}

const ROLE_LABELS: Record<TypographyRoleKey, { label: string; description: string }> = {
  heading: {
    label: "Headings",
    description: "h1–h6 across the whole site.",
  },
  body: {
    label: "Body Text",
    description: "Paragraphs, lists, and descriptions.",
  },
  buttons: {
    label: "Buttons & CTAs",
    description: "Every button and call-to-action.",
  },
  nav: {
    label: "Navigation Links",
    description: "Header and footer navigation links.",
  },
  productTitle: {
    label: "Product Titles",
    description: "Product names on cards, cart, and detail pages.",
  },
  price: {
    label: "Prices",
    description: "Price and discount text.",
  },
  formInput: {
    label: "Form Inputs & Labels",
    description: "Text fields, selects, and form labels.",
  },
};

const ROLE_ORDER: TypographyRoleKey[] = [
  "heading",
  "body",
  "buttons",
  "nav",
  "productTitle",
  "price",
  "formInput",
];

const WEIGHT_LABELS: Record<number, string> = {
  100: "100 — Thin",
  200: "200 — Extra Light",
  300: "300 — Light",
  400: "400 — Regular",
  500: "500 — Medium",
  600: "600 — Semi Bold",
  700: "700 — Bold",
  800: "800 — Extra Bold",
  900: "900 — Black",
};

const DEFAULT_SETTINGS: TypographySettings = {
  roles: {
    heading: null,
    body: null,
    buttons: null,
    nav: null,
    productTitle: null,
    price: null,
    formInput: null,
  },
};

export default function TypographyPage() {
  const [fonts, setFonts] = useState<CustomFontFile[]>([]);
  const [settings, setSettings] = useState<TypographySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<TypographyRoleKey | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFamily, setUploadFamily] = useState("");
  const [uploadWeight, setUploadWeight] = useState<number>(400);
  const [uploadStyle, setUploadStyle] = useState<"normal" | "italic">("normal");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [fontsResult, settingsResult] = await Promise.all([
        trpc.typography.listFonts.query(),
        trpc.typography.getSettings.query(),
      ]);
      if (fontsResult.success) setFonts(fontsResult.result as CustomFontFile[]);
      if (settingsResult.success)
        setSettings(settingsResult.result as TypographySettings);
    } catch {
      toast.error("Failed to load typography settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const families = useMemo(() => {
    const map = new Map<string, CustomFontFile[]>();
    for (const font of fonts) {
      const list = map.get(font.familyName) ?? [];
      list.push(font);
      map.set(font.familyName, list);
    }
    return Array.from(map.entries()).map(([familyName, files]) => ({
      familyName,
      files: files.sort((a, b) => a.weight - b.weight),
    }));
  }, [fonts]);

  const existingFamilyNames = useMemo(
    () => Array.from(new Set(fonts.map((f) => f.familyName))),
    [fonts],
  );

  const weightsForFamily = (familyName: string): number[] =>
    Array.from(
      new Set(fonts.filter((f) => f.familyName === familyName).map((f) => f.weight)),
    ).sort((a, b) => a - b);

  const saveRole = async (role: TypographyRoleKey, assignment: RoleAssignment | null) => {
    const next: TypographySettings = {
      roles: { ...settings.roles, [role]: assignment },
    };
    const previous = settings;
    setSettings(next);
    setSavingRole(role);
    try {
      const result = await trpc.typography.updateSettings.mutate(next);
      if (!result.success) {
        setSettings(previous);
        toast.error(result.error || "Failed to save");
      }
    } catch {
      setSettings(previous);
      toast.error("Failed to save");
    } finally {
      setSavingRole(null);
    }
  };

  const handleUpload = async () => {
    if (!uploadFamily.trim()) {
      toast.error("Family name is required");
      return;
    }
    if (!uploadFile) {
      toast.error("Choose a font file");
      return;
    }
    if (uploadFile.size > 2 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 2MB.");
      return;
    }
    setUploading(true);
    try {
      const buffer = new Uint8Array(await uploadFile.arrayBuffer());
      const result = await trpc.typography.uploadFontFile.mutate({
        file: { name: uploadFile.name, type: uploadFile.type, buffer },
        familyName: uploadFamily.trim(),
        weight: uploadWeight,
        style: uploadStyle,
      });
      if (result.success) {
        toast.success("Font uploaded");
        setUploadOpen(false);
        setUploadFamily("");
        setUploadWeight(400);
        setUploadStyle("normal");
        setUploadFile(null);
        fetchAll();
      } else {
        toast.error(result.error || "Upload failed");
      }
    } catch {
      toast.error("Failed to upload font");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const result = await trpc.typography.deleteFontFile.mutate({ id });
      if (result.success) {
        toast.success("Font file removed");
        fetchAll();
      } else {
        toast.error(result.error || "Failed to remove font file");
      }
    } catch {
      toast.error("Failed to remove font file");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <Loader2 className='w-6 h-6 animate-spin text-muted-foreground' />
      </div>
    );
  }

  return (
    <div className='max-w-5xl mx-auto p-4 md:p-6 space-y-6'>
      <div>
        <h1 className='text-2xl font-semibold'>Typography</h1>
        <p className='text-sm text-muted-foreground'>
          Upload your own fonts and choose which weight applies to which part
          of the site — applies everywhere, regardless of which template is
          active. Anything left unassigned keeps the site's current default
          look.
        </p>
      </div>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between gap-4 space-y-0'>
          <div>
            <CardTitle className='text-base'>Font Families</CardTitle>
            <CardDescription>
              Upload one file per weight/style — group them under the same
              family name to build a real family.
            </CardDescription>
          </div>
          <Button type='button' size='sm' onClick={() => setUploadOpen(true)}>
            <Plus className='w-4 h-4' />
            Upload Font
          </Button>
        </CardHeader>
        <CardContent>
          {families.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No fonts uploaded yet — everything below uses the site defaults.
            </p>
          ) : (
            <div className='space-y-4'>
              {families.map(({ familyName, files }) => (
                <div key={familyName} className='border rounded-md p-3'>
                  <p
                    className='text-base font-medium mb-2'
                    style={{ fontFamily: `"${familyName}"` }}>
                    {familyName} — The quick brown fox
                  </p>
                  <div className='flex flex-wrap gap-2'>
                    {files.map((file) => (
                      <Badge
                        key={file.id}
                        variant='outline'
                        className='gap-1.5 pr-1'>
                        {WEIGHT_LABELS[file.weight] ?? file.weight}
                        {file.style === "italic" && " · Italic"}
                        <button
                          type='button'
                          disabled={deletingId === file.id}
                          onClick={() => handleDelete(file.id)}
                          aria-label={`Remove ${familyName} ${file.weight}`}
                          className='ml-1 rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive transition-colors'>
                          {deletingId === file.id ? (
                            <Loader2 className='w-3 h-3 animate-spin' />
                          ) : (
                            <Trash2 className='w-3 h-3' />
                          )}
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Font Roles</CardTitle>
          <CardDescription>
            Assign an uploaded family + weight to each part of the site.
            Leave a role unset to keep the current default font there.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {ROLE_ORDER.map((role, idx) => {
            const assignment = settings.roles[role];
            const weights = assignment ? weightsForFamily(assignment.familyName) : [];
            return (
              <div key={role}>
                {idx > 0 && <Separator className='mb-4' />}
                <div className='flex flex-col sm:flex-row sm:items-center gap-3'>
                  <div className='sm:w-52 shrink-0'>
                    <p className='text-sm font-medium'>{ROLE_LABELS[role].label}</p>
                    <p className='text-xs text-muted-foreground'>
                      {ROLE_LABELS[role].description}
                    </p>
                  </div>

                  <Select
                    value={assignment?.familyName ?? "__default__"}
                    disabled={savingRole === role || existingFamilyNames.length === 0}
                    onValueChange={(value) => {
                      if (value === "__default__") {
                        saveRole(role, null);
                        return;
                      }
                      const defaultWeight = weightsForFamily(value)[0] ?? 400;
                      saveRole(role, { familyName: value, weight: defaultWeight });
                    }}>
                    <SelectTrigger className='w-full sm:w-48'>
                      <SelectValue placeholder='Site default' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__default__'>Site default</SelectItem>
                      {existingFamilyNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={assignment ? String(assignment.weight) : undefined}
                    disabled={!assignment || savingRole === role}
                    onValueChange={(value) =>
                      assignment &&
                      saveRole(role, { familyName: assignment.familyName, weight: Number(value) })
                    }>
                    <SelectTrigger className='w-full sm:w-44'>
                      <SelectValue placeholder='Weight' />
                    </SelectTrigger>
                    <SelectContent>
                      {weights.map((w) => (
                        <SelectItem key={w} value={String(w)}>
                          {WEIGHT_LABELS[w] ?? w}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <p
                    className='text-sm text-muted-foreground sm:ml-2'
                    style={
                      assignment
                        ? { fontFamily: `"${assignment.familyName}"`, fontWeight: assignment.weight }
                        : undefined
                    }>
                    Preview text
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <Type className='w-4 h-4' />
              Upload Font
            </DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <div>
              <Label htmlFor='font-family-name'>Family name</Label>
              <Input
                id='font-family-name'
                list='existing-font-families'
                placeholder='e.g. Brand Sans'
                value={uploadFamily}
                onChange={(e) => setUploadFamily(e.target.value)}
                className='mt-1'
              />
              <datalist id='existing-font-families'>
                {existingFamilyNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <p className='text-xs text-muted-foreground mt-1'>
                Reuse an existing name to add another weight to that family.
              </p>
            </div>

            <div className='flex gap-3'>
              <div className='flex-1'>
                <Label>Weight</Label>
                <Select
                  value={String(uploadWeight)}
                  onValueChange={(value) => setUploadWeight(Number(value))}>
                  <SelectTrigger className='mt-1 w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(WEIGHT_LABELS).map(([weight, label]) => (
                      <SelectItem key={weight} value={weight}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='flex-1'>
                <Label>Style</Label>
                <Select
                  value={uploadStyle}
                  onValueChange={(value) => setUploadStyle(value as "normal" | "italic")}>
                  <SelectTrigger className='mt-1 w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='normal'>Normal</SelectItem>
                    <SelectItem value='italic'>Italic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor='font-file-input'>Font file</Label>
              <Input
                id='font-file-input'
                type='file'
                accept='.woff2,.woff,.ttf'
                className='mt-1'
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
              <p className='text-xs text-muted-foreground mt-1'>
                WOFF2, WOFF, or TTF — max 2MB.
              </p>
            </div>

            <Button type='button' className='w-full' disabled={uploading} onClick={handleUpload}>
              {uploading && <Loader2 className='w-4 h-4 animate-spin' />}
              Upload
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
