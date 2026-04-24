import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  PERSONA_CHAPTER_REVIEW_STATE_FAMILY_VALUES,
  type ConflictFlagProjectionSourceRow,
  type EventClaimProjectionSourceRow,
  type IdentityResolutionClaimProjectionSourceRow,
  type PersonaChapterFactProjectionRow,
  type PersonaChapterReviewStateSummary,
  type PersonaTimeFactProjectionRow,
  type ProjectionChapterSourceRow,
  type RelationClaimProjectionSourceRow,
  type RelationshipEdgeProjectionRow,
  type TimeClaimProjectionSourceRow,
  type TimelineEventProjectionRow
} from "@/server/modules/review/evidence-review/projections/types";
import {
  CLAIM_REVIEW_STATE_VALUES,
  type ClaimReviewState
} from "@/server/modules/review/evidence-review/review-state";

import type { ReviewRegressionFixture } from "./contracts";

export type ReviewRegressionSnapshotBookRow = {
  id   : string;
  title: string;
};

export type ReviewRegressionSnapshotChapterRow = ProjectionChapterSourceRow & {
  title  : string;
  content: string;
};

export type ReviewRegressionSnapshotPersonaRow = {
  id     : string;
  name   : string;
  aliases: readonly string[];
};

export type ReviewRegressionSnapshotPersonaAliasRow = {
  personaId: string;
  aliasText: string;
};

export type ReviewRegressionSnapshotEvidenceSpanRow = {
  id                 : string;
  bookId             : string;
  chapterId          : string;
  segmentId          : string;
  startOffset        : number;
  endOffset          : number;
  quotedText         : string;
  normalizedText     : string;
  speakerHint        : string | null;
  narrativeRegionType: string;
  createdAt          : Date;
};

export type ReviewRegressionSnapshotChapterSegmentRow = {
  id            : string;
  bookId        : string;
  chapterId     : string;
  runId         : string;
  segmentIndex  : number;
  segmentType   : string;
  startOffset   : number;
  endOffset     : number;
  text          : string;
  normalizedText: string;
  confidence    : number;
  speakerHint   : string | null;
  createdAt     : Date;
};

export interface ReviewRegressionSnapshotFixtureContext {
  fixture : ReviewRegressionFixture;
  book    : ReviewRegressionSnapshotBookRow;
  chapters: ReviewRegressionSnapshotChapterRow[];
}

export interface ReviewRegressionCurrentRows {
  personas                : ReviewRegressionSnapshotPersonaRow[];
  personaAliases          : ReviewRegressionSnapshotPersonaAliasRow[];
  identityResolutionClaims: IdentityResolutionClaimProjectionSourceRow[];
  eventClaims             : EventClaimProjectionSourceRow[];
  relationClaims          : RelationClaimProjectionSourceRow[];
  timeClaims              : TimeClaimProjectionSourceRow[];
  conflictFlags           : ConflictFlagProjectionSourceRow[];
  personaChapterFacts     : PersonaChapterFactProjectionRow[];
  personaTimeFacts        : PersonaTimeFactProjectionRow[];
  relationshipEdges       : RelationshipEdgeProjectionRow[];
  timelineEvents          : TimelineEventProjectionRow[];
  evidenceSpans           : ReviewRegressionSnapshotEvidenceSpanRow[];
  chapterSegments         : ReviewRegressionSnapshotChapterSegmentRow[];
}

export interface ReviewRegressionRunScopedRows {
  personas                : ReviewRegressionSnapshotPersonaRow[];
  personaAliases          : ReviewRegressionSnapshotPersonaAliasRow[];
  identityResolutionClaims: IdentityResolutionClaimProjectionSourceRow[];
  eventClaims             : EventClaimProjectionSourceRow[];
  relationClaims          : RelationClaimProjectionSourceRow[];
  timeClaims              : TimeClaimProjectionSourceRow[];
  conflictFlags           : ConflictFlagProjectionSourceRow[];
  evidenceSpans           : ReviewRegressionSnapshotEvidenceSpanRow[];
  chapterSegments         : ReviewRegressionSnapshotChapterSegmentRow[];
}

export interface ReviewRegressionSnapshotRepository {
  resolveFixtureContext(
    fixture: ReviewRegressionFixture
  ): Promise<ReviewRegressionSnapshotFixtureContext>;
  loadCurrentReviewRows(
    context: ReviewRegressionSnapshotFixtureContext
  ): Promise<ReviewRegressionCurrentRows>;
  loadRunScopedClaimRows(
    context: ReviewRegressionSnapshotFixtureContext,
    runId: string
  ): Promise<ReviewRegressionRunScopedRows>;
}

