import { useState } from "react";
import { toast } from "sonner";
import { useRole } from "#root/lib/context/RoleContext";
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
import { Alert, AlertTitle, AlertDescription } from "#root/components/ui/alert";
import { Download, Upload, Loader2, AlertTriangle } from "lucide-react";

const CONFIRM_PHRASE = "OVERWRITE_DEV";

export default function SuperadminSyncPage() {
  const { userRole } = useRole();

  if (userRole !== "superadmin") {
    // Deliberately generic — this route isn't linked anywhere, and a 404-ish
    // response avoids confirming to a curious admin that anything special
    // lives here.
    return (
      <div className="p-8 text-center text-muted-foreground">Not found.</div>
    );
  }

  return <SyncTools />;
}

function SyncTools() {
  const [file, setFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastWarning, setLastWarning] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      // Plain navigation instead of fetch+blob: the browser's native download
      // flow streams the response straight to disk instead of buffering a
      // potentially very large zip in a JS Blob first.
      window.location.href = "/api/superadmin/sync/export";
      toast.success("Export started — check your downloads.");
    } finally {
      setTimeout(() => setExporting(false), 1500);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Choose an export .zip file first");
      return;
    }
    if (confirmText !== CONFIRM_PHRASE) {
      toast.error(`Type ${CONFIRM_PHRASE} exactly to confirm`);
      return;
    }

    setImporting(true);
    setLastWarning(null);
    try {
      const formData = new FormData();
      formData.append("confirm", CONFIRM_PHRASE);
      formData.append("file", file);

      const response = await fetch("/api/superadmin/sync/import", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!result.success) {
        toast.error(result.error || "Import failed");
        return;
      }

      if (result.warning) {
        setLastWarning(result.warning);
        toast.warning("Import finished with warnings — see details below");
      } else {
        toast.success("Dev database and uploads fully replaced from the import");
      }
      setFile(null);
      setConfirmText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Environment Sync</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Superadmin-only. Pulls a full snapshot of this environment's
          database, or overwrites this environment with a previously
          exported one. Uploaded files stay on their persistent volume and
          load via a fallback to the live site instead of being copied.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" /> Export database
          </CardTitle>
          <CardDescription>
            Downloads a .zip containing a full database dump. Uploaded files
            (product photos, logos, etc.) are NOT included — they stay on
            the persistent volume. Set PROD_ASSET_ORIGIN in your local .env
            so missing images fall back to loading from the live site
            instead. Includes all data — customers, orders, credentials —
            so treat the downloaded file as sensitive.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download full export
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Import (overwrite this environment)
          </CardTitle>
          <CardDescription>
            Fully replaces this environment's database with the contents of
            an uploaded export. This cannot be undone. Refused automatically
            when running in production.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Destructive action</AlertTitle>
            <AlertDescription>
              Everything currently in this environment's database and
              uploads/ folder will be permanently overwritten.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="import-file">Export .zip file</Label>
            <Input
              id="import-file"
              type="file"
              accept=".zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-text">
              Type <code className="font-mono">{CONFIRM_PHRASE}</code> to confirm
            </Label>
            <Input
              id="confirm-text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
            />
          </div>

          <Button
            variant="destructive"
            onClick={handleImport}
            disabled={importing || !file || confirmText !== CONFIRM_PHRASE}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Overwrite this environment
          </Button>

          {lastWarning && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Completed with warnings</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap font-mono text-xs">
                {lastWarning}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
