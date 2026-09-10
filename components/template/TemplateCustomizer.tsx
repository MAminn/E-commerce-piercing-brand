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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#root/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Textarea } from "#root/components/ui/textarea";
import { Switch } from "#root/components/ui/switch";
import { Slider } from "#root/components/ui/slider";
import { Badge } from "#root/components/ui/badge";
import { Separator } from "#root/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "#root/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "#root/components/ui/accordion";
import {
  Palette,
  Type,
  Layout,
  Image,
  Settings,
  Save,
  RotateCcw,
  Copy,
  Download,
  Upload,
  Eye,
  Code,
  Paintbrush,
  Grid,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  FileCode,
} from "lucide-react";
import { cn } from "#root/lib/utils";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import { TemplateSelector } from "#root/components/template/TemplateSelector";
import type { TemplateCategory } from "#root/components/template-system/templateConfig";

export interface TemplateCustomizationConfig {
  // Colors
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };

  // Typography
  typography: {
    fontFamily: string;
    headingFontFamily: string;
    fontSize: {
      xs: number;
      sm: number;
      base: number;
      lg: number;
      xl: number;
      "2xl": number;
      "3xl": number;
      "4xl": number;
    };
    fontWeight: {
      normal: number;
      medium: number;
      semibold: number;
      bold: number;
    };
    lineHeight: {
      tight: number;
      normal: number;
      relaxed: number;
    };
  };

  // Layout
  layout: {
    containerMaxWidth: number;
    gridColumns: number;
    gridGap: number;
    borderRadius: {
      sm: number;
      md: number;
      lg: number;
      xl: number;
    };
    spacing: {
      xs: number;
      sm: number;
      md: number;
      lg: number;
      xl: number;
      "2xl": number;
    };
  };

  // Components
  components: {
    button: {
      borderRadius?: number;
      padding?: string;
      fontSize?: number;
      fontWeight?: number;
    };
    card: {
      borderRadius?: number;
      padding?: string;
      shadow?: string;
      border?: boolean;
    };
    input: {
      borderRadius?: number;
      padding?: string;
      fontSize?: number;
      fontWeight?: number;
      border?: boolean;
    };
  };

  // Custom CSS
  customCSS: string;

  // Responsive settings
  responsive: {
    breakpoints: {
      sm: number;
      md: number;
      lg: number;
      xl: number;
    };
    hideOnMobile: string[];
    hideOnTablet: string[];
    hideOnDesktop: string[];
  };
}

