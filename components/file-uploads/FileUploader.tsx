import { useEffect, useState } from "react";
import { Input } from "../ui/input";
import { toast } from "sonner";
import { Loader2, UploadCloud, X } from "lucide-react";
import { Button } from "../ui/button";

interface FileUploaderProps {
  onUpload: (file: File) => Promise<void>;
  fileId?: string;
  accept?: string;
  maxSize?: number; // in MB
}

export const FileUploader = ({
  onUpload,
  fileId,
  accept = "*/*",
  maxSize = 5,
}: FileUploaderProps) => {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // If we have a fileId but no preview, try to set preview from uploads
  useEffect(() => {
    if (fileId && !previewUrl) {
      setPreviewUrl(`/uploads/${fileId}`);
    }
  }, [fileId, previewUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Get the first file - we're only allowing single file uploads
    const file = files[0];
    if (!file) return;

    // Validate file
    if (file.size > maxSize * 1024 * 1024) {
      toast.error(`File size should be less than ${maxSize}MB`);
      return;
    }

    // Create a preview URL
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    setUploading(true);
    try {
      await onUpload(file);
      toast.success("File uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload file");
      // Clear preview on error
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setPreviewUrl(null);
  };

  return (
    <div className="space-y-2">
      {!previewUrl ? (
        <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative">
          <Input
            type="file"
            accept={accept}
            onChange={handleFileChange}
            disabled={uploading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <UploadCloud className="h-10 w-10 text-gray-400 mb-2" />
          <p className="text-sm text-gray-600 text-center">
            {uploading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </span>
            ) : (
              <span>
                Click to upload or drag and drop
                <br />
                <span className="text-xs text-gray-500">
                  {accept === "image/*" ? "PNG, JPG or WebP" : "Files"} up to{" "}
                  {maxSize}MB
                </span>
              </span>
            )}
          </p>
        </div>
      ) : (
        <div className="relative rounded-lg overflow-hidden border">
          {accept.includes("image") ? (
            <img
              src={previewUrl}
              alt="Preview"
              className="w-full h-40 object-contain"
            />
          ) : (
            <div className="w-full h-40 flex items-center justify-center bg-gray-100">
              <p className="text-sm text-gray-600">File uploaded</p>
            </div>
          )}
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6 rounded-full"
            onClick={clearFile}
            type="button"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
