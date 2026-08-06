/**
 * =============================================================================
 * 文件定位（Skill 域模块出口）
 * -----------------------------------------------------------------------------
 * - 对外暴露 Skill 服务（CRUD/版本）、装载器（resolveSkillsForBook）与 content 契约。
 * - 供管理后台 API、Agent system prompt 组装、SkillGenerator 复用。
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
  parseSkillMetadata,
  serializeSkillFrontmatter,
  skillFrontmatterSchema,
  skillTriggersSchema,
  type SkillMetadata,
  type SkillDocument,
  type SkillTriggers
} from "./content-schema";

export {
  skillGenerator,
  type SkillGenerator,
  type SkillGenerationSignals,
  type GenerateSkillResult
} from "./skillGenerator";
