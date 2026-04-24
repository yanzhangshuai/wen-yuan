import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import type { PersonaDetail } from "@/types/graph";

export interface ReviewPersonaDetailSummaryDto {
  firstChapterNo     : number | null;
  firstTimeSortKey   : number | null;
  totalEventCount    : number;
  totalRelationCount : number;
  totalTimeClaimCount: number;
  totalConflictCount : number;
}

export interface ReviewPersonaChapterFactDto {
  id              : string;
  bookId          : string;
  bookTitle       : string;
  chapterId       : string;
  chapterNo       : number;
  factLabel       : string;
  eventCategory   : string;
  location        : string | null;
  evidenceSnippets: string[];
  recordSource    : RecordSource;
  status          : ProcessingStatus;
}

export interface ReviewPersonaTimeFactDto {
  id                : string;
  bookId            : string;
  bookTitle         : string;
  normalizedLabel   : string;
  timeType          : string | null;
  timeSortKey       : number | null;
  chapterRangeStart : number | null;
  chapterRangeEnd   : number | null;
  evidenceSnippets  : string[];
  sourceTimeClaimIds: string[];
}

export interface ReviewPersonaRelationDto {
  id                    : string;
  bookId                : string;
  bookTitle             : string;
  chapterId             : string | null;
  chapterNo             : number | null;
  sourcePersonaId       : string;
  targetPersonaId       : string;
  counterpartPersonaId  : string;
  counterpartDisplayName: string;
  relationTypeKey       : string;
  relationLabel         : string;
  direction             : "outgoing" | "incoming";
  effectiveChapterStart : number | null;
  effectiveChapterEnd   : number | null;
  evidenceSnippets      : string[];
  recordSource          : RecordSource;
  status                : ProcessingStatus;
}

export interface ReviewPersonaDetailDto {
  id                       : string;
  name                     : string;
  aliases                  : string[];
  gender                   : string | null;
  hometown                 : string | null;
  nameType                 : string;
  recordSource             : RecordSource;
  confidence               : number;
  status                   : string;
  primaryPersonaCandidateId: string | null;
  personaCandidateIds      : string[];
  summary                  : ReviewPersonaDetailSummaryDto;
  chapterFacts             : ReviewPersonaChapterFactDto[];
  timeFacts                : ReviewPersonaTimeFactDto[];
  relations                : ReviewPersonaRelationDto[];
}

type EvidenceSpanRow = {
  id             : string;
  quotedText     : string;
  normalizedText?: string | null;
};

type EventClaimRow = {
  id             : string;
  chapterId      : string;
  eventCategory  : string;
  locationText   : string | null;
  evidenceSpanIds: string[];
  reviewState    : string;
  source         : string;
  createdAt?     : Date | null;
  updatedAt?     : Date | null;
};

type RelationClaimRow = {
  id                   : string;
  chapterId            : string;
  relationTypeKey      : string;
  relationLabel        : string;
  evidenceSpanIds      : string[];
  reviewState          : string;
  source               : string;
  effectiveChapterStart: number | null;
  effectiveChapterEnd  : number | null;
  createdAt?           : Date | null;
  updatedAt?           : Date | null;
};

type TimeClaimRow = {
  id               : string;
  normalizedLabel  : string;
  timeType         : string;
  chapterRangeStart: number | null;
  chapterRangeEnd  : number | null;
  evidenceSpanIds  : string[];
  reviewState      : string;
  source           : string;
  createdAt?       : Date | null;
  updatedAt?       : Date | null;
};

function resolveProjectionStatus(status: string, recordSource: RecordSource): ProcessingStatus {
  if (status === "CONFIRMED" || recordSource === RecordSource.MANUAL) {
    return ProcessingStatus.VERIFIED;
  }

  return ProcessingStatus.DRAFT;
}

function resolveClaimStatus(reviewState: string | null | undefined): ProcessingStatus {
  if (reviewState === "ACCEPTED") {
    return ProcessingStatus.VERIFIED;
  }
  if (reviewState === "REJECTED") {
    return ProcessingStatus.REJECTED;
  }

  return ProcessingStatus.DRAFT;
}

function resolveClaimRecordSource(source: string | null | undefined): RecordSource {
  return source === RecordSource.MANUAL ? RecordSource.MANUAL : RecordSource.AI;
}

function toUniqueSortedIds(values: readonly (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))).sort();
}

function compareNullableAscNullLast(
  left: string | number | null | undefined,
  right: string | number | null | undefined
): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