type ReviewRegressionSnapshotPersonaChapterFactRawRow = Omit<
  PersonaChapterFactProjectionRow,
  "reviewStateSummary"
> & {
  reviewStateSummary: unknown;
};

export interface ReviewRegressionSnapshotPrismaClient {
  book: {
    findMany(this: void, args: Prisma.BookFindManyArgs): Promise<ReviewRegressionSnapshotBookRow[]>;
  };
  chapter: {
    findMany(this: void, args: Prisma.ChapterFindManyArgs): Promise<ReviewRegressionSnapshotChapterRow[]>;
  };
  persona: {
    findMany(this: void, args: Prisma.PersonaFindManyArgs): Promise<ReviewRegressionSnapshotPersonaRow[]>;
  };
  personaAlias: {
    findMany(this: void, args: Prisma.PersonaAliasFindManyArgs): Promise<ReviewRegressionSnapshotPersonaAliasRow[]>;
  };
  identityResolutionClaim: {
    findMany(this: void, args: Prisma.IdentityResolutionClaimFindManyArgs): Promise<IdentityResolutionClaimProjectionSourceRow[]>;
  };
  eventClaim: {
    findMany(this: void, args: Prisma.EventClaimFindManyArgs): Promise<EventClaimProjectionSourceRow[]>;
  };
  relationClaim: {
    findMany(this: void, args: Prisma.RelationClaimFindManyArgs): Promise<RelationClaimProjectionSourceRow[]>;
  };
  timeClaim: {
    findMany(this: void, args: Prisma.TimeClaimFindManyArgs): Promise<TimeClaimProjectionSourceRow[]>;
  };
  conflictFlag: {
    findMany(this: void, args: Prisma.ConflictFlagFindManyArgs): Promise<ConflictFlagProjectionSourceRow[]>;
  };
  personaChapterFact: {
    findMany(this: void, args: Prisma.PersonaChapterFactFindManyArgs): Promise<ReviewRegressionSnapshotPersonaChapterFactRawRow[]>;
  };
  personaTimeFact: {
    findMany(this: void, args: Prisma.PersonaTimeFactFindManyArgs): Promise<PersonaTimeFactProjectionRow[]>;
  };
  relationshipEdge: {
    findMany(this: void, args: Prisma.RelationshipEdgeFindManyArgs): Promise<RelationshipEdgeProjectionRow[]>;
  };
  timelineEvent: {
    findMany(this: void, args: Prisma.TimelineEventFindManyArgs): Promise<TimelineEventProjectionRow[]>;
  };
  evidenceSpan: {
    findMany(this: void, args: Prisma.EvidenceSpanFindManyArgs): Promise<ReviewRegressionSnapshotEvidenceSpanRow[]>;
  };
  chapterSegment: {
    findMany(this: void, args: Prisma.ChapterSegmentFindManyArgs): Promise<ReviewRegressionSnapshotChapterSegmentRow[]>;
  };
}

