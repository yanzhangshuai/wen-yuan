import {
  EventCategory,
  FactType,
  ProcessingStatus,
  RecordSource
} from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { ReviewInputError, ReviewNotFoundError } from "@/server/modules/review/errors";
import { BookNotFoundError } from "@/server/modules/books/errors";

type TxCallback<T> = (tx: ChapterEventsWorkbenchTransaction) => Promise<T>;

interface CountResult {
  count: number;
}

interface ChapterGroupCount {
  chapterId: string | null;
  _count   : { _all: number | null };
}

interface ChapterSummaryRow {
  id    : string;
  no    : number;
  noText: string | null;
  title : string;
}

interface ChapterLookupRow {
  id     : string;
  no?    : number;
  bookId?: string;
}

/** BIOGRAPHY 事实的展示字段（title/location/event/tags/ironyNote 存于 Fact.payload）。 */
interface EventPayload {
  title    : string | null;
  location : string | null;
  event    : string;
  tags     : string[];
  ironyNote: string | null;
}

interface EventRow {
  id            : string;
  sourceEntityId: string | null;
  chapterId     : string;
  chapterNo     : number;
  eventCategory : EventCategory | null;
  virtualYear   : string | null;
  recordSource  : RecordSource;
  status        : ProcessingStatus;
  payload       : unknown;
  createdAt?    : Date;
  updatedAt?    : Date;
  sourceEntity? : { name: string } | null;
  chapter?      : { bookId?: string; no?: number; title?: string };
}

interface VerificationRow {
  chapterId : string;
  verifiedAt: Date;
}

export interface ChapterEventsWorkbenchTransaction {
  book: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
  chapter: {
    findMany(args: unknown): Promise<ChapterSummaryRow[]>;
    findFirst(args: unknown): Promise<ChapterLookupRow | null>;
  };
  fact: {
    groupBy(args: unknown): Promise<ChapterGroupCount[]>;
    findMany(args: unknown): Promise<EventRow[]>;
    count(args: unknown): Promise<number>;
    create(args: unknown): Promise<EventRow>;
    findFirst(args: unknown): Promise<EventRow | null>;
    update(args: unknown): Promise<EventRow>;
    updateMany?(args: unknown): Promise<CountResult>;
  };
  entityProfile: {
    findFirst(args: unknown): Promise<{ entityId: string } | null>;
  };
  chapterBiographyVerification: {
    findMany(args: unknown): Promise<VerificationRow[]>;
    upsert(args: unknown): Promise<VerificationRow>;
  };
}

export interface ChapterEventsWorkbenchPrisma extends ChapterEventsWorkbenchTransaction {
  $transaction<T>(callback: TxCallback<T>): Promise<T>;
}

export interface ChapterEventFilters {
  status?: ProcessingStatus;
  source?: RecordSource;
}

export interface ChapterEventInput {
  sourceEntityId?: string;
  chapterId?     : string;
  eventCategory? : EventCategory;
  title?         : string | null;
  location?      : string | null;
  event?         : string;
  virtualYear?   : string | null;
  tags?          : string[];
  ironyNote?     : string | null;
  status?        : ProcessingStatus;
}

export interface ChapterEventItem {
  id            : string;
  sourceEntityId: string;
  personaName   : string;
  chapterId     : string;
  chapterNo     : number;
  eventCategory : EventCategory;
  title         : string | null;
  location      : string | null;
  event         : string;
  virtualYear   : string | null;
  tags          : string[];
  ironyNote     : string | null;
  recordSource  : RecordSource;
  status        : ProcessingStatus;
  updatedAt     : string | null;
}

function normalizeNullableText(input: string | null | undefined): string | null {
  if (input == null) return null;
  const value = input.trim();
  return value.length > 0 ? value : null;
}

