/*
  Warnings:

  - You are about to drop the `feature_models` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "feature_models" DROP CONSTRAINT "feature_models_model_id_fkey";

-- DropTable
DROP TABLE "feature_models";
