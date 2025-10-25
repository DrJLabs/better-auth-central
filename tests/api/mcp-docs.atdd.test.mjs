import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "../..");

const readFile = (relativePath) =>
  fs.readFileSync(path.resolve(projectRoot, relativePath), "utf8").trim();

const extractEnvSection = (content) =>
  Array.from(content.matchAll(/`MCP_[A-Z_]+`[^\n]*|`BETTER_AUTH_TRUSTED_ORIGINS`[^\n]*/g)).map((match) =>
    match[0].replace(/\s+/g, " ").trim(),
  );

describe("[ATDD] Documentation parity for MCP compliance workflow (RED phase)", () => {
  it("should keep README and integration checklist in sync for MCP environment variables", () => {
    const readme = readFile("README.md");
    const checklist = readFile("docs/integration/mcp-auth-checklist.md");

    const readmeEnv = extractEnvSection(readme);
    const checklistEnv = extractEnvSection(checklist);

    assert.deepEqual(
      readmeEnv,
      checklistEnv,
      "Expected README and MCP integration checklist to enumerate identical environment variable guidance (RED phase expectation)",
    );
  });
});
