import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client.ts";

type Expected = Record<string, string[]>;

const expected: Expected = {
  NameType: ["NAMED", "TITLE_ONLY"],
  RecordSource: ["AI", "MANUAL"],
  AppRole: ["ADMIN", "VIEWER"],
  ProcessingStatus: ["DRAFT", "VERIFIED", "REJECTED"],
  AnalysisJobStatus: ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED"],
  PersonaType: ["PERSON", "LOCATION", "ORGANIZATION", "CONCEPT"],
  BioCategory: ["BIRTH", "EXAM", "CAREER", "TRAVEL", "SOCIAL", "DEATH", "EVENT"],
  ChapterType: ["PRELUDE", "CHAPTER", "POSTLUDE"],
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  let failed = false;

  for (const [enumName, expectedValues] of Object.entries(expected)) {
    const rows = await prisma.$queryRaw<Array<{ enum_value: string }>>`
      SELECT e.enumlabel AS enum_value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE lower(t.typname) = lower(${enumName})
      ORDER BY e.enumsortorder
    `;

    const actualValues = rows.map((row) => row.enum_value);
    console.log(`${enumName}=${actualValues.join(",")}`);

    if (
      actualValues.length !== expectedValues.length
      || actualValues.some((value, index) => value !== expectedValues[index])
    ) {
      failed = true;
      console.error(`MISMATCH ${enumName}: expected=${expectedValues.join(",")} actual=${actualValues.join(",")}`);
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
