/**
 * Search Results Templates
 *
 * This module exports search results page templates for displaying
 * product search results across the marketplace.
 *
 * Available Templates:
 * - SearchResultsGrid: Standard marketplace layout with sidebar filters
 * - SearchResultsMinimal: Clean, typography-first minimal design
 */

export { SearchResultsGrid } from "./SearchResultsGrid";
export type {
  SearchResultsGridProps,
  SearchResultProduct,
} from "./SearchResultsGrid";

export { SearchResultsMinimal } from "./SearchResultsMinimal";
export type { SearchResultsMinimalProps } from "./SearchResultsMinimal";
