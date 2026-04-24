import { readFile } from "node:fs/promises";

import { type z } from "zod";

import {
  getChapterFactExpectationNaturalKey,
  getPersonaExpectationNaturalKey,
  getRelationExpectationNaturalKey,
  getReviewActionScenarioNaturalKey,
  getTimeExpectationNaturalKey,
  reviewRegressionFixtureSchema,
  type ReviewRegressionFixture
} from "./contracts";

function formatZodIssues(error: z.ZodError<unknown>): string {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `${path}: ${issue.message}`;
  }).join("; ");
}

function assertUniqueNaturalKeys<TItem>(
  filePath: string,
  collection: string,
  items: readonly TItem[],
  getNaturalKey: (item: TItem) => string
): void {
  const firstIndexByKey = new Map<string, number>();

  for (const [index, item] of items.entries()) {
    const naturalKey = getNaturalKey(item);
    const firstIndex = firstIndexByKey.get(naturalKey);
    if (firstIndex !== undefined) {
      throw new Error(
        `Duplicate review regression natural key in ${filePath}: ${collection} "${naturalKey}" at indexes ${firstIndex} and ${index}`
      );
    }

    firstIndexByKey.set(naturalKey, index);
  }
}

function assertFixtureNaturalKeysAreUnique(filePath: string, fixture: ReviewRegressionFixture): void {
  assertUniqueNaturalKeys(
    filePath,
    "personas",
    fixture.personas,
    getPersonaExpectationNaturalKey
  );
  assertUniqueNaturalKeys(
    filePath,
    "chapterFacts",
    fixture.chapterFacts,
    getChapterFactExpectationNaturalKey
  );
  assertUniqueNaturalKeys(
    filePath,
    "relations",
    fixture.relations,
    getRelationExpectationNaturalKey
  );
  assertUniqueNaturalKeys(
    filePath,
    "timeFacts",
    fixture.timeFacts,
    getTimeExpectationNaturalKey
  );
  assertUniqueNaturalKeys(
    filePath,
    "reviewActions",
    fixture.reviewActions,
    getReviewActionScenarioNaturalKey
  );
}

function parseFixtureJson(filePath: string, rawJson: string): unknown {
  try {
    const parsedJson: unknown = JSON.parse(rawJson);
    return parsedJson;
  } catch (error) {
    throw new Error(`Invalid JSON in review regression fixture: ${filePath}`, { cause: error });
  }
}

/**
 * Loads one review regression fixture from disk and validates it before use.
 * Fixture JSON is an external contract for later scripts, so schema and natural-key failures include the source file.
 */
export async function loadReviewRegressionFixture(filePath: string): Promise<ReviewRegressionFixture> {
  const rawJson = await readFile(filePath, { encoding: "utf8" });
  const parsedJson = parseFixtureJson(filePath, rawJson);
  const parsedFixture = reviewRegressionFixtureSchema.safeParse(parsedJson);
  if (!parsedFixture.success) {
    throw new Error(
      `Invalid review regression fixture schema in ${filePath}: ${formatZodIssues(parsedFixture.error)}`
    );
  }

  assertFixtureNaturalKeysAreUnique(filePath, parsedFixture.data);

  return parsedFixture.data;
}

export async function loadReviewRegressionFixtures(
  filePaths: readonly string[]
): Promise<ReviewRegressionFixture[]> {
  const fixtures = await Promise.all(filePaths.map((filePath) => loadReviewRegressionFixture(filePath)));
  const firstPathByFixtureKey = new Map<string, string>();

  for (const [index, fixture] of fixtures.entries()) {
    const filePath = filePaths[index];
    if (filePath === undefined) {
      throw new Error(`Missing source path for fixture index ${index}`);
    }

    const firstPath = firstPathByFixtureKey.get(fixture.fixtureKey);
    if (firstPath !== undefined) {
      throw new Error(
        `Duplicate review regression fixtureKey "${fixture.fixtureKey}" in ${firstPath} and ${filePath}`
      );
    }

    firstPathByFixtureKey.set(fixture.fixtureKey, filePath);
  }

  return fixtures;
}