export function createReviewRegressionSnapshotRepository(
  prismaClient: ReviewRegressionSnapshotPrismaClient = prisma as unknown as ReviewRegressionSnapshotPrismaClient
): ReviewRegressionSnapshotRepository {
  async function resolveFixtureContext(
    fixture: ReviewRegressionFixture
  ): Promise<ReviewRegressionSnapshotFixtureContext> {
    const bookWhere: Prisma.BookWhereInput = {
      title    : fixture.bookTitle,
      deletedAt: null,
      ...(fixture.bookAuthor === undefined ? {} : { author: fixture.bookAuthor })
    };
    const books = await prismaClient.book.findMany({
      where  : bookWhere,
      select : { id: true, title: true },
      orderBy: [{ id: "asc" }]
    });
    if (books.length === 0) {
      throw new Error(buildBookNotFoundMessage(fixture));
    }
    if (books.length > 1) {
      throw new Error(buildAmbiguousBookMessage(fixture, books.length));
    }
    const [book] = books;
    if (book === undefined) {
      throw new Error(buildBookNotFoundMessage(fixture));
    }

    const chapters = sortChapters(await prismaClient.chapter.findMany({
      where: {
        bookId: book.id,
        no    : { gte: fixture.chapterRange.startNo, lte: fixture.chapterRange.endNo }
      },
      select : { id: true, bookId: true, no: true, title: true, content: true },
      orderBy: [{ no: "asc" }, { id: "asc" }]
    }));

    const missingChapterNos = collectMissingChapterNos(fixture, chapters);
    if (missingChapterNos.length > 0) {
      throw new Error(
        `Missing chapters for review regression fixture ${fixture.fixtureKey}: ${missingChapterNos.join(", ")}`
      );
    }

    return { fixture, book, chapters };
  }

  async function loadCurrentReviewRows(
    context: ReviewRegressionSnapshotFixtureContext
  ): Promise<ReviewRegressionCurrentRows> {
    const chapterIds = context.chapters.map((chapter) => chapter.id);
    const [identityResolutionClaims, eventClaims, relationClaims, timeClaims, conflictFlags] = await Promise.all([
      prismaClient.identityResolutionClaim.findMany({
        where : { bookId: context.book.id, reviewState: "ACCEPTED", chapterId: { in: chapterIds } },
        select: {
          id                : true,
          bookId            : true,
          chapterId         : true,
          mentionId         : true,
          personaCandidateId: true,
          resolvedPersonaId : true,
          resolutionKind    : true,
          reviewState       : true,
          source            : true,
          runId             : true,
          createdAt         : true,
          updatedAt         : true
        },
        orderBy: [{ personaCandidateId: "asc" }, { id: "asc" }]
      }),
      prismaClient.eventClaim.findMany({
        where : { bookId: context.book.id, reviewState: "ACCEPTED", chapterId: { in: chapterIds } },
        select: {
          id                       : true,
          bookId                   : true,
          chapterId                : true,
          subjectPersonaCandidateId: true,
          objectPersonaCandidateId : true,
          predicate                : true,
          objectText               : true,
          locationText             : true,
          timeHintId               : true,
          eventCategory            : true,
          narrativeLens            : true,
          evidenceSpanIds          : true,
          confidence               : true,
          reviewState              : true,
          source                   : true,
          runId                    : true,
          createdAt                : true,
          updatedAt                : true
        },
        orderBy: [{ chapterId: "asc" }, { id: "asc" }]
      }),
      prismaClient.relationClaim.findMany({
        where : { bookId: context.book.id, reviewState: "ACCEPTED", chapterId: { in: chapterIds } },
        select: {
          id                      : true,
          bookId                  : true,
          chapterId               : true,
          sourcePersonaCandidateId: true,
          targetPersonaCandidateId: true,
          relationTypeKey         : true,
          relationLabel           : true,
          relationTypeSource      : true,
          direction               : true,
          effectiveChapterStart   : true,
          effectiveChapterEnd     : true,
          timeHintId              : true,
          evidenceSpanIds         : true,
          confidence              : true,
          reviewState             : true,
          source                  : true,
          runId                   : true,
          createdAt               : true,
          updatedAt               : true
        },
        orderBy: [{ chapterId: "asc" }, { relationTypeKey: "asc" }, { id: "asc" }]
      }),
      prismaClient.timeClaim.findMany({
        where : { bookId: context.book.id, reviewState: "ACCEPTED", chapterId: { in: chapterIds } },
        select: {
          id                 : true,
          bookId             : true,
          chapterId          : true,
          rawTimeText        : true,
          timeType           : true,
          normalizedLabel    : true,
          relativeOrderWeight: true,
          chapterRangeStart  : true,
          chapterRangeEnd    : true,
          evidenceSpanIds    : true,
          confidence         : true,
          reviewState        : true,
          source             : true,
          runId              : true,
          createdAt          : true,
          updatedAt          : true
        },
        orderBy: [{ chapterId: "asc" }, { normalizedLabel: "asc" }, { id: "asc" }]
      }),
      prismaClient.conflictFlag.findMany({
        where : { bookId: context.book.id, reviewState: "ACCEPTED" },
        select: {
          id                        : true,
          bookId                    : true,
          chapterId                 : true,
          runId                     : true,
          conflictType              : true,
          severity                  : true,
          reason                    : true,
          recommendedActionKey      : true,
          sourceStageKey            : true,
          relatedClaimKind          : true,
          relatedClaimIds           : true,
          relatedPersonaCandidateIds: true,
          relatedChapterIds         : true,
          summary                   : true,
          evidenceSpanIds           : true,
          reviewState               : true,
          source                    : true,
          reviewedByUserId          : true,
          reviewedAt                : true,
          reviewNote                : true,
          createdAt                 : true,
          updatedAt                 : true
        },
        orderBy: [{ id: "asc" }]
      })
    ]);

    const [personaChapterFactRows, personaTimeFacts, relationshipEdges, timelineEvents] = await Promise.all([
      prismaClient.personaChapterFact.findMany({
        where: {
          bookId   : context.book.id,
          chapterNo: {
            gte: context.fixture.chapterRange.startNo,
            lte: context.fixture.chapterRange.endNo
          }
        },
        select: {
          bookId            : true,
          personaId         : true,
          chapterId         : true,
          chapterNo         : true,
          eventCount        : true,
          relationCount     : true,
          conflictCount     : true,
          reviewStateSummary: true,
          latestUpdatedAt   : true
        },
        orderBy: [{ personaId: "asc" }, { chapterNo: "asc" }, { chapterId: "asc" }]
      }),
      prismaClient.personaTimeFact.findMany({
        where : { bookId: context.book.id },
        select: {
          bookId            : true,
          personaId         : true,
          timeLabel         : true,
          timeSortKey       : true,
          chapterRangeStart : true,
          chapterRangeEnd   : true,
          eventCount        : true,
          relationCount     : true,
          sourceTimeClaimIds: true
        },
        orderBy: [{ personaId: "asc" }, { timeSortKey: "asc" }, { timeLabel: "asc" }]
      }),
      prismaClient.relationshipEdge.findMany({
        where : { bookId: context.book.id },
        select: {
          bookId               : true,
          sourcePersonaId      : true,
          targetPersonaId      : true,
          relationTypeKey      : true,
          relationLabel        : true,
          relationTypeSource   : true,
          direction            : true,
          effectiveChapterStart: true,
          effectiveChapterEnd  : true,
          sourceClaimIds       : true,
          latestClaimId        : true
        },
        orderBy: [
          { sourcePersonaId: "asc" },
          { targetPersonaId: "asc" },
          { relationTypeKey: "asc" }
        ]
      }),
      prismaClient.timelineEvent.findMany({
        where : { bookId: context.book.id, chapterId: { in: chapterIds } },
        select: {
          bookId        : true,
          personaId     : true,
          chapterId     : true,
          chapterNo     : true,
          timeLabel     : true,
          eventLabel    : true,
          narrativeLens : true,
          sourceClaimIds: true
        },
        orderBy: [{ personaId: "asc" }, { chapterNo: "asc" }, { eventLabel: "asc" }]
      })
    ]);
    const personaChapterFacts = normalizePersonaChapterFactRows(personaChapterFactRows);

    const chapterScopedPersonaTimeFacts = filterRowsBySourceIds(personaTimeFacts, timeClaims, (row) => {
      return row.sourceTimeClaimIds;
    });
    const chapterScopedRelationshipEdges = filterRowsBySourceIds(relationshipEdges, relationClaims, (row) => {
      return row.sourceClaimIds;
    });

    const supportingRows = await loadSupportingRows(prismaClient, context, {
      identityResolutionClaims,
      eventClaims,
      relationClaims,
      timeClaims,
      conflictFlags,
      personaChapterFacts,
      personaTimeFacts : chapterScopedPersonaTimeFacts,
      relationshipEdges: chapterScopedRelationshipEdges,
      timelineEvents
    });

    return {
      personas                : supportingRows.personas,
      personaAliases          : supportingRows.personaAliases,
      identityResolutionClaims: sortBy(identityResolutionClaims, compareIdentityClaims),
      eventClaims             : sortBy(eventClaims, compareEventClaims),
      relationClaims          : sortBy(relationClaims, compareRelationClaims),
      timeClaims              : sortBy(timeClaims, compareTimeClaims),
      conflictFlags           : sortBy(conflictFlags, (left, right) => left.id.localeCompare(right.id)),
      personaChapterFacts     : sortBy(personaChapterFacts, comparePersonaChapterFacts),
      personaTimeFacts        : sortBy(chapterScopedPersonaTimeFacts, comparePersonaTimeFacts),
      relationshipEdges       : sortBy(chapterScopedRelationshipEdges, compareRelationshipEdges),
      timelineEvents          : sortBy(timelineEvents, compareTimelineEvents),
      evidenceSpans           : supportingRows.evidenceSpans,
      chapterSegments         : supportingRows.chapterSegments
    };
  }

  async function loadRunScopedClaimRows(
    context: ReviewRegressionSnapshotFixtureContext,
    runId: string
  ): Promise<ReviewRegressionRunScopedRows> {
    const chapterIds = context.chapters.map((chapter) => chapter.id);
    const [identityResolutionClaims, eventClaims, relationClaims, timeClaims, conflictFlags] = await Promise.all([
      prismaClient.identityResolutionClaim.findMany({
        where : { bookId: context.book.id, runId },
        select: {
          id                : true,
          bookId            : true,
          chapterId         : true,
          mentionId         : true,
          personaCandidateId: true,
          resolvedPersonaId : true,
          resolutionKind    : true,
          reviewState       : true,
          source            : true,
          runId             : true,
          createdAt         : true,
          updatedAt         : true
        },
        orderBy: [{ personaCandidateId: "asc" }, { id: "asc" }]
      }),
      prismaClient.eventClaim.findMany({
        where : { bookId: context.book.id, runId, chapterId: { in: chapterIds } },
        select: {
          id                       : true,
          bookId                   : true,
          chapterId                : true,
          subjectPersonaCandidateId: true,
          objectPersonaCandidateId : true,
          predicate                : true,
          objectText               : true,
          locationText             : true,
          timeHintId               : true,
          eventCategory            : true,
          narrativeLens            : true,
          evidenceSpanIds          : true,
          confidence               : true,
          reviewState              : true,
          source                   : true,
          runId                    : true,
          createdAt                : true,
          updatedAt                : true
        },
        orderBy: [{ chapterId: "asc" }, { id: "asc" }]
      }),
      prismaClient.relationClaim.findMany({
        where : { bookId: context.book.id, runId, chapterId: { in: chapterIds } },
        select: {
          id                      : true,
          bookId                  : true,
          chapterId               : true,
          sourcePersonaCandidateId: true,
          targetPersonaCandidateId: true,
          relationTypeKey         : true,
          relationLabel           : true,
          relationTypeSource      : true,
          direction               : true,
          effectiveChapterStart   : true,
          effectiveChapterEnd     : true,
          timeHintId              : true,
          evidenceSpanIds         : true,
          confidence              : true,
          reviewState             : true,
          source                  : true,
          runId                   : true,
          createdAt               : true,
          updatedAt               : true
        },
        orderBy: [{ chapterId: "asc" }, { relationTypeKey: "asc" }, { id: "asc" }]
      }),
      prismaClient.timeClaim.findMany({
        where : { bookId: context.book.id, runId, chapterId: { in: chapterIds } },
        select: {
          id                 : true,
          bookId             : true,
          chapterId          : true,
          rawTimeText        : true,
          timeType           : true,
          normalizedLabel    : true,
          relativeOrderWeight: true,
          chapterRangeStart  : true,
          chapterRangeEnd    : true,
          evidenceSpanIds    : true,
          confidence         : true,
          reviewState        : true,
          source             : true,
          runId              : true,
          createdAt          : true,
          updatedAt          : true
        },
        orderBy: [{ chapterId: "asc" }, { normalizedLabel: "asc" }, { id: "asc" }]
      }),
      prismaClient.conflictFlag.findMany({
        where : { bookId: context.book.id, runId },
        select: {
          id                        : true,
          bookId                    : true,
          chapterId                 : true,
          runId                     : true,
          conflictType              : true,
          severity                  : true,
          reason                    : true,
          recommendedActionKey      : true,
          sourceStageKey            : true,
          relatedClaimKind          : true,
          relatedClaimIds           : true,
          relatedPersonaCandidateIds: true,
          relatedChapterIds         : true,
          summary                   : true,
          evidenceSpanIds           : true,
          reviewState               : true,
          source                    : true,
          reviewedByUserId          : true,
          reviewedAt                : true,
          reviewNote                : true,
          createdAt                 : true,
          updatedAt                 : true
        },
        orderBy: [{ id: "asc" }]
      })
    ]);

    const supportingRows = await loadSupportingRows(prismaClient, context, {
      identityResolutionClaims,
      eventClaims,
      relationClaims,
      timeClaims,
      conflictFlags
    });

    return {
      personas                : supportingRows.personas,
      personaAliases          : supportingRows.personaAliases,
      identityResolutionClaims: sortBy(identityResolutionClaims, compareIdentityClaims),
      eventClaims             : sortBy(eventClaims, compareEventClaims),
      relationClaims          : sortBy(relationClaims, compareRelationClaims),
      timeClaims              : sortBy(timeClaims, compareTimeClaims),
      conflictFlags           : sortBy(conflictFlags, (left, right) => left.id.localeCompare(right.id)),
      evidenceSpans           : supportingRows.evidenceSpans,
      chapterSegments         : supportingRows.chapterSegments
    };
  }

  return {
    resolveFixtureContext,
    loadCurrentReviewRows,
    loadRunScopedClaimRows
  };
}

