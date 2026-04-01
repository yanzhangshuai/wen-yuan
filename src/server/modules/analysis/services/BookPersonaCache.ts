import { NameType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";

export interface BookPersonaCache {
  personas    : Map<string, { id: string; name: string; aliases: string[]; nameType: string }>;
  aliasIndex  : Map<string, string>;
  profileIndex: Map<string, string>;

  lookupByName(name: string): string | undefined;
  lookupByAlias(alias: string): string | undefined;
  addPersona(persona: { id: string; name: string; aliases: string[]; nameType: string }): void;
  addAlias(alias: string, personaId: string): void;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

export function createBookPersonaCache(): BookPersonaCache {
  const personas = new Map<string, { id: string; name: string; aliases: string[]; nameType: string }>();
  const aliasIndex = new Map<string, string>();
  const profileIndex = new Map<string, string>();
  const nameIndex = new Map<string, string>();

  function addAlias(alias: string, personaId: string): void {
    const key = normalizeKey(alias);
    if (!key) {
      return;
    }
    aliasIndex.set(key, personaId);
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

    return aliasIndex.get(key);
  }

  function lookupByAlias(alias: string): string | undefined {
    const key = normalizeKey(alias);
    if (!key) {
      return undefined;
    }

    return aliasIndex.get(key) ?? profileIndex.get(key);
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
      cache.profileIndex.set(profileNameKey, profile.personaId);
    }

    cache.addAlias(profile.localName, profile.personaId);
  }

  return cache;
}
