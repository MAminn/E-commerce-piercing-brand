import { useState, useEffect } from "react";
import { trpc } from "#root/shared/trpc/client";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Badge } from "#root/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#root/components/ui/dialog";
import { Checkbox } from "#root/components/ui/checkbox";
import { Plus, X, Search, GripVertical } from "lucide-react";

interface ProductItem {
  id: string;
  name: string;
  price: string;
  discountPrice: string | null;
  imageUrl: string | null;
  stock: number;
}

interface HomepageProductPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function HomepageProductPicker({
  selectedIds,
  onChange,
  disabled,
}: HomepageProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [allProducts, setAllProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<ProductItem[]>([]);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  // Fetch all products for the picker dialog
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    trpc.product.search
      .query({ limit: 100, includeOutOfStock: true })
      .then((result) => {
        if (result.success && result.result) {
          setAllProducts(
            result.result.items.map((item) => ({
              id: item.id,
              name: item.name,
              price: item.price,
              discountPrice: item.discountPrice,
              imageUrl: item.imageUrl,
              stock: item.stock,
            })),
          );
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open]);

  // Fetch selected product details for the chips display
  useEffect(() => {
    if (selectedIds.length === 0) {
      setSelectedProducts([]);
      return;
    }
    trpc.product.search
      .query({ limit: 100, includeOutOfStock: true, productIds: selectedIds })
      .then((result) => {
        if (result.success && result.result) {
          // Maintain the order from selectedIds
          const map = new Map(
            result.result.items.map((item) => [
              item.id,
              {
                id: item.id,
                name: item.name,
                price: item.price,
                discountPrice: item.discountPrice,
                imageUrl: item.imageUrl,
                stock: item.stock,
              },
            ]),
          );
          setSelectedProducts(
            selectedIds
              .map((id) => map.get(id))
              .filter(Boolean) as ProductItem[],
          );
        }
      })
      .catch(console.error);
  }, [selectedIds]);

  const handleOpenDialog = () => {
    setPendingIds([...selectedIds]);
    setSearch("");
    setOpen(true);
  };

  const toggleProduct = (id: string) => {
    setPendingIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id],
    );
  };

  const handleConfirm = () => {
    onChange(pendingIds);
    setOpen(false);
  };

  const removeProduct = (id: string) => {
    onChange(selectedIds.filter((pid) => pid !== id));
  };

  const clearAll = () => {
    onChange([]);
  };

  const filtered = allProducts.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between'>
        <span className='text-sm font-medium'>
          Selected Products ({selectedIds.length})
        </span>
        <div className='flex gap-2'>
          {selectedIds.length > 0 && (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={clearAll}
              disabled={disabled}
              className='text-xs h-7'>
              Clear All
            </Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={disabled}
                onClick={handleOpenDialog}
                className='h-7 text-xs'>
                <Plus className='w-3 h-3 mr-1' />
                Pick Products
              </Button>
            </DialogTrigger>
            <DialogContent className='max-w-lg max-h-[80vh] flex flex-col'>
              <DialogHeader>
                <DialogTitle>Select Products</DialogTitle>
              </DialogHeader>
              <div className='relative'>
                <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder='Search products...'
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className='pl-8'
                />
              </div>
              <div className='flex-1 overflow-y-auto border rounded-md min-h-0 max-h-[50vh]'>
                {loading ? (
                  <div className='p-4 text-center text-sm text-muted-foreground'>
                    Loading products...
                  </div>
                ) : filtered.length === 0 ? (
                  <div className='p-4 text-center text-sm text-muted-foreground'>
                    No products found
                  </div>
                ) : (
                  <div className='divide-y'>
                    {filtered.map((product) => (
                      <label
                        key={product.id}
                        className='flex items-center gap-3 p-2.5 hover:bg-muted/50 cursor-pointer'>
                        <Checkbox
                          checked={pendingIds.includes(product.id)}
                          onCheckedChange={() => toggleProduct(product.id)}
                        />
                        {product.imageUrl && (
                          <img
                            src={
                              product.imageUrl.startsWith("http")
                                ? product.imageUrl
                                : `/uploads/${product.imageUrl}`
                            }
                            alt=''
                            className='w-8 h-8 rounded object-cover flex-shrink-0'
                          />
                        )}
                        <div className='flex-1 min-w-0'>
                          <p className='text-sm font-medium truncate'>
                            {product.name}
                          </p>
                          <p className='text-xs text-muted-foreground'>
                            {product.discountPrice ? (
                              <>
                                <span className='line-through'>
                                  ${product.price}
                                </span>{" "}
                                <span className='text-green-600'>
                                  ${product.discountPrice}
                                </span>
                              </>
                            ) : (
                              `$${product.price}`
                            )}
                            {product.stock <= 0 && (
                              <span className='ml-2 text-red-500'>
                                Out of stock
                              </span>
                            )}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className='flex items-center justify-between pt-2 border-t'>
                <span className='text-xs text-muted-foreground'>
                  {pendingIds.length} selected
                </span>
                <div className='flex gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button size='sm' onClick={handleConfirm}>
                    Confirm
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {selectedIds.length > 0 ? (
        <div className='flex flex-wrap gap-1.5'>
          {selectedProducts.map((product) => (
            <Badge
              key={product.id}
              variant='secondary'
              className='flex items-center gap-1 pr-1'>
              {product.imageUrl && (
                <img
                  src={
                    product.imageUrl.startsWith("http")
                      ? product.imageUrl
                      : `/uploads/${product.imageUrl}`
                  }
                  alt=''
                  className='w-4 h-4 rounded object-cover'
                />
              )}
              <span className='text-xs max-w-[120px] truncate'>
                {product.name}
              </span>
              <button
                type='button'
                onClick={() => removeProduct(product.id)}
                disabled={disabled}
                className='ml-0.5 hover:bg-muted rounded p-0.5'>
                <X className='w-3 h-3' />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className='text-xs text-muted-foreground italic'>
          No products selected — all products will be shown automatically
        </p>
      )}
    </div>
  );
}
