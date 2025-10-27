#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..",);

const READ_ME_PATH = path.resolve(projectRoot, "README.md");
const RUNBOOK_PATH = path.resolve(projectRoot, "docs", "integration", "mcp-onboarding-runbook.md");

const REQUIRED_VARS = [
  "MCP_COMPLIANCE_BASE_URL_STAGING",
  "MCP_COMPLIANCE_BASE_URL_MAIN",
  "MCP_COMPLIANCE_CLIENT_ID",
  "MCP_COMPLIANCE_SCOPE",
  "MCP_COMPLIANCE_CLIENT_SECRET",
];

const readFile = (filePath) => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error(`Unable to read ${filePath}:`, error.message);
    process.exit(1);
  }
};

const readme = readFile(READ_ME_PATH);
const runbook = readFile(RUNBOOK_PATH);

const missingInRunbook = REQUIRED_VARS.filter((variable) => !runbook.includes(variable));
const missingInReadme = REQUIRED_VARS.filter((variable) => !readme.includes(`\`${variable}\``));

if (missingInRunbook.length === 0 && missingInReadme.length === 0) {
  console.log("✅ README and runbook contain matching MCP compliance secret guidance.");
  process.exit(0);
}

if (missingInRunbook.length > 0) {
  console.error("❌ Runbook is missing variable guidance:");
  missingInRunbook.forEach((variable) => console.error(`  - ${variable}`));
}

if (missingInReadme.length > 0) {
  console.error("❌ README is missing variable guidance:");
  missingInReadme.forEach((variable) => console.error(`  - ${variable}`));
}

process.exit(1);
