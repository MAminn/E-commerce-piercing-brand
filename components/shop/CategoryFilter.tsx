/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import { useState, useEffect } from "react";
import { trpc } from "#root/shared/trpc/client";
import { Checkbox } from "#root/components/ui/checkbox";
import { Label } from "#root/components/ui/label";
import { Loader2 } from "lucide-react";

interface Category {
  id: string;
  name: string;
}

interface CategoryFilterProps {
  selectedCategoryIds: string[];
  onSelectCategory: (categoryIds: string[]) => void;
}

export default function CategoryFilter({
  selectedCategoryIds,
  onSelectCategory,
}: CategoryFilterProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const result = await trpc.category.view.query();
        if (result.success && result.result) {
          setCategories(result.result);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchCategories();
  }, []);

  const handleToggleCategory = (categoryId: string) => {
    if (selectedCategoryIds.includes(categoryId)) {
      onSelectCategory(selectedCategoryIds.filter((id) => id !== categoryId));
    } else {
      onSelectCategory([...selectedCategoryIds, categoryId]);
    }
  };

  if (isLoading) {
    return (
      <div className='flex justify-center py-4'>
        <Loader2 className='h-5 w-5 animate-spin text-accent-lb' />
      </div>
    );
  }

  if (categories.length === 0) {
    return <p className='text-sm text-gray-500'>No categories available</p>;
  }

  return (
    <div className='space-y-2'>
      {categories.map((category) => (
        <div key={category.id} className='flex items-center space-x-2'>
          <Checkbox
            id={`category-${category.id}`}
            checked={selectedCategoryIds.includes(category.id)}
            onCheckedChange={() => handleToggleCategory(category.id)}
          />
          <Label
            htmlFor={`category-${category.id}`}
            className='text-sm cursor-pointer'>
            {category.name}
          </Label>
        </div>
      ))}
    </div>
  );
}
