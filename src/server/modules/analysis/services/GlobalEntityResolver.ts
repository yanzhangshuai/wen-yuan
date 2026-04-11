/**
 * =============================================================================
 * 文件定位（服务端 Pass 2：全书实体消歧服务）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/analysis/services/GlobalEntityResolver.ts`
 *
 * 核心职责：
 * - 收集 Pass 1 各章独立提取的实体列表，执行全书级去重与消歧；
 * - 先用规则预分组（精确匹配 + 姓氏前缀 + 编辑距离），再用 LLM 判断模糊候选；
 * - 输出全局 persona 映射表：surfaceForm → personaId，供 Pass 3 使用。
 *
 * 在两遍式架构中的位置：
 * - 上游：Pass 1 各章 ChapterEntityList
 * - 下游：Pass 3 使用映射表做章节细节提取
 * =============================================================================
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { AiCallExecutor } from "@/server/modules/analysis/services/AiCallExecutor";
import type { ResolvedStageModel, ResolvedFallbackModel } from "@/server/modules/analysis/services/ModelStrategyResolver";
import { createAiProviderClient } from "@/server/providers/ai";
import { buildEntityResolutionPrompt } from "@/server/modules/analysis/services/prompts";
import { resolvePromptTemplateOrFallback } from "@/server/modules/knowledge";
import type {
  ChapterEntityList,
  EntityCandidateGroup,
  AnalysisProfileContext
} from "@/types/analysis";
import { parseEntityResolutionResponse } from "@/types/analysis";
import { PipelineStage } from "@/types/pipeline";
import { extractSurname } from "@/server/modules/analysis/config/lexicon";
import { resolveByKnowledgeBase } from "@/server/modules/analysis/config/classical-names";

/** 每批发给 LLM 的最大候选组数，避免单次请求过大导致截断或选错。 */
const RESOLUTION_BATCH_SIZE = 15;

/** 编辑距离阈值：两个名字编辑距离 ≤ 此值时视为候选。 */
const EDIT_DISTANCE_THRESHOLD = 1;

/**
 * 统一名字的内部标识：全称谓 → 规范化键。
 * 仅用于内部分组去重，不影响最终输出。
 */
function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Levenshtein 编辑距离（仅用于短文本，中文姓名一般 2-4 字）。
 */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // 长度差超过阈值时直接跳过计算，节省不必要的开销
  if (Math.abs(m - n) > EDIT_DISTANCE_THRESHOLD) return EDIT_DISTANCE_THRESHOLD + 1;

  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * 从所有章节实体中收集全局人物词典。
 * key = normalizedName，value = 出现章节号集合 + 描述 + 原始名字列表。
 */
interface GlobalEntityInfo {
  /** 该名字的规范形式（取首次出现的原始大小写）。 */
  canonicalName: string;
  /** 出现的章节号集合。 */
  chapterNos   : Set<number>;
  /** 描述（取最长的一条）。 */
  description  : string;
  /** 所有出现过的别名（包括自身）。 */
  allNames     : Set<string>;
}

interface EntityResolutionMergeDecision {
  shouldMerge  : boolean;
  mergedName   : string;
  mergedAliases: string[];
}

/**
 * 创建全书实体消歧服务。
 */
