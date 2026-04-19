import { prisma } from "@/server/db/prisma";
import {
  createClaimRepository,
  type ClaimRepositoryClient,
  type ClaimWriteScope
} from "@/server/modules/analysis/claims/claim-repository";
import {
  toClaimCreateData,
  validateClaimDraftByFamily,
  type ClaimCreateDataByFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import type {
  StageADiscardRecord,
  StageANormalizedExtraction,
  StageAPersistResult
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";

type StageAFamily = "ENTITY_MENTION" | "TIME" | "EVENT" | "RELATION";
type StageAReviewableFamily = Exclude<StageAFamily, "ENTITY_MENTION">;

interface StageAEntityMentionCreateDelegate {
  create(args: {
    data: ClaimCreateDataByFamily["ENTITY_MENTION"];
  }): Promise<{ id: string } & ClaimCreateDataByFamily["ENTITY_MENTION"]>;
}

interface StageAReviewableCreateDelegate<TFamily extends StageAReviewableFamily> {
  create(args: {
    data: ClaimCreateDataByFamily[TFamily];
  }): Promise<{ id: string } & ClaimCreateDataByFamily[TFamily]>;
}

export interface StageAClaimPersisterRepository {
  transaction<T>(work: (repository: StageAClaimPersisterRepository) => Promise<T>): Promise<T>;
  clearFamilyScope(family: StageAFamily, scope: ClaimWriteScope): Promise<void>;
  createEntityMention(
    data: ClaimCreateDataByFamily["ENTITY_MENTION"]
  ): Promise<{ id: string } & ClaimCreateDataByFamily["ENTITY_MENTION"]>;
  createReviewableClaim<TFamily extends StageAReviewableFamily>(
    family: TFamily,
    data: ClaimCreateDataByFamily[TFamily]
  ): Promise<{ id: string } & ClaimCreateDataByFamily[TFamily]>;
}

interface StageAClaimPersisterClient {
  entityMention: StageAEntityMentionCreateDelegate;
  eventClaim   : StageAReviewableCreateDelegate<"EVENT">;
  relationClaim: StageAReviewableCreateDelegate<"RELATION">;
  timeClaim    : StageAReviewableCreateDelegate<"TIME">;
  $transaction<T>(work: (tx: StageAClaimPersisterClient) => Promise<T>): Promise<T>;
}

function createRepositoryFromClient(
  client: StageAClaimPersisterClient
): StageAClaimPersisterRepository {
  const claimRepository = createClaimRepository(client as unknown as ClaimRepositoryClient);

  return {
    async transaction<T>(
      work: (repository: StageAClaimPersisterRepository) => Promise<T>
    ): Promise<T> {
      return work(createRepositoryFromClient(client));
    },

    async clearFamilyScope(family, scope) {
      await claimRepository.replaceClaimFamilyScope({
        family,
        scope,
        rows: []
      });
    },

    createEntityMention(data) {
      return client.entityMention.create({ data });
    },

    createReviewableClaim<TFamily extends StageAReviewableFamily>(
      family: TFamily,
      data: ClaimCreateDataByFamily[TFamily]
    ): Promise<{ id: string } & ClaimCreateDataByFamily[TFamily]> {
      switch (family) {
        case "TIME":
          return client.timeClaim.create({
            data: data as ClaimCreateDataByFamily["TIME"]
          }) as unknown as Promise<{ id: string } & ClaimCreateDataByFamily[TFamily]>;
        case "EVENT":
          return client.eventClaim.create({
            data: data as ClaimCreateDataByFamily["EVENT"]
          }) as unknown as Promise<{ id: string } & ClaimCreateDataByFamily[TFamily]>;
        case "RELATION":
          return client.relationClaim.create({
            data: data as ClaimCreateDataByFamily["RELATION"]
          }) as unknown as Promise<{ id: string } & ClaimCreateDataByFamily[TFamily]>;
      }
    }
  };
}

export function createStageAClaimPersisterRepository(
  client: StageAClaimPersisterClient = prisma as unknown as StageAClaimPersisterClient
): StageAClaimPersisterRepository {
  return {
    ...createRepositoryFromClient(client),
    async transaction<T>(
      work: (repository: StageAClaimPersisterRepository) => Promise<T>
    ): Promise<T> {
      return client.$transaction(async (tx) => work(createRepositoryFromClient(tx)));
    }
  };
}

function buildDiscard(
  kind: StageADiscardRecord["kind"],
  ref: string,
  code: StageADiscardRecord["code"],
  message: string
): StageADiscardRecord {
  return { kind, ref, code, message };
}

export interface PersistStageAChapterClaimsInput {
  scope     : ClaimWriteScope;
  normalized: StageANormalizedExtraction;
}

export interface StageAClaimPersisterDependencies {
  repository?: StageAClaimPersisterRepository;
}

export function createStageAClaimPersister(
  dependencies: StageAClaimPersisterDependencies = {}
) {
  const repository =
    dependencies.repository ?? createStageAClaimPersisterRepository();

  async function persistChapterClaims(
    input: PersistStageAChapterClaimsInput
  ): Promise<StageAPersistResult> {
    return repository.transaction(async (tx) => {
      await tx.clearFamilyScope("ENTITY_MENTION", input.scope);
      await tx.clearFamilyScope("TIME", input.scope);
      await tx.clearFamilyScope("EVENT", input.scope);
      await tx.clearFamilyScope("RELATION", input.scope);

      const mentionIdsByRef: Record<string, string> = {};
      const timeIdsByRef: Record<string, string> = {};
      const discardRecords = [...input.normalized.discardRecords];

      let mentionCount = 0;
      let timeCount = 0;
      let eventCount = 0;
      let relationCount = 0;

      for (const mention of input.normalized.mentionClaims) {
        const validatedMention = validateClaimDraftByFamily<"ENTITY_MENTION">(
          "ENTITY_MENTION",
          mention.draft
        );
        const mentionCreateData: ClaimCreateDataByFamily["ENTITY_MENTION"] =
          toClaimCreateData<"ENTITY_MENTION">(validatedMention);
        const created = await tx.createEntityMention(mentionCreateData);

        mentionIdsByRef[mention.ref] = created.id;
        mentionCount += 1;
      }

      for (const time of input.normalized.timeClaims) {
        const validatedTime = validateClaimDraftByFamily<"TIME">("TIME", time.draft);
        const timeCreateData: ClaimCreateDataByFamily["TIME"] =
          toClaimCreateData<"TIME">(validatedTime);
        const created = await tx.createReviewableClaim("TIME", timeCreateData);

        timeIdsByRef[time.ref] = created.id;
        timeCount += 1;
      }

      for (const event of input.normalized.pendingEventClaims) {
        if (event.subjectMentionRef && !mentionIdsByRef[event.subjectMentionRef]) {
          discardRecords.push(
            buildDiscard(
              "EVENT",
              event.ref,
              "UNRESOLVED_MENTION_REF",
              `subjectMentionRef could not be resolved: ${event.subjectMentionRef}`
            )
          );
          continue;
        }

        if (event.timeRef && !timeIdsByRef[event.timeRef]) {
          discardRecords.push(
            buildDiscard(
              "EVENT",
              event.ref,
              "UNRESOLVED_TIME_REF",
              `timeRef could not be resolved: ${event.timeRef}`
            )
          );
          continue;
        }

        const validatedEvent = validateClaimDraftByFamily<"EVENT">("EVENT", {
          ...event.draft,
          subjectMentionId: event.subjectMentionRef
            ? mentionIdsByRef[event.subjectMentionRef]
            : null,
          timeHintId: event.timeRef ? timeIdsByRef[event.timeRef] : null
        });
        const eventCreateData: ClaimCreateDataByFamily["EVENT"] =
          toClaimCreateData<"EVENT">(validatedEvent);

        await tx.createReviewableClaim("EVENT", eventCreateData);

        eventCount += 1;
      }

      for (const relation of input.normalized.pendingRelationClaims) {
        if (relation.sourceMentionRef && !mentionIdsByRef[relation.sourceMentionRef]) {
          discardRecords.push(
            buildDiscard(
              "RELATION",
              relation.ref,
              "UNRESOLVED_MENTION_REF",
              `sourceMentionRef could not be resolved: ${relation.sourceMentionRef}`
            )
          );
          continue;
        }

        if (relation.targetMentionRef && !mentionIdsByRef[relation.targetMentionRef]) {
          discardRecords.push(
            buildDiscard(
              "RELATION",
              relation.ref,
              "UNRESOLVED_MENTION_REF",
              `targetMentionRef could not be resolved: ${relation.targetMentionRef}`
            )
          );
          continue;
        }

        if (relation.timeRef && !timeIdsByRef[relation.timeRef]) {
          discardRecords.push(
            buildDiscard(
              "RELATION",
              relation.ref,
              "UNRESOLVED_TIME_REF",
              `timeRef could not be resolved: ${relation.timeRef}`
            )
          );
          continue;
        }

        const validatedRelation = validateClaimDraftByFamily<"RELATION">("RELATION", {
          ...relation.draft,
          sourceMentionId: relation.sourceMentionRef
            ? mentionIdsByRef[relation.sourceMentionRef]
            : null,
          targetMentionId: relation.targetMentionRef
            ? mentionIdsByRef[relation.targetMentionRef]
            : null,
          timeHintId: relation.timeRef ? timeIdsByRef[relation.timeRef] : null
        });
        const relationCreateData: ClaimCreateDataByFamily["RELATION"] =
          toClaimCreateData<"RELATION">(validatedRelation);

        await tx.createReviewableClaim("RELATION", relationCreateData);

        relationCount += 1;
      }

      return {
        mentionIdsByRef,
        timeIdsByRef,
        persistedCounts: {
          mentions : mentionCount,
          times    : timeCount,
          events   : eventCount,
          relations: relationCount
        },
        discardRecords
      };
    });
  }

  return {
    persistChapterClaims
  };
}

export type StageAClaimPersister = ReturnType<typeof createStageAClaimPersister>;
