import { useState, useEffect } from "react";
import { Input } from "../ui/input";
import { toast } from "sonner";
import { Loader2Icon, Upload, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";

interface FileMetadata {
  id: string;
  url?: string;
  diskname?: string;
  isPrimary?: boolean;
}

export const MultiFileUploadInput = ({
  name,
  value = [], // Array of file IDs
  id,
  onChange,
  maxFiles = 10,
  accept = "image/*",
  maxSize = 20, // MB
}: {
  name: string;
  value: FileMetadata[];
  id: string;
  onChange: (files: FileMetadata[]) => void;
  maxFiles?: number;
  accept?: string;
  maxSize?: number;
}) => {
  const [uploading, setUploading] = useState(false);

  // Debug when value changes or on component mount
  useEffect(() => {
    console.log("MultiFileUploadInput value:", value);

    // Validate each image has required properties
    if (value && value.length > 0) {
      value.forEach((img, index) => {
        if (!img.id) {
          console.error(`Image at index ${index} is missing id:`, img);
        }
        if (!img.url) {
          console.error(`Image at index ${index} is missing url:`, img);
        }
      });
    }
  }, [value]);

  // Initialize component with at least one primary image
  useEffect(() => {
    if (value && value.length > 0 && !value.some((img) => img.isPrimary)) {
      console.log(
        "No primary image found in initial value, setting first image as primary"
      );
      const updatedImages = [...value];
      if (updatedImages[0]) {
        updatedImages[0].isPrimary = true;
        onChange(updatedImages);
      }
    }
  }, [value, onChange]);

  const handleUpload = async (file: File) => {
    if (value.length >= maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }

    setUploading(true);

    try {
      const { trpc } = await import("#root/shared/trpc/client");
      const reader = new FileReader();

      reader.onload = async (event) => {
        if (!event.target || !event.target.result) {
          toast.error("Failed to read file");
          setUploading(false);
          return;
        }

        try {
          // Convert to Uint8Array which is what the server expects
          const buffer = new Uint8Array(event.target.result as ArrayBuffer);

          const result = await trpc.file.upload.mutate({
            file: {
              name: file.name,
              type: file.type,
              buffer: buffer,
            },
          });

          if (result.success && result.result) {
            const newFile = {
              id: result.result.id,
              diskname: result.result.diskname,
              url: `/uploads/${result.result.diskname}`,
              isPrimary: value.length === 0, // First uploaded image is primary by default
            };

            // Add the new file to the list
            const newFiles = [...value, newFile];
            onChange(newFiles);
            toast.success("File uploaded successfully");
          } else {
            toast.error(
              result.success === false ? result.error : "Failed to upload file"
            );
          }
        } catch (error) {
          console.error("tRPC mutation error:", error);
          toast.error("Failed to upload file. Server error.");
        } finally {
          setUploading(false);
        }
      };

      reader.onerror = () => {
        toast.error("Error reading file");
        setUploading(false);
      };

      // Read the file as an array buffer
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("An error occurred while uploading the file");
      setUploading(false);
    }
  };

  const moveImage = (index: number, direction: "left" | "right") => {
    const newFiles = [...value];
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newFiles.length) return;
    [newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex]!, newFiles[index]!];
    onChange(newFiles);
  };

  const removeFile = (fileId: string) => {
    const newFiles = value.filter((file) => file.id !== fileId);

    // If we removed the primary image and we still have images, make the first one primary
    const removedFile = value.find((f) => f.id === fileId);
    if (removedFile?.isPrimary && newFiles.length > 0 && newFiles[0]) {
      newFiles[0].isPrimary = true;
    }

    onChange(newFiles);
  };

  const setPrimaryImage = (fileId: string) => {
    const newFiles = value.map((file) => ({
      ...file,
      isPrimary: file.id === fileId,
    }));
    onChange(newFiles);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <input type="hidden" name={name} value={JSON.stringify(value)} />
        {uploading && <Loader2Icon className="animate-spin h-4 w-4" />}
        <div className="relative border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer w-full">
          <Input
            disabled={uploading || value.length >= maxFiles}
            type="file"
            id={id}
            accept={accept}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            onChange={(e) => {
              if (e.target.files) {
                const file = e.target.files[0];

                if (!file) {
                  toast.error("Please select a file");
                  return;
                }

                if (file.size > maxSize * 1024 * 1024) {
                  toast.error(`File size should be less than ${maxSize}MB`);
                  return;
                }

                handleUpload(file);
              }
            }}
          />
          <Upload className="h-8 w-8 text-gray-400 mb-2" />
          <p className="text-sm text-gray-600 text-center">
            {uploading ? (
              <span className="flex items-center gap-2">
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Uploading...
              </span>
            ) : (
              <span>
                {value && value.length > 0
                  ? "Click to add more images"
                  : "Click to upload or drag and drop"}
                <br />
                <span className="text-xs text-gray-500">
                  {value.length} of {maxFiles} files
                </span>
              </span>
            )}
          </p>
        </div>
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {value.map((file, index) => (
            <div
              key={`${file.id || index}`}
              className={`relative rounded-lg overflow-hidden border group ${file.isPrimary ? "ring-2 ring-primary" : ""}`}
            >
              {file.url ? (
                <img
                  src={file.url}
                  alt={`Product item ${index + 1}`}
                  className="w-full h-32 object-cover"
                  onError={(e) => {
                    console.error(`Failed to load image: ${file.url}`);
                    (e.target as HTMLImageElement).src = "/placeholder.svg";
                  }}
                />
              ) : (
                <div className="w-full h-32 bg-gray-200 flex items-center justify-center">
                  <span className="text-gray-400">No preview available</span>
                </div>
              )}
              <div className="absolute p-2 inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                <div className="flex gap-1 w-full">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1 text-[8px] px-1"
                    disabled={index === 0}
                    onClick={() => moveImage(index, "left")}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1 text-[8px] px-1"
                    disabled={index === value.length - 1}
                    onClick={() => moveImage(index, "right")}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
                {!file.isPrimary && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full text-[8px]"
                    onClick={() => setPrimaryImage(file.id)}
                  >
                    Set as Primary
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full text-[8px]"
                  onClick={() => removeFile(file.id)}
                >
                  <X className="h-3 w-3 mr-1" /> Remove
                </Button>
              </div>
              {file.isPrimary && (
                <div className="absolute top-0 left-0 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-br">
                  Primary
                </div>
              )}
              {!file.isPrimary && (
                <div className="absolute top-0 left-0 bg-black/40 text-white text-xs px-1.5 py-0.5 rounded-br">
                  #{index + 1}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