function compareClaimsByRecency<
  TClaim extends { id: string; updatedAt?: Date | null; createdAt?: Date | null }
>(
  left: TClaim,
  right: TClaim
): number {
  const updatedAtDiff = compareNullableAscNullLast(
    right.updatedAt?.getTime() ?? null,
    left.updatedAt?.getTime() ?? null
  );
  if (updatedAtDiff !== 0) {
    return updatedAtDiff;
  }

  const createdAtDiff = compareNullableAscNullLast(
    right.createdAt?.getTime() ?? null,
    left.createdAt?.getTime() ?? null
  );
  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  return left.id.localeCompare(right.id);
}

function collectEvidenceSnippets<
  TClaim extends { id: string; evidenceSpanIds: readonly string[] }
>(
  claimById: ReadonlyMap<string, TClaim>,
  evidenceSpanById: ReadonlyMap<string, EvidenceSpanRow>,
  claimIds: readonly string[]
): string[] {
  const snippets = new Set<string>();

  for (const claimId of claimIds) {
    const claim = claimById.get(claimId);
    if (claim === undefined) {
      continue;
    }

    for (const evidenceSpanId of claim.evidenceSpanIds) {
      const evidenceSpan = evidenceSpanById.get(evidenceSpanId);
      const snippet = evidenceSpan?.quotedText?.trim()
        || evidenceSpan?.normalizedText?.trim()
        || null;
      if (snippet) {
        snippets.add(snippet);
      }
    }
  }

  return Array.from(snippets);
}

function pickPrimaryClaim<TClaim extends { id: string; updatedAt?: Date | null; createdAt?: Date | null }>(
  latestClaimId: string | null | undefined,
  claimIds: readonly string[],
  claimById: ReadonlyMap<string, TClaim>
): TClaim | null {
  if (latestClaimId) {
    const latestClaim = claimById.get(latestClaimId);
    if (latestClaim) {
      return latestClaim;
    }
  }

  const claims = claimIds
    .map((claimId) => claimById.get(claimId))
    .filter((claim): claim is TClaim => claim !== undefined);

  if (claims.length === 0) {
    return null;
  }

  return [...claims].sort(compareClaimsByRecency)[0] ?? null;
}

function buildBookTitleMap(rows: readonly { id: string; title: string }[]): Map<string, string> {
  return new Map(rows.map((row) => [row.id, row.title]));
}

