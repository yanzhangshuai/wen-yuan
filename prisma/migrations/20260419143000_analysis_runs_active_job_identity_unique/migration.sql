CREATE UNIQUE INDEX "analysis_runs_active_job_identity_uidx"
  ON "analysis_runs" ("job_id", "book_id", "trigger", "scope")
  WHERE "status" = 'RUNNING' AND "job_id" IS NOT NULL;
