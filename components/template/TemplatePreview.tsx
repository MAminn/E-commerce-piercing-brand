import type React from "react";
import { useState, useEffect, useMemo } from "react";
import { Button } from "#root/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import { Badge } from "#root/components/ui/badge";
import { Slider } from "#root/components/ui/slider";
import { Switch } from "#root/components/ui/switch";
import { Label } from "#root/components/ui/label";
import { Separator } from "#root/components/ui/separator";
import {
  Monitor,
  Smartphone,
  Tablet,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
  Settings,
  Palette,
  Layout,
  Code,
  RefreshCw,
} from "lucide-react";
import { cn } from "#root/lib/utils";
import TemplateRenderer from "#root/frontend/components/template/TemplateRenderer";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import type { TemplateCategory } from "#root/components/template-system/templateConfig";

export type PreviewDevice = "desktop" | "tablet" | "mobile";
export type PreviewOrientation = "portrait" | "landscape";
export type PreviewTheme = "light" | "dark" | "auto";

interface TemplatePreviewProps {
  templateId?: string;
  templateName?: string;
  category?: TemplateCategory;
  componentPath?: string;
  className?: string;
  showControls?: boolean;
  showDeviceFrame?: boolean;
  showGrid?: boolean;
  allowInteraction?: boolean;
  onDeviceChange?: (device: PreviewDevice) => void;
  onOrientationChange?: (orientation: PreviewOrientation) => void;
  onZoomChange?: (zoom: number) => void;
}

interface DeviceConfig {
  width: number;
  height: number;
  label: string;
  icon: React.ReactNode;
}