function buildChapterMap(rows: readonly { id: string; bookId: string; no: number; title: string }[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function buildPersonaNameMap(rows: readonly { id: string; name: string }[]) {
  return new Map(rows.map((row) => [row.id, row.name]));
}

export function toLegacyPersonaDetail(detail: ReviewPersonaDetailDto): PersonaDetail {
  const legacyStatus = resolveProjectionStatus(detail.status, detail.recordSource);
  const profileMap = new Map<string, { bookTitle: string }>();

  for (const fact of detail.chapterFacts) {
    profileMap.set(fact.bookId, { bookTitle: fact.bookTitle });
  }
  for (const fact of detail.timeFacts) {
    profileMap.set(fact.bookId, { bookTitle: fact.bookTitle });
  }
  for (const relation of detail.relations) {
    profileMap.set(relation.bookId, { bookTitle: relation.bookTitle });
  }

  return {
    id          : detail.id,
    name        : detail.name,
    aliases     : [...detail.aliases],
    gender      : detail.gender,
    hometown    : detail.hometown,
    nameType    : detail.nameType,
    recordSource: detail.recordSource,
    confidence  : detail.confidence,
    status      : legacyStatus,
    profiles    : Array.from(profileMap.entries())
      .sort(([leftBookId], [rightBookId]) => leftBookId.localeCompare(rightBookId))
      .map(([bookId, profile]) => ({
        profileId    : `projection:${bookId}`,
        bookId,
        bookTitle    : profile.bookTitle,
        localName    : detail.name,
        localSummary : null,
        officialTitle: null,
        localTags    : [],
        ironyIndex   : 0
      })),
    timeline: detail.chapterFacts.map((fact) => ({
      id          : fact.id,
      bookId      : fact.bookId,
      bookTitle   : fact.bookTitle,
      chapterId   : fact.chapterId,
      chapterNo   : fact.chapterNo,
      category    : fact.eventCategory,
      title       : null,
      location    : fact.location,
      event       : fact.factLabel,
      recordSource: fact.recordSource,
      status      : fact.status
    })),
    relationships: detail.relations.map((relation) => ({
      id             : relation.id,
      bookId         : relation.bookId,
      bookTitle      : relation.bookTitle,
      chapterId      : relation.chapterId ?? "",
      chapterNo      : relation.chapterNo ?? relation.effectiveChapterStart ?? 0,
      direction      : relation.direction,
      counterpartId  : relation.counterpartPersonaId,
      counterpartName: relation.counterpartDisplayName,
      type           : relation.relationLabel.trim() || relation.relationTypeKey,
      weight         : Math.max(1, relation.evidenceSnippets.length),
      evidence       : relation.evidenceSnippets[0] ?? null,
      recordSource   : relation.recordSource,
      status         : relation.status
    }))
  };
}

export function createReviewPersonaDetailService(
  prismaClient: PrismaClient = prisma
) {
  async function getReviewPersonaDetail(personaId: string): Promise<ReviewPersonaDetailDto> {
    const persona = await prismaClient.persona.findFirst({
      where : { id: personaId, deletedAt: null },
      select: {
        id          : true,
        name        : true,
        aliases     : true,
        gender      : true,
        hometown    : true,
        nameType    : true,
        recordSource: true,
        confidence  : true,
        status      : true
      }
    });

    if (!persona) {
      throw new PersonaNotFoundError(personaId);
    }

    const [
      acceptedIdentityRows,
      personaChapterFacts,
      personaTimeFacts,
      relationshipEdges,
      timelineEvents
    ] = await Promise.all([
      prismaClient.identityResolutionClaim.findMany({
        where: {
          resolvedPersonaId : personaId,
          reviewState       : "ACCEPTED",
          personaCandidateId: { not: null }
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      prismaClient.personaChapterFact.findMany({
        where: { personaId }
      }),
      prismaClient.personaTimeFact.findMany({
        where: { personaId }
      }),
      prismaClient.relationshipEdge.findMany({
        where: {
          OR: [
            { sourcePersonaId: personaId },
            { targetPersonaId: personaId }
          ]
        }
      }),
      prismaClient.timelineEvent.findMany({
        where: { personaId }
      })
    ]);

    const eventClaimIds = toUniqueSortedIds(
      timelineEvents.flatMap((row) => row.sourceClaimIds)
    );
    const relationClaimIds = toUniqueSortedIds(
      relationshipEdges.flatMap((row) => row.sourceClaimIds)
    );
    const timeClaimIds = toUniqueSortedIds(
      personaTimeFacts.flatMap((row) => row.sourceTimeClaimIds)
    );

    const [eventClaims, relationClaims, timeClaims] = await Promise.all([
      eventClaimIds.length > 0
        ? prismaClient.eventClaim.findMany({
          where: { id: { in: eventClaimIds } }
        })
        : Promise.resolve([]),
      relationClaimIds.length > 0
        ? prismaClient.relationClaim.findMany({
          where: { id: { in: relationClaimIds } }
        })
        : Promise.resolve([]),
      timeClaimIds.length > 0
        ? prismaClient.timeClaim.findMany({
          where: { id: { in: timeClaimIds } }
        })
        : Promise.resolve([])
    ]);

    const evidenceSpanIds = toUniqueSortedIds([
      ...eventClaims.flatMap((claim) => claim.evidenceSpanIds),
      ...relationClaims.flatMap((claim) => claim.evidenceSpanIds),
      ...timeClaims.flatMap((claim) => claim.evidenceSpanIds)
    ]);
    const counterpartPersonaIds = toUniqueSortedIds(
      relationshipEdges.flatMap((row) => [
        row.sourcePersonaId === personaId ? row.targetPersonaId : row.sourcePersonaId
      ])
    );
    const chapterIds = toUniqueSortedIds([
      ...timelineEvents.map((row) => row.chapterId),
      ...relationClaims.map((row) => row.chapterId)
    ]);
    const bookIds = toUniqueSortedIds([
      ...personaChapterFacts.map((row) => row.bookId),
      ...personaTimeFacts.map((row) => row.bookId),
      ...relationshipEdges.map((row) => row.bookId),
      ...timelineEvents.map((row) => row.bookId)
    ]);

    const [evidenceSpans, counterpartPersonas, chapters, books] = await Promise.all([
      evidenceSpanIds.length > 0
        ? prismaClient.evidenceSpan.findMany({
          where: { id: { in: evidenceSpanIds } }
        })
        : Promise.resolve([]),
      counterpartPersonaIds.length > 0
        ? prismaClient.persona.findMany({
          where : { id: { in: counterpartPersonaIds } },
          select: { id: true, name: true }
        })
        : Promise.resolve([]),
      chapterIds.length > 0
        ? prismaClient.chapter.findMany({
          where : { id: { in: chapterIds } },
          select: {
            id    : true,
            bookId: true,
            no    : true,
            title : true
          }
        })
        : Promise.resolve([]),
      bookIds.length > 0
        ? prismaClient.book.findMany({
          where : { id: { in: bookIds } },
          select: { id: true, title: true }
        })
        : Promise.resolve([])
    ]);

    const candidateIds = Array.from(new Set(
      acceptedIdentityRows
        .map((row) => row.personaCandidateId)
        .filter((candidateId): candidateId is string => typeof candidateId === "string")
    ));
    const summary: ReviewPersonaDetailSummaryDto = {
      firstChapterNo: personaChapterFacts.length > 0
        ? Math.min(...personaChapterFacts.map((row) => row.chapterNo))
        : null,
      firstTimeSortKey: (() => {
        const sortKeys = personaTimeFacts
          .map((row) => row.timeSortKey)
          .filter((value): value is number => typeof value === "number");
        return sortKeys.length > 0 ? Math.min(...sortKeys) : null;
      })(),
      totalEventCount    : personaChapterFacts.reduce((sum, row) => sum + row.eventCount, 0),
      totalRelationCount : relationshipEdges.length,
      totalTimeClaimCount: timeClaimIds.length,
      totalConflictCount : personaChapterFacts.reduce((sum, row) => sum + row.conflictCount, 0)
    };

    const bookTitleById = buildBookTitleMap(books);
    const chapterById = buildChapterMap(chapters);
    const personaNameById = buildPersonaNameMap(counterpartPersonas);
    const eventClaimById = new Map(eventClaims.map((claim) => [claim.id, claim as EventClaimRow]));
    const relationClaimById = new Map(relationClaims.map((claim) => [claim.id, claim as RelationClaimRow]));
    const timeClaimById = new Map(timeClaims.map((claim) => [claim.id, claim as TimeClaimRow]));
    const evidenceSpanById = new Map(evidenceSpans.map((span) => [span.id, span as EvidenceSpanRow]));

    const chapterFacts = timelineEvents
      .map((row) => {
        const primaryClaim = pickPrimaryClaim(null, row.sourceClaimIds, eventClaimById);
        return {
          id              : row.id,
          bookId          : row.bookId,
          bookTitle       : bookTitleById.get(row.bookId) ?? row.bookId,
          chapterId       : row.chapterId ?? primaryClaim?.chapterId ?? "",
          chapterNo       : row.chapterNo ?? chapterById.get(primaryClaim?.chapterId ?? "")?.no ?? 0,
          factLabel       : row.eventLabel,
          eventCategory   : primaryClaim?.eventCategory ?? "EVENT",
          location        : primaryClaim?.locationText ?? null,
          evidenceSnippets: collectEvidenceSnippets(eventClaimById, evidenceSpanById, row.sourceClaimIds),
          recordSource    : resolveClaimRecordSource(primaryClaim?.source),
          status          : resolveClaimStatus(primaryClaim?.reviewState)
        } satisfies ReviewPersonaChapterFactDto;
      })
      .sort((left, right) => {
        const chapterNoDiff = compareNullableAscNullLast(left.chapterNo, right.chapterNo);
        if (chapterNoDiff !== 0) {
          return chapterNoDiff;
        }

        const labelDiff = left.factLabel.localeCompare(right.factLabel);
        if (labelDiff !== 0) {
          return labelDiff;
        }

        return left.id.localeCompare(right.id);
      });

    const timeFacts = personaTimeFacts
      .map((row) => {
        const primaryClaim = pickPrimaryClaim(null, row.sourceTimeClaimIds, timeClaimById);
        return {
          id                : row.id,
          bookId            : row.bookId,
          bookTitle         : bookTitleById.get(row.bookId) ?? row.bookId,
          normalizedLabel   : row.timeLabel,
          timeType          : primaryClaim?.timeType ?? null,
          timeSortKey       : row.timeSortKey,
          chapterRangeStart : row.chapterRangeStart,
          chapterRangeEnd   : row.chapterRangeEnd,
          evidenceSnippets  : collectEvidenceSnippets(timeClaimById, evidenceSpanById, row.sourceTimeClaimIds),
          sourceTimeClaimIds: [...row.sourceTimeClaimIds]
        } satisfies ReviewPersonaTimeFactDto;
      })
      .sort((left, right) => {
        const sortKeyDiff = compareNullableAscNullLast(left.timeSortKey, right.timeSortKey);
        if (sortKeyDiff !== 0) {
          return sortKeyDiff;
        }

        const chapterStartDiff = compareNullableAscNullLast(left.chapterRangeStart, right.chapterRangeStart);
        if (chapterStartDiff !== 0) {
          return chapterStartDiff;
        }

        const chapterEndDiff = compareNullableAscNullLast(left.chapterRangeEnd, right.chapterRangeEnd);
        if (chapterEndDiff !== 0) {
          return chapterEndDiff;
        }

        const labelDiff = left.normalizedLabel.localeCompare(right.normalizedLabel);
        if (labelDiff !== 0) {
          return labelDiff;
        }

        return left.id.localeCompare(right.id);
      });

    const relations = relationshipEdges
      .map((row) => {
        const primaryClaim = pickPrimaryClaim(row.latestClaimId, row.sourceClaimIds, relationClaimById);
        const counterpartPersonaId = row.sourcePersonaId === personaId
          ? row.targetPersonaId
          : row.sourcePersonaId;
        const relationChapter = primaryClaim?.chapterId
          ? chapterById.get(primaryClaim.chapterId)
          : null;

        return {
          id                    : row.id,
          bookId                : row.bookId,
          bookTitle             : bookTitleById.get(row.bookId) ?? row.bookId,
          chapterId             : primaryClaim?.chapterId ?? null,
          chapterNo             : relationChapter?.no ?? row.effectiveChapterStart ?? null,
          sourcePersonaId       : row.sourcePersonaId,
          targetPersonaId       : row.targetPersonaId,
          counterpartPersonaId,
          counterpartDisplayName: personaNameById.get(counterpartPersonaId) ?? counterpartPersonaId,
          relationTypeKey       : row.relationTypeKey,
          relationLabel         : row.relationLabel,
          direction             : row.sourcePersonaId === personaId ? "outgoing" : "incoming",
          effectiveChapterStart : row.effectiveChapterStart,
          effectiveChapterEnd   : row.effectiveChapterEnd,
          evidenceSnippets      : collectEvidenceSnippets(relationClaimById, evidenceSpanById, row.sourceClaimIds),
          recordSource          : resolveClaimRecordSource(primaryClaim?.source),
          status                : resolveClaimStatus(primaryClaim?.reviewState)
        } satisfies ReviewPersonaRelationDto;
      })
      .sort((left, right) => {
        const startDiff = compareNullableAscNullLast(left.effectiveChapterStart, right.effectiveChapterStart);
        if (startDiff !== 0) {
          return startDiff;
        }

        const endDiff = compareNullableAscNullLast(left.effectiveChapterEnd, right.effectiveChapterEnd);
        if (endDiff !== 0) {
          return endDiff;
        }

        const nameDiff = left.counterpartDisplayName.localeCompare(right.counterpartDisplayName);
        if (nameDiff !== 0) {
          return nameDiff;
        }

        const keyDiff = left.relationTypeKey.localeCompare(right.relationTypeKey);
        if (keyDiff !== 0) {
          return keyDiff;
        }

        return left.id.localeCompare(right.id);
      });

    return {
      id                       : persona.id,
      name                     : persona.name,
      aliases                  : [...persona.aliases],
      gender                   : persona.gender,
      hometown                 : persona.hometown,
      nameType                 : persona.nameType,
      recordSource             : persona.recordSource,
      confidence               : persona.confidence,
      status                   : persona.status,
      primaryPersonaCandidateId: candidateIds[0] ?? null,
      personaCandidateIds      : candidateIds,
      summary,
      chapterFacts,
      timeFacts,
      relations
    };
  }

  async function getLegacyPersonaDetail(personaId: string): Promise<PersonaDetail> {
    const detail = await getReviewPersonaDetail(personaId);
    return toLegacyPersonaDetail(detail);
  }

  return {
    getReviewPersonaDetail,
    getLegacyPersonaDetail
  };
}

const reviewPersonaDetailService = createReviewPersonaDetailService();

export async function getReviewPersonaDetail(personaId: string): Promise<ReviewPersonaDetailDto> {
  return reviewPersonaDetailService.getReviewPersonaDetail(personaId);
}

export async function getLegacyPersonaDetail(personaId: string): Promise<PersonaDetail> {
  return reviewPersonaDetailService.getLegacyPersonaDetail(personaId);
}
