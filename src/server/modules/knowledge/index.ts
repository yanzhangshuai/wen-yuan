/**
 * 知识库模块入口。
 * 聚合书籍类型、知识包、知识条目、姓氏、泛化称谓、提示词模板、NER规则、审计日志的 CRUD 与查询服务。
 */

export {
  listBookTypes,
  listActiveBookTypes,
  getBookType,
  createBookType,
  updateBookType,
  deleteBookType
} from "./book-types";

export {
  listKnowledgePacks,
  getKnowledgePack,
  createKnowledgePack,
  updateKnowledgePack,
  deleteKnowledgePack
} from "./knowledge-packs";

export {
  previewAliasPackGenerationPrompt,
  reviewGenerateEntries,
  generateEntries
} from "./generateEntries";

export {
  previewSurnameGenerationPrompt,
  reviewGeneratedSurnames
} from "./generateSurnames";

export {
  previewGenericTitleGenerationPrompt,
  reviewGeneratedGenericTitles
} from "./generateGenericTitles";

export {
  previewNerLexiconGenerationPrompt,
  generateNerLexiconRules
} from "./generateNerLexiconRules";

export {
  previewPromptExtractionGenerationPrompt,
  generatePromptExtractionRules
} from "./generatePromptExtractionRules";

export {
  listKnowledgeEntries,
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
  verifyEntry,
  rejectEntry,
  batchVerifyEntries,
  batchRejectEntries,
  importEntries,
  exportEntries
} from "./knowledge-entries";

export {
  listBookKnowledgePacks,
  mountKnowledgePack,
  unmountKnowledgePack,
  updateBookKnowledgePackPriority
} from "./book-knowledge-packs";

export {
  clearKnowledgeCache,
  buildAliasLookupFromDb,
  loadFullRuntimeKnowledge,
  loadAnalysisRuntimeConfig
} from "./load-book-knowledge";
export type { FullRuntimeKnowledge, CompiledNamePatternRule } from "./load-book-knowledge";

export { auditLog } from "./audit";

export {
  listSurnames,
  createSurname,
  updateSurname,
  deleteSurname,
  batchDeleteSurnames,
  batchToggleSurnames,
  batchChangeBookTypeSurnames,
  importSurnames,
  testSurnameExtraction
} from "./surnames";

export {
  listGenericTitles,
  createGenericTitle,
  updateGenericTitle,
  deleteGenericTitle,
  batchDeleteGenericTitles,
  batchToggleGenericTitles,
  batchChangeBookTypeGenericTitles,
  testGenericTitle
} from "./generic-titles";

export {
  listPromptTemplates,
  getPromptTemplate,
  createPromptVersion,
  activatePromptVersion,
  diffPromptVersions,
  previewPrompt,
  resolvePromptTemplateOrFallback
} from "./prompt-templates";

export {
  listNerLexiconRules,
  createNerLexiconRule,
  updateNerLexiconRule,
  deleteNerLexiconRule,
  batchDeleteNerLexiconRules,
  batchToggleNerLexiconRules,
  batchChangeBookTypeNerLexiconRules,
  reorderNerLexiconRules
} from "./ner-lexicon-rules";

export {
  listPromptExtractionRules,
  createPromptExtractionRule,
  updatePromptExtractionRule,
  deletePromptExtractionRule,
  batchDeletePromptExtractionRules,
  batchTogglePromptExtractionRules,
  batchChangeBookTypePromptExtractionRules,
  reorderPromptExtractionRules,
  previewCombinedPromptRules
} from "./prompt-extraction-rules";

export {
  listChangeLogs,
  getChangeLog
} from "./change-logs";
