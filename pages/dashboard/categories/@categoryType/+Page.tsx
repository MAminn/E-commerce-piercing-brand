import { useState, useEffect } from "react";
import { Link } from "#root/components/utils/Link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "#root/components/ui/card";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input.jsx";
import { Label } from "#root/components/ui/label";
import { PlusCircle, ArrowLeft, Pencil, Trash2, Package } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "#root/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#root/components/ui/table";

import { useData } from "vike-react/useData";
import type { Data } from "./+data";
import type { SubCategoryFormSchema } from "./components";
import SubCategoryForm from "./components";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";

export default function CategoryDetail() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedCategoryData, setSelectedCategoryData] =
    useState<SubCategoryFormSchema | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedSubcategory, setSelectedSubcategory] =
    useState<SubCategory | null>(null);
  const [lastFetchDate, setLastFetchDate] = useState(new Date());
  const initialFetchData = useData<Data>();
  const [fetchData, setFetchData] = useState<Data>(initialFetchData);

  // biome-ignore lint/correctness/useExhaustiveDependencies(lastFetchDate): <explanation>
  useEffect(() => {
    if (!initialFetchData.success) return;

    try {
      trpc.category.view.query().then((res) => {
        if (!res.success) {
          setFetchData(initialFetchData);
          return;
        }

        setFetchData({
          success: true,
          categoryType: initialFetchData.categoryType,
          subcategories: res.result.filter(
            (s) => s.type === initialFetchData.categoryType,
          ),
        });
      });
    } catch (err) {
      if (err instanceof Error) {
        toast.error(err.message);
        return;
      }
      toast.error(
        "Something went wrong, please refresh the page and try again.",
      );
    }
  }, [lastFetchDate, initialFetchData]);

  if (!fetchData.success) {
    return (
      <div className='p-6 w-full h-full flex-wrap mx-auto'>
        <div className='flex items-center mb-6'>
          <Button variant='ghost' asChild className='mr-2'>
            <Link href='/dashboard/categories'>
              <ArrowLeft className='h-4 w-4 mr-2' />
              Back to Categories
            </Link>
          </Button>
        </div>
        <div className='text-center py-12'>
          <h2 className='text-2xl font-bold mb-2'>Category Not Found</h2>
          <p className='text-slate-500 mb-6'>
            The category you're looking for doesn't exist.
          </p>
          <Button asChild>
            <Link href='/dashboard/categories'>Return to Categories</Link>
          </Button>
        </div>
      </div>
    );
  }

  const categoryType = fetchData.categoryType;
  const subcategories = fetchData.subcategories;

  type SubCategory = (typeof subcategories)[number];

  const handleAddSubcategory = async (values: SubCategoryFormSchema) => {
    try {
      await trpc.category.create.mutate(values).then((res) => {
        if (!res.success) {
          toast.error(res.error);
          return;
        }
        setLastFetchDate(new Date());
      });
    } catch (err) {
      if (err instanceof Error) {
        toast.error(err.message);
        return;
      }
      toast.error(
        "Something went wrong, please refresh the page and try again.",
      );
    }

    setIsAddDialogOpen(false);
  };

  const handleEditSubcategory = async (values: SubCategoryFormSchema) => {
    if (!values.id) {
      alert(
        "Selected category has no id, this is likely a bug, try refreshing the page.",
      );
      return;
    }

    const res = await trpc.category.edit.mutate(
      values as SubCategoryFormSchema & { id: string },
    );

    if (!res.success) {
      toast.error(res.error);
      return;
    }

    setLastFetchDate(new Date());

    setIsEditDialogOpen(false);
  };

  const handleDeleteSubcategory = async () => {
    if (!selectedSubcategory) return;

    const res = await trpc.category.delete.mutate({
      id: selectedSubcategory.id,
    });

    if (!res.success) {
      toast.error(res.error);
      return;
    }

    setLastFetchDate(new Date());
    setIsDeleteDialogOpen(false);
  };

  const openEditDialog = (id: string) => {
    const subCategory = subcategories.find((s) => s.id === id);

    // images are required on the backend so this won't happen
    if (!subCategory) return;

    if (!subCategory.imageId) {
      alert("Subcategory has no image, please delete it and create it again");
      return;
    }

    setSelectedSubcategory(subCategory);

    setSelectedCategoryData({
      id: subCategory.id,
      name: subCategory.name,
      imageId: subCategory.imageId,
      type: subCategory.type,
    });

    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (id: string) => {
    const subCategory = subcategories.find((s) => s.id === id);

    if (!subCategory) return;

    setSelectedSubcategory(subCategory);

    setIsDeleteDialogOpen(true);
  };

  return (
    <div className='p-6 w-full h-full flex-wrap mx-auto'>
      <div className='flex flex-col lg:flex-row items-center mb-6 gap-2'>
        <Button variant='ghost' asChild className='mr-4'>
          <Link href='/dashboard/categories'>
            <ArrowLeft className='h-4 w-4 mr-2' />
            Back to Categories
          </Link>
        </Button>
        <div className='flex items-center gap-2'>
          <h1 className='text-2xl font-bold capitalize'>{categoryType}</h1>
        </div>
      </div>

      <div className='flex justify-center lg:justify-between items-center mb-4 flex-wrap gap-2'>
        <h2 className='text-xl font-semibold'>Subcategories</h2>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <PlusCircle className='mr-2 h-4 w-4' />
          Add Subcategory
        </Button>
      </div>

      {subcategories.length === 0 ? (
        <Card className='text-center py-12'>
          <CardContent>
            <p className='text-slate-500 mb-4'>No subcategories found</p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <PlusCircle className='mr-2 h-4 w-4' />
              Add Your First Subcategory
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='pt-6'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subcategories.map((subcategory) => (
                  <TableRow key={subcategory.id}>
                    <TableCell className='font-medium'>
                      {subcategory.name}
                    </TableCell>
                    <TableCell>{subcategory.productCount} product</TableCell>
                    <TableCell className='flex justify-end space-x-2'>
                      <Button size='sm' variant='outline' asChild>
                        <Link
                          href={`/dashboard/products?categoryId=${subcategory.id}`}>
                          <Package className='h-4 w-4 mr-1' />
                          Products
                        </Link>
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => openEditDialog(subcategory.id)}>
                        <Pencil className='h-4 w-4' />
                      </Button>
                      <Button
                        size='sm'
                        variant='destructive'
                        onClick={() => openDeleteDialog(subcategory.id)}>
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subcategory</DialogTitle>
          </DialogHeader>
          <SubCategoryForm
            onSubmit={handleAddSubcategory}
            type={categoryType}
          />
          <DialogFooter>
            <Button variant='outline' onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subcategory</DialogTitle>
          </DialogHeader>
          <SubCategoryForm
            type={categoryType}
            defaultValues={selectedCategoryData ?? undefined}
            onSubmit={handleEditSubcategory}
          />
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Subcategory</DialogTitle>
          </DialogHeader>
          <div className='py-4'>
            <p>
              Are you sure you want to delete "{selectedSubcategory?.name}"?
              This will also remove all product associations.
            </p>
            {selectedSubcategory && selectedSubcategory.productCount > 0 && (
              <p className='mt-2 text-orange-600'>
                Warning: This subcategory has {selectedSubcategory.productCount}{" "}
                products associated with it.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant='destructive' onClick={handleDeleteSubcategory}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
