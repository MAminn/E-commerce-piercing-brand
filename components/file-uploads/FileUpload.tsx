import { useState } from "react";
import { Input } from "../ui/input";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

export const FileUploadInput = ({
  name,
  value,
  id,
  onChange,
}: {
  name: string;
  value: string;
  id: string;
  onChange: (value: string) => void;
}) => {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    await fetch("/file", {
      method: "POST",
      body: formData,
    })
      .then(
        async (res) =>
          (await res.json()) as
            | {
                success: false;
                error: string;
              }
            | {
                success: true;
                result: {
                  id: string;
                  diskname: string;
                };
              }
      )
      .then((res) => {
        if (res.success) {
          onChange(res.result.id);
        }

        if (!res.success) {
          toast.error(res.error);
        }
      })
      .catch((err) => {
        toast.error(err);
      });

    setUploading(false);
  };

  return (
    <div className="flex gap-2 items-center">
      <input type="hidden" name={name} value={value} />
      {uploading && <Loader2Icon className="animate-spin size-4" />}
      <Input
        disabled={uploading}
        type="file"
        id={id}
        onChange={(e) => {
          if (e.target.files) {
            const file = e.target.files[0];

            if (!file) {
              toast.error("Please select a file");
              return;
            }

            if (file.size > 20 * 1024 * 1024) {
              toast.error("File size should be less than 20MB");
              return;
            }

            handleUpload(file);
          }
        }}
      />
    </div>
  );
};
