/**
 * =============================================================================
 * 文件定位（服务端 Pass 2：全书实体消歧服务）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/analysis/pipelines/twopass/GlobalEntityResolver.ts`
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

interface GlobalEntityInfo {
  canonicalName: string;
  chapterNos   : Set<number>;
  description  : string;
  allNames     : Set<string>;
}

interface EntityResolutionMergeDecision {
  shouldMerge  : boolean;
  mergedName   : string;
  mergedAliases: string[];
}

/**
 * 功能：创建全书实体消歧服务。
 * 输入：PrismaClient、统一 AI 调用执行器。
 * 输出：Pass 2 消歧服务对象。
 * 异常：无（具体错误由各方法抛出）。
 * 副作用：可能创建 persona/profile 记录并记录 AI 调用日志。
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

  function collectGlobalDictionary(chapterEntities: ChapterEntityList[]): Map<string, GlobalEntityInfo> {
    const dict = new Map<string, GlobalEntityInfo>();

    for (const chapter of chapterEntities) {
      for (const entity of chapter.entities) {
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
            for (const candidateName of allNames) {
              existing.allNames.add(candidateName);
            }
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

  function buildCandidateGroups(dict: Map<string, GlobalEntityInfo>, aliasLookup: Map<string, string>): EntityCandidateGroup[] {
    const keys = Array.from(dict.keys());
    const parent = new Map<string, string>();

    function find(key: string): string {
      while (parent.get(key) !== key) {
        const parentKey = parent.get(key)!;
        parent.set(key, parent.get(parentKey) ?? parentKey);
        key = parentKey;
      }
      return key;
    }

    function union(left: string, right: string): void {
      const rootLeft = find(left);
      const rootRight = find(right);
      if (rootLeft !== rootRight) {
        parent.set(rootLeft, rootRight);
      }
    }

    for (const key of keys) {
      parent.set(key, key);
    }

    if (aliasLookup.size > 0) {
      for (let i = 0; i < keys.length; i += 1) {
        const infoI = dict.get(keys[i])!;
        for (let j = i + 1; j < keys.length; j += 1) {
          const infoJ = dict.get(keys[j])!;
          if (resolveByKnowledgeBase(infoI.canonicalName, infoJ.canonicalName, aliasLookup)) {
            union(keys[i], keys[j]);
          }
        }
      }
    }

    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        if (editDistance(keys[i], keys[j]) <= EDIT_DISTANCE_THRESHOLD) {
          union(keys[i], keys[j]);
        }
      }
    }

    for (let i = 0; i < keys.length; i += 1) {
      const infoI = dict.get(keys[i])!;
      const surnameI = extractSurname(infoI.canonicalName);
      if (!surnameI) {
        continue;
      }

      for (let j = i + 1; j < keys.length; j += 1) {
        const infoJ = dict.get(keys[j])!;
        const surnameJ = extractSurname(infoJ.canonicalName);
        if (surnameI !== surnameJ) {
          continue;
        }

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
      if (memberKeys.length <= 1) {
        continue;
      }

      groups.push({
        groupId,
        members: memberKeys.map((memberKey) => {
          const info = dict.get(memberKey)!;
          return {
            name       : info.canonicalName,
            description: info.description,
            chapterNos : Array.from(info.chapterNos).sort((a, b) => a - b)
          };
        })
      });
      groupId += 1;
    }

    return groups;
  }

  async function resolveCandidateGroupsWithLLM(
    bookTitle: string,
    groups: EntityCandidateGroup[],
    stageContext: { bookId: string; jobId: string }
  ): Promise<Map<number, EntityResolutionMergeDecision>> {
    const decisions = new Map<number, EntityResolutionMergeDecision>();

    for (let i = 0; i < groups.length; i += RESOLUTION_BATCH_SIZE) {
      const batch = groups.slice(i, i + RESOLUTION_BATCH_SIZE);
      const fallbackPrompt = buildEntityResolutionPrompt(bookTitle, batch);
      const candidateGroups = batch.map((group) => {
        const membersText = group.members.map((member) =>
          `  - "${member.name}"${member.description ? `（${member.description}）` : ""}，出现于第${member.chapterNos.join("、")}回`
        ).join("\n");
        return `### 候选组 ${group.groupId}\n${membersText}`;
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
          const providerClient = createAiProviderClient({
            provider : model.provider,
            apiKey   : model.apiKey,
            baseUrl  : model.baseUrl,
            modelName: model.modelName
          });
          const rawResult = await providerClient.generateJson(prompt, toGenerateOptions(model));
          return {
            data : parseEntityResolutionResponse(rawResult.content),
            usage: rawResult.usage
          };
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
    const dict = collectGlobalDictionary(chapterEntities);
    console.info("[GlobalEntityResolver] dictionary.collected", JSON.stringify({
      bookId,
      uniqueNames: dict.size
    }));

    const aliasLookup = preloadedAliasLookup ?? new Map<string, string>();
    const candidateGroups = buildCandidateGroups(dict, aliasLookup);
    console.info("[GlobalEntityResolver] candidate.groups.formed", JSON.stringify({
      bookId,
      groupCount          : candidateGroups.length,
      knowledgeBaseEntries: aliasLookup.size
    }));

    const decisions = candidateGroups.length > 0
      ? await resolveCandidateGroupsWithLLM(bookTitle, candidateGroups, stageContext)
      : new Map<number, EntityResolutionMergeDecision>();

    const mergedNames = new Set<string>();
    const mergeTargets: Array<{ name: string; aliases: string[]; description: string }> = [];

    for (const group of candidateGroups) {
      const decision = decisions.get(group.groupId);
      if (!decision?.shouldMerge) {
        continue;
      }

      const bestDescription = group.members
        .map((member) => member.description)
        .sort((left, right) => right.length - left.length)[0] ?? "";

      mergeTargets.push({
        name       : decision.mergedName,
        aliases    : decision.mergedAliases,
        description: bestDescription
      });

      for (const member of group.members) {
        mergedNames.add(normalizeKey(member.name));
      }
    }

    const finalEntities: Array<{ name: string; aliases: string[]; description: string }> = [...mergeTargets];
    const processedKeys = new Set<string>();

    for (const [key, info] of dict) {
      if (mergedNames.has(key) || processedKeys.has(key)) {
        continue;
      }

      finalEntities.push({
        name       : info.canonicalName,
        aliases    : Array.from(info.allNames),
        description: info.description
      });

      for (const name of info.allNames) {
        processedKeys.add(normalizeKey(name));
      }
    }

    const globalPersonaMap = new Map<string, string>();
    const profiles: AnalysisProfileContext[] = [];

    for (const entity of finalEntities) {
      const uniqueAliases = Array.from(new Set(entity.aliases.map((alias) => alias.trim()).filter((alias) => alias.length > 0)));

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
              bookId,
              localName   : entity.name,
              localSummary: entity.description || null
            }
          }
        }
      });

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

  return {
    resolveGlobalEntities,
    _collectGlobalDictionary: collectGlobalDictionary,
    _buildCandidateGroups   : buildCandidateGroups,
    _editDistance           : editDistance
  };
}

export type GlobalEntityResolverService = ReturnType<typeof createGlobalEntityResolver>;
