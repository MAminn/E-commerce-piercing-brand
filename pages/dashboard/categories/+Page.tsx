import { useState } from "react";
import { Link } from "#root/components/utils/Link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "#root/components/ui/card";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#root/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#root/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#root/components/ui/alert-dialog";
import { Plus, MoreVertical, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { useData } from "vike-react/useData";
import { navigate } from "vike/client/router";
import type { Data } from "./+data";
import { ErrorSection } from "#root/components/dashboard/ErrorSection";
import { trpc } from "#root/shared/trpc/client";
import { useToast } from "#root/components/ui/use-toast";
import { CategoryImageUpload } from "#root/components/file-uploads/CategoryImageUpload";
import { Switch } from "#root/components/ui/switch";

export default function Categories() {
  const fetchData = useData<Data>();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryImageId, setCategoryImageId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<{
    id: string;
    name: string;
    imageId?: string | null;
  } | null>(null);

  if (!fetchData.success) {
    return <ErrorSection error={fetchData.error} />;
  }

  const mainCategories = fetchData.mainCategories;
  const subCategories = fetchData.subcategories;

  const getSubcategories = (type: string) => {
    return subCategories.filter((s) => s.type === type);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      });
      return;
    }

    const result = await trpc.category.createMain.mutate({
      name: newCategoryName,
      imageId: categoryImageId,
    });

    if (result.success) {
      toast({
        title: "Success",
        description: `Category "${newCategoryName}" created successfully`,
      });
      setCreateDialogOpen(false);
      setNewCategoryName("");
      setCategoryImageId(null);
      navigate("/dashboard/categories"); // Refresh page
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to create category",
        variant: "destructive",
      });
    }
  };

  const handleRenameCategory = async () => {
    if (!selectedCategory || !newCategoryName.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      });
      return;
    }

    const result = await trpc.category.renameMain.mutate({
      id: selectedCategory.id,
      name: newCategoryName,
      imageId: categoryImageId,
    });

    if (result.success) {
      toast({
        title: "Success",
        description: `Category renamed to "${newCategoryName}"`,
      });
      setRenameDialogOpen(false);
      setNewCategoryName("");
      setCategoryImageId(null);
      setSelectedCategory(null);
      navigate("/dashboard/categories"); // Refresh page
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to rename category",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCategory = async () => {
    if (!selectedCategory) return;

    const result = await trpc.category.deleteMain.mutate({
      id: selectedCategory.id,
    });

    if (result.success) {
      toast({
        title: "Success",
        description: `Category "${selectedCategory.name}" deleted successfully`,
      });
      setDeleteDialogOpen(false);
      setSelectedCategory(null);
      navigate("/dashboard/categories"); // Refresh page
    } else {
      toast({
        title: "Cannot Delete Category",
        description: result.error || "Failed to delete category",
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
    }
  };

  const handleToggleLanding = async (categoryId: string, currentValue: boolean) => {
    const result = await trpc.category.toggleLanding.mutate({
      id: categoryId,
      showOnLanding: !currentValue,
    });

    if (result.success) {
      toast({
        title: "Success",
        description: `Category ${!currentValue ? "shown on" : "hidden from"} landing page`,
      });
      navigate("/dashboard/categories");
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to update category",
        variant: "destructive",
      });
    }
  };

  return (
    <div className='p-6 w-full h-full mx-auto'>
      <div className='flex flex-col lg:flex-row gap-4 justify-between items-center mb-6'>
        <div className='flex flex-col gap-2 items-center lg:items-start'>
          <h1 className='text-2xl font-bold'>Categories</h1>
          <p className='text-slate-500'>Manage your product categories</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className='h-4 w-4 mr-2' />
              Add Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Category</DialogTitle>
              <DialogDescription>
                Add a new main category for organizing products
              </DialogDescription>
            </DialogHeader>
            <div className='grid gap-4 py-4'>
              <div className='grid gap-2'>
                <Label htmlFor='name'>Category Name</Label>
                <Input
                  id='name'
                  placeholder='e.g., Electronics, Clothing'
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateCategory();
                    }
                  }}
                />
              </div>
              <div className='grid gap-2'>
                <CategoryImageUpload
                  value={categoryImageId}
                  onChange={setCategoryImageId}
                  label='Category Image (Optional)'
                  required={false}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => {
                  setCreateDialogOpen(false);
                  setNewCategoryName("");
                  setCategoryImageId(null);
                }}>
                Cancel
              </Button>
              <Button onClick={handleCreateCategory}>Create Category</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        {mainCategories.map((category) => {
          const subcategories = getSubcategories(category.type);

          return (
            <Card key={category.id} className='relative group'>
              {/* Category Image Header */}
              {category.filename && (
                <div className='w-full h-32 overflow-hidden rounded-t-lg'>
                  <img
                    src={`/uploads/${category.filename}`}
                    alt={category.name}
                    className='w-full h-full object-cover'
                  />
                </div>
              )}
              <div className='p-4'>
                <CardHeader className='p-0 pb-4'>
                  <div className='flex justify-between items-center'>
                    <CardTitle className='capitalize'>
                      {category.name}
                    </CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant='ghost'
                          size='sm'
                          className='h-8 w-8 p-0'>
                          <MoreVertical className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCategory({
                              id: category.id,
                              name: category.name,
                              imageId: category.imageId,
                            });
                            setNewCategoryName(category.name);
                            setCategoryImageId(category.imageId || null);
                            setRenameDialogOpen(true);
                          }}>
                          <Pencil className='h-4 w-4 mr-2' />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className='text-red-600'
                          onClick={() => {
                            setSelectedCategory({
                              id: category.id,
                              name: category.name,
                            });
                            setDeleteDialogOpen(true);
                          }}>
                          <Trash2 className='h-4 w-4 mr-2' />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription>
                    {subcategories.length} subcategories
                  </CardDescription>
                  <div className='flex items-center gap-2 mt-2'>
                    <Switch
                      checked={category.showOnLanding !== false}
                      onCheckedChange={() =>
                        handleToggleLanding(
                          category.id,
                          category.showOnLanding !== false,
                        )
                      }
                    />
                    <span className='text-xs text-muted-foreground'>
                      {category.showOnLanding !== false
                        ? "Shown on landing"
                        : "Hidden from landing"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className='space-y-1'>
                    {subcategories.slice(0, 3).map((subcategory) => (
                      <li key={subcategory.id} className='text-sm'>
                        {subcategory.name} ({subcategory.productCount} products)
                      </li>
                    ))}
                    {subcategories.length > 3 && (
                      <li className='text-sm text-slate-500'>
                        +{subcategories.length - 3} more...
                      </li>
                    )}
                    {subcategories.length === 0 && (
                      <li className='text-sm text-slate-500 italic'>
                        No subcategories yet
                      </li>
                    )}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button variant='outline' className='w-full' asChild>
                    <Link href={`/dashboard/categories/${category.type}`}>
                      Manage Subcategories
                    </Link>
                  </Button>
                </CardFooter>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              Update the name and image of "{selectedCategory?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='rename'>Category Name</Label>
              <Input
                id='rename'
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRenameCategory();
                  }
                }}
              />
            </div>
            <div className='grid gap-2'>
              <CategoryImageUpload
                value={categoryImageId}
                onChange={setCategoryImageId}
                label='Category Image (Optional)'
                required={false}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setRenameDialogOpen(false);
                setNewCategoryName("");
                setCategoryImageId(null);
                setSelectedCategory(null);
              }}>
              Cancel
            </Button>
            <Button onClick={handleRenameCategory}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedCategory?.name}"? This
              action can only be performed if the category has no subcategories
              and no products.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedCategory(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCategory}
              className='bg-red-600 hover:bg-red-700'>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
