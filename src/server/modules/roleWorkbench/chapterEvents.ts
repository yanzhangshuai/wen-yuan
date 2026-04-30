import {
  BioCategory,
  ProcessingStatus,
  RecordSource
} from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BiographyInputError, BiographyRecordNotFoundError } from "@/server/modules/biography/errors";
import { BookNotFoundError } from "@/server/modules/books/errors";

type TxCallback<T> = (tx: ChapterEventsWorkbenchTransaction) => Promise<T>;

interface CountResult {
  count: number;
}

interface ChapterGroupCount {
  chapterId: string;
  _count   : { _all: number };
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

interface EventRow {
  id          : string;
  personaId   : string;
  chapterId   : string;
  chapterNo   : number;
  category    : BioCategory;
  title       : string | null;
  location    : string | null;
  event       : string;
  virtualYear : string | null;
  tags        : string[];
  ironyNote   : string | null;
  recordSource: RecordSource;
  status      : ProcessingStatus;
  createdAt?  : Date;
  updatedAt?  : Date;
  persona?    : { name: string };
  chapter?    : { bookId?: string; no?: number; title?: string };
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
  biographyRecord: {
    groupBy(args: unknown): Promise<ChapterGroupCount[]>;
    findMany(args: unknown): Promise<EventRow[]>;
    count(args: unknown): Promise<number>;
    create(args: unknown): Promise<EventRow>;
    findFirst(args: unknown): Promise<EventRow | null>;
    update(args: unknown): Promise<EventRow>;
    updateMany?(args: unknown): Promise<CountResult>;
  };
  profile: {
    findFirst(args: unknown): Promise<{ personaId: string } | null>;
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
  personaId?  : string;
  chapterId?  : string;
  category?   : BioCategory;
  title?      : string | null;
  location?   : string | null;
  event?      : string;
  virtualYear?: string | null;
  tags?       : string[];
  ironyNote?  : string | null;
  status?     : ProcessingStatus;
}

export interface ChapterEventItem {
  id          : string;
  personaId   : string;
  personaName : string;
  chapterId   : string;
  chapterNo   : number;
  category    : BioCategory;
  title       : string | null;
  location    : string | null;
  event       : string;
  virtualYear : string | null;
  tags        : string[];
  ironyNote   : string | null;
  recordSource: RecordSource;
  status      : ProcessingStatus;
  updatedAt   : string | null;
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

function mapEvent(row: EventRow): ChapterEventItem {
  return {
    id          : row.id,
    personaId   : row.personaId,
    personaName : row.persona?.name ?? "未知角色",
    chapterId   : row.chapterId,
    chapterNo   : row.chapterNo,
    category    : row.category,
    title       : row.title,
    location    : row.location,
    event       : row.event,
    virtualYear : row.virtualYear,
    tags        : row.tags ?? [],
    ironyNote   : row.ironyNote,
    recordSource: row.recordSource,
    status      : row.status,
    updatedAt   : row.updatedAt?.toISOString() ?? null
  };
}

async function assertBookExists(tx: ChapterEventsWorkbenchTransaction, bookId: string) {
  const book = await tx.book.findFirst({
    where : { id: bookId, deletedAt: null },
    select: { id: true }
  });
  if (!book) throw new BookNotFoundError(bookId);
}

async function assertPersonaInBook(
  tx: ChapterEventsWorkbenchTransaction,
  bookId: string,
  personaId: string
) {
  const profile = await tx.profile.findFirst({
    where: {
      bookId,
      personaId,
      deletedAt: null,
      persona  : { deletedAt: null }
    },
    select: { personaId: true }
  });
  if (!profile) throw new BiographyInputError("角色不属于当前书籍");
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
  if (!chapter) throw new BiographyInputError("章节不属于当前书籍");
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
      prismaClient.biographyRecord.groupBy({
        by    : ["chapterId"],
        where : { chapter: { bookId }, deletedAt: null },
        _count: { _all: true }
      }),
      prismaClient.biographyRecord.groupBy({
        by    : ["chapterId"],
        where : { chapter: { bookId }, deletedAt: null, status: ProcessingStatus.DRAFT },
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

    const rows = await prismaClient.biographyRecord.findMany({
      where: {
        chapterId,
        deletedAt: null,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.source ? { recordSource: filters.source } : {})
      },
      orderBy: [{ chapterNo: "asc" }, { updatedAt: "desc" }],
      select : {
        id          : true,
        personaId   : true,
        chapterId   : true,
        chapterNo   : true,
        category    : true,
        title       : true,
        location    : true,
        event       : true,
        virtualYear : true,
        tags        : true,
        ironyNote   : true,
        recordSource: true,
        status      : true,
        updatedAt   : true,
        persona     : { select: { name: true } }
      }
    });

    return rows.map(mapEvent);
  }

  async function markChapterVerified(bookId: string, chapterId: string, verifiedBy?: string) {
    return prismaClient.$transaction(async (tx) => {
      await assertBookExists(tx, bookId);
      await findChapterInBook(tx, bookId, chapterId);
      const pendingCount = await tx.biographyRecord.count({
        where: { chapterId, deletedAt: null, status: ProcessingStatus.DRAFT }
      });
      if (pendingCount > 0) {
        throw new BiographyInputError("当前章节仍有待确认角色事迹，请先处理后再标记已校验");
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
    if (!input.personaId) throw new BiographyInputError("角色不能为空");
    if (!input.chapterId) throw new BiographyInputError("章节不能为空");
    if (!eventText) throw new BiographyInputError("事件内容不能为空");
    const personaId = input.personaId;
    const chapterId = input.chapterId;

    return prismaClient.$transaction(async (tx) => {
      await assertBookExists(tx, bookId);
      await assertPersonaInBook(tx, bookId, personaId);
      const chapter = await findChapterInBook(tx, bookId, chapterId);
      const created = await tx.biographyRecord.create({
        data: {
          personaId,
          chapterId   : chapter.id,
          chapterNo   : chapter.no ?? 0,
          category    : input.category ?? BioCategory.EVENT,
          title       : normalizeNullableText(input.title),
          location    : normalizeNullableText(input.location),
          event       : eventText,
          virtualYear : normalizeNullableText(input.virtualYear),
          tags        : normalizeTags(input.tags),
          ironyNote   : normalizeNullableText(input.ironyNote),
          recordSource: RecordSource.MANUAL,
          status      : ProcessingStatus.VERIFIED
        },
        select: {
          id          : true,
          personaId   : true,
          chapterId   : true,
          chapterNo   : true,
          category    : true,
          title       : true,
          location    : true,
          event       : true,
          virtualYear : true,
          tags        : true,
          ironyNote   : true,
          recordSource: true,
          status      : true,
          createdAt   : true,
          persona     : { select: { name: true } }
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
      const current = await tx.biographyRecord.findFirst({
        where : { id: eventId, deletedAt: null },
        select: { id: true, chapter: { select: { bookId: true } } }
      });
      if (!current) throw new BiographyRecordNotFoundError(eventId);
      if (current.chapter?.bookId !== bookId) throw new BiographyInputError("事迹不属于当前书籍");

      const data: Record<string, unknown> = {};
      if (input.personaId !== undefined) {
        await assertPersonaInBook(tx, bookId, input.personaId);
        data.personaId = input.personaId;
      }
      if (input.chapterId !== undefined) {
        const chapter = await findChapterInBook(tx, bookId, input.chapterId);
        data.chapterId = chapter.id;
        data.chapterNo = chapter.no ?? 0;
      }
      if (input.category !== undefined) data.category = input.category;
      if (input.title !== undefined) data.title = normalizeNullableText(input.title);
      if (input.location !== undefined) data.location = normalizeNullableText(input.location);
      if (input.event !== undefined) data.event = input.event.trim();
      if (input.virtualYear !== undefined) data.virtualYear = normalizeNullableText(input.virtualYear);
      if (input.tags !== undefined) data.tags = normalizeTags(input.tags);
      if (input.ironyNote !== undefined) data.ironyNote = normalizeNullableText(input.ironyNote);
      if (input.status !== undefined) data.status = input.status;

      if (Object.keys(data).length === 0) throw new BiographyInputError("至少需要一个可更新字段");

      const updated = await tx.biographyRecord.update({
        where : { id: eventId },
        data,
        select: {
          id          : true,
          personaId   : true,
          chapterId   : true,
          chapterNo   : true,
          category    : true,
          title       : true,
          location    : true,
          event       : true,
          virtualYear : true,
          tags        : true,
          ironyNote   : true,
          recordSource: true,
          status      : true,
          updatedAt   : true,
          persona     : { select: { name: true } }
        }
      });

      return mapEvent(updated);
    });
  }

  async function deleteEvent(bookId: string, eventId: string) {
    return prismaClient.$transaction(async (tx) => {
      await assertBookExists(tx, bookId);
      const current = await tx.biographyRecord.findFirst({
        where : { id: eventId, deletedAt: null },
        select: { id: true, chapter: { select: { bookId: true } } }
      });
      if (!current) throw new BiographyRecordNotFoundError(eventId);
      if (current.chapter?.bookId !== bookId) throw new BiographyInputError("事迹不属于当前书籍");

      await tx.biographyRecord.update({
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
