import { test } from "node:test";
import assert from "node:assert/strict";
import { availableModels, defaultModel, normalizeModel } from "./models.ts";

test("normalizeModel", () => {
  assert.equal(normalizeModel("openai:gpt-5.4"), "openai:gpt-5.4");
  assert.equal(normalizeModel("openai:gpt-4o"), defaultModel);
  assert.equal(normalizeModel(undefined), defaultModel);
  assert.ok((availableModels as readonly string[]).includes(defaultModel));
});
