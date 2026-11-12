import { useState } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { Button } from "#root/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#root/components/ui/dropdown-menu";
import { useToast } from "#root/components/ui/use-toast";

/** The Orders page filters as the export endpoint expects them. */
export type OrdersExportFilters = {
  status?: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  dateFrom?: string;
  dateTo?: string;
  dateLabel?: string;
  paymentIssueOnly?: boolean;
  search?: string;
};

type Scope = "all" | "filtered";

const FALLBACK_FILE_NAME = "perce-orders.xlsx";

function fileNameFrom(disposition: string | null): string {
  const match = /filename="([^"]+)"/.exec(disposition ?? "");
  return match?.[1] ?? FALLBACK_FILE_NAME;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * "Export" button for the admin Orders page: downloads every order, or the
 * orders matching the current filters, as an Excel workbook (orders, items,
 * Sets, status history, webhooks). The server reads all matching orders,
 * not just the page on screen.
 */
export function OrdersExportMenu({
  getFilters,
  filtersActive,
}: {
  /** Read at click time so the export uses the filters as they are now. */
  getFilters: () => OrdersExportFilters;
  filtersActive: boolean;
}) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState<Scope | null>(null);

  const runExport = async (scope: Scope) => {
    if (exporting) return;
    setExporting(scope);
    try {
      const body = scope === "all" ? { scope } : { scope, ...getFilters() };
      const res = await fetch("/api/admin/orders/export", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let message = `Export failed (HTTP ${res.status})`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          // keep the generic message
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const fileName = fileNameFrom(res.headers.get("Content-Disposition"));
      saveBlob(blob, fileName);
      const count = Number(res.headers.get("X-Export-Order-Count") ?? Number.NaN);
      toast({
        title: "Export ready",
        description: Number.isFinite(count)
          ? `${count} order${count === 1 ? "" : "s"} saved to ${fileName}`
          : `Saved to ${fileName}`,
      });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "The export could not be generated.",
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          size='sm'
          variant='outline'
          className='h-9 gap-1.5'
          disabled={exporting !== null}
          aria-label='Export orders to Excel'
          data-testid='orders-export-trigger'>
          {exporting ? (
            <Loader2 className='h-3.5 w-3.5 animate-spin' />
          ) : (
            <Download className='h-3.5 w-3.5' />
          )}
          {exporting ? "Exporting…" : "Export"}
          {!exporting && <ChevronDown className='h-3.5 w-3.5 opacity-60' />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-64'>
        <DropdownMenuLabel className='text-xs font-medium text-muted-foreground'>
          Excel workbook (.xlsx)
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid='orders-export-all'
          onSelect={() => void runExport("all")}
          className='flex-col items-start gap-0.5'>
          <span className='text-sm'>Export all orders</span>
          <span className='text-xs text-muted-foreground'>
            Every order, any status or date
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid='orders-export-filtered'
          disabled={!filtersActive}
          onSelect={() => void runExport("filtered")}
          className='flex-col items-start gap-0.5'>
          <span className='text-sm'>Export filtered orders</span>
          <span className='text-xs text-muted-foreground'>
            {filtersActive
              ? "Every order matching the current filters"
              : "No filters applied"}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