export function createGlobalEntityResolver(
  prismaClient: PrismaClient,
  aiCallExecutor: AiCallExecutor
) {
  function toGenerateOptions(model: ResolvedStageModel | ResolvedFallbackModel) {
    return {
      temperature    : model.params.temperature,
      maxOutputTokens: model.params.maxOutputTokens,
      topP           : model.params.topP,
      ...(typeof model.params.enableThinking === "boolean"
        ? { enableThinking: model.params.enableThinking }
        : {}),
      ...(model.params.reasoningEffort
        ? { reasoningEffort: model.params.reasoningEffort }
        : {})
    };
  }

  /**
   * Step 1: 收集所有章节实体为全局词典。
   */
  function collectGlobalDictionary(chapterEntities: ChapterEntityList[]): Map<string, GlobalEntityInfo> {
    const dict = new Map<string, GlobalEntityInfo>();

    for (const chapter of chapterEntities) {
      for (const entity of chapter.entities) {
        // 为该实体的所有名字（主名 + 别名）建立条目
        const allNames = [entity.name, ...entity.aliases];
        for (const name of allNames) {
          const key = normalizeKey(name);
          if (!key) continue;

          const existing = dict.get(key);
          if (existing) {
            existing.chapterNos.add(chapter.chapterNo);
            if (entity.description.length > existing.description.length) {
              existing.description = entity.description;
            }
            for (const n of allNames) existing.allNames.add(n);
          } else {
            dict.set(key, {
              canonicalName: name,
              chapterNos   : new Set([chapter.chapterNo]),
              description  : entity.description,
              allNames     : new Set(allNames)
            });
          }
        }
      }
    }

    return dict;
  }

  /**
   * Step 2: 规则预分组——用 Union-Find 将明显相同的名字归为一组。
   * - 精确匹配（已在 collectGlobalDictionary 中完成）
   * - 编辑距离 ≤ 1
   * - 同姓 + 别名交叉
   */
  function buildCandidateGroups(dict: Map<string, GlobalEntityInfo>, aliasLookup: Map<string, string>): EntityCandidateGroup[] {
    const keys = Array.from(dict.keys());
    const parent = new Map<string, string>();

    function find(x: string): string {
      while (parent.get(x) !== x) {
        const p = parent.get(x)!;
        parent.set(x, parent.get(p) ?? p);
        x = p;
      }
      return x;
    }

    function union(a: string, b: string): void {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    }

    // 初始化
    for (const key of keys) parent.set(key, key);

    // 规则 0: 字号知识库预合并 — 已知的字号/绰号/别名直接归组
    if (aliasLookup.size > 0) {
      for (let i = 0; i < keys.length; i++) {
        const infoI = dict.get(keys[i])!;
        for (let j = i + 1; j < keys.length; j++) {
          const infoJ = dict.get(keys[j])!;
          if (resolveByKnowledgeBase(infoI.canonicalName, infoJ.canonicalName, aliasLookup)) {
            union(keys[i], keys[j]);
          }
        }
      }
    }

    // 规则 1: 编辑距离 ≤ 1 的名字归为同组
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        if (editDistance(keys[i], keys[j]) <= EDIT_DISTANCE_THRESHOLD) {
          union(keys[i], keys[j]);
        }
      }
    }

    // 规则 2: 同姓 + 别名交叉归组
    for (let i = 0; i < keys.length; i++) {
      const infoI = dict.get(keys[i])!;
      const surnameI = extractSurname(infoI.canonicalName);
      if (!surnameI) continue;

      for (let j = i + 1; j < keys.length; j++) {
        const infoJ = dict.get(keys[j])!;
        const surnameJ = extractSurname(infoJ.canonicalName);
        if (surnameI !== surnameJ) continue;

        // 检查别名交叉
        let hasOverlap = false;
        for (const nameI of infoI.allNames) {
          if (infoJ.allNames.has(nameI)) {
            hasOverlap = true;
            break;
          }
        }
        if (hasOverlap) {
          union(keys[i], keys[j]);
        }
      }
    }

    // 将分组结果收集为 EntityCandidateGroup[]
    const groupMap = new Map<string, string[]>();
    for (const key of keys) {
      const root = find(key);
      const group = groupMap.get(root) ?? [];
      group.push(key);
      groupMap.set(root, group);
    }

    let groupId = 1;
    const groups: EntityCandidateGroup[] = [];
    for (const [, memberKeys] of groupMap) {
      // 只有 2+ 个不同名字的组才需要消歧判断
      if (memberKeys.length <= 1) continue;

      const members = memberKeys.map(key => {
        const info = dict.get(key)!;
        return {
          name       : info.canonicalName,
          description: info.description,
          chapterNos : Array.from(info.chapterNos).sort((a, b) => a - b)
        };
      });

      groups.push({ groupId: groupId++, members });
    }

    return groups;
  }

  /**
   * Step 3: 对需要 LLM 判断的候选组进行批量消歧。
   */
  async function resolveCandidateGroupsWithLLM(
    bookTitle: string,
    groups: EntityCandidateGroup[],
    stageContext: { bookId: string; jobId: string }
  ): Promise<Map<number, EntityResolutionMergeDecision>> {
    const decisions = new Map<number, EntityResolutionMergeDecision>();

    // 分批处理，避免单次请求过大
    for (let i = 0; i < groups.length; i += RESOLUTION_BATCH_SIZE) {
      const batch = groups.slice(i, i + RESOLUTION_BATCH_SIZE);
      const fallbackPrompt = buildEntityResolutionPrompt(bookTitle, batch);
      const candidateGroups = batch.map(g => {
        const membersText = g.members.map(m =>
          `  - "${m.name}"${m.description ? `（${m.description}）` : ""}，出现于第${m.chapterNos.join("、")}回`
        ).join("\n");
        return `### 候选组 ${g.groupId}\n${membersText}`;
      }).join("\n\n");
      const prompt = await resolvePromptTemplateOrFallback({
        slug        : "ENTITY_RESOLUTION",
        replacements: {
          bookTitle,
          candidateGroups,
          groups: candidateGroups
        },
        fallback: fallbackPrompt
      });

      const result = await aiCallExecutor.execute({
        stage  : PipelineStage.ENTITY_RESOLUTION,
        prompt,
        jobId  : stageContext.jobId,
        context: stageContext,
        callFn : async ({ model }) => {
          const options = toGenerateOptions(model);
          // 通过 providerClient.generateJson 获取原始文本，再解析为结构化结果
          const providerClient = createAiProviderClient({
            provider : model.provider,
            apiKey   : model.apiKey,
            baseUrl  : model.baseUrl,
            modelName: model.modelName
          });
          const rawResult = await providerClient.generateJson(prompt, options);
          const data = parseEntityResolutionResponse(rawResult.content);
          return { data, usage: rawResult.usage };
        }
      });

      for (const decision of result.data) {
        decisions.set(decision.groupId, {
          shouldMerge  : decision.shouldMerge,
          mergedName   : decision.mergedName,
          mergedAliases: decision.mergedAliases
        });
      }
    }

    return decisions;
  }

  /**
   * 主流程：从 Pass 1 结果生成全局 persona 映射表。
   *
   * 返回值：
   * - globalPersonaMap: surfaceForm → personaId（所有已知称谓到 persona 的映射）
   * - profiles: 新建的 AnalysisProfileContext[]（供 Pass 3 使用）
   */
  async function resolveGlobalEntities(
    bookId: string,
    bookTitle: string,
    chapterEntities: ChapterEntityList[],
    stageContext: { bookId: string; jobId: string },
    preloadedAliasLookup?: Map<string, string>
  ): Promise<{
    globalPersonaMap: Map<string, string>;
    profiles        : AnalysisProfileContext[];
  }> {
    // Step 1: 收集全局词典
    const dict = collectGlobalDictionary(chapterEntities);
    console.info("[GlobalEntityResolver] dictionary.collected", JSON.stringify({
      bookId,
      uniqueNames: dict.size
    }));

    // Step 2: 规则预分组（含字号知识库预合并）
    // 使用预加载的 aliasLookup（从 DB 加载），替代硬编码的 buildAliasLookup(genre)
    const aliasLookup = preloadedAliasLookup ?? new Map<string, string>();
    const candidateGroups = buildCandidateGroups(dict, aliasLookup);
    console.info("[GlobalEntityResolver] candidate.groups.formed", JSON.stringify({
      bookId,
      groupCount          : candidateGroups.length,
      knowledgeBaseEntries: aliasLookup.size
    }));

    // Step 3: LLM 消歧（仅对有歧义的多成员组）
    const decisions: Map<number, EntityResolutionMergeDecision> = candidateGroups.length > 0
      ? await resolveCandidateGroupsWithLLM(bookTitle, candidateGroups, stageContext)
      : new Map<number, EntityResolutionMergeDecision>();

    // Step 4: 构建合并后的全局实体列表
    // 先处理 LLM 决策的合并组
    const mergedNames = new Set<string>(); // 已被合并到其他实体的名字（不再独立创建）
    const mergeTargets: Array<{ name: string; aliases: string[]; description: string }> = [];

    for (const group of candidateGroups) {
      const decision = decisions.get(group.groupId);
      if (decision?.shouldMerge) {
        // 合并为一个实体
        const bestDescription = group.members
          .map(m => m.description)
          .sort((a, b) => b.length - a.length)[0] ?? "";

        mergeTargets.push({
          name       : decision.mergedName,
          aliases    : decision.mergedAliases,
          description: bestDescription
        });

        // 标记组内所有名字为"已合并"
        for (const member of group.members) {
          mergedNames.add(normalizeKey(member.name));
        }
      }
    }

    // Step 5: 收集所有最终实体（合并后 + 未参与合并的独立实体）
    const finalEntities: Array<{ name: string; aliases: string[]; description: string }> = [
      ...mergeTargets
    ];

    // 从 dict 中找出未被合并的独立实体
    const processedKeys = new Set<string>();
    for (const [key, info] of dict) {
      if (mergedNames.has(key)) continue;
      if (processedKeys.has(key)) continue;

      // 对于未参与合并组的实体，直接保留
      finalEntities.push({
        name       : info.canonicalName,
        aliases    : Array.from(info.allNames),
        description: info.description
      });

      // 标记该实体所有形式为已处理，避免重复创建
      for (const name of info.allNames) {
        processedKeys.add(normalizeKey(name));
      }
    }

    // Step 6: 批量创建 Persona + Profile，构建映射表
    const globalPersonaMap = new Map<string, string>();
    const profiles: AnalysisProfileContext[] = [];

    for (const entity of finalEntities) {
      // 去重别名
      const uniqueAliases = Array.from(new Set(entity.aliases.map(a => a.trim()).filter(a => a.length > 0)));

      // 创建 Persona
      const persona = await prismaClient.persona.create({
        data: {
          name        : entity.name,
          type        : "PERSON",
          nameType    : "NAMED",
          aliases     : uniqueAliases,
          confidence  : 0.8,
          recordSource: "AI",
          profiles    : {
            create: {
              bookId      : bookId,
              localName   : entity.name,
              localSummary: entity.description || null
            }
          }
        }
      });

      // 建立所有称谓 → personaId 的映射
      for (const alias of uniqueAliases) {
        globalPersonaMap.set(alias, persona.id);
      }
      globalPersonaMap.set(entity.name, persona.id);

      profiles.push({
        personaId    : persona.id,
        canonicalName: entity.name,
        aliases      : uniqueAliases,
        localSummary : entity.description || null
      });
    }

    console.info("[GlobalEntityResolver] entities.created", JSON.stringify({
      bookId,
      personaCount: finalEntities.length,
      mappingCount: globalPersonaMap.size,
      mergedGroups: mergeTargets.length
    }));

    return { globalPersonaMap, profiles };
  }

  // 暴露内部函数用于测试
  return {
    resolveGlobalEntities,
    /** @internal 仅用于单元测试 */
    _collectGlobalDictionary: collectGlobalDictionary,
    /** @internal 仅用于单元测试 */
    _buildCandidateGroups   : buildCandidateGroups,
    /** @internal 仅用于单元测试 */
    _editDistance           : editDistance
  };
}

export type GlobalEntityResolverService = ReturnType<typeof createGlobalEntityResolver>;
