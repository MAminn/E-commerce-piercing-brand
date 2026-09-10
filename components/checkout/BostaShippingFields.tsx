"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "#root/components/ui/button";
import { Label } from "#root/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "#root/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#root/components/ui/popover";
import { cn } from "#root/lib/utils";
import { trpc } from "#root/shared/trpc/client";

export interface BostaShippingSelection {
  city: string;
  zone: string;
  zoneId: string;
  districtId: string;
  districtName: string;
}

interface BostaShippingFieldsProps {
  value: BostaShippingSelection | null;
  onChange: (value: BostaShippingSelection | null) => void;
  error?: string;
}

function SearchCombobox({
  id,
  label,
  placeholder,
  searchPlaceholder,
  value,
  options,
  disabled,
  onSelect,
}: {
  id: string;
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  disabled?: boolean;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((o) => o.id === value)?.label ?? "";

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} <span className="text-destructive">*</span>
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <span className="truncate">{selectedLabel || placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.label}
                    onSelect={() => {
                      onSelect(option.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function BostaShippingFields({
  value,
  onChange,
  error,
}: BostaShippingFieldsProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cities, setCities] = useState<
    Array<{
      cityId: string;
      cityName: string;
      zones: Array<{
        zoneId: string;
        zoneName: string;
        districts: Array<{ districtId: string; districtName: string }>;
      }>;
    }>
  >([]);

  const [cityId, setCityId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [districtId, setDistrictId] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await trpc.order.bosta.listShippingLocations.query();
        if (!cancelled) {
          setCities(res.cities);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load shipping areas",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cityOptions = useMemo(
    () => cities.map((c) => ({ id: c.cityId, label: c.cityName })),
    [cities],
  );

  const selectedCity = cities.find((c) => c.cityId === cityId);

  const zoneOptions = useMemo(
    () =>
      (selectedCity?.zones ?? []).map((z) => ({
        id: z.zoneId,
        label: z.zoneName,
      })),
    [selectedCity],
  );

  const selectedZone = selectedCity?.zones.find((z) => z.zoneId === zoneId);

  const districtOptions = useMemo(
    () =>
      (selectedZone?.districts ?? []).map((d) => ({
        id: d.districtId,
        label: d.districtName,
      })),
    [selectedZone],
  );

  useEffect(() => {
    if (!cityId || !zoneId || !districtId) {
      if (value) onChange(null);
      return;
    }

    const city = cities.find((c) => c.cityId === cityId);
    const zone = city?.zones.find((z) => z.zoneId === zoneId);
    const district = zone?.districts.find((d) => d.districtId === districtId);

    if (!city || !zone || !district) return;

    const next: BostaShippingSelection = {
      city: city.cityName,
      zone: zone.zoneName,
      zoneId: zone.zoneId,
      districtId: district.districtId,
      districtName: district.districtName,
    };

    if (
      value?.city !== next.city ||
      value?.zone !== next.zone ||
      value?.districtId !== next.districtId
    ) {
      onChange(next);
    }
  }, [cityId, zoneId, districtId, cities, value, onChange]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading delivery areas…
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="text-sm text-destructive">
        Could not load Bosta delivery areas. {loadError}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <SearchCombobox
        id="bostaCity"
        label="City"
        placeholder="Select city"
        searchPlaceholder="Search cities…"
        value={cityId}
        options={cityOptions}
        onSelect={(id) => {
          setCityId(id);
          setZoneId("");
          setDistrictId("");
        }}
      />
      <SearchCombobox
        id="bostaZone"
        label="Area / Zone"
        placeholder="Select area"
        searchPlaceholder="Search areas…"
        value={zoneId}
        options={zoneOptions}
        disabled={!cityId}
        onSelect={(id) => {
          setZoneId(id);
          setDistrictId("");
        }}
      />
      <SearchCombobox
        id="bostaDistrict"
        label="District"
        placeholder="Select district"
        searchPlaceholder="Search districts…"
        value={districtId}
        options={districtOptions}
        disabled={!zoneId}
        onSelect={setDistrictId}
      />
      {value && (
        <p className="text-xs text-muted-foreground">
          Selected: {value.city} → {value.zone} → {value.districtName}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
