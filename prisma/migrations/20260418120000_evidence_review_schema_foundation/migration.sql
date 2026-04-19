-- CreateEnum
CREATE TYPE "claim_review_state" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EDITED', 'DEFERRED', 'CONFLICTED');

-- CreateEnum
CREATE TYPE "claim_source" AS ENUM ('AI', 'RULE', 'MANUAL', 'IMPORTED');

-- CreateEnum
CREATE TYPE "analysis_stage_run_status" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELED');

-- CreateEnum
CREATE TYPE "chapter_segment_type" AS ENUM ('TITLE', 'NARRATIVE', 'DIALOGUE_LEAD', 'DIALOGUE_CONTENT', 'POEM', 'COMMENTARY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "mention_kind" AS ENUM ('NAMED', 'TITLE_ONLY', 'COURTESY_NAME', 'KINSHIP', 'ORGANIZATION', 'LOCATION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "persona_candidate_status" AS ENUM ('OPEN', 'CONFIRMED', 'MERGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "relation_direction" AS ENUM ('FORWARD', 'REVERSE', 'BIDIRECTIONAL', 'UNDIRECTED');

-- CreateEnum
CREATE TYPE "relation_type_source" AS ENUM ('PRESET', 'CUSTOM', 'NORMALIZED_FROM_CUSTOM');

-- CreateEnum
CREATE TYPE "time_type" AS ENUM ('CHAPTER_ORDER', 'RELATIVE_PHASE', 'NAMED_EVENT', 'HISTORICAL_YEAR', 'BATTLE_PHASE', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "conflict_type" AS ENUM ('POSSIBLE_DUPLICATE', 'POSSIBLE_SPLIT', 'POST_MORTEM_ACTION', 'IMPOSSIBLE_LOCATION', 'RELATION_DIRECTION_CONFLICT', 'ALIAS_CONFLICT', 'TIME_ORDER_CONFLICT', 'LOW_EVIDENCE_CLAIM');

-- CreateEnum
CREATE TYPE "claim_kind" AS ENUM ('ALIAS', 'EVENT', 'RELATION', 'TIME', 'IDENTITY_RESOLUTION', 'CONFLICT_FLAG');

-- CreateEnum
CREATE TYPE "review_action" AS ENUM ('ACCEPT', 'REJECT', 'EDIT', 'CREATE_MANUAL_CLAIM', 'MERGE_PERSONA', 'SPLIT_PERSONA', 'CHANGE_RELATION_TYPE', 'CHANGE_RELATION_INTERVAL', 'RELINK_EVIDENCE');

-- CreateEnum
CREATE TYPE "alias_claim_kind" AS ENUM ('ALIAS_OF', 'COURTESY_NAME_OF', 'TITLE_OF', 'KINSHIP_REFERENCE_TO', 'IMPERSONATES', 'MISIDENTIFIED_AS', 'UNSURE');

-- CreateEnum
CREATE TYPE "identity_resolution_kind" AS ENUM ('RESOLVES_TO', 'SPLIT_FROM', 'MERGE_INTO', 'UNSURE');

-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "analysis_job_status" NOT NULL DEFAULT 'QUEUED',
    "current_stage_key" TEXT,
    "requested_by_user_id" UUID,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_stage_runs" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter_id" UUID,
    "stage_key" TEXT NOT NULL,
    "status" "analysis_stage_run_status" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "input_hash" TEXT,
    "output_hash" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_stage_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_raw_outputs" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "stage_run_id" UUID,
    "book_id" UUID NOT NULL,
    "chapter_id" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "request_payload" JSONB NOT NULL,
    "response_text" TEXT NOT NULL,
    "response_json" JSONB,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_raw_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_segments" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "segment_index" INTEGER NOT NULL,
    "segment_type" "chapter_segment_type" NOT NULL,
    "start_offset" INTEGER NOT NULL,
    "end_offset" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "normalized_text" TEXT NOT NULL,
    "speaker_hint" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_spans" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "segment_id" UUID NOT NULL,
    "start_offset" INTEGER NOT NULL,
    "end_offset" INTEGER NOT NULL,
    "quoted_text" TEXT NOT NULL,
    "normalized_text" TEXT NOT NULL,
    "speaker_hint" TEXT,
    "narrative_region_type" TEXT NOT NULL,
    "created_by_run_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_spans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_mentions" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "surface_text" TEXT NOT NULL,
    "mention_kind" "mention_kind" NOT NULL,
    "identity_claim" "identity_claim",
    "alias_type_hint" "alias_type",
    "speaker_persona_candidate_id" UUID,
    "suspected_resolves_to" UUID,
    "evidence_span_id" UUID NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" "claim_source" NOT NULL DEFAULT 'AI',
    "run_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona_candidates" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "canonical_label" TEXT NOT NULL,
    "candidate_status" "persona_candidate_status" NOT NULL DEFAULT 'OPEN',
    "first_seen_chapter_no" INTEGER,
    "last_seen_chapter_no" INTEGER,
    "mention_count" INTEGER NOT NULL DEFAULT 0,
    "evidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "run_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "persona_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alias_claims" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter_id" UUID,
    "alias_text" TEXT NOT NULL,
    "alias_type" "alias_type" NOT NULL,
    "persona_candidate_id" UUID,
    "target_persona_candidate_id" UUID,
    "claim_kind" "alias_claim_kind" NOT NULL,
    "evidence_span_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "review_state" "claim_review_state" NOT NULL DEFAULT 'PENDING',
    "source" "claim_source" NOT NULL DEFAULT 'AI',
    "run_id" UUID NOT NULL,
    "supersedes_claim_id" UUID,
    "derived_from_claim_id" UUID,
    "created_by_user_id" UUID,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "alias_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_claims" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "subject_mention_id" UUID,
    "subject_persona_candidate_id" UUID,
    "predicate" TEXT NOT NULL,
    "object_text" TEXT,
    "object_persona_candidate_id" UUID,
    "location_text" TEXT,
    "time_hint_id" UUID,
    "event_category" "bio_category" NOT NULL DEFAULT 'EVENT',
    "narrative_lens" "narrative_lens" NOT NULL DEFAULT 'SELF',
    "evidence_span_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "review_state" "claim_review_state" NOT NULL DEFAULT 'PENDING',
    "source" "claim_source" NOT NULL DEFAULT 'AI',
    "run_id" UUID NOT NULL,
    "supersedes_claim_id" UUID,
    "derived_from_claim_id" UUID,
    "created_by_user_id" UUID,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relation_claims" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "source_mention_id" UUID,
    "target_mention_id" UUID,
    "source_persona_candidate_id" UUID,
    "target_persona_candidate_id" UUID,
    "relation_type_key" TEXT NOT NULL,
    "relation_label" TEXT NOT NULL,
    "relation_type_source" "relation_type_source" NOT NULL,
    "direction" "relation_direction" NOT NULL,
    "effective_chapter_start" INTEGER,
    "effective_chapter_end" INTEGER,
    "time_hint_id" UUID,
    "evidence_span_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "review_state" "claim_review_state" NOT NULL DEFAULT 'PENDING',
    "source" "claim_source" NOT NULL DEFAULT 'AI',
    "run_id" UUID NOT NULL,
    "supersedes_claim_id" UUID,
    "derived_from_claim_id" UUID,
    "created_by_user_id" UUID,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "relation_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_claims" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "raw_time_text" TEXT NOT NULL,
    "time_type" "time_type" NOT NULL,
    "normalized_label" TEXT NOT NULL,
    "relative_order_weight" DOUBLE PRECISION,
    "chapter_range_start" INTEGER,
    "chapter_range_end" INTEGER,
    "evidence_span_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "review_state" "claim_review_state" NOT NULL DEFAULT 'PENDING',
    "source" "claim_source" NOT NULL DEFAULT 'AI',
    "run_id" UUID NOT NULL,
    "supersedes_claim_id" UUID,
    "derived_from_claim_id" UUID,
    "created_by_user_id" UUID,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "time_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_resolution_claims" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter_id" UUID,
    "mention_id" UUID NOT NULL,
    "persona_candidate_id" UUID,
    "resolved_persona_id" UUID,
    "resolution_kind" "identity_resolution_kind" NOT NULL,
    "rationale" TEXT,
    "evidence_span_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "review_state" "claim_review_state" NOT NULL DEFAULT 'PENDING',
    "source" "claim_source" NOT NULL DEFAULT 'AI',
    "run_id" UUID NOT NULL,
    "supersedes_claim_id" UUID,
    "derived_from_claim_id" UUID,
    "created_by_user_id" UUID,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "identity_resolution_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_flags" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter_id" UUID,
    "run_id" UUID NOT NULL,
    "conflict_type" "conflict_type" NOT NULL,
    "related_claim_kind" "claim_kind",
    "related_claim_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT NOT NULL,
    "evidence_span_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "review_state" "claim_review_state" NOT NULL DEFAULT 'CONFLICTED',
    "source" "claim_source" NOT NULL DEFAULT 'RULE',
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conflict_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona_aliases" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "alias_text" TEXT NOT NULL,
    "alias_type" "alias_type" NOT NULL,
    "source_claim_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "persona_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona_chapter_facts" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "chapter_no" INTEGER NOT NULL,
    "event_count" INTEGER NOT NULL DEFAULT 0,
    "relation_count" INTEGER NOT NULL DEFAULT 0,
    "conflict_count" INTEGER NOT NULL DEFAULT 0,
    "review_state_summary" JSONB NOT NULL,
    "latest_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "persona_chapter_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona_time_facts" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "time_label" TEXT NOT NULL,
    "time_sort_key" DOUBLE PRECISION,
    "chapter_range_start" INTEGER,
    "chapter_range_end" INTEGER,
    "event_count" INTEGER NOT NULL DEFAULT 0,
    "relation_count" INTEGER NOT NULL DEFAULT 0,
    "source_time_claim_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "persona_time_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_edges" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "source_persona_id" UUID NOT NULL,
    "target_persona_id" UUID NOT NULL,
    "relation_type_key" TEXT NOT NULL,
    "relation_label" TEXT NOT NULL,
    "relation_type_source" "relation_type_source" NOT NULL,
    "direction" "relation_direction" NOT NULL,
    "effective_chapter_start" INTEGER,
    "effective_chapter_end" INTEGER,
    "source_claim_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latest_claim_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "relationship_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "chapter_id" UUID,
    "chapter_no" INTEGER,
    "time_label" TEXT,
    "event_label" TEXT NOT NULL,
    "narrative_lens" "narrative_lens" NOT NULL DEFAULT 'SELF',
    "source_claim_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_audit_logs" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "claim_kind" "claim_kind",
    "claim_id" UUID,
    "persona_id" UUID,
    "action" "review_action" NOT NULL,
    "actor_user_id" UUID,
    "before_state" JSONB,
    "after_state" JSONB,
    "note" TEXT,
    "evidence_span_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analysis_runs_book_created_at_idx" ON "analysis_runs"("book_id", "created_at");

-- CreateIndex
CREATE INDEX "analysis_runs_status_created_at_idx" ON "analysis_runs"("status", "created_at");

-- CreateIndex
CREATE INDEX "analysis_stage_runs_run_stage_idx" ON "analysis_stage_runs"("run_id", "stage_key");

-- CreateIndex
CREATE INDEX "analysis_stage_runs_chapter_stage_idx" ON "analysis_stage_runs"("chapter_id", "stage_key");

-- CreateIndex
CREATE INDEX "llm_raw_outputs_run_idx" ON "llm_raw_outputs"("run_id");

-- CreateIndex
CREATE INDEX "llm_raw_outputs_stage_run_idx" ON "llm_raw_outputs"("stage_run_id");

-- CreateIndex
CREATE INDEX "llm_raw_outputs_chapter_idx" ON "llm_raw_outputs"("chapter_id");

-- CreateIndex
CREATE INDEX "chapter_segments_chapter_type_idx" ON "chapter_segments"("chapter_id", "segment_type");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_segments_run_chapter_index_key" ON "chapter_segments"("run_id", "chapter_id", "segment_index");

-- CreateIndex
CREATE INDEX "evidence_spans_chapter_offset_idx" ON "evidence_spans"("chapter_id", "start_offset");

-- CreateIndex
CREATE INDEX "evidence_spans_segment_idx" ON "evidence_spans"("segment_id");

-- CreateIndex
CREATE INDEX "evidence_spans_run_idx" ON "evidence_spans"("created_by_run_id");

-- CreateIndex
CREATE INDEX "entity_mentions_book_chapter_idx" ON "entity_mentions"("book_id", "chapter_id");

-- CreateIndex
CREATE INDEX "entity_mentions_evidence_idx" ON "entity_mentions"("evidence_span_id");

-- CreateIndex
CREATE INDEX "entity_mentions_run_idx" ON "entity_mentions"("run_id");

-- CreateIndex
CREATE INDEX "persona_candidates_book_status_idx" ON "persona_candidates"("book_id", "candidate_status");

-- CreateIndex
CREATE INDEX "persona_candidates_run_idx" ON "persona_candidates"("run_id");

-- CreateIndex
CREATE INDEX "alias_claims_book_state_idx" ON "alias_claims"("book_id", "review_state");

-- CreateIndex
CREATE INDEX "alias_claims_candidate_idx" ON "alias_claims"("persona_candidate_id");

-- CreateIndex
CREATE INDEX "alias_claims_run_idx" ON "alias_claims"("run_id");

-- CreateIndex
CREATE INDEX "event_claims_book_chapter_state_idx" ON "event_claims"("book_id", "chapter_id", "review_state");

-- CreateIndex
CREATE INDEX "event_claims_subject_candidate_idx" ON "event_claims"("subject_persona_candidate_id");

-- CreateIndex
CREATE INDEX "event_claims_time_hint_idx" ON "event_claims"("time_hint_id");

-- CreateIndex
CREATE INDEX "relation_claims_book_chapter_state_idx" ON "relation_claims"("book_id", "chapter_id", "review_state");

-- CreateIndex
CREATE INDEX "relation_claims_candidate_pair_idx" ON "relation_claims"("source_persona_candidate_id", "target_persona_candidate_id");

-- CreateIndex
CREATE INDEX "relation_claims_type_key_idx" ON "relation_claims"("relation_type_key");

-- CreateIndex
CREATE INDEX "time_claims_book_chapter_state_idx" ON "time_claims"("book_id", "chapter_id", "review_state");

-- CreateIndex
CREATE INDEX "time_claims_type_idx" ON "time_claims"("time_type");

-- CreateIndex
CREATE INDEX "time_claims_run_idx" ON "time_claims"("run_id");

-- CreateIndex
CREATE INDEX "identity_resolution_claims_book_state_idx" ON "identity_resolution_claims"("book_id", "review_state");

-- CreateIndex
CREATE INDEX "identity_resolution_claims_mention_idx" ON "identity_resolution_claims"("mention_id");

-- CreateIndex
CREATE INDEX "identity_resolution_claims_run_idx" ON "identity_resolution_claims"("run_id");

-- CreateIndex
CREATE INDEX "conflict_flags_book_state_idx" ON "conflict_flags"("book_id", "review_state");

-- CreateIndex
CREATE INDEX "conflict_flags_run_idx" ON "conflict_flags"("run_id");

-- CreateIndex
CREATE INDEX "conflict_flags_type_idx" ON "conflict_flags"("conflict_type");

-- CreateIndex
CREATE INDEX "persona_aliases_persona_idx" ON "persona_aliases"("persona_id");

-- CreateIndex
CREATE UNIQUE INDEX "persona_aliases_book_persona_alias_key" ON "persona_aliases"("book_id", "persona_id", "alias_text");

-- CreateIndex
CREATE INDEX "persona_chapter_facts_book_chapter_no_idx" ON "persona_chapter_facts"("book_id", "chapter_no");

-- CreateIndex
CREATE INDEX "persona_chapter_facts_persona_chapter_no_idx" ON "persona_chapter_facts"("persona_id", "chapter_no");

-- CreateIndex
CREATE UNIQUE INDEX "persona_chapter_facts_book_persona_chapter_key" ON "persona_chapter_facts"("book_id", "persona_id", "chapter_id");

-- CreateIndex
CREATE INDEX "persona_time_facts_book_persona_idx" ON "persona_time_facts"("book_id", "persona_id");

-- CreateIndex
CREATE INDEX "persona_time_facts_book_sort_key_idx" ON "persona_time_facts"("book_id", "time_sort_key");

-- CreateIndex
CREATE INDEX "relationship_edges_book_pair_idx" ON "relationship_edges"("book_id", "source_persona_id", "target_persona_id");

-- CreateIndex
CREATE INDEX "relationship_edges_type_key_idx" ON "relationship_edges"("relation_type_key");

-- CreateIndex
CREATE INDEX "timeline_events_book_persona_chapter_idx" ON "timeline_events"("book_id", "persona_id", "chapter_no");

-- CreateIndex
CREATE INDEX "timeline_events_book_time_label_idx" ON "timeline_events"("book_id", "time_label");

-- CreateIndex
CREATE INDEX "review_audit_logs_book_created_at_idx" ON "review_audit_logs"("book_id", "created_at");

-- CreateIndex
CREATE INDEX "review_audit_logs_claim_idx" ON "review_audit_logs"("claim_kind", "claim_id");

-- CreateIndex
CREATE INDEX "review_audit_logs_persona_idx" ON "review_audit_logs"("persona_id");
