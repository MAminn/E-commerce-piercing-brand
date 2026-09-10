import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";
import { Effect } from "effect";

/**
 * Image optimization options
 */
export interface ImageOptimizationOptions {
  quality?: number;
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  withoutEnlargement?: boolean;
  format?: "webp" | "avif" | "png" | "jpeg" | "gif" | "svg" | "auto";
  stripMetadata?: boolean;
}

/**
 * Default optimization options for different image types
 */
const DEFAULT_OPTIONS: Record<string, ImageOptimizationOptions> = {
  default: {
    quality: 85,
    width: 1500,
    height: 1000,
    fit: "inside",
    withoutEnlargement: true,
    format: "webp",
    stripMetadata: true,
  },
  thumbnail: {
    quality: 80,
    width: 400,
    height: 400,
    fit: "cover",
    withoutEnlargement: false,
    format: "webp",
    stripMetadata: true,
  },
  avatar: {
    quality: 85,
    width: 200,
    height: 200,
    fit: "cover",
    withoutEnlargement: false,
    format: "webp",
    stripMetadata: true,
  },
  banner: {
    quality: 85,
    width: 1920,
    height: 600,
    fit: "cover",
    withoutEnlargement: false,
    format: "webp",
    stripMetadata: true,
  },
};

/**
 * Result of image optimization
 */
export interface OptimizationResult {
  success: boolean;
  error?: string;
  outputPath?: string;
  originalSize?: number;
  optimizedSize?: number;
  compressionRatio?: number;
  width?: number;
  height?: number;
  format?: string;
}

/**
 * Optimize an image buffer and save it to a file
 *
 * @param buffer Image buffer
 * @param outputPath Path to save the optimized image
 * @param options Optimization options
 * @returns Promise resolving to optimization result
 */
export const optimizeBuffer = async (
  buffer: Buffer,
  outputPath: string,
  optionsType: keyof typeof DEFAULT_OPTIONS = "default",
  customOptions: Partial<ImageOptimizationOptions> = {}
): Promise<OptimizationResult> => {
  try {
    // Merge default options with custom options
    const options = { ...DEFAULT_OPTIONS[optionsType], ...customOptions };

    // Create the sharp instance
    let optimizer = sharp(buffer);

    // Get the image metadata
    const metadata = await optimizer.metadata();
    const originalSize = buffer.length;

    // Determine output format based on options or input format
    let outputFormat = options.format;
    if (outputFormat === "auto" && metadata.format) {
      // Auto-detect based on input format
      if (metadata.format === "jpeg" || metadata.format === "jpg") {
        outputFormat = "webp";
      } else if (metadata.format === "png") {
        outputFormat = "webp";
      } else if (metadata.format === "gif") {
        outputFormat = "gif";
      } else if (metadata.format === "webp") {
        outputFormat = "webp";
      } else if (metadata.format === "avif") {
        outputFormat = "avif";
      } else if (metadata.format === "svg") {
        outputFormat = "webp";
      } else {
        outputFormat = "webp";
      }
    }

    // Handle SVG format specially
    if (metadata.format === "svg" && outputFormat === "svg") {
      // We don't need to process SVGs further if output is also SVG
      // Just ensure the output directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      await fs.promises.writeFile(outputPath, buffer);

      return {
        success: true,
        outputPath,
        originalSize,
        optimizedSize: buffer.length,
        compressionRatio: 0,
        format: "svg",
      };
    }

    // Auto-rotate based on orientation metadata
    optimizer = optimizer.rotate();

    // Strip metadata if requested
    if (options.stripMetadata) {
      optimizer = optimizer.withMetadata({ orientation: undefined });
    }

    // Resize the image
    if (options.width || options.height) {
      optimizer = optimizer.resize({
        width: options.width,
        height: options.height,
        fit: options.fit,
        withoutEnlargement: options.withoutEnlargement,
      });
    }

    // Set output format with optimized options
    if (outputFormat === "webp") {
      optimizer = optimizer.webp({
        quality: options.quality,
        effort: 6, // Higher compression effort (0-6)
        smartSubsample: true,
      });
    } else if (outputFormat === "avif") {
      optimizer = optimizer.avif({
        quality: options.quality,
        effort: 8, // Higher effort for compression (0-9)
      });
    } else if (outputFormat === "jpeg") {
      optimizer = optimizer.jpeg({
        quality: options.quality,
        progressive: true,
        mozjpeg: true,
        trellisQuantisation: true,
        overshootDeringing: true,
      });
    } else if (outputFormat === "png") {
      optimizer = optimizer.png({
        compressionLevel: 9,
        progressive: true,
        adaptiveFiltering: true,
        palette: true,
      });
    } else if (outputFormat === "gif") {
      optimizer = optimizer.gif({
        colours: 256,
        effort: 10,
      });
    }

    // Ensure the output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Process and save the image
    const outputInfo = await optimizer.toFile(outputPath);

    // Calculate compression ratio
    const compressionRatio =
      originalSize > 0
        ? Math.round((1 - outputInfo.size / originalSize) * 100)
        : 0;

    return {
      success: true,
      outputPath,
      originalSize,
      optimizedSize: outputInfo.size,
      compressionRatio,
      width: outputInfo.width,
      height: outputInfo.height,
      format: outputInfo.format,
    };
  } catch (error) {
    console.error("Image optimization error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Optimize an image file and save it to a new location
 *
 * @param inputPath Path to the input image
 * @param outputPath Path to save the optimized image
 * @param options Optimization options
 * @returns Promise resolving to optimization result
 */
export const optimizeFile = async (
  inputPath: string,
  outputPath: string,
  optionsType: keyof typeof DEFAULT_OPTIONS = "default",
  customOptions: Partial<ImageOptimizationOptions> = {}
): Promise<OptimizationResult> => {
  try {
    // Read input file
    const buffer = await fs.promises.readFile(inputPath);

    // Optimize the buffer
    return optimizeBuffer(buffer, outputPath, optionsType, customOptions);
  } catch (error) {
    console.error(`Error optimizing file ${inputPath}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Image Optimization Service that provides Effect-based functions for image processing
 */
export class ImageOptimizationService {
  /**
   * Optimize an image buffer with Effect-based error handling
   */
  optimizeBuffer = (
    buffer: Buffer,
    outputPath: string,
    optionsType: keyof typeof DEFAULT_OPTIONS = "default",
    customOptions: Partial<ImageOptimizationOptions> = {}
  ) => {
    return Effect.tryPromise({
      try: () => optimizeBuffer(buffer, outputPath, optionsType, customOptions),
      catch: (error) =>
        new Error(
          `Image optimization failed: ${error instanceof Error ? error.message : String(error)}`
        ),
    });
  };

  /**
   * Optimize an image file with Effect-based error handling
   */
  optimizeFile = (
    inputPath: string,
    outputPath: string,
    optionsType: keyof typeof DEFAULT_OPTIONS = "default",
    customOptions: Partial<ImageOptimizationOptions> = {}
  ) => {
    return Effect.tryPromise({
      try: () =>
        optimizeFile(inputPath, outputPath, optionsType, customOptions),
      catch: (error) =>
        new Error(
          `Image file optimization failed: ${error instanceof Error ? error.message : String(error)}`
        ),
    });
  };
}

export const imageOptimizationService = new ImageOptimizationService();
