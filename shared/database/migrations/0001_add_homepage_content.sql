-- Migration: Add homepage_content table
-- Created: 2025-12-13
-- Description: Creates table for storing merchant homepage content

CREATE TABLE IF NOT EXISTS homepage_content (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL UNIQUE,
  content JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create index on merchant_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_homepage_content_merchant_id ON homepage_content(merchant_id);

-- Add comment to table
COMMENT ON TABLE homepage_content IS 'Stores customizable homepage content for each merchant';
COMMENT ON COLUMN homepage_content.merchant_id IS 'Unique identifier for the merchant - currently using placeholder UUID';
COMMENT ON COLUMN homepage_content.content IS 'JSON structure containing all editable homepage sections';
