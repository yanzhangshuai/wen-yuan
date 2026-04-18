import type { PrismaClient } from "@/generated/prisma/client";
import type { NameType, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";

export interface PersonaProjectionRow {
  id                     : string;
  name                   : string;
  aliases                : string[];
  gender                 : string | null;
  hometown               : string | null;
  nameType               : NameType;
  globalTags             : string[];
  confidence             : number;
  recordSource           : RecordSource;
  status                 : string;
  mentionCount           : number;
  effectiveBiographyCount: number;
  distinctChapters       : number;
}

export interface ProjectedBookPersonaListItem {
  id           : string;
  profileId    : string | null;
  bookId       : string;
  name         : string;
  localName    : string;
  aliases      : string[];
  gender       : string | null;
  hometown     : string | null;
  nameType     : NameType;
  globalTags   : string[];
  localTags    : string[];
  officialTitle: string | null;
  localSummary : string | null;
  ironyIndex   : number;
  confidence   : number;
  recordSource : RecordSource;
  status       : ProcessingStatus;
}

interface LatestAnalysisJobSnapshot {
  architecture?: string | null;
  scope?       : string | null;
}

function resolveProjectionStatus(status: string, recordSource: RecordSource): ProcessingStatus {
  if (status === "CONFIRMED" || recordSource === "MANUAL") {
    return "VERIFIED";
  }

  return "DRAFT";
}

export function isThreestageFullBookJob(job: LatestAnalysisJobSnapshot | null | undefined): boolean {
  return job?.architecture === "threestage" && job.scope === "FULL_BOOK";
}

export function mapPersonaProjectionRows(
  bookId: string,
  rows: readonly PersonaProjectionRow[]
): ProjectedBookPersonaListItem[] {
  return rows.map((row) => ({
    id           : row.id,
    profileId    : null,
    bookId,
    name         : row.name,
    localName    : row.name,
    aliases      : row.aliases,
    gender       : row.gender,
    hometown     : row.hometown,
    nameType     : row.nameType,
    globalTags   : row.globalTags,
    localTags    : [],
    officialTitle: null,
    localSummary : null,
    ironyIndex   : 0,
    confidence   : row.confidence,
    recordSource : row.recordSource,
    status       : resolveProjectionStatus(row.status, row.recordSource)
  }));
}

const PERSONA_PROJECTION_SELECT = {
  id                     : true,
  name                   : true,
  aliases                : true,
  gender                 : true,
  hometown               : true,
  nameType               : true,
  globalTags             : true,
  confidence             : true,
  recordSource           : true,
  status                 : true,
  mentionCount           : true,
  effectiveBiographyCount: true,
  distinctChapters       : true
} as const;

export async function listProjectedBookPersonas(
  bookId: string,
  prismaClient: PrismaClient = prisma
): Promise<ProjectedBookPersonaListItem[]> {
  const rows = await prismaClient.persona.findMany({
    where: {
      deletedAt      : null,
      personaMentions: {
        some: { bookId }
      }
    },
    orderBy: [
      { mentionCount: "desc" },
      { updatedAt: "desc" }
    ],
    select: PERSONA_PROJECTION_SELECT
  });

  return mapPersonaProjectionRows(bookId, rows);
}

export async function countProjectedBookPersonasByBookIds(
  bookIds: readonly string[],
  prismaClient: PrismaClient = prisma
): Promise<Map<string, number>> {
  if (bookIds.length === 0 || !prismaClient.personaMention?.groupBy) {
    return new Map();
  }

  const grouped = await prismaClient.personaMention.groupBy({
    by   : ["bookId", "promotedPersonaId"],
    where: {
      bookId           : { in: [...bookIds] },
      promotedPersonaId: { not: null }
    }
  });

  const counts = new Map<string, number>();
  for (const row of grouped) {
    if (!row.promotedPersonaId) {
      continue;
    }

    counts.set(row.bookId, (counts.get(row.bookId) ?? 0) + 1);
  }

  return counts;
}
