"use client";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { cn } from "#root/lib/utils";
import { Button } from "#root/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "#root/components/ui/form";
import { Input } from "#root/components/ui/input";
import { Textarea } from "#root/components/ui/textarea";
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
import { Check, ChevronsUpDown, XIcon, Zap, Palette } from "lucide-react";
import { FileUploadInput } from "#root/components/file-uploads/FileUpload";
import { MultiFileUploadInput } from "#root/components/file-uploads/MultiFileUpload";

import { Label } from "#root/components/ui/label";
import { Badge } from "#root/components/ui/badge";
import { Switch } from "#root/components/ui/switch";
import { trpc } from "#root/shared/trpc/client";

// Define the interface to match our component
export interface FileMetadata {
  id: string;
  url?: string;
  diskname?: string;
  isPrimary?: boolean;
}

/**
 * Picker for the "Style It With" products shown on this product's page.
 * Fetches the product catalog once on mount and lets the admin search/select
 * any number of products; leaving it empty hides the section on the
 * storefront entirely rather than showing a placeholder.
 */
function StyleItWithPicker({
  value,
  onChange,
  excludeProductId,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  excludeProductId?: string;
}) {
  const [options, setOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    trpc.product.view
      .query({ limit: 100 })
      .then((res) => {
        if (cancelled || !res.success || !res.result) return;
        const items = (res.result.products ?? [])
          .map((p: any) => ({ id: p.product.id as string, name: p.product.name as string }))
          .filter((p: { id: string }) => p.id !== excludeProductId);
        setOptions(items);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [excludeProductId]);

  const selected = options.filter((o) => value.includes(o.id));

  return (
    <FormItem className='flex flex-col'>
      <FormLabel>Style It With (Optional)</FormLabel>
      <p className='text-xs text-muted-foreground -mt-1 mb-1'>
        Select products that pair well with this piece. Leave empty and the
        section is hidden on the product page.
      </p>
      {selected.length > 0 && (
        <div className='flex flex-wrap gap-2 mb-2'>
          {selected.map((p) => (
            <Badge key={p.id} className='p-2'>
              {p.name}
              <button
                type='button'
                className='ml-1'
                onClick={() => onChange(value.filter((id) => id !== p.id))}>
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <FormControl>
            <Button
              type='button'
              variant='outline'
              disabled={isLoading}
              className={cn(
                "w-full justify-between",
                value.length === 0 && "text-muted-foreground",
              )}>
              {isLoading
                ? "Loading products…"
                : value.length === 0
                  ? "Select products"
                  : `${value.length} product${value.length === 1 ? "" : "s"} selected`}
              <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
            </Button>
          </FormControl>
        </PopoverTrigger>
        <PopoverContent className='w-full p-0'>
          <Command>
            <CommandInput placeholder='Search products...' />
            <CommandList>
              <CommandEmpty>No products found.</CommandEmpty>
              <CommandGroup>
                {options.map((p) => {
                  const isSelected = value.includes(p.id);
                  return (
                    <CommandItem
                      key={p.id}
                      onSelect={() => {
                        if (isSelected) {
                          onChange(value.filter((id) => id !== p.id));
                        } else {
                          onChange([...value, p.id]);
                        }
                      }}>
                      <div className='flex items-center'>
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {p.name}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </FormItem>
  );
}

export function ProductForm({
  initialValues,
  categories,
  vendors = [],
  onSuccess,
  isLoading = false,
}: {
  initialValues?: Partial<{
    id: string;
    name: string;
    description: string;
    price: number;
    discountPrice?: number | null;
    stock: number;
    imageId: string;
    productImages: FileMetadata[];
    categoryId: string;
    categoryIds: string[];
    variants: { name: string; values: { value: string; priceModifier?: number }[] }[];
    sortOrder?: number;
    hidden?: boolean;
    bestLayeredWithIds?: string[] | null;
    /** Merchant-only internal reference code, e.g. FB001. */
    internalCode?: string | null;
    /** Merchant-only unit cost in EGP. `null` = not entered yet. */
    costPrice?: number | string | null;
  }>;
  categories: { id: string; name: string }[];
  vendors?: { id: string; name: string }[];
  onSuccess?: () => void;
  isLoading?: boolean;
}) {
  const formSchema = z.object({
    name: z.string().min(1, "Product name is required"),
    description: z
      .string()
      .min(1, "Product description is required")
      .max(3000, "Description must be less than 3000 characters"),
    price: z.coerce.number().min(0, "Price must be greater than 0"),
    discountPrice: z.coerce
      .number()
      .min(0, "Discount price must be greater than 0")
      .nullable()
      .optional(),
    stock: z.coerce.number().int().min(0, "Stock must be greater than 0"),
    imageId: z.string().default(""),
    productImages: z
      .array(
        z.object({
          id: z.string(),
          url: z.string().optional(),
          diskname: z.string().optional(),
          isPrimary: z.boolean().optional(),
        }),
      )
      .min(1, "At least one product image is required")
      .default([]),
    categoryId: z.string().min(1, "Primary category is required"),
    categoryIds: z
      .array(z.string())
      .min(1, "At least one category is required"),
    variants: z
      .array(
        z.object({
          name: z.string(),
          values: z.array(
            z.object({
              value: z.string(),
              priceModifier: z.number().min(0).optional(),
              enabledOverride: z.boolean().optional(),
            }),
          ),
        }),
      )
      .optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    hidden: z.boolean().default(false),
    bestLayeredWithIds: z.array(z.string()).optional().default([]),
    /**
     * Merchant-only. Normalized again on the server; doing it here too means
     * the admin sees the canonical form ("FB001") before saving.
     */
    internalCode: z
      .string()
      .max(64, "Internal code must be 64 characters or fewer")
      .optional()
      .default(""),
    /**
     * Merchant-only unit cost in EGP.
     *
     * A cleared number input reads back as `NaN` (`valueAsNumber` on an empty
     * field) and an untouched one as `""`. Both mean "not entered" and must
     * become `null`, NOT 0 — `z.coerce.number()` would turn `""` into 0 and
     * silently record a zero cost on every product the admin never filled in.
     */
    costPrice: z.preprocess(
      (v) =>
        v === "" ||
        v === null ||
        v === undefined ||
        (typeof v === "number" && Number.isNaN(v))
          ? null
          : Number(v),
      z
        .number({ invalid_type_error: "Cost must be a number" })
        .min(0, "Cost cannot be negative")
        .nullable(),
    ),
  });

  // Debug initial values
  console.log("ProductForm received initialValues:", initialValues);

  // Initialize form with validated values
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialValues?.name || "",
      description: initialValues?.description || "",
      sortOrder: initialValues?.sortOrder || 0,
      price: initialValues?.price || 0,
      discountPrice: initialValues?.discountPrice || null,
      stock: initialValues?.stock || 0,
      // Use the primary image ID as the main imageId
      imageId: initialValues?.imageId || "",
      // Ensure we have a valid array of product images
      productImages: Array.isArray(initialValues?.productImages)
        ? initialValues.productImages
        : [],
      // Ensure we have a valid array of variants
      variants: Array.isArray(initialValues?.variants)
        ? initialValues.variants
        : [],
      // Ensure we have valid category IDs
      categoryIds: Array.isArray(initialValues?.categoryIds)
        ? initialValues.categoryIds
        : [],
      // Get the primary category from categoryIds if available, or fallback to the provided categoryId
      categoryId:
        Array.isArray(initialValues?.categoryIds) &&
        initialValues?.categoryIds.length > 0
          ? initialValues.categoryIds[0]
          : initialValues?.categoryId || "",
      hidden: initialValues?.hidden ?? false,
      bestLayeredWithIds: Array.isArray(initialValues?.bestLayeredWithIds)
        ? initialValues.bestLayeredWithIds
        : [],
      internalCode: initialValues?.internalCode ?? "",
      // A stored NULL cost stays null in the form so the input renders empty
      // rather than showing a 0 the admin never entered.
      costPrice:
        initialValues?.costPrice === null ||
        initialValues?.costPrice === undefined
          ? null
          : Number(initialValues.costPrice),
    },
  });

  // Watch form values for debugging
  const watchedValues = form.watch();

  // Log key form values to help debug
  useEffect(() => {
    console.log("Form values updated:", {
      categoryIds: watchedValues.categoryIds,
      categoryId: watchedValues.categoryId,
      productImages: watchedValues.productImages.length,
    });
  }, [
    watchedValues.categoryIds,
    watchedValues.categoryId,
    watchedValues.productImages,
  ]);

  // Watch categoryIds to update categoryId (primary category)
  const categoryIds = form.watch("categoryIds");

  // Update the primary categoryId whenever categoryIds changes
  useEffect(() => {
    if (categoryIds && categoryIds.length > 0) {
      // Ensure we handle potential undefined safely
      const primaryCategoryId = categoryIds[0] ? categoryIds[0] : "";
      console.log("Setting primary categoryId to:", primaryCategoryId);

      // Only update if the value changed to avoid unnecessary rerenders
      if (form.getValues("categoryId") !== primaryCategoryId) {
        form.setValue("categoryId", primaryCategoryId, {
          shouldValidate: true,
        });
      }
    } else {
      console.log("No categories selected, clearing primary categoryId");
      form.setValue("categoryId", "", { shouldValidate: false });
    }
  }, [categoryIds, form]);

  // Log form values for debugging
  useEffect(() => {
    console.log("Form values:", form.getValues());
  }, [form]);

  const [submitting, setSubmitting] = useState(false);

  const handleFormSubmit = async (values: z.infer<typeof formSchema>) => {
    setSubmitting(true);
    console.log("Submitting form with values:", values);

    // Ensure we have at least one image that is primary
    if (values.productImages && values.productImages.length > 0) {
      // If no primary image is set, make the first one primary
      if (!values.productImages.some((img) => img?.isPrimary)) {
        console.log("No primary image found, setting first image as primary");
        if (values.productImages[0]) {
          values.productImages[0].isPrimary = true;
        }
      }

      // Set the primary image's ID as the main imageId for backward compatibility
      const primaryImage = values.productImages.find((img) => img?.isPrimary);
      if (primaryImage?.id) {
        console.log("Using primary image ID:", primaryImage.id);
        values.imageId = primaryImage.id;
      } else if (values.productImages[0]?.id) {
        console.log(
          "No primary image, using first image ID:",
          values.productImages[0].id,
        );
        values.imageId = values.productImages[0].id;
      }
    }

    // Ensure categoryId is set from categoryIds if available
    if (values.categoryIds && values.categoryIds.length > 0) {
      // Safely access the first element
      if (values.categoryIds[0]) {
        console.log(
          "Setting categoryId from categoryIds:",
          values.categoryIds[0],
        );
        values.categoryId = values.categoryIds[0];
      }
    } else if (
      values.categoryId &&
      (!values.categoryIds || values.categoryIds.length === 0)
    ) {
      // If we have a categoryId but no categoryIds, set categoryIds to include the categoryId
      console.log("Setting categoryIds from categoryId:", values.categoryId);
      values.categoryIds = [values.categoryId];
    }

    // Validate required fields
    if (!values.imageId) {
      toast.error("At least one product image is required");
      setSubmitting(false);
      return;
    }

    if (!values.categoryId || values.categoryIds.length === 0) {
      toast.error("At least one category is required");
      setSubmitting(false);
      return;
    }

    try {
      const { trpc } = await import("#root/shared/trpc/client");

      let result: { success: boolean; error?: string };
      if (initialValues?.id) {
        // Update existing product - always include variants to ensure we can remove them
        // This allows clearing all variants when editing
        const payload = {
          id: initialValues.id,
          ...values,
          // Make sure variants is included as at least an empty array
          variants: values.variants || [],
          // Convert null to undefined for type compatibility
          discountPrice: values.discountPrice ?? undefined,
          // Merchant-only. Sent on every save so clearing either field
          // actually clears it — the edit contract treats an ABSENT key as
          // "leave alone", which is what protects clients that predate the
          // fields. Blank cost stays null, never 0.
          internalCode: values.internalCode ?? "",
          costPrice: values.costPrice ?? null,
        };
        result = await trpc.product.edit.mutate(payload);
      } else {
        // Create new product
        result = await trpc.product.create.mutate({
          ...values,
          imageId: values.imageId,
          // Convert null to undefined for type compatibility
          discountPrice: values.discountPrice ?? undefined,
          internalCode: values.internalCode ?? "",
          costPrice: values.costPrice ?? null,
        });
      }

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        initialValues?.id ? "Product updated!" : "Product created!",
      );
      onSuccess?.();
      if (!initialValues?.id) {
        form.reset();
      }
    } catch (error) {
      toast.error("Something went wrong");
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      {isLoading ? (
        <div className='flex justify-center items-center p-8'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900' />
          <p className='ml-3'>Loading product data...</p>
        </div>
      ) : (
        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className='space-y-4 max-h-[70vh] overflow-y-auto p-3'>
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder='Awesome Product' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='description'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <div className='flex items-center gap-2 mb-1'>
                  <DescriptionColorButton
                    value={field.value}
                    onChange={field.onChange}
                  />
                  <span className='text-xs text-muted-foreground'>
                    Select text, then pick a color
                  </span>
                </div>
                <FormControl>
                  <Textarea
                    id='product-description-textarea'
                    placeholder='This product is awesome because...'
                    className='resize-none'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='bestLayeredWithIds'
            render={({ field }) => (
              <StyleItWithPicker
                value={field.value ?? []}
                onChange={field.onChange}
                excludeProductId={initialValues?.id}
              />
            )}
          />

          <div className='grid grid-cols-2 gap-4'>
            <FormField
              control={form.control}
              name='price'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      placeholder='99.99'
                      {...field}
                      onChange={(e) => {
                        field.onChange(e.target.valueAsNumber);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='discountPrice'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount Price</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      placeholder='99.99'
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e.target.valueAsNumber);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='stock'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stock</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      placeholder='100'
                      {...field}
                      onChange={(e) => {
                        field.onChange(e.target.valueAsNumber);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/*
            Merchant-only fields. Neither is ever sent to a storefront client
            and neither takes part in any price the customer pays.
          */}
          <div className='grid grid-cols-2 gap-4 rounded-lg border border-dashed p-3'>
            <div className='col-span-2 -mb-1'>
              <p className='text-xs font-medium text-muted-foreground'>
                Internal only — never shown to customers
              </p>
            </div>

            <FormField
              control={form.control}
              name='internalCode'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Product Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g. FB001'
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                      onBlur={(e) => {
                        // Show the canonical form the server will store, so
                        // the admin isn't surprised by " fb001 " becoming
                        // FB001 after the save.
                        field.onChange(e.target.value.trim().toUpperCase());
                        field.onBlur();
                      }}
                    />
                  </FormControl>
                  <p className='text-xs text-muted-foreground'>
                    Must be unique. Leave blank if not assigned yet.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='costPrice'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Cost (EGP)</FormLabel>
                  <FormControl>
                    <div className='relative'>
                      <Input
                        type='number'
                        min='0'
                        step='0.01'
                        placeholder='0.00'
                        className='pr-12'
                        value={
                          field.value === null || field.value === undefined
                            ? ""
                            : field.value
                        }
                        onChange={(e) => {
                          // Empty input → null, NOT 0. A zero cost is a real
                          // value and has to stay distinguishable from "not
                          // entered yet".
                          const raw = e.target.value;
                          field.onChange(raw === "" ? null : Number(raw));
                        }}
                      />
                      <span className='pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground'>
                        EGP
                      </span>
                    </div>
                  </FormControl>
                  <p className='text-xs text-muted-foreground'>
                    Our unit cost. Leave blank if unknown.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name='hidden'
            render={({ field }) => (
              <FormItem>
                <div className='flex items-center justify-between rounded-lg border p-3'>
                  <div className='space-y-0.5'>
                    <FormLabel>Hide from shop</FormLabel>
                    <p className='text-xs text-muted-foreground'>
                      {field.value
                        ? "Hidden — customers cannot see or buy this product"
                        : "Visible — product appears in the shop"}
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='sortOrder'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sort Order (Optional)</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    placeholder='0'
                    {...field}
                    value={field.value ?? 0}
                    onChange={(e) => {
                      field.onChange(e.target.valueAsNumber);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='productImages'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Product Images</FormLabel>
                <FormControl>
                  <MultiFileUploadInput
                    name='productImages'
                    id='productImages'
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='categoryIds'
            render={({ field }) => (
              <FormItem className='flex flex-col'>
                <FormLabel>Categories (select multiple)</FormLabel>
                <div className='flex flex-wrap gap-2 mb-2'>
                  {field.value.map((categoryId) => {
                    const category = categories.find(
                      (c) => c.id === categoryId,
                    );
                    return category ? (
                      <Badge key={categoryId} className='p-2'>
                        {category.name}
                        <button
                          type='button'
                          className='ml-1'
                          onClick={() => {
                            const newCategoryIds = field.value.filter(
                              (id) => id !== categoryId,
                            );
                            field.onChange(newCategoryIds);
                          }}>
                          ×
                        </button>
                      </Badge>
                    ) : null;
                  })}
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        type='button'
                        variant='outline'
                        className={cn(
                          "w-full justify-between",
                          field.value.length === 0 && "text-muted-foreground",
                        )}>
                        {field.value.length === 0
                          ? "Select categories"
                          : `${field.value.length} ${
                              field.value.length === 1
                                ? "category"
                                : "categories"
                            } selected`}
                        <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className='w-full p-0'>
                    <Command>
                      <CommandInput placeholder='Search categories...' />
                      <CommandList>
                        <CommandEmpty>No categories found.</CommandEmpty>
                        <CommandGroup>
                          {categories.map((c) => (
                            <CommandItem
                              key={c.id}
                              onSelect={() => {
                                const isSelected = field.value.includes(c.id);
                                let newCategoryIds = [...field.value];

                                if (isSelected) {
                                  // Remove if already selected
                                  newCategoryIds = newCategoryIds.filter(
                                    (id) => id !== c.id,
                                  );
                                } else {
                                  // Add if not selected
                                  newCategoryIds.push(c.id);
                                }

                                field.onChange(newCategoryIds);
                              }}>
                              <div className='flex items-center'>
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value.includes(c.id)
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                {c.name}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Hidden field for storing the primary categoryId */}
          <input type='hidden' {...form.register("categoryId")} />

          <FormField
            name='variants'
            control={form.control}
            render={({ field }) => {
              return (
                <FormItem>
                  <FormLabel className='text-lg'>Variants (Optional)</FormLabel>
                  <p className='text-sm text-muted-foreground mb-2'>
                    Add product variants like size, color, etc. if needed
                  </p>
                  <FormControl>
                    <VariantsInput
                      value={field.value}
                      onChange={(v) => field.onChange(v)}
                    />
                  </FormControl>
                </FormItem>
              );
            }}
          />
          <Button type='submit' size='lg' className='w-full'>
            Submit
          </Button>
        </form>
      )}
    </Form>
  );
}

export function VariantsInput({
  value,
  onChange,
}: {
  value: { name: string; values: { value: string; priceModifier?: number; enabledOverride?: boolean }[] }[] | undefined;
  onChange: (value: { name: string; values: { value: string; priceModifier?: number; enabledOverride?: boolean }[] }[]) => void;
}) {
  // Ensure value is always an array
  const variants = value || [];

  const [presets, setPresets] = useState<
    { id: string; name: string; values: string[]; strikethroughValues?: string[] }[]
  >([]);
  const [presetsOpen, setPresetsOpen] = useState(false);

  useEffect(() => {
    trpc.settings.getVariantPresets
      .query()
      .then((result) => {
        if (result.success && Array.isArray(result.result)) {
          const fetched = result.result as unknown as { id: string; name: string; values: string[]; strikethroughValues?: string[] }[];
          setPresets(fetched);
          // Auto-apply all presets when creating a new product (empty variants)
          if ((!value || value.length === 0) && fetched.length > 0) {
            const autoApplied = fetched.map((p) => ({
              name: p.name,
              values: p.values.map((v) => ({ value: v, priceModifier: 0 })),
            }));
            onChange(autoApplied);
          }
        }
      })
      .catch(() => {});
  }, []);

  const applyPreset = (preset: { name: string; values: string[] }) => {
    // Check if a variant with this name already exists
    const existingIndex = variants.findIndex(
      (v) => v.name.toLowerCase() === preset.name.toLowerCase(),
    );
    if (existingIndex >= 0) {
      // Merge values (preserve existing modifiers, add new values with 0 modifier)
      const existing = variants[existingIndex]!;
      const existingValueStrings = existing.values.map((v) => v.value);
      const newVals = preset.values
        .filter((v) => !existingValueStrings.includes(v))
        .map((v) => ({ value: v, priceModifier: 0 }));
      const merged = [...existing.values, ...newVals];
      const newValue = [...variants];
      newValue[existingIndex] = { ...existing, values: merged };
      onChange(newValue);
    } else {
      onChange([
        ...variants,
        { name: preset.name, values: preset.values.map((v) => ({ value: v, priceModifier: 0 })) },
      ]);
    }
    setPresetsOpen(false);
    toast.success(`Applied "${preset.name}" preset`);
  };

  return (
    <div className='flex flex-col gap-2'>
      {variants.map((v, i) => (
        <Fragment
          key={`variant.${
            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
            i
          }`}>
          <VariantInput
            value={v}
            onChange={(v) => {
              const newValue = [...variants];
              newValue[i] = v;
              onChange(newValue);
            }}
            globalStrikethroughValues={
              presets.find((p) => p.name.toLowerCase() === v.name.toLowerCase())
                ?.strikethroughValues ?? []
            }
          />
          <Button
            size='sm'
            className='self-end opacity-90'
            variant={"destructive"}
            type='button'
            onClick={() => {
              const newValue = [...variants];
              newValue.splice(i, 1);
              onChange(newValue);
            }}>
            <XIcon />
            Remove Variant
          </Button>
        </Fragment>
      ))}

      <div className='flex items-center gap-2'>
        <Button
          type='button'
          onClick={() =>
            onChange([
              ...variants,
              { name: `Variant ${variants.length + 1}`, values: [] },
            ])
          }>
          Add Variant
        </Button>
        {presets.length > 0 && (
          <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
            <PopoverTrigger asChild>
              <Button type='button' variant='outline'>
                <Zap className='mr-1 h-4 w-4' />
                Apply Preset
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-64 p-2' align='start'>
              <div className='space-y-1'>
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type='button'
                    className='w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted'
                    onClick={() => applyPreset(preset)}>
                    <span className='font-medium'>{preset.name}</span>
                    <span className='text-muted-foreground ml-1 text-xs'>
                      ({preset.values.join(", ")})
                    </span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

export function VariantInput({
  value,
  onChange,
  globalStrikethroughValues = [],
}: {
  value: {
    name: string;
    values: { value: string; priceModifier?: number; enabledOverride?: boolean }[];
  };
  onChange: (value: { name: string; values: { value: string; priceModifier?: number; enabledOverride?: boolean }[] }) => void;
  /** Values that are globally strikethrough for this variant name (from preset) */
  globalStrikethroughValues?: string[];
}) {
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-col gap-1'>
        <Label>Name</Label>
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </div>

      <div className='flex flex-col gap-1'>
        <Label>Values & Price Modifiers</Label>
        <div className='space-y-2'>
          {value.values.map((vv, idx) => {
            const isGloballyStruck = globalStrikethroughValues.includes(vv.value);
            const isOverridden = vv.enabledOverride === true;
            return (
            <div key={idx} className='flex items-center gap-2'>
              <Input
                className='flex-1'
                placeholder='Value (e.g. 100ml)'
                value={vv.value}
                onChange={(e) => {
                  const updated = [...value.values];
                  updated[idx] = { ...vv, value: e.target.value };
                  onChange({ ...value, values: updated });
                }}
              />
              <div className='flex items-center gap-1 w-36 flex-shrink-0'>
                <span className='text-xs text-muted-foreground'>+</span>
                <Input
                  type='number'
                  min={0}
                  placeholder='0'
                  className='w-full'
                  value={vv.priceModifier ?? 0}
                  onChange={(e) => {
                    const updated = [...value.values];
                    updated[idx] = { ...vv, priceModifier: Number(e.target.value) || 0 };
                    onChange({ ...value, values: updated });
                  }}
                />
                <span className='text-xs text-muted-foreground whitespace-nowrap'>EGP</span>
              </div>
              {/* Override toggle — only shown for globally-strikethrough values */}
              {isGloballyStruck && (
                <button
                  type='button'
                  title={isOverridden ? 'Currently enabled for this product (click to re-apply global strikethrough)' : 'Globally disabled — click to enable for this product only'}
                  onClick={() => {
                    const updated = [...value.values];
                    updated[idx] = { ...vv, enabledOverride: !isOverridden };
                    onChange({ ...value, values: updated });
                  }}
                  className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-medium transition-colors ${
                    isOverridden
                      ? 'border-green-500 text-green-600 bg-green-50 hover:bg-green-100'
                      : 'border-orange-400 text-orange-500 bg-orange-50 hover:bg-orange-100 line-through'
                  }`}>
                  {isOverridden ? 'ON' : 'OFF'}
                </button>
              )}
              <Button
                type='button'
                size='icon'
                variant='ghost'
                className='h-8 w-8 text-destructive hover:text-destructive flex-shrink-0'
                onClick={() => {
                  const updated = value.values.filter((_, i) => i !== idx);
                  onChange({ ...value, values: updated });
                }}>
                <XIcon className='w-3.5 h-3.5' />
              </Button>
            </div>
            );
          })}
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() =>
              onChange({
                ...value,
                values: [...value.values, { value: '', priceModifier: 0 }],
              })
            }>
            + Add Value
          </Button>
        </div>
        <p className='text-xs text-muted-foreground'>
          Set a price modifier (e.g. +50 EGP for 100ml) — added on top of base price
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Description Color Button
   Wraps the selected text in the description textarea with
   [color:#hex]...[/color] tags
   ═══════════════════════════════════════════════════════════════════ */

const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
  "#000000",
];

function DescriptionColorButton({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customColor, setCustomColor] = useState("#000000");

  const applyColor = (color: string) => {
    const textarea = document.getElementById(
      "product-description-textarea",
    ) as HTMLTextAreaElement | null;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end) {
      // No selection — insert a placeholder
      const tag = `[color:${color}]colored text[/color]`;
      const newVal = value.slice(0, start) + tag + value.slice(end);
      onChange(newVal);
    } else {
      const selected = value.slice(start, end);
      const newVal =
        value.slice(0, start) +
        `[color:${color}]${selected}[/color]` +
        value.slice(end);
      onChange(newVal);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type='button' variant='outline' size='sm' className='h-7 px-2'>
          <Palette className='h-3.5 w-3.5 mr-1' />
          Color
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-52 p-3' align='start'>
        <div className='grid grid-cols-5 gap-1.5 mb-2'>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type='button'
              className='w-7 h-7 rounded-full border border-gray-200 hover:scale-110 transition-transform'
              style={{ backgroundColor: c }}
              onClick={() => applyColor(c)}
              aria-label={`Apply color ${c}`}
            />
          ))}
        </div>
        <div className='flex items-center gap-1.5'>
          <input
            type='color'
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            className='w-7 h-7 rounded cursor-pointer border-0 p-0'
          />
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='flex-1 h-7 text-xs'
            onClick={() => applyColor(customColor)}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
