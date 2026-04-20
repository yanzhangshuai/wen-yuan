import {
  parseRelationCatalogEntry,
  type RelationCatalogEntry
} from "@/server/modules/knowledge-v2/relation-types/contracts";

function assertUniquePresetFields(entries: readonly RelationCatalogEntry[]): void {
  const seenKeys = new Set<string>();
  const seenAliases = new Set<string>();

  for (const entry of entries) {
    if (seenKeys.has(entry.relationTypeKey)) {
      throw new Error(`Duplicate relation type preset key: ${entry.relationTypeKey}`);
    }

    seenKeys.add(entry.relationTypeKey);

    for (const aliasLabel of entry.aliasLabels) {
      if (seenAliases.has(aliasLabel)) {
        throw new Error(`Duplicate relation type preset alias: ${aliasLabel}`);
      }

      seenAliases.add(aliasLabel);
    }
  }
}

const presetEntries = [
  {
    relationTypeKey   : "teacher_of",
    defaultLabel      : "师徒",
    direction         : "FORWARD",
    relationTypeSource: "PRESET",
    aliasLabels       : ["师生", "门生"],
    scopeType         : "GLOBAL",
    scopeId           : null,
    reviewState       : "VERIFIED",
    systemPreset      : true,
    enabled           : true,
    knowledgeItemId   : null
  },
  {
    relationTypeKey   : "parent_of",
    defaultLabel      : "亲属",
    direction         : "FORWARD",
    relationTypeSource: "PRESET",
    aliasLabels       : ["父子", "母子", "父女", "母女"],
    scopeType         : "GLOBAL",
    scopeId           : null,
    reviewState       : "VERIFIED",
    systemPreset      : true,
    enabled           : true,
    knowledgeItemId   : null
  },
  {
    relationTypeKey   : "spouse_of",
    defaultLabel      : "夫妻",
    direction         : "BIDIRECTIONAL",
    relationTypeSource: "PRESET",
    aliasLabels       : ["配偶", "夫妇"],
    scopeType         : "GLOBAL",
    scopeId           : null,
    reviewState       : "VERIFIED",
    systemPreset      : true,
    enabled           : true,
    knowledgeItemId   : null
  },
  {
    relationTypeKey   : "sworn_brother",
    defaultLabel      : "结义兄弟",
    direction         : "BIDIRECTIONAL",
    relationTypeSource: "PRESET",
    aliasLabels       : ["义兄弟"],
    scopeType         : "GLOBAL",
    scopeId           : null,
    reviewState       : "VERIFIED",
    systemPreset      : true,
    enabled           : true,
    knowledgeItemId   : null
  },
  {
    relationTypeKey   : "ruler_of",
    defaultLabel      : "君臣",
    direction         : "FORWARD",
    relationTypeSource: "PRESET",
    aliasLabels       : ["主从"],
    scopeType         : "GLOBAL",
    scopeId           : null,
    reviewState       : "VERIFIED",
    systemPreset      : true,
    enabled           : true,
    knowledgeItemId   : null
  },
  {
    relationTypeKey   : "subordinate_of",
    defaultLabel      : "属下",
    direction         : "REVERSE",
    relationTypeSource: "PRESET",
    aliasLabels       : ["部属"],
    scopeType         : "GLOBAL",
    scopeId           : null,
    reviewState       : "VERIFIED",
    systemPreset      : true,
    enabled           : true,
    knowledgeItemId   : null
  }
] satisfies RelationCatalogEntry[];

export const RELATION_TYPE_PRESETS = Object.freeze(
  presetEntries.map((entry) => parseRelationCatalogEntry(entry))
);

assertUniquePresetFields(RELATION_TYPE_PRESETS);
