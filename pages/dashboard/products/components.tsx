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
 * Picker for the "Best Layered With" products shown on this product's page.
 * Fetches the product catalog once on mount and lets the admin search/select
 * any number of products; leaving it empty makes the storefront show a
 * "stay tuned" note instead of the section's contents.
 */
function BestLayeredWithPicker({
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
      <FormLabel>Best Layered With (Optional)</FormLabel>
      <p className='text-xs text-muted-foreground -mt-1 mb-1'>
        Shown in the "Best Layered With" section on this product's page. Leave
        empty and the section shows "Stay tuned for our recommended layering
        combination.." instead.
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

/**
 * Comma-separated text input for the badges array. Keeps its own local raw
 * text so a trailing/mid-typing comma isn't immediately stripped by the
 * split+trim+filter pass (that pass only runs when committing to the array).
 */
function BadgesInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (badges: string[]) => void;
}) {
  const [text, setText] = useState(value.join(", "));

  useEffect(() => {
    setText(value.join(", "));
    // Only resync from external value changes (e.g. form reset), not our own keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.join(",")]);

  return (
    <FormItem>
      <FormLabel>Badges (comma-separated)</FormLabel>
      <FormControl>
        <Input
          placeholder='Vegan, Cruelty-free, Clean ingredients'
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            );
          }}
        />
      </FormControl>
      <FormMessage />
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
    inspiredBy?: string;
    sortOrder?: number;
    hidden?: boolean;
    fragranceInfo?: {
      tagline?: string;
      taglineAr?: string;
      about?: string;
      aboutAr?: string;
      longevity?: string;
      longevityAr?: string;
      whenToUse?: string;
      whenToUseAr?: string;
      concentration?: string;
      scentIntensity?: string;
      scentIntensityAr?: string;
      gender?: string;
      genderAr?: string;
      topNotes?: string;
      topNotesAr?: string;
      middleNotes?: string;
      middleNotesAr?: string;
      baseNotes?: string;
      baseNotesAr?: string;
      ingredients?: string;
      ingredientsAr?: string;
      badges?: string[];
    } | null;
    bestLayeredWithIds?: string[] | null;
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
    inspiredBy: z.string().max(1000).optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    hidden: z.boolean().default(false),
    fragranceInfo: z
      .object({
        tagline: z.string().max(200).optional(),
        taglineAr: z.string().max(200).optional(),
        about: z.string().max(1000).optional(),
        aboutAr: z.string().max(1000).optional(),
        longevity: z.string().max(200).optional(),
        longevityAr: z.string().max(200).optional(),
        whenToUse: z.string().max(200).optional(),
        whenToUseAr: z.string().max(200).optional(),
        concentration: z.string().max(50).optional(),
        scentIntensity: z.string().max(50).optional(),
        scentIntensityAr: z.string().max(50).optional(),
        gender: z.string().max(50).optional(),
        genderAr: z.string().max(50).optional(),
        topNotes: z.string().max(300).optional(),
        topNotesAr: z.string().max(300).optional(),
        middleNotes: z.string().max(300).optional(),
        middleNotesAr: z.string().max(300).optional(),
        baseNotes: z.string().max(300).optional(),
        baseNotesAr: z.string().max(300).optional(),
        ingredients: z.string().max(1500).optional(),
        ingredientsAr: z.string().max(1500).optional(),
        badges: z.array(z.string().max(50)).max(10).optional(),
      })
      .optional(),
    bestLayeredWithIds: z.array(z.string()).optional().default([]),
  });

  // Debug initial values
  console.log("ProductForm received initialValues:", initialValues);

  // Initialize form with validated values
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialValues?.name || "",
      description: initialValues?.description || "",
      inspiredBy: initialValues?.inspiredBy || "",
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
      fragranceInfo: initialValues?.fragranceInfo ?? undefined,
      bestLayeredWithIds: Array.isArray(initialValues?.bestLayeredWithIds)
        ? initialValues.bestLayeredWithIds
        : [],
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
        };
        result = await trpc.product.edit.mutate(payload);
      } else {
        // Create new product
        result = await trpc.product.create.mutate({
          ...values,
          imageId: values.imageId,
          // Convert null to undefined for type compatibility
          discountPrice: values.discountPrice ?? undefined,
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
            name='inspiredBy'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Inspired By (Optional)</FormLabel>
                <div className='flex items-center gap-2 mb-1'>
                  <DescriptionColorButton
                    value={field.value || ""}
                    onChange={field.onChange}
                  />
                  <span className='text-xs text-muted-foreground'>
                    Select text, then pick a color
                  </span>
                </div>
                <FormControl>
                  <Textarea
                    placeholder='e.g., Inspired by Baccarat Rouge 540...'
                    className='resize-none'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className='border rounded-md p-4 space-y-3'>
            <p className='text-sm font-medium'>Fragrance Info (Optional)</p>
            <p className='text-xs text-muted-foreground -mt-2'>
              Shown on the product page: character, longevity, when to wear, and notes.
            </p>
            <FormField
              control={form.control}
              name='fragranceInfo.tagline'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tagline ("This perfume is:")</FormLabel>
                  <FormControl>
                    <Input placeholder='Where sweet meets seductive' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='fragranceInfo.about'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>About the Scent</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='A warm, sensual blend of...'
                      className='resize-none'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='fragranceInfo.longevity'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longevity</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. 6-8 hours' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='fragranceInfo.whenToUse'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>When to Use</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. Evening, Fall/Winter' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className='grid grid-cols-3 gap-4'>
              <FormField
                control={form.control}
                name='fragranceInfo.concentration'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Concentration</FormLabel>
                    <FormControl>
                      <Input placeholder='18%' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='fragranceInfo.scentIntensity'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scent Intensity</FormLabel>
                    <FormControl>
                      <Input placeholder='Statement' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='fragranceInfo.gender'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <FormControl>
                      <Input placeholder='Feminine' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className='grid grid-cols-3 gap-4'>
              <FormField
                control={form.control}
                name='fragranceInfo.topNotes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Top Notes</FormLabel>
                    <FormControl>
                      <Input placeholder='Bergamot, Marshmallow' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='fragranceInfo.middleNotes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Middle Notes</FormLabel>
                    <FormControl>
                      <Input placeholder='Jasmine, Orris' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='fragranceInfo.baseNotes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base Notes</FormLabel>
                    <FormControl>
                      <Input placeholder='Amber, Vanilla, Musk' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name='fragranceInfo.ingredients'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ingredients</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Alcohol Denat., Fragrance/Parfum, Water/Aqua/Eau, ...'
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
              name='fragranceInfo.badges'
              render={({ field }) => (
                <BadgesInput value={field.value ?? []} onChange={field.onChange} />
              )}
            />
            <p className='text-xs text-muted-foreground'>
              Arabic versions can be added later via direct API if needed — English fields above are shown when no Arabic override is set.
            </p>
          </div>

          <FormField
            control={form.control}
            name='bestLayeredWithIds'
            render={({ field }) => (
              <BestLayeredWithPicker
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
