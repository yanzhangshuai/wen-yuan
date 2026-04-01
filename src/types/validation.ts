export type ValidationIssueType =
  | "ALIAS_AS_NEW_PERSONA"
  | "WRONG_MERGE"
  | "MISSING_NAME_MAPPING"
  | "INVALID_RELATIONSHIP"
  | "SAME_NAME_DIFFERENT_PERSON"
  | "DUPLICATE_PERSONA"
  | "LOW_CONFIDENCE_ENTITY"
  | "ORPHAN_MENTION";

export type ValidationSeverity = "ERROR" | "WARNING" | "INFO";

export type ValidationSuggestionAction =
  | "MERGE"
  | "SPLIT"
  | "UPDATE_NAME"
  | "ADD_ALIAS"
  | "DELETE"
  | "ADD_MAPPING"
  | "MANUAL_REVIEW";

export interface ValidationSuggestion {
  action          : ValidationSuggestionAction;
  targetPersonaId?: string;
  sourcePersonaId?: string;
  newName?        : string;
  newAlias?       : string;
  reason          : string;
}

export interface ValidationIssue {
  id                 : string;
  type               : ValidationIssueType;
  severity           : ValidationSeverity;
  confidence         : number;
  description        : string;
  evidence           : string;
  affectedPersonaIds : string[];
  affectedChapterIds?: string[];
  suggestion         : ValidationSuggestion;
}

export interface ValidationSummary {
  totalIssues : number;
  errorCount  : number;
  warningCount: number;
  infoCount   : number;
  autoFixable : number;
  needsReview : number;
}

export interface ValidationReportData {
  id     : string;
  issues : ValidationIssue[];
  summary: ValidationSummary;
}