const DEFAULT_CONFIG: TemplateCustomizationConfig = {
  colors: {
    primary: "#3b82f6",
    secondary: "#64748b",
    accent: "#f59e0b",
    background: "#ffffff",
    surface: "#f8fafc",
    text: "#1e293b",
    textSecondary: "#64748b",
    border: "#e2e8f0",
    success: "#10b981",
    warning: "#f59e0b",
    error: "#ef4444",
  },
  typography: {
    fontFamily: "Inter, system-ui, sans-serif",
    headingFontFamily: "Inter, system-ui, sans-serif",
    fontSize: {
      xs: 12,
      sm: 14,
      base: 16,
      lg: 18,
      xl: 20,
      "2xl": 24,
      "3xl": 30,
      "4xl": 36,
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
  },
  layout: {
    containerMaxWidth: 1200,
    gridColumns: 12,
    gridGap: 24,
    borderRadius: {
      sm: 4,
      md: 8,
      lg: 12,
      xl: 16,
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      "2xl": 48,
    },
  },
  components: {
    button: {
      borderRadius: 8,
      padding: "12px 24px",
      fontSize: 16,
      fontWeight: 500,
    },
    card: {
      borderRadius: 12,
      padding: "24px",
      shadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
      border: true,
    },
    input: {
      borderRadius: 8,
      padding: "12px 16px",
      fontSize: 16,
      border: true,
    },
  },
  customCSS: "",
  responsive: {
    breakpoints: {
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
    },
    hideOnMobile: [],
    hideOnTablet: [],
    hideOnDesktop: [],
  },
};

interface TemplateCustomizerProps {
  templateId?: string;
  category?: TemplateCategory;
  initialConfig?: Partial<TemplateCustomizationConfig>;
  onConfigChange?: (config: TemplateCustomizationConfig) => void;
  onSave?: (config: TemplateCustomizationConfig) => void;
  onReset?: () => void;
  className?: string;
}

export function TemplateCustomizer({
  templateId,
  category = "home",
  initialConfig,
  onConfigChange,
  onSave,
  onReset,
  className,
}: TemplateCustomizerProps) {
  const [config, setConfig] = useState<TemplateCustomizationConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });
  const [activeTab, setActiveTab] = useState("templates");
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [presets, setPresets] = useState<
    Record<string, TemplateCustomizationConfig>
  >({});

  const { activeTemplates } = useTemplate();

  // Update config when initialConfig changes
  useEffect(() => {
    if (initialConfig) {
      setConfig((prev) => ({ ...prev, ...initialConfig }));
    }
  }, [initialConfig]);

  // Notify parent of config changes
  useEffect(() => {
    onConfigChange?.(config);
  }, [config, onConfigChange]);

  // Update config helper
  const updateConfig = <T extends keyof TemplateCustomizationConfig>(
    section: T,
    updates: Partial<TemplateCustomizationConfig[T]>
  ) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] as object),
        ...updates,
      },
    }));
  };

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave?.(config);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle reset
  const handleReset = () => {
    setConfig({ ...DEFAULT_CONFIG, ...initialConfig });
    onReset?.();
  };

  // Export config
  const exportConfig = () => {
    const dataStr = JSON.stringify(config, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `template-config-${templateId || "default"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import config
  const importConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedConfig = JSON.parse(e.target?.result as string);
        setConfig({ ...DEFAULT_CONFIG, ...importedConfig });
      } catch (error) {
        console.error("Failed to import config:", error);
      }
    };
    reader.readAsText(file);
  };

  // Generate CSS from config
  const generateCSS = useMemo(() => {
    const { colors, typography, layout, components } = config;

    return `
      :root {
        /* Colors */
        --color-primary: ${colors.primary};
        --color-secondary: ${colors.secondary};
        --color-accent: ${colors.accent};
        --color-background: ${colors.background};
        --color-surface: ${colors.surface};
        --color-text: ${colors.text};
        --color-text-secondary: ${colors.textSecondary};
        --color-border: ${colors.border};
        --color-success: ${colors.success};
        --color-warning: ${colors.warning};
        --color-error: ${colors.error};
        
        /* Typography */
        --font-family: ${typography.fontFamily};
        --font-family-heading: ${typography.headingFontFamily};
        --font-size-xs: ${typography.fontSize.xs}px;
        --font-size-sm: ${typography.fontSize.sm}px;
        --font-size-base: ${typography.fontSize.base}px;
        --font-size-lg: ${typography.fontSize.lg}px;
        --font-size-xl: ${typography.fontSize.xl}px;
        --font-size-2xl: ${typography.fontSize["2xl"]}px;
        --font-size-3xl: ${typography.fontSize["3xl"]}px;
        --font-size-4xl: ${typography.fontSize["4xl"]}px;
        
        /* Layout */
        --container-max-width: ${layout.containerMaxWidth}px;
        --grid-columns: ${layout.gridColumns};
        --grid-gap: ${layout.gridGap}px;
        --border-radius-sm: ${layout.borderRadius.sm}px;
        --border-radius-md: ${layout.borderRadius.md}px;
        --border-radius-lg: ${layout.borderRadius.lg}px;
        --border-radius-xl: ${layout.borderRadius.xl}px;
        --spacing-xs: ${layout.spacing.xs}px;
        --spacing-sm: ${layout.spacing.sm}px;
        --spacing-md: ${layout.spacing.md}px;
        --spacing-lg: ${layout.spacing.lg}px;
        --spacing-xl: ${layout.spacing.xl}px;
        --spacing-2xl: ${layout.spacing["2xl"]}px;
      }
      
      /* Component Styles */
      .btn-custom {
        border-radius: ${components.button.borderRadius}px;
        padding: ${components.button.padding};
        font-size: ${components.button.fontSize}px;
        font-weight: ${components.button.fontWeight};
      }
      
      .card-custom {
        border-radius: ${components.card.borderRadius}px;
        padding: ${components.card.padding};
        box-shadow: ${components.card.shadow};
        ${
          components.card.border ? "border: 1px solid var(--color-border);" : ""
        }
      }
      
      .input-custom {
        border-radius: ${components.input.borderRadius}px;
        padding: ${components.input.padding};
        font-size: ${components.input.fontSize}px;
        ${
          components.input.border
            ? "border: 1px solid var(--color-border);"
            : ""
        }
      }
      
      /* Custom CSS */
      ${config.customCSS}
    `;
  }, [config]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className='flex items-center justify-between p-4 border-b'>
        <div>
          <h2 className='text-lg font-semibold'>Template Customizer</h2>
          <p className='text-sm text-muted-foreground'>
            Customize the appearance and behavior of your template
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setIsPreviewMode(!isPreviewMode)}>
            <Eye className='w-4 h-4 mr-2' />
            {isPreviewMode ? "Edit" : "Preview"}
          </Button>
          <Button variant='outline' size='sm' onClick={handleReset}>
            <RotateCcw className='w-4 h-4 mr-2' />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={isSaving} size='sm'>
            <Save className='w-4 h-4 mr-2' />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-hidden'>
        {isPreviewMode ? (
          <div className='h-full p-4'>
            <Card className='h-full'>
              <CardHeader>
                <CardTitle>Live Preview</CardTitle>
                <CardDescription>
                  See how your customizations look in real-time
                </CardDescription>
              </CardHeader>
              <CardContent className='h-full overflow-auto'>
                <div className='space-y-6'>
                  {/* Color Swatches */}
                  <div>
                    <h3 className='font-medium mb-3'>Color Palette</h3>
                    <div className='grid grid-cols-6 gap-2'>
                      {Object.entries(config.colors).map(([name, color]) => (
                        <div key={name} className='text-center'>
                          <div
                            className='w-12 h-12 rounded-lg border mx-auto mb-1'
                            style={{ backgroundColor: color }}
                          />
                          <span className='text-xs text-muted-foreground'>
                            {name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Typography */}
                  <div>
                    <h3 className='font-medium mb-3'>Typography</h3>
                    <div className='space-y-2'>
                      <h1
                        style={{
                          fontFamily: config.typography.headingFontFamily,
                          fontSize: config.typography.fontSize["4xl"],
                        }}>
                        Heading 1
                      </h1>
                      <h2
                        style={{
                          fontFamily: config.typography.headingFontFamily,
                          fontSize: config.typography.fontSize["2xl"],
                        }}>
                        Heading 2
                      </h2>
                      <p
                        style={{
                          fontFamily: config.typography.fontFamily,
                          fontSize: config.typography.fontSize.base,
                        }}>
                        Body text with normal font size and line height.
                      </p>
                      <p
                        style={{
                          fontFamily: config.typography.fontFamily,
                          fontSize: config.typography.fontSize.sm,
                          color: config.colors.textSecondary,
                        }}>
                        Secondary text with smaller font size.
                      </p>
                    </div>
                  </div>

                  {/* Components */}
                  <div>
                    <h3 className='font-medium mb-3'>Components</h3>
                    <div className='space-y-4'>
                      <button
                        className='btn-custom'
                        style={{
                          backgroundColor: config.colors.primary,
                          color: config.colors.background,
                          border: "none",
                          cursor: "pointer",
                        }}
                        type='button'>
                        Primary Button
                      </button>

                      <div
                        className='card-custom'
                        style={{ backgroundColor: config.colors.surface }}>
                        <h4
                          style={{
                            margin: 0,
                            marginBottom: "8px",
                            color: config.colors.text,
                          }}>
                          Card Component
                        </h4>
                        <p
                          style={{
                            margin: 0,
                            color: config.colors.textSecondary,
                            fontSize: config.typography.fontSize.sm,
                          }}>
                          This is how cards will look with your customizations.
                        </p>
                      </div>

                      <input
                        className='input-custom'
                        placeholder='Input field'
                        style={{
                          backgroundColor: config.colors.background,
                          color: config.colors.text,
                          width: "100%",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className='h-full flex flex-col'>
            <TabsList className='grid w-full grid-cols-7 mx-4 mt-4'>
              <TabsTrigger
                value='templates'
                className='flex items-center gap-1'>
                <FileCode className='w-4 h-4' />
                <span className='hidden sm:inline'>Templates</span>
              </TabsTrigger>
              <TabsTrigger value='colors' className='flex items-center gap-1'>
                <Palette className='w-4 h-4' />
                <span className='hidden sm:inline'>Colors</span>
              </TabsTrigger>
              <TabsTrigger
                value='typography'
                className='flex items-center gap-1'>
                <Type className='w-4 h-4' />
                <span className='hidden sm:inline'>Typography</span>
              </TabsTrigger>
              <TabsTrigger value='layout' className='flex items-center gap-1'>
                <Layout className='w-4 h-4' />
                <span className='hidden sm:inline'>Layout</span>
              </TabsTrigger>
              <TabsTrigger
                value='components'
                className='flex items-center gap-1'>
                <Settings className='w-4 h-4' />
                <span className='hidden sm:inline'>Components</span>
              </TabsTrigger>
              <TabsTrigger
                value='responsive'
                className='flex items-center gap-1'>
                <Grid className='w-4 h-4' />
                <span className='hidden sm:inline'>Responsive</span>
              </TabsTrigger>
              <TabsTrigger value='advanced' className='flex items-center gap-1'>
                <Code className='w-4 h-4' />
                <span className='hidden sm:inline'>Advanced</span>
              </TabsTrigger>
            </TabsList>

            <div className='flex-1 overflow-auto p-4'>
              {/* Templates Tab */}
              <TabsContent value='templates' className='mt-0 space-y-4'>
                <div className='space-y-4'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <h3 className='text-lg font-semibold'>
                        Template Selection
                      </h3>
                      <p className='text-sm text-muted-foreground'>
                        Choose templates for different sections of your site
                      </p>
                    </div>
                  </div>

                  <div className='grid gap-4'>
                    <TemplateSelector
                      category='landing'
                      label='Landing Page Template'
                      description='Select the template for your landing pages'
                    />

                    <TemplateSelector
                      category='home'
                      label='Homepage Template'
                      description='Select the template for your main homepage'
                    />

                    <TemplateSelector
                      category='productPage'
                      label='Product Page Template'
                      description='Choose how individual product pages should look'
                    />

                    <TemplateSelector
                      category='categoryPage'
                      label='Category Page Template'
                      description='Select the template for category/collection pages'
                    />

                    <TemplateSelector
                      category='sorting'
                      label='Product Sorting Template'
                      description='Choose the template for product listing and sorting views'
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Colors Tab */}
              <TabsContent value='colors' className='mt-0'>
                <Card>
                  <CardHeader>
                    <CardTitle>Color Palette</CardTitle>
                    <CardDescription>
                      Customize the color scheme for your template
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='space-y-6'>
                    <div className='grid grid-cols-2 gap-4'>
                      {Object.entries(config.colors).map(
                        ([colorName, colorValue]) => (
                          <div key={colorName} className='space-y-2'>
                            <Label className='capitalize'>
                              {colorName.replace(/([A-Z])/g, " $1")}
                            </Label>
                            <div className='flex items-center gap-2'>
                              <Input
                                type='color'
                                value={colorValue}
                                onChange={(e) =>
                                  updateConfig("colors", {
                                    [colorName]: e.target.value,
                                  })
                                }
                                className='w-12 h-10 p-1 border rounded'
                              />
                              <Input
                                type='text'
                                value={colorValue}
                                onChange={(e) =>
                                  updateConfig("colors", {
                                    [colorName]: e.target.value,
                                  })
                                }
                                className='flex-1'
                                placeholder='#000000'
                              />
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Typography Tab */}
              <TabsContent value='typography' className='mt-0'>
                <Card>
                  <CardHeader>
                    <CardTitle>Typography Settings</CardTitle>
                    <CardDescription>
                      Configure fonts, sizes, and text styling
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='space-y-6'>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-2'>
                        <Label>Body Font Family</Label>
                        <Select
                          value={config.typography.fontFamily}
                          onValueChange={(value) =>
                            updateConfig("typography", { fontFamily: value })
                          }>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='Inter, system-ui, sans-serif'>
                              Inter
                            </SelectItem>
                            <SelectItem value='Roboto, system-ui, sans-serif'>
                              Roboto
                            </SelectItem>
                            <SelectItem value='Open Sans, system-ui, sans-serif'>
                              Open Sans
                            </SelectItem>
                            <SelectItem value='Lato, system-ui, sans-serif'>
                              Lato
                            </SelectItem>
                            <SelectItem value='Poppins, system-ui, sans-serif'>
                              Poppins
                            </SelectItem>
                            <SelectItem value='Montserrat, system-ui, sans-serif'>
                              Montserrat
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className='space-y-2'>
                        <Label>Heading Font Family</Label>
                        <Select
                          value={config.typography.headingFontFamily}
                          onValueChange={(value) =>
                            updateConfig("typography", {
                              headingFontFamily: value,
                            })
                          }>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='Inter, system-ui, sans-serif'>
                              Inter
                            </SelectItem>
                            <SelectItem value='Roboto, system-ui, sans-serif'>
                              Roboto
                            </SelectItem>
                            <SelectItem value='Open Sans, system-ui, sans-serif'>
                              Open Sans
                            </SelectItem>
                            <SelectItem value='Lato, system-ui, sans-serif'>
                              Lato
                            </SelectItem>
                            <SelectItem value='Poppins, system-ui, sans-serif'>
                              Poppins
                            </SelectItem>
                            <SelectItem value='Montserrat, system-ui, sans-serif'>
                              Montserrat
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 className='font-medium mb-4'>Font Sizes</h4>
                      <div className='grid grid-cols-2 gap-4'>
                        {Object.entries(config.typography.fontSize).map(
                          ([sizeName, sizeValue]) => (
                            <div key={sizeName} className='space-y-2'>
                              <Label className='capitalize'>{sizeName}</Label>
                              <div className='flex items-center gap-2'>
                                <Slider
                                  value={[sizeValue]}
                                  onValueChange={([value]) =>
                                    updateConfig("typography", {
                                      fontSize: {
                                        ...config.typography.fontSize,
                                        [sizeName]: value,
                                      },
                                    })
                                  }
                                  min={8}
                                  max={72}
                                  step={1}
                                  className='flex-1'
                                />
                                <span className='text-sm font-mono w-12'>
                                  {sizeValue}px
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Layout Tab */}
              <TabsContent value='layout' className='mt-0'>
                <Card>
                  <CardHeader>
                    <CardTitle>Layout Settings</CardTitle>
                    <CardDescription>
                      Configure spacing, grid, and layout properties
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='space-y-6'>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-2'>
                        <Label>Container Max Width</Label>
                        <div className='flex items-center gap-2'>
                          <Slider
                            value={[config.layout.containerMaxWidth]}
                            onValueChange={([value]) =>
                              updateConfig("layout", {
                                containerMaxWidth: value,
                              })
                            }
                            min={800}
                            max={1600}
                            step={50}
                            className='flex-1'
                          />
                          <span className='text-sm font-mono w-16'>
                            {config.layout.containerMaxWidth}px
                          </span>
                        </div>
                      </div>

                      <div className='space-y-2'>
                        <Label>Grid Columns</Label>
                        <div className='flex items-center gap-2'>
                          <Slider
                            value={[config.layout.gridColumns]}
                            onValueChange={([value]) =>
                              updateConfig("layout", { gridColumns: value })
                            }
                            min={6}
                            max={24}
                            step={1}
                            className='flex-1'
                          />
                          <span className='text-sm font-mono w-8'>
                            {config.layout.gridColumns}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 className='font-medium mb-4'>Border Radius</h4>
                      <div className='grid grid-cols-2 gap-4'>
                        {Object.entries(config.layout.borderRadius).map(
                          ([sizeName, sizeValue]) => (
                            <div key={sizeName} className='space-y-2'>
                              <Label className='capitalize'>{sizeName}</Label>
                              <div className='flex items-center gap-2'>
                                <Slider
                                  value={[sizeValue]}
                                  onValueChange={([value]) =>
                                    updateConfig("layout", {
                                      borderRadius: {
                                        ...config.layout.borderRadius,
                                        [sizeName]: value,
                                      },
                                    })
                                  }
                                  min={0}
                                  max={32}
                                  step={1}
                                  className='flex-1'
                                />
                                <span className='text-sm font-mono w-12'>
                                  {sizeValue}px
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 className='font-medium mb-4'>Spacing</h4>
                      <div className='grid grid-cols-2 gap-4'>
                        {Object.entries(config.layout.spacing).map(
                          ([sizeName, sizeValue]) => (
                            <div key={sizeName} className='space-y-2'>
                              <Label className='capitalize'>{sizeName}</Label>
                              <div className='flex items-center gap-2'>
                                <Slider
                                  value={[sizeValue]}
                                  onValueChange={([value]) =>
                                    updateConfig("layout", {
                                      spacing: {
                                        ...config.layout.spacing,
                                        [sizeName]: value,
                                      },
                                    })
                                  }
                                  min={0}
                                  max={96}
                                  step={2}
                                  className='flex-1'
                                />
                                <span className='text-sm font-mono w-12'>
                                  {sizeValue}px
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Components Tab */}
              <TabsContent value='components' className='mt-0'>
                <div className='space-y-4'>
                  <Accordion type='single' collapsible className='w-full'>
                    <AccordionItem value='button'>
                      <AccordionTrigger>Button Component</AccordionTrigger>
                      <AccordionContent className='space-y-4'>
                        <div className='grid grid-cols-2 gap-4'>
                          <div className='space-y-2'>
                            <Label>Border Radius</Label>
                            <div className='flex items-center gap-2'>
                              <Slider
                                value={[
                                  config.components.button.borderRadius || 0,
                                ]}
                                onValueChange={([value]) =>
                                  updateConfig("components", {
                                    button: {
                                      ...config.components.button,
                                      borderRadius: value,
                                    },
                                  })
                                }
                                min={0}
                                max={32}
                                step={1}
                                className='flex-1'
                              />
                              <span className='text-sm font-mono w-12'>
                                {config.components.button.borderRadius || 0}px
                              </span>
                            </div>
                          </div>

                          <div className='space-y-2'>
                            <Label>Font Size</Label>
                            <div className='flex items-center gap-2'>
                              <Slider
                                value={[
                                  config.components.button.fontSize || 14,
                                ]}
                                onValueChange={([value]) =>
                                  updateConfig("components", {
                                    button: {
                                      ...config.components.button,
                                      fontSize: value,
                                    },
                                  })
                                }
                                min={12}
                                max={24}
                                step={1}
                                className='flex-1'
                              />
                              <span className='text-sm font-mono w-12'>
                                {config.components.button.fontSize || 14}px
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className='space-y-2'>
                          <Label>Padding</Label>
                          <Input
                            value={config.components.button.padding}
                            onChange={(e) =>
                              updateConfig("components", {
                                button: {
                                  ...config.components.button,
                                  padding: e.target.value,
                                },
                              })
                            }
                            placeholder='12px 24px'
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value='card'>
                      <AccordionTrigger>Card Component</AccordionTrigger>
                      <AccordionContent className='space-y-4'>
                        <div className='grid grid-cols-2 gap-4'>
                          <div className='space-y-2'>
                            <Label>Border Radius</Label>
                            <div className='flex items-center gap-2'>
                              <Slider
                                value={[
                                  config.components.card.borderRadius || 0,
                                ]}
                                onValueChange={([value]) =>
                                  updateConfig("components", {
                                    card: {
                                      ...config.components.card,
                                      borderRadius: value,
                                    },
                                  })
                                }
                                min={0}
                                max={32}
                                step={1}
                                className='flex-1'
                              />
                              <span className='text-sm font-mono w-12'>
                                {config.components.card.borderRadius || 0}px
                              </span>
                            </div>
                          </div>

                          <div className='flex items-center space-x-2'>
                            <Switch
                              id='card-border'
                              checked={config.components.card.border}
                              onCheckedChange={(checked) =>
                                updateConfig("components", {
                                  card: {
                                    ...config.components.card,
                                    border: checked,
                                  },
                                })
                              }
                            />
                            <Label htmlFor='card-border'>Show Border</Label>
                          </div>
                        </div>

                        <div className='space-y-2'>
                          <Label>Padding</Label>
                          <Input
                            value={config.components.card.padding}
                            onChange={(e) =>
                              updateConfig("components", {
                                card: {
                                  ...config.components.card,
                                  padding: e.target.value,
                                },
                              })
                            }
                            placeholder='24px'
                          />
                        </div>

                        <div className='space-y-2'>
                          <Label>Box Shadow</Label>
                          <Input
                            value={config.components.card.shadow}
                            onChange={(e) =>
                              updateConfig("components", {
                                card: {
                                  ...config.components.card,
                                  shadow: e.target.value,
                                },
                              })
                            }
                            placeholder='0 1px 3px rgba(0, 0, 0, 0.1)'
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </TabsContent>

              {/* Responsive Tab */}
              <TabsContent value='responsive' className='mt-0'>
                <Card>
                  <CardHeader>
                    <CardTitle>Responsive Settings</CardTitle>
                    <CardDescription>
                      Configure breakpoints and responsive behavior
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='space-y-6'>
                    <div>
                      <h4 className='font-medium mb-4'>Breakpoints</h4>
                      <div className='grid grid-cols-2 gap-4'>
                        {Object.entries(config.responsive.breakpoints).map(
                          ([breakpointName, breakpointValue]) => (
                            <div key={breakpointName} className='space-y-2'>
                              <Label className='capitalize'>
                                {breakpointName}
                              </Label>
                              <div className='flex items-center gap-2'>
                                <Slider
                                  value={[breakpointValue]}
                                  onValueChange={([value]) =>
                                    updateConfig("responsive", {
                                      breakpoints: {
                                        ...config.responsive.breakpoints,
                                        [breakpointName]: value,
                                      },
                                    })
                                  }
                                  min={320}
                                  max={1920}
                                  step={10}
                                  className='flex-1'
                                />
                                <span className='text-sm font-mono w-16'>
                                  {breakpointValue}px
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Advanced Tab */}
              <TabsContent value='advanced' className='mt-0'>
                <div className='space-y-4'>
                  <Card>
                    <CardHeader>
                      <CardTitle>Custom CSS</CardTitle>
                      <CardDescription>
                        Add custom CSS to override or extend the template styles
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={config.customCSS}
                        onChange={(e) =>
                          updateConfig("customCSS", e.target.value)
                        }
                        placeholder='/* Add your custom CSS here */
.my-custom-class {
  color: red;
}'
                        rows={12}
                        className='font-mono text-sm'
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Import/Export</CardTitle>
                      <CardDescription>
                        Save or load customization configurations
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className='flex gap-2'>
                        <Button variant='outline' onClick={exportConfig}>
                          <Download className='w-4 h-4 mr-2' />
                          Export Config
                        </Button>
                        <div className='relative'>
                          <input
                            type='file'
                            accept='.json'
                            onChange={importConfig}
                            className='absolute inset-0 w-full h-full opacity-0 cursor-pointer'
                          />
                          <Button variant='outline'>
                            <Upload className='w-4 h-4 mr-2' />
                            Import Config
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>
    </div>
  );
}

export default TemplateCustomizer;
