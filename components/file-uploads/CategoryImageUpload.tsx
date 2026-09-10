import { useState } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { Loader2Icon, X, Upload } from "lucide-react";
import { cn } from "#root/lib/utils";

export interface CategoryImageUploadProps {
  value: string | null;
  onChange: (fileId: string | null) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * CategoryImageUpload Component
 *
 * Single image upload component specifically for category images.
 * Shows preview thumbnail, handles upload, and allows removal.
 */
export function CategoryImageUpload({
  value,
  onChange,
  label = "Category Image",
  required = false,
  disabled = false,
}: CategoryImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    value ? `/uploads/${value}` : null,
  );

  const handleUpload = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/file", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json()) as
        | { success: false; error: string }
        | { success: true; result: { id: string; diskname: string } };

      if (result.success) {
        onChange(result.result.id);
        setPreviewUrl(`/uploads/${result.result.diskname}`);
        toast.success("Image uploaded successfully");
      } else {
        toast.error(result.error || "Upload failed");
      }
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    onChange(null);
    setPreviewUrl(null);
    toast.success("Image removed");
  };

  return (
    <div className='space-y-3'>
      <Label htmlFor='category-image'>
        {label}
        {required && <span className='text-red-500 ml-1'>*</span>}
      </Label>

      {/* Preview Area */}
      {previewUrl ? (
        <div className='relative w-full max-w-xs'>
          <div className='relative aspect-video w-full rounded-lg overflow-hidden border border-stone-200 bg-stone-100'>
            <img
              src={previewUrl}
              alt='Category preview'
              className='w-full h-full object-cover'
            />
          </div>
          <Button
            type='button'
            variant='destructive'
            size='sm'
            className='absolute top-2 right-2'
            onClick={handleRemove}
            disabled={disabled || uploading}>
            <X className='w-4 h-4' />
          </Button>
        </div>
      ) : (
        <div className='w-full max-w-xs'>
          <label
            htmlFor='category-image'
            className={cn(
              "flex flex-col items-center justify-center w-full aspect-video",
              "border-2 border-dashed rounded-lg cursor-pointer",
              "bg-stone-50 border-stone-300 hover:bg-stone-100",
              "transition-colors",
              (disabled || uploading) && "opacity-50 cursor-not-allowed",
            )}>
            <div className='flex flex-col items-center justify-center pt-5 pb-6'>
              {uploading ? (
                <Loader2Icon className='w-10 h-10 mb-3 text-stone-400 animate-spin' />
              ) : (
                <Upload className='w-10 h-10 mb-3 text-stone-400' />
              )}
              <p className='mb-2 text-sm text-stone-600'>
                <span className='font-semibold'>Click to upload</span> or drag
                and drop
              </p>
              <p className='text-xs text-stone-500'>
                PNG, JPG or WEBP (MAX. 5MB)
              </p>
            </div>
            <Input
              id='category-image'
              type='file'
              className='hidden'
              accept='image/*'
              disabled={disabled || uploading}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleUpload(e.target.files[0]);
                  // Reset input to allow re-uploading the same file
                  e.target.value = "";
                }
              }}
            />
          </label>
        </div>
      )}

      {/* Helper Text */}
      <p className='text-xs text-stone-500'>
        Recommended: 16:9 aspect ratio (e.g., 1280×720px) for best results
      </p>
    </div>
  );
}