function normalizeTags(input: string[] | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  return input
    .map(tag => tag.trim())
    .filter(tag => {
      if (tag.length === 0 || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    })
    .slice(0, 12);
}

/** 从 Fact.payload 读取 BIOGRAPHY 展示字段（容错解析，字段缺失给默认值）。 */
function readPayload(payload: unknown): EventPayload {
  const raw = (payload ?? {}) as Record<string, unknown>;
  return {
    title    : typeof raw.title === "string" ? raw.title : null,
    location : typeof raw.location === "string" ? raw.location : null,
    event    : typeof raw.event === "string" ? raw.event : "",
    tags     : Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
    ironyNote: typeof raw.ironyNote === "string" ? raw.ironyNote : null
  };
}

function mapEvent(row: EventRow): ChapterEventItem {
  const payload = readPayload(row.payload);
  return {
    id            : row.id,
    sourceEntityId: row.sourceEntityId ?? "",
    personaName   : row.sourceEntity?.name ?? "未知角色",
    chapterId     : row.chapterId,
    chapterNo     : row.chapterNo,
    eventCategory : row.eventCategory ?? EventCategory.EVENT,
    title         : payload.title,
    location      : payload.location,
    event         : payload.event,
    virtualYear   : row.virtualYear,
    tags          : payload.tags,
    ironyNote     : payload.ironyNote,
    recordSource  : row.recordSource,
    status        : row.status,
    updatedAt     : row.updatedAt?.toISOString() ?? null
  };
}

async function assertBookExists(tx: ChapterEventsWorkbenchTransaction, bookId: string) {
  const book = await tx.book.findFirst({
    where : { id: bookId, deletedAt: null },
    select: { id: true }
  });
  if (!book) throw new BookNotFoundError(bookId);
}

async function assertEntityInBook(
  tx: ChapterEventsWorkbenchTransaction,
  bookId: string,
  entityId: string
) {
  const profile = await tx.entityProfile.findFirst({
    where: {
      bookId,
      entityId,
      deletedAt: null,
      entity   : { deletedAt: null }
    },
    select: { entityId: true }
  });
  if (!profile) throw new ReviewInputError("角色不属于当前书籍");
}

async function findChapterInBook(
  tx: ChapterEventsWorkbenchTransaction,
  bookId: string,
  chapterId: string
) {
  const chapter = await tx.chapter.findFirst({
    where : { id: chapterId, bookId },
    select: { id: true, no: true, bookId: true }
  });
  if (!chapter) throw new ReviewInputError("章节不属于当前书籍");
  return chapter;
}

export function createChapterEventsWorkbenchService(
  prismaClient: ChapterEventsWorkbenchPrisma = prisma
) {
  async function listChapterSummaries(bookId: string) {
    await assertBookExists(prismaClient, bookId);

    const chapters = await prismaClient.chapter.findMany({
      where  : { bookId },
      orderBy: [{ no: "asc" }],
      select : { id: true, no: true, noText: true, title: true }
    });
    const [eventCounts, pendingCounts, verifications] = await Promise.all([
      prismaClient.fact.groupBy({
        by    : ["chapterId"],
        where : { chapter: { bookId }, deletedAt: null, factType: FactType.BIOGRAPHY },
        _count: { _all: true }
      }),
      prismaClient.fact.groupBy({
        by   : ["chapterId"],
        where: {
          chapter  : { bookId },
          deletedAt: null,
          factType : FactType.BIOGRAPHY,
          status   : ProcessingStatus.DRAFT
        },
        _count: { _all: true }
      }),
      prismaClient.chapterBiographyVerification.findMany({
        where : { bookId },
        select: { chapterId: true, verifiedAt: true }
      })
    ]);

    const countByChapter = new Map(eventCounts.map(row => [row.chapterId, row._count._all]));
    const pendingByChapter = new Map(pendingCounts.map(row => [row.chapterId, row._count._all]));
    const verifiedByChapter = new Map(verifications.map(row => [row.chapterId, row.verifiedAt]));

    const mapped = chapters.map(chapter => {
      const verifiedAt = verifiedByChapter.get(chapter.id) ?? null;
      return {
        id          : chapter.id,
        no          : chapter.no,
        noText      : chapter.noText,
        title       : chapter.title,
        eventCount  : countByChapter.get(chapter.id) ?? 0,
        pendingCount: pendingByChapter.get(chapter.id) ?? 0,
        isVerified  : verifiedAt !== null,
        verifiedAt  : verifiedAt?.toISOString() ?? null
      };
    });

    return {
      summary: {
        totalChapters   : chapters.length,
        verifiedChapters: mapped.filter(chapter => chapter.isVerified).length,
        pendingEvents   : mapped.reduce((sum, chapter) => sum + chapter.pendingCount, 0)
      },
      chapters: mapped
    };
  }

  async function listEvents(bookId: string, chapterId: string, filters: ChapterEventFilters = {}) {
    await assertBookExists(prismaClient, bookId);
    await findChapterInBook(prismaClient, bookId, chapterId);

    const rows = await prismaClient.fact.findMany({
      where: {
        chapterId,
        factType : FactType.BIOGRAPHY,
        deletedAt: null,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.source ? { recordSource: filters.source } : {})
      },
      orderBy: [{ chapterNo: "asc" }, { updatedAt: "desc" }],
      select : {
        id            : true,
        sourceEntityId: true,
        chapterId     : true,
        chapterNo     : true,
        eventCategory : true,
        virtualYear   : true,
        payload       : true,
        recordSource  : true,
        status        : true,
        updatedAt     : true,
        sourceEntity  : { select: { name: true } }
      }
    });

    return rows.map(mapEvent);
  }

  async function markChapterVerified(bookId: string, chapterId: string, verifiedBy?: string) {
    return prismaClient.$transaction(async (tx) => {
      await assertBookExists(tx, bookId);
      await findChapterInBook(tx, bookId, chapterId);
      const pendingCount = await tx.fact.count({
        where: {
          chapterId,
          deletedAt: null,
          factType : FactType.BIOGRAPHY,
          status   : ProcessingStatus.DRAFT
        }
      });
      if (pendingCount > 0) {
        throw new ReviewInputError("当前章节仍有待确认角色事迹，请先处理后再标记已校验");
      }

      const now = new Date();
      const verification = await tx.chapterBiographyVerification.upsert({
        where : { bookId_chapterId: { bookId, chapterId } },
        create: { bookId, chapterId, verifiedAt: now, verifiedBy },
        update: { verifiedAt: now, verifiedBy },
        select: { chapterId: true, verifiedAt: true }
      });

      return {
        chapterId : verification.chapterId,
        isVerified: true,
        verifiedAt: verification.verifiedAt.toISOString()
      };
    });
  }

  async function createManualEvent(bookId: string, input: ChapterEventInput) {
    const eventText = input.event?.trim();
    if (!input.sourceEntityId) throw new ReviewInputError("角色不能为空");
    if (!input.chapterId) throw new ReviewInputError("章节不能为空");
    if (!eventText) throw new ReviewInputError("事件内容不能为空");
    const entityId = input.sourceEntityId;
    const chapterId = input.chapterId;

    return prismaClient.$transaction(async (tx) => {
      await assertBookExists(tx, bookId);
      await assertEntityInBook(tx, bookId, entityId);
      const chapter = await findChapterInBook(tx, bookId, chapterId);
      const created = await tx.fact.create({
        data: {
          bookId,
          factType      : FactType.BIOGRAPHY,
          sourceEntityId: entityId,
          chapterId     : chapter.id,
          chapterNo     : chapter.no ?? 0,
          eventCategory : input.eventCategory ?? EventCategory.EVENT,
          virtualYear   : normalizeNullableText(input.virtualYear),
          // evidence 为必填字段：手动录入时正文即记录内容。
          evidence      : eventText,
          payload       : {
            event    : eventText,
            title    : normalizeNullableText(input.title),
            location : normalizeNullableText(input.location),
            tags     : normalizeTags(input.tags),
            ironyNote: normalizeNullableText(input.ironyNote)
          },
          recordSource: RecordSource.MANUAL,
          status      : ProcessingStatus.VERIFIED
        },
        select: {
          id            : true,
          sourceEntityId: true,
          chapterId     : true,
          chapterNo     : true,
          eventCategory : true,
          virtualYear   : true,
          payload       : true,
          recordSource  : true,
          status        : true,
          createdAt     : true,
          sourceEntity  : { select: { name: true } }
        }
      });

      return {
        ...mapEvent(created),
        updatedAt: created.createdAt?.toISOString() ?? null
      };
    });
  }

  async function updateEvent(bookId: string, eventId: string, input: ChapterEventInput) {
    return prismaClient.$transaction(async (tx) => {
      await assertBookExists(tx, bookId);
      const current = await tx.fact.findFirst({
        where : { id: eventId, deletedAt: null },
        select: { id: true, payload: true, chapter: { select: { bookId: true } } }
      });
      if (!current) throw new ReviewNotFoundError(eventId);
      if (current.chapter?.bookId !== bookId) throw new ReviewInputError("事迹不属于当前书籍");

      const data: Record<string, unknown> = {};
      const payload = { ...((current.payload ?? {}) as Record<string, unknown>) };
      let payloadChanged = false;

      if (input.sourceEntityId !== undefined) {
        await assertEntityInBook(tx, bookId, input.sourceEntityId);
        data.sourceEntityId = input.sourceEntityId;
      }
      if (input.chapterId !== undefined) {
        const chapter = await findChapterInBook(tx, bookId, input.chapterId);
        data.chapterId = chapter.id;
        data.chapterNo = chapter.no ?? 0;
      }
      if (input.eventCategory !== undefined) data.eventCategory = input.eventCategory;
      if (input.title !== undefined) {
        payload.title = normalizeNullableText(input.title);
        payloadChanged = true;
      }
      if (input.location !== undefined) {
        payload.location = normalizeNullableText(input.location);
        payloadChanged = true;
      }
      if (input.event !== undefined) {
        payload.event = input.event.trim();
        payloadChanged = true;
      }
      if (input.virtualYear !== undefined) data.virtualYear = normalizeNullableText(input.virtualYear);
      if (input.tags !== undefined) {
        payload.tags = normalizeTags(input.tags);
        payloadChanged = true;
      }
      if (input.ironyNote !== undefined) {
        payload.ironyNote = normalizeNullableText(input.ironyNote);
        payloadChanged = true;
      }
      if (input.status !== undefined) data.status = input.status;
      if (payloadChanged) data.payload = payload;

      if (Object.keys(data).length === 0) throw new ReviewInputError("至少需要一个可更新字段");

      const updated = await tx.fact.update({
        where : { id: eventId },
        data,
        select: {
          id            : true,
          sourceEntityId: true,
          chapterId     : true,
          chapterNo     : true,
          eventCategory : true,
          virtualYear   : true,
          payload       : true,
          recordSource  : true,
          status        : true,
          updatedAt     : true,
          sourceEntity  : { select: { name: true } }
        }
      });

      return mapEvent(updated);
    });
  }

  async function deleteEvent(bookId: string, eventId: string) {
    return prismaClient.$transaction(async (tx) => {
      await assertBookExists(tx, bookId);
      const current = await tx.fact.findFirst({
        where : { id: eventId, deletedAt: null },
        select: { id: true, chapter: { select: { bookId: true } } }
      });
      if (!current) throw new ReviewNotFoundError(eventId);
      if (current.chapter?.bookId !== bookId) throw new ReviewInputError("事迹不属于当前书籍");

      await tx.fact.update({
        where: { id: eventId },
        data : {
          status   : ProcessingStatus.REJECTED,
          deletedAt: new Date()
        },
        select: { id: true }
      });

      return { id: eventId };
    });
  }

  return {
    listChapterSummaries,
    listEvents,
    markChapterVerified,
    createManualEvent,
    updateEvent,
    deleteEvent
  };
}

export const {
  listChapterSummaries,
  listEvents,
  markChapterVerified,
  createManualEvent,
  updateEvent,
  deleteEvent
} = createChapterEventsWorkbenchService();
