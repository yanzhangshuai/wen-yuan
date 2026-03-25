ALTER TABLE "books"
ADD COLUMN "source_file_key" TEXT,
ADD COLUMN "source_file_url" TEXT,
ADD COLUMN "source_file_name" TEXT,
ADD COLUMN "source_file_mime" TEXT,
ADD COLUMN "source_file_size" INTEGER;
