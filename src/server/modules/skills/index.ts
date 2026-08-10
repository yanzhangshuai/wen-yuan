/**
 * =============================================================================
 * 文件定位（Skill 域模块出口）
 * -----------------------------------------------------------------------------
 * - 对外暴露 Skill 服务（CRUD）、装载器（resolveSkillsForJob）、AI 动态选择器
 *   （skillSelector / selectSkillsForJob）与 content 契约。
 * - 供管理后台 API、Agent system prompt 组装、runAnalysisJob 编排复用。
 * =============================================================================
 */
export {
  skillService,
  type SkillService,
  type SkillListItem,
  type SkillDetail,
  type CreateSkillInput
} from "./skillService";

export {
  skillLoader,
  type SkillLoader,
  type ResolvedSkillContext
} from "./loader";

export {
  createSkillSelector,
  skillSelector,
  callSkillSelectorLlm,
  parseSkillsSnapshot,
  skillSelectionOutputSchema,
  buildSkillSelectionUserPrompt,
  sampleBookText,
  SKILL_SELECTION_SYSTEM_PROMPT,
  SKILL_SELECTION_TEXT_THRESHOLD,
  SKILL_SELECTION_SAMPLE_CHARS,
  type SkillSelector,
  type SkillSelectorDeps,
  type SkillSelectionInput,
  type SkillSelectionResult,
  type SkillsSnapshot,
  type SkillCatalogItem,
  type BookContext,
  type SkillSelectorCallLlmInput,
  type SkillSelectionOutput
} from "./skillSelector";

export {
  parseSkillMetadata,
  skillFrontmatterSchema,
  relationshipCodeSchema,
  type SkillMetadata,
  type SkillDocument,
  type RelationshipCode
} from "./content-schema";

export {
  skillGenerator,
  type SkillGenerator,
  type SkillGenerationSignals,
  type GenerateSkillResult
} from "./skillGenerator";

export {
  aiSkillGenerator,
  createAiSkillGenerator,
  assembleSkillMarkdown,
  buildSkillGenerationUserPrompt,
  type AiSkillGenerator,
  type AiSkillGenerationInput,
  type AiSkillGenerationResult
} from "./aiSkillGenerator";

export {
  lookupRelationshipTypeNames
} from "./lookupTypeNames";
