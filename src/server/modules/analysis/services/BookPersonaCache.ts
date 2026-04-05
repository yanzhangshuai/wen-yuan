import { NameType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * 文件定位（分析域服务层）：
 * - 本文件为章节解析流程提供“书籍维度人物缓存”。
 * - 它不直接参与 Next.js 路由响应，而是被 PersonaResolver / ChapterAnalysisService 在服务端调用。
 *
 * 核心职责：
 * - 将书内已有人物、别名、本地称谓（profile.localName）构建为内存索引。
 * - 以 O(1) 方式支持“按姓名/别名 -> personaId”的快速查询，降低重复数据库查询成本。
 *
 * 业务价值：
 * - 在长文本分章解析时，人物消歧是高频操作；该缓存可显著减少 DB I/O，提升整书分析吞吐。
 * - 别名冲突时采用保守策略返回 `undefined`，由上游继续兜底，避免误绑定导致脏数据扩散。
 */
export interface BookPersonaCache {
  /** 人物主表缓存：personaId -> 人物核心信息。 */
  personas    : Map<string, { id: string; name: string; aliases: string[]; nameType: string }>;
  /** 别名倒排索引：规范化别名 -> 候选 personaId 集合。 */
  aliasIndex  : Map<string, Set<string>>;
  /** 本地档案名倒排索引：规范化 localName -> 候选 personaId 集合。 */
  profileIndex: Map<string, Set<string>>;

  /** 按“姓名优先、别名兜底”查询 personaId。 */
  lookupByName(name: string): string | undefined;
  /** 按别名或本地名查询 personaId。 */
  lookupByAlias(alias: string): string | undefined;
  /** 新增/覆盖人物缓存，并把其别名写入索引。 */
  addPersona(persona: { id: string; name: string; aliases: string[]; nameType: string }): void;
  /** 仅补充某个别名到索引（不触碰 persona 主信息）。 */
  addAlias(alias: string, personaId: string): void;
}

/** 名称归一化：忽略前后空白并统一小写，减少“同词不同写法”造成的索引分裂。 */
function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 通用倒排索引写入：
 * - 已存在 key 时追加到 Set；
 * - 不存在时创建新 Set。
 * 使用 Set 的目的是天然去重，避免重复别名导致候选膨胀。
 */
function appendToIndex(index: Map<string, Set<string>>, key: string, personaId: string): void {
  const existing = index.get(key);
  if (existing) {
    existing.add(personaId);
    return;
  }
  index.set(key, new Set([personaId]));
}

export function createBookPersonaCache(): BookPersonaCache {
  /** 人物主缓存，作为冲突判定（如 nameType）的事实来源。 */
  const personas = new Map<string, { id: string; name: string; aliases: string[]; nameType: string }>();
  /** 别名倒排索引。 */
  const aliasIndex = new Map<string, Set<string>>();
  /** profile.localName 倒排索引。 */
  const profileIndex = new Map<string, Set<string>>();
  /** 人名精确索引：规范化姓名 -> personaId（单值优先命中）。 */
  const nameIndex = new Map<string, string>();

  /**
   * 多候选冲突时的决策器。
   * 决策顺序（业务规则）：
   * 1. 单候选直接返回；
   * 2. 若提供 preferName，优先 canonicalName 精确命中；
   * 3. 若仍冲突，优先非 TITLE_ONLY（减少把“泛化称号”误认成唯一人物）；
   * 4. 仍无法唯一确定则返回 undefined，交由上游做保守处理。
   */
  function choosePersonaId(candidates: Set<string>, preferName?: string): string | undefined {
    if (candidates.size === 0) {
      return undefined;
    }
    if (candidates.size === 1) {
      return Array.from(candidates)[0];
    }

    // 别名冲突处理：优先 canonicalName 精确命中，其次优先非 TITLE_ONLY；仍冲突则返回 undefined 交给上游保守处理。
    if (preferName) {
      const normalizedPrefer = normalizeKey(preferName);
      for (const personaId of candidates) {
        const persona = personas.get(personaId);
        if (persona && normalizeKey(persona.name) === normalizedPrefer) {
          return personaId;
        }
      }
    }

    const nonTitleOnly = Array.from(candidates).filter((personaId) => {
      const persona = personas.get(personaId);
      return persona?.nameType !== NameType.TITLE_ONLY;
    });
    if (nonTitleOnly.length === 1) {
      return nonTitleOnly[0];
    }

    return undefined;
  }

  function addAlias(alias: string, personaId: string): void {
    const key = normalizeKey(alias);
    // 空别名不进入索引，防止污染查询路径。
    if (!key) {
      return;
    }
    appendToIndex(aliasIndex, key, personaId);
  }

  function addPersona(persona: { id: string; name: string; aliases: string[]; nameType: string }): void {
    // 别名先去重后入库，避免后续查询/冲突判断被重复数据干扰。
    personas.set(persona.id, {
      ...persona,
      aliases: Array.from(new Set(persona.aliases))
    });

    const nameKey = normalizeKey(persona.name);
    if (nameKey) {
      nameIndex.set(nameKey, persona.id);
    }

    for (const alias of persona.aliases) {
      addAlias(alias, persona.id);
    }
  }

  function lookupByName(name: string): string | undefined {
    const key = normalizeKey(name);
    // 防御空输入，避免把空串误当合法 key。
    if (!key) {
      return undefined;
    }

    // 先走人名精确索引，命中即返回，保障“全名匹配”优先级。
    const byName = nameIndex.get(key);
    if (byName) {
      return byName;
    }

    // 未命中再退化到别名索引，由冲突策略兜底。
    return choosePersonaId(aliasIndex.get(key) ?? new Set(), name);
  }

  function lookupByAlias(alias: string): string | undefined {
    const key = normalizeKey(alias);
    if (!key) {
      return undefined;
    }

    const aliasMatches = aliasIndex.get(key);
    if (aliasMatches && aliasMatches.size > 0) {
      // 别名索引优先于 profile 索引，因为其语义更明确（通常来自 persona.aliases 或人工维护）。
      return choosePersonaId(aliasMatches, alias);
    }

    // 别名索引无结果时，退化到 profile.localName 索引，兼容历史数据中的本地称谓。
    return choosePersonaId(profileIndex.get(key) ?? new Set(), alias);
  }

  return {
    personas,
    aliasIndex,
    profileIndex,
    lookupByName,
    lookupByAlias,
    addPersona,
    addAlias
  };
}

export async function loadBookPersonaCache(prismaClient: PrismaClient, bookId: string): Promise<BookPersonaCache> {
  // 每次按书维度构建独立缓存，避免跨书人物命名冲突。
  const cache = createBookPersonaCache();

  const profiles = await prismaClient.profile.findMany({
    where: {
      bookId,
      deletedAt: null,
      persona  : { deletedAt: null }
    },
    select: {
      personaId: true,
      localName: true,
      persona  : {
        select: {
          id      : true,
          name    : true,
          aliases : true,
          nameType: true
        }
      }
    }
  });

  // 将 profile + persona 聚合到缓存：
  // - persona 进入主缓存；
  // - localName 既进入 profileIndex，也同步写入 aliasIndex，确保 lookupByAlias 可命中。
  for (const profile of profiles) {
    const persona = profile.persona;
    if (!cache.personas.has(persona.id)) {
      cache.addPersona({
        id      : persona.id,
        name    : persona.name,
        aliases : persona.aliases,
        nameType: persona.nameType ?? NameType.NAMED
      });
    }

    const profileNameKey = normalizeKey(profile.localName);
    if (profileNameKey) {
      appendToIndex(cache.profileIndex, profileNameKey, profile.personaId);
    }

    cache.addAlias(profile.localName, profile.personaId);
  }

  return cache;
}