function buildBookNotFoundMessage(fixture: ReviewRegressionFixture): string {
  return `Book not found for review regression fixture ${fixture.fixtureKey}: ${formatFixtureBookKey(fixture)}`;
}

function buildAmbiguousBookMessage(fixture: ReviewRegressionFixture, matchedCount: number): string {
  return (
    `Ambiguous book title for review regression fixture ${fixture.fixtureKey}: `
    + `${formatFixtureBookKey(fixture)} (matched ${matchedCount} books)`
  );
}

function formatFixtureBookKey(fixture: ReviewRegressionFixture): string {
  return fixture.bookAuthor === undefined
    ? fixture.bookTitle
    : `${fixture.bookTitle} by ${fixture.bookAuthor}`;
}

async function loadSupportingRows(
  prismaClient: ReviewRegressionSnapshotPrismaClient,
  context: ReviewRegressionSnapshotFixtureContext,
  rows: {
    identityResolutionClaims: readonly IdentityResolutionClaimProjectionSourceRow[];
    eventClaims             : readonly EventClaimProjectionSourceRow[];
    relationClaims          : readonly RelationClaimProjectionSourceRow[];
    timeClaims              : readonly TimeClaimProjectionSourceRow[];
    conflictFlags           : readonly ConflictFlagProjectionSourceRow[];
    personaChapterFacts?    : readonly PersonaChapterFactProjectionRow[];
    personaTimeFacts?       : readonly PersonaTimeFactProjectionRow[];
    relationshipEdges?      : readonly RelationshipEdgeProjectionRow[];
    timelineEvents?         : readonly TimelineEventProjectionRow[];
  }
): Promise<{
  personas       : ReviewRegressionSnapshotPersonaRow[];
  personaAliases : ReviewRegressionSnapshotPersonaAliasRow[];
  evidenceSpans  : ReviewRegressionSnapshotEvidenceSpanRow[];
  chapterSegments: ReviewRegressionSnapshotChapterSegmentRow[];
}> {
  const personaIds = collectPersonaIds(rows);
  const evidenceSpanIds = collectEvidenceSpanIds(rows);

  const [personas, personaAliases, evidenceSpans] = await Promise.all([
    prismaClient.persona.findMany({
      where  : { id: { in: personaIds } },
      select : { id: true, name: true, aliases: true },
      orderBy: [{ name: "asc" }, { id: "asc" }]
    }),
    prismaClient.personaAlias.findMany({
      where  : { bookId: context.book.id, personaId: { in: personaIds } },
      select : { personaId: true, aliasText: true },
      orderBy: [{ aliasText: "asc" }, { personaId: "asc" }]
    }),
    prismaClient.evidenceSpan.findMany({
      where : { id: { in: evidenceSpanIds } },
      select: {
        id                 : true,
        bookId             : true,
        chapterId          : true,
        segmentId          : true,
        startOffset        : true,
        endOffset          : true,
        quotedText         : true,
        normalizedText     : true,
        speakerHint        : true,
        narrativeRegionType: true,
        createdAt          : true
      },
      orderBy: [{ chapterId: "asc" }, { startOffset: "asc" }, { id: "asc" }]
    })
  ]);

  const segmentIds = Array.from(new Set(evidenceSpans.map((span) => span.segmentId))).sort();
  const chapterSegments = sortBy(await prismaClient.chapterSegment.findMany({
    where : { id: { in: segmentIds } },
    select: {
      id            : true,
      bookId        : true,
      chapterId     : true,
      runId         : true,
      segmentIndex  : true,
      segmentType   : true,
      startOffset   : true,
      endOffset     : true,
      text          : true,
      normalizedText: true,
      confidence    : true,
      speakerHint   : true,
      createdAt     : true
    },
    orderBy: [{ chapterId: "asc" }, { segmentIndex: "asc" }, { id: "asc" }]
  }), compareChapterSegments);

  return {
    personas      : sortBy(personas, (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    personaAliases: sortBy(personaAliases, (left, right) => left.aliasText.localeCompare(right.aliasText) || left.personaId.localeCompare(right.personaId)),
    evidenceSpans : sortBy(evidenceSpans, compareEvidenceSpans),
    chapterSegments
  };
}

function collectMissingChapterNos(
  fixture: ReviewRegressionFixture,
  chapters: readonly ReviewRegressionSnapshotChapterRow[]
): number[] {
  const chapterNoSet = new Set(chapters.map((chapter) => chapter.no));
  const missing: number[] = [];

  for (let chapterNo = fixture.chapterRange.startNo; chapterNo <= fixture.chapterRange.endNo; chapterNo += 1) {
    if (!chapterNoSet.has(chapterNo)) {
      missing.push(chapterNo);
    }
  }

  return missing;
}

function collectPersonaIds(rows: {
  identityResolutionClaims: readonly IdentityResolutionClaimProjectionSourceRow[];
  personaChapterFacts?    : readonly PersonaChapterFactProjectionRow[];
  personaTimeFacts?       : readonly PersonaTimeFactProjectionRow[];
  relationshipEdges?      : readonly RelationshipEdgeProjectionRow[];
  timelineEvents?         : readonly TimelineEventProjectionRow[];
}): string[] {
  const personaIds = new Set<string>();

  for (const claim of rows.identityResolutionClaims) {
    if (claim.resolvedPersonaId !== null) {
      personaIds.add(claim.resolvedPersonaId);
    }
  }
  for (const row of rows.personaChapterFacts ?? []) {
    personaIds.add(row.personaId);
  }
  for (const row of rows.personaTimeFacts ?? []) {
    personaIds.add(row.personaId);
  }
  for (const row of rows.relationshipEdges ?? []) {
    personaIds.add(row.sourcePersonaId);
    personaIds.add(row.targetPersonaId);
  }
  for (const row of rows.timelineEvents ?? []) {
    personaIds.add(row.personaId);
  }

  return Array.from(personaIds).sort();
}

function collectEvidenceSpanIds(rows: {
  identityResolutionClaims: readonly IdentityResolutionClaimProjectionSourceRow[];
  eventClaims             : readonly EventClaimProjectionSourceRow[];
  relationClaims          : readonly RelationClaimProjectionSourceRow[];
  timeClaims              : readonly TimeClaimProjectionSourceRow[];
  conflictFlags           : readonly ConflictFlagProjectionSourceRow[];
}): string[] {
  const evidenceSpanIds = new Set<string>();

  for (const eventClaim of rows.eventClaims) {
    for (const evidenceSpanId of eventClaim.evidenceSpanIds) {
      evidenceSpanIds.add(evidenceSpanId);
    }
  }
  for (const relationClaim of rows.relationClaims) {
    for (const evidenceSpanId of relationClaim.evidenceSpanIds) {
      evidenceSpanIds.add(evidenceSpanId);
    }
  }
  for (const timeClaim of rows.timeClaims) {
    for (const evidenceSpanId of timeClaim.evidenceSpanIds) {
      evidenceSpanIds.add(evidenceSpanId);
    }
  }
  for (const conflictFlag of rows.conflictFlags) {
    for (const evidenceSpanId of conflictFlag.evidenceSpanIds) {
      evidenceSpanIds.add(evidenceSpanId);
    }
  }

  return Array.from(evidenceSpanIds).sort();
}

function filterRowsBySourceIds<
  TRow,
  TSource extends { id: string }
>(
  rows: readonly TRow[],
  sourceRows: readonly TSource[],
  getSourceIds: (row: TRow) => readonly string[]
): TRow[] {
  const sourceIdSet = new Set(sourceRows.map((row) => row.id));
  return rows.filter((row) => getSourceIds(row).some((sourceId) => sourceIdSet.has(sourceId)));
}

/**
 * Prisma 对 JSON 字段只会返回宽泛的 `JsonValue`。
 * 回归仓储在这里收紧成 projection 读模型真正可消费的 review-state 结构，避免把 `unknown` 继续向下游传播。
 */
function normalizePersonaChapterFactRows(
  rows: readonly ReviewRegressionSnapshotPersonaChapterFactRawRow[]
): PersonaChapterFactProjectionRow[] {
  return rows.map((row) => ({
    ...row,
    reviewStateSummary: normalizePersonaChapterReviewStateSummary(row.reviewStateSummary)
  }));
}

function normalizePersonaChapterReviewStateSummary(value: unknown): PersonaChapterReviewStateSummary {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: PersonaChapterReviewStateSummary = {};
  for (const familyKey of PERSONA_CHAPTER_REVIEW_STATE_FAMILY_VALUES) {
    const familyValue = (value as Record<string, unknown>)[familyKey];
    if (familyValue === null || typeof familyValue !== "object" || Array.isArray(familyValue)) {
      continue;
    }

    const stateCounts: Partial<Record<ClaimReviewState, number>> = {};
    for (const reviewState of CLAIM_REVIEW_STATE_VALUES) {
      const count = (familyValue as Record<string, unknown>)[reviewState];
      if (typeof count === "number" && Number.isFinite(count) && count > 0) {
        stateCounts[reviewState] = count;
      }
    }

    if (Object.keys(stateCounts).length > 0) {
      normalized[familyKey] = stateCounts;
    }
  }

  return normalized;
}

function sortChapters(
  chapters: readonly ReviewRegressionSnapshotChapterRow[]
): ReviewRegressionSnapshotChapterRow[] {
  return sortBy(chapters, (left, right) => left.no - right.no || left.id.localeCompare(right.id));
}

function compareIdentityClaims(
  left: IdentityResolutionClaimProjectionSourceRow,
  right: IdentityResolutionClaimProjectionSourceRow
): number {
  return compareNullableString(left.personaCandidateId, right.personaCandidateId)
    || compareNullableString(left.resolvedPersonaId, right.resolvedPersonaId)
    || left.id.localeCompare(right.id);
}

function compareEventClaims(left: EventClaimProjectionSourceRow, right: EventClaimProjectionSourceRow): number {
  return left.chapterId.localeCompare(right.chapterId) || left.id.localeCompare(right.id);
}

function compareRelationClaims(
  left: RelationClaimProjectionSourceRow,
  right: RelationClaimProjectionSourceRow
): number {
  return left.chapterId.localeCompare(right.chapterId)
    || left.relationTypeKey.localeCompare(right.relationTypeKey)
    || left.id.localeCompare(right.id);
}

function compareTimeClaims(left: TimeClaimProjectionSourceRow, right: TimeClaimProjectionSourceRow): number {
  return left.chapterId.localeCompare(right.chapterId)
    || left.normalizedLabel.localeCompare(right.normalizedLabel)
    || left.id.localeCompare(right.id);
}

function comparePersonaChapterFacts(
  left: PersonaChapterFactProjectionRow,
  right: PersonaChapterFactProjectionRow
): number {
  return left.personaId.localeCompare(right.personaId)
    || left.chapterNo - right.chapterNo
    || left.chapterId.localeCompare(right.chapterId);
}

function comparePersonaTimeFacts(
  left: PersonaTimeFactProjectionRow,
  right: PersonaTimeFactProjectionRow
): number {
  return left.personaId.localeCompare(right.personaId)
    || compareNullableNumber(left.timeSortKey, right.timeSortKey)
    || compareNullableNumber(left.chapterRangeStart, right.chapterRangeStart)
    || compareNullableNumber(left.chapterRangeEnd, right.chapterRangeEnd)
    || left.timeLabel.localeCompare(right.timeLabel);
}

function compareRelationshipEdges(
  left: RelationshipEdgeProjectionRow,
  right: RelationshipEdgeProjectionRow
): number {
  return left.sourcePersonaId.localeCompare(right.sourcePersonaId)
    || left.targetPersonaId.localeCompare(right.targetPersonaId)
    || left.relationTypeKey.localeCompare(right.relationTypeKey)
    || left.direction.localeCompare(right.direction)
    || compareNullableNumber(left.effectiveChapterStart, right.effectiveChapterStart)
    || compareNullableNumber(left.effectiveChapterEnd, right.effectiveChapterEnd);
}

function compareTimelineEvents(
  left: TimelineEventProjectionRow,
  right: TimelineEventProjectionRow
): number {
  return left.personaId.localeCompare(right.personaId)
    || compareNullableNumber(left.chapterNo, right.chapterNo)
    || compareNullableString(left.timeLabel, right.timeLabel)
    || left.eventLabel.localeCompare(right.eventLabel);
}

function compareEvidenceSpans(
  left: ReviewRegressionSnapshotEvidenceSpanRow,
  right: ReviewRegressionSnapshotEvidenceSpanRow
): number {
  return left.chapterId.localeCompare(right.chapterId)
    || left.startOffset - right.startOffset
    || left.endOffset - right.endOffset
    || left.id.localeCompare(right.id);
}

function compareChapterSegments(
  left: ReviewRegressionSnapshotChapterSegmentRow,
  right: ReviewRegressionSnapshotChapterSegmentRow
): number {
  return left.chapterId.localeCompare(right.chapterId)
    || left.segmentIndex - right.segmentIndex
    || left.id.localeCompare(right.id);
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function compareNullableString(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}

function sortBy<TItem>(items: readonly TItem[], compare: (left: TItem, right: TItem) => number): TItem[] {
  return [...items].sort(compare);
}