const DEVICE_CONFIGS: Record<PreviewDevice, DeviceConfig> = {
  desktop: {
    width: 1200,
    height: 800,
    label: "Desktop",
    icon: <Monitor className='w-4 h-4' />,
  },
  tablet: {
    width: 768,
    height: 1024,
    label: "Tablet",
    icon: <Tablet className='w-4 h-4' />,
  },
  mobile: {
    width: 375,
    height: 667,
    label: "Mobile",
    icon: <Smartphone className='w-4 h-4' />,
  },
};

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export function TemplatePreview({
  templateId,
  templateName,
  category = "home",
  componentPath,
  className,
  showControls = true,
  showDeviceFrame = true,
  showGrid = false,
  allowInteraction = true,
  onDeviceChange,
  onOrientationChange,
  onZoomChange,
}: TemplatePreviewProps) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [orientation, setOrientation] =
    useState<PreviewOrientation>("portrait");
  const [zoom, setZoom] = useState(1);
  const [theme, setTheme] = useState<PreviewTheme>("light");
  const [showRulers, setShowRulers] = useState(false);
  const [showGridLines, setShowGridLines] = useState(showGrid);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { activeTemplates, switchTemplate, getTemplateId } = useTemplate();

  // Get the selected template for the category
  const selectedTemplateId = getTemplateId(category);
  const effectiveTemplateId =
    templateName || selectedTemplateId || templateId || "default";

  // Get device dimensions based on orientation
  const deviceConfig = useMemo(() => {
    const config = DEVICE_CONFIGS[device];
    if (orientation === "landscape" && device !== "desktop") {
      return {
        ...config,
        width: config.height,
        height: config.width,
      };
    }
    return config;
  }, [device, orientation]);

  // Calculate container dimensions with zoom
  const containerDimensions = useMemo(() => {
    return {
      width: deviceConfig.width * zoom,
      height: deviceConfig.height * zoom,
    };
  }, [deviceConfig, zoom]);

  // Handle device change
  const handleDeviceChange = (newDevice: PreviewDevice) => {
    setDevice(newDevice);
    onDeviceChange?.(newDevice);

    // Reset orientation for desktop
    if (newDevice === "desktop") {
      setOrientation("portrait");
      onOrientationChange?.("portrait");
    }
  };

  // Handle orientation change
  const handleOrientationChange = () => {
    const newOrientation =
      orientation === "portrait" ? "landscape" : "portrait";
    setOrientation(newOrientation);
    onOrientationChange?.(newOrientation);
  };

  // Handle zoom change
  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
    onZoomChange?.(newZoom);
  };

  // Zoom in/out functions
  const zoomIn = () => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoom);
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      handleZoomChange(ZOOM_LEVELS[currentIndex + 1] || 0);
    }
  };

  const zoomOut = () => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoom);
    if (currentIndex > 0) {
      handleZoomChange(ZOOM_LEVELS[currentIndex - 1] || 0);
    }
  };

  // Reset zoom
  const resetZoom = () => {
    handleZoomChange(1);
  };

  // Refresh preview
  const refreshPreview = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Simulate refresh delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // If we have a template name and category, switch to it
      if (templateName && category) {
        await switchTemplate(category, templateName);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh preview",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Get device frame classes
  const getDeviceFrameClasses = () => {
    if (!showDeviceFrame) return "";

    switch (device) {
      case "mobile":
        return "rounded-[2rem] border-8 border-gray-800 shadow-2xl";
      case "tablet":
        return "rounded-xl border-4 border-gray-700 shadow-xl";
      default:
        return "rounded-lg border-2 border-gray-300 shadow-lg";
    }
  };

  // Get theme classes
  const getThemeClasses = () => {
    switch (theme) {
      case "dark":
        return "bg-gray-900 text-white";
      case "light":
        return "bg-white text-gray-900";
      default:
        return "bg-white text-gray-900 dark:bg-gray-900 dark:text-white";
    }
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Controls */}
      {showControls && (
        <Card className='mb-4'>
          <CardHeader className='pb-3'>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-lg'>Preview Controls</CardTitle>
              <Button
                variant='outline'
                size='sm'
                onClick={refreshPreview}
                disabled={isLoading}>
                <RefreshCw
                  className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")}
                />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className='flex flex-wrap items-center gap-4'>
              {/* Device Selection */}
              <div className='flex items-center gap-2'>
                <Label className='text-sm font-medium'>Device:</Label>
                <div className='flex border rounded-md'>
                  {Object.entries(DEVICE_CONFIGS).map(([key, config]) => (
                    <Button
                      key={key}
                      variant={device === key ? "primary" : "ghost"}
                      size='sm'
                      onClick={() => handleDeviceChange(key as PreviewDevice)}
                      className='rounded-none first:rounded-l-md last:rounded-r-md'>
                      {config.icon}
                      <span className='ml-1 hidden sm:inline'>
                        {config.label}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Orientation Toggle */}
              {device !== "desktop" && (
                <div className='flex items-center gap-2'>
                  <Label className='text-sm font-medium'>Orientation:</Label>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={handleOrientationChange}>
                    <RotateCcw className='w-4 h-4 mr-1' />
                    {orientation === "portrait" ? "Portrait" : "Landscape"}
                  </Button>
                </div>
              )}

              {/* Zoom Controls */}
              <div className='flex items-center gap-2'>
                <Label className='text-sm font-medium'>Zoom:</Label>
                <div className='flex items-center gap-1'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={zoomOut}
                    disabled={zoom <= (ZOOM_LEVELS[0] ?? 0)}>
                    <ZoomOut className='w-4 h-4' />
                  </Button>
                  <span className='text-sm font-mono min-w-[3rem] text-center'>
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={zoomIn}
                    disabled={
                      zoom >= (ZOOM_LEVELS[ZOOM_LEVELS.length - 1] ?? 0)
                    }>
                    <ZoomIn className='w-4 h-4' />
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={resetZoom}
                    disabled={zoom === 1}>
                    Reset
                  </Button>
                </div>
              </div>

              <Separator orientation='vertical' className='h-6' />

              {/* Theme Selection */}
              <div className='flex items-center gap-2'>
                <Label className='text-sm font-medium'>Theme:</Label>
                <Select
                  value={theme}
                  onValueChange={(value) => setTheme(value as PreviewTheme)}>
                  <SelectTrigger className='w-24'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='light'>Light</SelectItem>
                    <SelectItem value='dark'>Dark</SelectItem>
                    <SelectItem value='auto'>Auto</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Display Options */}
              <div className='flex items-center gap-4'>
                <div className='flex items-center gap-2'>
                  <Switch
                    id='rulers'
                    checked={showRulers}
                    onCheckedChange={setShowRulers}
                  />
                  <Label htmlFor='rulers' className='text-sm'>
                    Rulers
                  </Label>
                </div>
                <div className='flex items-center gap-2'>
                  <Switch
                    id='grid'
                    checked={showGridLines}
                    onCheckedChange={setShowGridLines}
                  />
                  <Label htmlFor='grid' className='text-sm'>
                    Grid
                  </Label>
                </div>
              </div>
            </div>

            {/* Template Info */}
            {(templateName || templateId) && (
              <div className='mt-4 pt-4 border-t'>
                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <Layout className='w-4 h-4' />
                  <span>Template: {templateName || templateId}</span>
                  {category && (
                    <>
                      <span>•</span>
                      <Badge variant='outline' className='text-xs'>
                        {category}
                      </Badge>
                    </>
                  )}
                  {componentPath && (
                    <>
                      <span>•</span>
                      <code className='text-xs bg-gray-100 px-1 rounded'>
                        {componentPath}
                      </code>
                    </>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Preview Container */}
      <div className='flex-1 overflow-auto bg-gray-50 rounded-lg p-4'>
        {/* Rulers */}
        {showRulers && (
          <>
            {/* Horizontal Ruler */}
            <div className='h-6 bg-white border-b border-gray-300 mb-2 relative'>
              {Array.from(
                { length: Math.ceil(containerDimensions.width / 50) },
                (_, i) => (
                  <div
                    key={"ruler"}
                    className='absolute top-0 h-full border-l border-gray-400'
                    style={{ left: i * 50 * zoom }}>
                    <span className='text-xs text-gray-600 ml-1'>{i * 50}</span>
                  </div>
                ),
              )}
            </div>

            {/* Vertical Ruler */}
            <div className='w-6 bg-white border-r border-gray-300 mr-2 absolute left-4 top-16 z-10'>
              {Array.from(
                { length: Math.ceil(containerDimensions.height / 50) },
                (_, i) => (
                  <div
                    key={"ruler"}
                    className='absolute left-0 w-full border-t border-gray-400'
                    style={{ top: i * 50 * zoom }}>
                    <span className='text-xs text-gray-600 ml-1 transform -rotate-90 origin-left'>
                      {i * 50}
                    </span>
                  </div>
                ),
              )}
            </div>
          </>
        )}

        {/* Preview Frame */}
        <div className='flex justify-center items-start'>
          <div
            className={cn(
              "relative bg-white overflow-hidden transition-all duration-300",
              getDeviceFrameClasses(),
              getThemeClasses(),
              showGridLines && "bg-grid-pattern",
              !allowInteraction && "pointer-events-none",
            )}
            style={{
              width: containerDimensions.width,
              height: containerDimensions.height,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}>
            {/* Grid Overlay */}
            {showGridLines && (
              <div
                className='absolute inset-0 opacity-20 pointer-events-none'
                style={{
                  backgroundImage: `
                    linear-gradient(to right, #000 1px, transparent 1px),
                    linear-gradient(to bottom, #000 1px, transparent 1px)
                  `,
                  backgroundSize: "20px 20px",
                }}
              />
            )}

            {/* Template Content */}
            <div className='w-full h-full overflow-auto'>
              {error ? (
                <div className='flex items-center justify-center h-full'>
                  <div className='text-center'>
                    <div className='text-red-500 mb-2'>
                      <Code className='w-8 h-8 mx-auto' />
                    </div>
                    <p className='text-red-600 font-medium'>Preview Error</p>
                    <p className='text-sm text-red-500 mt-1'>{error}</p>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={refreshPreview}
                      className='mt-3'>
                      Try Again
                    </Button>
                  </div>
                </div>
              ) : isLoading ? (
                <div className='flex items-center justify-center h-full'>
                  <div className='text-center'>
                    <RefreshCw className='w-8 h-8 mx-auto animate-spin text-blue-500 mb-2' />
                    <p className='text-gray-600'>Loading preview...</p>
                  </div>
                </div>
              ) : (
                <TemplateRenderer
                  category={category as any}
                  templateId={effectiveTemplateId}
                  fallbackComponent={({
                    error: renderError,
                    templateId: fallbackTemplateId,
                  }) => (
                    <div className='flex items-center justify-center h-full bg-gray-50'>
                      <div className='text-center p-8'>
                        <div className='text-gray-400 mb-4'>
                          <Layout className='w-12 h-12 mx-auto' />
                        </div>
                        <h3 className='text-lg font-medium text-gray-900 mb-2'>
                          Template Preview
                        </h3>
                        <p className='text-gray-600 mb-4'>
                          {renderError?.message ||
                            `Preview for ${
                              fallbackTemplateId || "template"
                            } will appear here`}
                        </p>
                        <div className='space-y-2'>
                          <div className='h-4 bg-gray-200 rounded animate-pulse' />
                          <div className='h-4 bg-gray-200 rounded animate-pulse w-3/4' />
                          <div className='h-4 bg-gray-200 rounded animate-pulse w-1/2' />
                        </div>
                      </div>
                    </div>
                  )}
                />
              )}
            </div>

            {/* Device Frame Details */}
            {showDeviceFrame && device !== "desktop" && (
              <>
                {/* Home Indicator (for mobile) */}
                {device === "mobile" && (
                  <div className='absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gray-600 rounded-full' />
                )}

                {/* Camera/Speaker (for mobile/tablet) */}
                <div className='absolute top-4 left-1/2 transform -translate-x-1/2 w-16 h-2 bg-gray-700 rounded-full' />
              </>
            )}
          </div>
        </div>

        {/* Device Info */}
        <div className='mt-4 text-center text-sm text-muted-foreground'>
          <span>
            {deviceConfig.label} • {deviceConfig.width} × {deviceConfig.height}
            px
            {orientation === "landscape" &&
              device !== "desktop" &&
              " (Landscape)"}
            {zoom !== 1 && ` • ${Math.round(zoom * 100)}% zoom`}
          </span>
        </div>
      </div>
    </div>
  );
}

export default TemplatePreview;
