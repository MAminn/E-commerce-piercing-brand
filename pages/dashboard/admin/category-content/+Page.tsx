import { useState, useEffect } from "react";
import { trpc } from "#root/shared/trpc/client";
import { getStoreOwnerId } from "#root/shared/config/store";
import { toast } from "sonner";
import { Button } from "#root/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "#root/components/ui/card";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Switch } from "#root/components/ui/switch";
import { Textarea } from "#root/components/ui/textarea";
import { Separator } from "#root/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import {
  DEFAULT_CATEGORY_CONTENT,
  type CategoryContent,
} from "#root/shared/types/category-content";
import { Save, RotateCcw, AlertCircle, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "#root/components/ui/alert";

export default function CategoryContentAdminPage() {
  const MERCHANT_ID = getStoreOwnerId();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [content, setContent] = useState<CategoryContent>(
    DEFAULT_CATEGORY_CONTENT,
  );
  const [originalContent, setOriginalContent] = useState<CategoryContent>(
    DEFAULT_CATEGORY_CONTENT,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Available categories (this would normally come from backend)
  const availableCategories = [
    { id: "electronics", name: "Electronics" },
    { id: "fashion", name: "Fashion" },
    { id: "home", name: "Home & Garden" },
    { id: "sports", name: "Sports" },
    { id: "men", name: "Men's Products" },
    { id: "women", name: "Women's Products" },
  ];

  // Load category content when category is selected
  useEffect(() => {
    if (!selectedCategoryId) return;

    const loadContent = async () => {
      setIsLoading(true);
      try {
        const result = await trpc.category.getContent.query({
          merchantId: MERCHANT_ID,
          categoryId: selectedCategoryId,
        });

        if (result.success && result.content) {
          setContent(result.content);
          setOriginalContent(result.content);
          setHasUnsavedChanges(false);
        }
      } catch (error) {
        console.error("Failed to load category content:", error);
        toast.error("Failed to load category content");
      } finally {
        setIsLoading(false);
      }
    };

    loadContent();
  }, [selectedCategoryId]);

  // Track changes
  useEffect(() => {
    const hasChanges =
      JSON.stringify(content) !== JSON.stringify(originalContent);
    setHasUnsavedChanges(hasChanges);
  }, [content, originalContent]);

  // Update functions
  const updateTitle = (title: string) => {
    setContent({ ...content, title });
  };

  const updateDescription = (
    updates: Partial<CategoryContent["description"]>,
  ) => {
    setContent({
      ...content,
      description: { ...content.description, ...updates },
    });
  };

  const updateHero = (updates: Partial<CategoryContent["hero"]>) => {
    setContent({
      ...content,
      hero: { ...content.hero, ...updates },
    });
  };

  // Save content
  const handleSave = async () => {
    if (!selectedCategoryId) {
      toast.error("Please select a category first");
      return;
    }

    setIsSaving(true);
    try {
      const result = await trpc.category.updateContent.mutate({
        merchantId: MERCHANT_ID,
        categoryId: selectedCategoryId,
        content,
      });

      if (result.success) {
        toast.success("Category content saved successfully");
        setOriginalContent(content);
        setHasUnsavedChanges(false);
        setLastSavedAt(new Date());
      }
    } catch (error) {
      console.error("Failed to save category content:", error);
      toast.error("Failed to save category content");
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to defaults
  const handleReset = () => {
    if (
      confirm(
        "Are you sure you want to reset to defaults? This cannot be undone.",
      )
    ) {
      setContent(DEFAULT_CATEGORY_CONTENT);
    }
  };

  // Discard changes
  const handleDiscard = () => {
    if (confirm("Discard all unsaved changes?")) {
      setContent(originalContent);
    }
  };

  return (
    <div className='min-h-screen bg-gray-50 py-8'>
      <div className='max-w-4xl mx-auto px-4 sm:px-6 lg:px-8'>
        {/* Header */}
        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-gray-900'>
            Category Content Management
          </h1>
          <p className='mt-2 text-gray-600'>
            Customize content for your category pages
          </p>
        </div>

        {/* Info Alert */}
        <Alert className='mb-6'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>
            You control the <strong>content</strong> only. Layout and design are
            managed by the template system to ensure professional quality.
          </AlertDescription>
        </Alert>

        {/* Category Selector */}
        <Card className='mb-6'>
          <CardHeader>
            <CardTitle>Select Category</CardTitle>
            <CardDescription>
              Choose a category to edit its content
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedCategoryId}
              onValueChange={setSelectedCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder='Select a category' />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Content Editor */}
        {selectedCategoryId && (
          <>
            {/* Title Section */}
            <Card className='mb-6'>
              <CardHeader>
                <CardTitle>Category Title</CardTitle>
                <CardDescription>
                  The main heading displayed on the category page
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div>
                  <Label htmlFor='title'>Title</Label>
                  <Input
                    id='title'
                    value={content.title}
                    onChange={(e) => updateTitle(e.target.value)}
                    placeholder='e.g., Electronics'
                    className='mt-1.5'
                  />
                </div>
              </CardContent>
            </Card>

            {/* Description Section */}
            <Card className='mb-6'>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <div>
                    <CardTitle>Category Description</CardTitle>
                    <CardDescription>
                      Optional description text below the title
                    </CardDescription>
                  </div>
                  <Switch
                    checked={content.description.enabled}
                    onCheckedChange={(enabled) =>
                      updateDescription({ enabled })
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div>
                  <Label htmlFor='description'>Description</Label>
                  <Textarea
                    id='description'
                    value={content.description.text}
                    onChange={(e) =>
                      updateDescription({ text: e.target.value })
                    }
                    placeholder='Brief description of this category...'
                    rows={3}
                    className='mt-1.5'
                    disabled={!content.description.enabled}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Hero Section */}
            <Card className='mb-6'>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <div>
                    <CardTitle>Hero Image</CardTitle>
                    <CardDescription>
                      Optional banner image at the top
                    </CardDescription>
                  </div>
                  <Switch
                    checked={content.hero.enabled}
                    onCheckedChange={(enabled) => updateHero({ enabled })}
                  />
                </div>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div>
                  <Label htmlFor='heroImage'>Image URL</Label>
                  <Input
                    id='heroImage'
                    value={content.hero.imageUrl || ""}
                    onChange={(e) => updateHero({ imageUrl: e.target.value })}
                    placeholder='https://example.com/image.jpg'
                    className='mt-1.5'
                    disabled={!content.hero.enabled}
                  />
                  <p className='text-sm text-gray-500 mt-2'>
                    Note: Image upload functionality will be added in a future
                    update. For now, use an external image URL.
                  </p>
                </div>

                {content.hero.enabled && content.hero.imageUrl && (
                  <div className='mt-4'>
                    <Label>Preview</Label>
                    <div className='mt-2 border border-gray-200 rounded-lg overflow-hidden'>
                      <img
                        src={content.hero.imageUrl}
                        alt='Hero preview'
                        className='w-full h-48 object-cover'
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = "";
                          target.classList.add("hidden");
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className='flex items-center justify-between border-t border-gray-200 pt-6 mt-8'>
              <div className='flex items-center gap-3'>
                <Button
                  variant='outline'
                  onClick={handleReset}
                  disabled={isLoading || isSaving}>
                  <RotateCcw className='w-4 h-4 mr-2' />
                  Reset to Defaults
                </Button>
                {hasUnsavedChanges && (
                  <Button
                    variant='ghost'
                    onClick={handleDiscard}
                    disabled={isLoading || isSaving}>
                    Discard Changes
                  </Button>
                )}
              </div>

              <div className='flex items-center gap-3'>
                {lastSavedAt && (
                  <span className='text-sm text-gray-500'>
                    Last saved: {lastSavedAt.toLocaleTimeString()}
                  </span>
                )}
                <Button
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges || isLoading || isSaving}>
                  <Save className='w-4 h-4 mr-2' />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>

            {/* Preview Link */}
            {selectedCategoryId && (
              <div className='mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-sm font-medium text-blue-900'>
                      Preview Category Page
                    </p>
                    <p className='text-xs text-blue-700 mt-1'>
                      View how your changes will look on the live page
                    </p>
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      window.open(
                        `/shop?category=${selectedCategoryId}`,
                        "_blank",
                      );
                    }}>
                    <ExternalLink className='w-4 h-4 mr-2' />
                    Open Preview
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {!selectedCategoryId && (
          <Card>
            <CardContent className='py-12 text-center text-gray-500'>
              Please select a category to start editing
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
