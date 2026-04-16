-- Remove the legacy ExtractionRule table after KB rules were split into
-- ner_lexicon_rules and prompt_extraction_rules.
DROP TABLE IF EXISTS "extraction_rules";
