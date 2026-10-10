import { useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Upload, X } from "lucide-react";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import {
  HERO_VIDEO_ACCEPT,
  HERO_VIDEO_MAX_BYTES,
  heroVideoFormatFromFilename,
  heroVideoFormatFromMime,
  isAllowedHeroVideoUrl,
} from "#root/shared/homepage/hero-video";

const MAX_MB = HERO_VIDEO_MAX_BYTES / (1024 * 1024);

interface HeroVideoFieldProps {
  id: string;
  label: string;
  variant: "desktop" | "mobile";
  value: string | undefined;
  onChange: (url: string | undefined) => void;
  disabled: boolean;
  placeholder: string;
  description: string;
  /** Shown when a video is set but there is no image to act as its poster/fallback. */
  missingPosterWarning?: string | null;
}

/**
 * Hero background video input: URL field, upload button and preview, in the
 * same shape as the background image fields above it. Uploads go to the
 * streamed multipart route (/api/homepage/hero-video), not tRPC — see
 * backend/homepage/upload-hero-video/api.ts.
 */
export function HeroVideoField({
  id,
  label,
  variant,
  value,
  onChange,
  disabled,
  placeholder,
  description,
  missingPosterWarning,
}: HeroVideoFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const isUploading = uploadProgress !== null;

  const setValue = (url: string | undefined) => {
    setPreviewFailed(false);
    onChange(url);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const format = heroVideoFormatFromFilename(file.name);
    const mimeFormat = file.type ? heroVideoFormatFromMime(file.type) : format;
    if (!format || mimeFormat !== format) {
      toast.error("Invalid file type. Only MP4 and WebM videos are allowed.");
      return;
    }
    if (file.size > HERO_VIDEO_MAX_BYTES) {
      toast.error(`File too large. Maximum size is ${MAX_MB}MB.`);
      return;
    }

    setUploadProgress(0);
    try {
      const url = await uploadHeroVideo(file, variant, setUploadProgress);
      setValue(url);
      toast.success(
        variant === "mobile"
          ? "Mobile hero video uploaded — save to publish it."
          : "Hero video uploaded — save to publish it.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload video");
    } finally {
      setUploadProgress(null);
    }
  };

  const urlInvalid = Boolean(value && !isAllowedHeroVideoUrl(value));

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className='flex gap-2'>
        <Input
          id={id}
          value={value || ""}
          onChange={(e) => setValue(e.target.value.trim() || undefined)}
          placeholder={placeholder}
          disabled={disabled}
          className={urlInvalid ? "border-red-500" : ""}
        />
        <div className='flex gap-2'>
          {value && (
            <Button
              type='button'
              variant='outline'
              size='icon'
              disabled={disabled || isUploading}
              onClick={() => {
                setValue(undefined);
                toast.info(
                  variant === "mobile" ? "Mobile hero video removed" : "Hero video removed",
                );
              }}
              title='Remove video'>
              <X className='w-4 h-4' />
            </Button>
          )}
          <input
            ref={fileInputRef}
            type='file'
            accept={HERO_VIDEO_ACCEPT}
            onChange={handleFile}
            disabled={disabled || isUploading}
            className='hidden'
          />
          <Button
            type='button'
            variant='outline'
            size='md'
            disabled={disabled || isUploading}
            onClick={() => fileInputRef.current?.click()}>
            {isUploading ? (
              <>Uploading… {uploadProgress}%</>
            ) : (
              <>
                <Upload className='w-4 h-4 mr-2' />
                {value ? "Replace" : "Upload"}
              </>
            )}
          </Button>
        </div>
      </div>
      <div className='space-y-1 mt-1'>
        <p className='text-sm text-muted-foreground'>{description}</p>
        {urlInvalid && (
          <p className='text-sm text-red-500'>URL must start with / or https://</p>
        )}
        {value && missingPosterWarning && (
          <p className='text-sm text-amber-600'>⚠️ {missingPosterWarning}</p>
        )}
      </div>
      {value && !urlInvalid && (
        <div className='mt-3'>
          <div className='flex items-center justify-between mb-2'>
            <Label className='text-sm text-muted-foreground'>Preview:</Label>
            <a
              href={value}
              target='_blank'
              rel='noopener noreferrer'
              className='text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1'>
              <ExternalLink className='w-3 h-3' />
              Open in new tab
            </a>
          </div>
          <div
            className={`relative h-32 rounded-lg overflow-hidden border border-border bg-muted ${
              variant === "mobile" ? "w-full max-w-50" : "w-full"
            }`}>
            {previewFailed ? (
              <div className='flex items-center justify-center h-full text-sm text-muted-foreground'>
                Failed to load video. Check URL.
              </div>
            ) : (
              <video
                key={value}
                src={value}
                muted
                loop
                playsInline
                controls
                preload='metadata'
                className='w-full h-full object-cover'
                onError={() => setPreviewFailed(true)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** XHR rather than fetch so the button can show upload progress for large files. */
function uploadHeroVideo(
  file: File,
  variant: "desktop" | "mobile",
  onProgress: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/homepage/hero-video?variant=${variant}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading video"));
    xhr.onload = () => {
      let body: { success?: boolean; data?: { url?: string }; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON (e.g. a proxy error page) — handled below.
      }
      if (xhr.status === 200 && body.success && body.data?.url) {
        resolve(body.data.url);
      } else {
        reject(new Error(body.error || `Upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.send(form);
  });
}
