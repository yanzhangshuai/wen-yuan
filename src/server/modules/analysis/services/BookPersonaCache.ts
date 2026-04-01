import { NameType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";

export interface BookPersonaCache {
  personas    : Map<string, { id: string; name: string; aliases: string[]; nameType: string }>;
  aliasIndex  : Map<string, Set<string>>;
  profileIndex: Map<string, Set<string>>;

  lookupByName(name: string): string | undefined;
  lookupByAlias(alias: string): string | undefined;
  addPersona(persona: { id: string; name: string; aliases: string[]; nameType: string }): void;
  addAlias(alias: string, personaId: string): void;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function appendToIndex(index: Map<string, Set<string>>, key: string, personaId: string): void {
  const existing = index.get(key);
  if (existing) {
    existing.add(personaId);
    return;
  }
  index.set(key, new Set([personaId]));
}

export function createBookPersonaCache(): BookPersonaCache {
  const personas = new Map<string, { id: string; name: string; aliases: string[]; nameType: string }>();
  const aliasIndex = new Map<string, Set<string>>();
  const profileIndex = new Map<string, Set<string>>();
  const nameIndex = new Map<string, string>();

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
    if (!key) {
      return;
    }
    appendToIndex(aliasIndex, key, personaId);
  }

  function addPersona(persona: { id: string; name: string; aliases: string[]; nameType: string }): void {
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
    if (!key) {
      return undefined;
    }

    const byName = nameIndex.get(key);
    if (byName) {
      return byName;
    }

    return choosePersonaId(aliasIndex.get(key) ?? new Set(), name);
  }

  function lookupByAlias(alias: string): string | undefined {
    const key = normalizeKey(alias);
    if (!key) {
      return undefined;
    }

    const aliasMatches = aliasIndex.get(key);
    if (aliasMatches && aliasMatches.size > 0) {
      return choosePersonaId(aliasMatches, alias);
    }

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
