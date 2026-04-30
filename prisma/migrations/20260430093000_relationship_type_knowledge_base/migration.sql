CREATE TABLE "relationship_type_definitions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "code" varchar(120) NOT NULL,
  "name" varchar(80) NOT NULL,
  "group" varchar(40) NOT NULL,
  "direction_mode" varchar(20) NOT NULL DEFAULT 'INVERSE',
  "source_role_label" varchar(80),
  "target_role_label" varchar(80),
  "edge_label" varchar(80) NOT NULL,
  "reverse_edge_label" varchar(80),
  "aliases" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "description" text,
  "usage_notes" text,
  "examples" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "color" varchar(40),
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
  "source" varchar(30) NOT NULL DEFAULT 'MANUAL',
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "relationship_type_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "relationship_type_definitions_code_key"
  ON "relationship_type_definitions"("code");

CREATE INDEX "relationship_type_definitions_group_status_sort_idx"
  ON "relationship_type_definitions"("group", "status", "sort_order");

CREATE INDEX "relationship_type_definitions_direction_status_idx"
  ON "relationship_type_definitions"("direction_mode", "status");

ALTER TABLE "relationships"
  ADD COLUMN "relationship_type_code" varchar(120);

CREATE INDEX "relationships_relationship_type_code_idx"
  ON "relationships"("relationship_type_code");

ALTER TABLE "relationships"
  ADD CONSTRAINT "relationships_relationship_type_code_fkey"
  FOREIGN KEY ("relationship_type_code")
  REFERENCES "relationship_type_definitions"("code")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
