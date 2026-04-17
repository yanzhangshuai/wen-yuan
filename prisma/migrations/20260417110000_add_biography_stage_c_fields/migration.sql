-- Stage C 归属层新增字段：§0-6 四条件 + §0-5 REV-1 区段覆写审计。
ALTER TABLE "biography_records"
  ADD COLUMN "raw_span"                TEXT,
  ADD COLUMN "action_verb"             TEXT,
  ADD COLUMN "is_effective"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "region_override_applied" TEXT,
  ADD COLUMN "attribution_confidence"  DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 便于 persona.effectiveBiographyCount 维护查询（按 persona + isEffective 过滤）。
CREATE INDEX "biography_record_persona_effective_idx"
  ON "biography_records" ("persona_id", "is_effective");
