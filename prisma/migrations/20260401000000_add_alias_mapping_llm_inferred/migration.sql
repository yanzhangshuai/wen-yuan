-- Add LLM_INFERRED status for alias mapping arbitration results
ALTER TYPE "public"."alias_mapping_status" ADD VALUE IF NOT EXISTS 'LLM_INFERRED';
