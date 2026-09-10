"use client";

import { useState, useEffect } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { trpc } from "#root/shared/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "#root/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "#root/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import { Input } from "#root/components/ui/input";
import { Textarea } from "#root/components/ui/textarea";
import { Button } from "#root/components/ui/button";
import { Checkbox } from "#root/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "#root/components/ui/accordion";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#root/components/ui/popover";
import { Calendar as CalendarComponent } from "#root/components/ui/calendar";
import { cn } from "#root/lib/utils";

type Product = {
  id: string;
  name: string;
};

type Category = {
  id: string;
  name: string;
  type: string;
};

interface PromoCodeFormProps {
  isOpen: boolean;
  onClose: () => void;
  promoCodeId: string | null;
  onSuccess: () => void;
  products: Product[];
  categories: Category[];
}

// Form schema with validation
const formSchema = z.object({
  code: z
    .string()
    .min(3, "Code must be at least 3 characters")
    .max(20, "Code must be at most 20 characters")
    .refine((val) => /^[A-Z0-9_-]+$/.test(val), {
      message:
        "Code must contain only uppercase letters, numbers, underscores, and hyphens",
    }),
  description: z
    .string()
    .max(255, "Description must be at most 255 characters")
    .optional(),
  discountType: z.enum(["percentage", "fixed_amount"]),
  discountValue: z.coerce
    .number()
    .min(0, "Discount value must be positive")
    .refine(
      (val) => Number.isFinite(val) && val >= 0,
      "Please enter a valid number"
    ),
  status: z.enum(["active", "inactive", "scheduled", "expired", "exhausted"]),
  startDate: z.date().nullable(),
  endDate: z.date().nullable(),
  usageLimit: z.coerce.number().optional().nullable(),
  usageLimitPerUser: z.coerce.number().optional().nullable(),
  minPurchaseAmount: z.coerce.number().optional().nullable(),
  appliesToAllProducts: z.boolean().default(true),
  productIds: z.array(z.string()).optional(),
  categoryIds: z.array(z.string()).optional(),
  showOnOffersPage: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

// Helper to format dates consistently
const formatDate = (date: Date | null): string => {
  if (!date) return "Pick a date";

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export function PromoCodeForm({
  isOpen,
  onClose,
  promoCodeId,
  onSuccess,
  products,
  categories,
}: PromoCodeFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Initialize the form with default values
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: "",
      description: "",
      discountType: "percentage",
      discountValue: 0,
      status: "active",
      startDate: null,
      endDate: null,
      usageLimit: null,
      usageLimitPerUser: null,
      minPurchaseAmount: null,
      appliesToAllProducts: true,
      productIds: [],
      categoryIds: [],
      showOnOffersPage: false,
    },
  });

  // Load promo code data for editing
  useEffect(() => {
    const loadPromoCodeData = async () => {
      if (!promoCodeId) return;

      setIsLoading(true);
      try {
        const result = await trpc.promoCode.getById.query({ id: promoCodeId });

        if (result.success) {
          const promoCode = result.result;
          form.reset({
            code: promoCode.code,
            description: promoCode.description || "",
            discountType: promoCode.discountType,
            discountValue: promoCode.discountValue,
            status: promoCode.status,
            startDate: promoCode.startDate
              ? new Date(promoCode.startDate)
              : null,
            endDate: promoCode.endDate ? new Date(promoCode.endDate) : null,
            usageLimit: promoCode.usageLimit,
            usageLimitPerUser: promoCode.usageLimitPerUser,
            minPurchaseAmount: promoCode.minPurchaseAmount,
            appliesToAllProducts: promoCode.appliesToAllProducts,
            productIds: promoCode.applicableProductIds,
            categoryIds: promoCode.applicableCategoryIds,
            showOnOffersPage: promoCode.showOnOffersPage,
          });

          setSelectedProducts(promoCode.applicableProductIds);
          setSelectedCategories(promoCode.applicableCategoryIds);
        } else {
          toast.error(result.error || "Failed to load promo code");
        }
      } catch (err) {
        console.error("Error loading promo code:", err);
        toast.error("Failed to load promo code");
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen && promoCodeId) {
      loadPromoCodeData();
    }
  }, [promoCodeId, isOpen, form]);

  // Handle form submission
  const onSubmit = async (values: FormValues) => {
    setIsLoading(true);

    try {
      // Prepare data for API - map from formSchema to the expected API structure
      const apiData = {
        code: values.code,
        description: values.description || undefined,
        discountType: values.discountType,
        discountValue: values.discountValue,
        status: values.status,
        startDate: values.startDate || undefined,
        endDate: values.endDate || undefined,
        usageLimit: values.usageLimit || undefined,
        usageLimitPerUser: values.usageLimitPerUser || undefined,
        minPurchaseAmount: values.minPurchaseAmount || undefined,
        appliesToAllProducts: values.appliesToAllProducts,
        applicableProductIds: values.appliesToAllProducts
          ? []
          : selectedProducts,
        applicableCategoryIds: values.appliesToAllProducts
          ? []
          : selectedCategories,
        showOnOffersPage: values.showOnOffersPage,
      };

      if (promoCodeId) {
        // Update existing promo code
        const result = await trpc.promoCode.update.mutate({
          id: promoCodeId,
          ...apiData,
        });

        if (result.success) {
          toast.success("Promo code updated successfully");
          onSuccess();
        } else {
          toast.error(result.error || "Failed to update promo code");
        }
      } else {
        // Create new promo code
        const result = await trpc.promoCode.create.mutate(apiData);

        if (result.success) {
          toast.success("Promo code created successfully");
          onSuccess();
        } else {
          toast.error(result.error || "Failed to create promo code");
        }
      }
    } catch (err) {
      console.error("Error saving promo code:", err);
      toast.error("An error occurred while saving the promo code");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleProduct = (productId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const appliesToAllProducts = form.watch("appliesToAllProducts");
  const discountType = form.watch("discountType");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {promoCodeId ? "Edit" : "Create"} Promo Code
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Promo Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. SUMMER2023"
                        {...field}
                        onChange={(e) =>
                          field.onChange(e.target.value.toUpperCase())
                        }
                        disabled={!!promoCodeId}
                      />
                    </FormControl>
                    <FormDescription>
                      Uppercase letters, numbers, hyphens, and underscores only.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Optional description..."
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="showOnOffersPage"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Show on Offers page</FormLabel>
                      <FormDescription>
                        When checked, this code appears in the "Active Promo
                        Codes" section of the public /offers page for
                        customers to copy.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            {/* Discount Information */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="discountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select discount type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="fixed_amount">
                          Fixed Amount
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="discountValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount Value</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder={
                            discountType === "percentage" ? "10" : "25.00"
                          }
                          {...field}
                        />
                        <div className="absolute top-0 right-3 h-full flex items-center text-sm text-muted-foreground">
                          {discountType === "percentage" ? "%" : ""}
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Status */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="exhausted">Exhausted</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <input
                        type="date"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={
                          field.value
                            ? new Date(field.value)
                                .toISOString()
                                .substring(0, 10)
                            : ""
                        }
                        onChange={(e) => {
                          field.onChange(
                            e.target.value ? new Date(e.target.value) : null
                          );
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <input
                        type="date"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={
                          field.value
                            ? new Date(field.value)
                                .toISOString()
                                .substring(0, 10)
                            : ""
                        }
                        onChange={(e) => {
                          field.onChange(
                            e.target.value ? new Date(e.target.value) : null
                          );
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Usage Limits */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="usage-limits">
                <AccordionTrigger>Usage Limits & Requirements</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="usageLimit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total Usage Limit</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="No limit"
                              {...field}
                              value={field.value === null ? "" : field.value}
                              onChange={(e) => {
                                const value =
                                  e.target.value === ""
                                    ? null
                                    : Number.parseInt(e.target.value, 10);
                                field.onChange(value);
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            Maximum number of times this code can be used.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="usageLimitPerUser"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Usage Limit Per User</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="No limit"
                              {...field}
                              value={field.value === null ? "" : field.value}
                              onChange={(e) => {
                                const value =
                                  e.target.value === ""
                                    ? null
                                    : Number.parseInt(e.target.value, 10);
                                field.onChange(value);
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            Maximum number of times a user can use this code.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="minPurchaseAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minimum Purchase Amount</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="No minimum"
                              {...field}
                              value={field.value === null ? "" : field.value}
                              onChange={(e) => {
                                const value =
                                  e.target.value === ""
                                    ? null
                                    : Number.parseFloat(e.target.value);
                                field.onChange(value);
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            Minimum order amount required to use this code.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Product Applicability */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="applicability">
                <AccordionTrigger>Product Applicability</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="appliesToAllProducts"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Apply to all products</FormLabel>
                            <FormDescription>
                              If unchecked, you can select specific products or
                              categories.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />

                    {!appliesToAllProducts && (
                      <div className="space-y-4">
                        {/* Products Selection */}
                        <div>
                          <h4 className="text-sm font-medium mb-2">Products</h4>
                          <div className="border rounded-md p-2 max-h-40 overflow-y-auto">
                            {products.length === 0 ? (
                              <p className="text-sm text-muted-foreground p-2">
                                No products available
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {products.map((product) => (
                                  <div
                                    key={product.id}
                                    className="flex items-center space-x-2"
                                  >
                                    <Checkbox
                                      id={`product-${product.id}`}
                                      checked={selectedProducts.includes(
                                        product.id
                                      )}
                                      onCheckedChange={() =>
                                        toggleProduct(product.id)
                                      }
                                    />
                                    <label
                                      htmlFor={`product-${product.id}`}
                                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                      {product.name}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Categories Selection */}
                        <div>
                          <h4 className="text-sm font-medium mb-2">
                            Categories
                          </h4>
                          <div className="border rounded-md p-2 max-h-40 overflow-y-auto">
                            {categories.length === 0 ? (
                              <p className="text-sm text-muted-foreground p-2">
                                No categories available
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {categories.map((category) => (
                                  <div
                                    key={category.id}
                                    className="flex items-center space-x-2"
                                  >
                                    <Checkbox
                                      id={`category-${category.id}`}
                                      checked={selectedCategories.includes(
                                        category.id
                                      )}
                                      onCheckedChange={() =>
                                        toggleCategory(category.id)
                                      }
                                    />
                                    <label
                                      htmlFor={`category-${category.id}`}
                                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                      {category.name} ({category.type})
                                    </label>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {promoCodeId ? "Update" : "Create"} Promo Code
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
