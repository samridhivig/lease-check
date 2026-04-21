import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const defaultExpectationsPath = path.join(rootDir, 'test-fixtures', 'fixture-expectations.json');

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:3101',
    expectationsPath: defaultExpectationsPath,
    startServer: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--base-url' && next) {
      args.baseUrl = next;
      index += 1;
      continue;
    }

    if (arg === '--expectations' && next) {
      args.expectationsPath = path.resolve(next);
      index += 1;
      continue;
    }

    if (arg === '--reuse-server') {
      args.startServer = false;
    }
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl, maxAttempts = 60) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Keep polling.
    }

    await sleep(1000);
  }

  throw new Error(`Server at ${baseUrl} did not become ready in time.`);
}

function startServer(baseUrl) {
  const { port } = new URL(baseUrl);
  const nextBin = path.join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'start', '-p', port], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let startupOutput = '';
  const capture = (chunk) => {
    startupOutput += chunk.toString();
    if (startupOutput.length > 8000) {
      startupOutput = startupOutput.slice(-8000);
    }
  };

  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  return { child, getStartupOutput: () => startupOutput };
}

async function analyzeFixture(baseUrl, relativePath, attempt = 1) {
  const absolutePath = path.join(rootDir, relativePath);
  const buffer = await readFile(absolutePath);
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: 'application/pdf' }), path.basename(relativePath));

  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    body: formData,
  });

  const body = await response.json();

  if (response.status === 429 && attempt < 7) {
    await sleep(5000 * attempt);
    return analyzeFixture(baseUrl, relativePath, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`Analyze failed for ${relativePath}: ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

function toFieldStatusMap(result) {
  return Object.fromEntries(
    (result.extraction?.fieldCoverage ?? []).map((entry) => [entry.fieldId, entry.status]),
  );
}

function toSummaryMap(result) {
  return Object.fromEntries(
    (result.extractedFields ?? []).map((entry) => [entry.label, entry.value]),
  );
}

function compareExpectation(expectation, result) {
  const failures = [];
  const actualFlagIds = (result.flags ?? []).map((flag) => flag.ruleId).sort();
  const actualStatuses = toFieldStatusMap(result);
  const actualSummaries = toSummaryMap(result);

  const expectedFlagIds = [...(expectation.expectedFlagIds ?? [])].sort();
  if (expectation.expectedFlagIds && JSON.stringify(actualFlagIds) !== JSON.stringify(expectedFlagIds)) {
    failures.push(`expected flags ${JSON.stringify(expectedFlagIds)} but got ${JSON.stringify(actualFlagIds)}`);
  }

  for (const forbiddenFlagId of expectation.forbiddenFlagIds ?? []) {
    if (actualFlagIds.includes(forbiddenFlagId)) {
      failures.push(`unexpected flag ${forbiddenFlagId}`);
    }
  }

  for (const [fieldId, expectedStatus] of Object.entries(expectation.fieldStatuses ?? {})) {
    if (actualStatuses[fieldId] !== expectedStatus) {
      failures.push(`field ${fieldId} expected status ${expectedStatus} but got ${actualStatuses[fieldId] ?? 'absent'}`);
    }
  }

  for (const [label, expectedValue] of Object.entries(expectation.summaryValues ?? {})) {
    if (actualSummaries[label] !== expectedValue) {
      failures.push(`summary ${label} expected ${JSON.stringify(expectedValue)} but got ${JSON.stringify(actualSummaries[label] ?? null)}`);
    }
  }

  for (const absentLabel of expectation.absentSummaryLabels ?? []) {
    if (Object.hasOwn(actualSummaries, absentLabel)) {
      failures.push(`summary ${absentLabel} was present with value ${JSON.stringify(actualSummaries[absentLabel])}`);
    }
  }

  return { actualFlagIds, failures };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readFile(args.expectationsPath, 'utf8');
  const expectations = JSON.parse(raw);

  let server = null;

  try {
    if (args.startServer) {
      server = startServer(args.baseUrl);
    }

    await waitForServer(args.baseUrl);

    const failures = [];

    for (const expectation of expectations.fixtures ?? []) {
      const result = await analyzeFixture(args.baseUrl, expectation.relativePath);
      const comparison = compareExpectation(expectation, result);

      if (comparison.failures.length === 0) {
        console.log(`PASS ${expectation.relativePath}`);
        continue;
      }

      console.log(`FAIL ${expectation.relativePath}`);
      for (const failure of comparison.failures) {
        console.log(`  - ${failure}`);
      }
      failures.push(expectation.relativePath);
    }

    if (failures.length > 0) {
      process.exitCode = 1;
      return;
    }

    console.log(`Checked ${(expectations.fixtures ?? []).length} fixture expectations with no regressions.`);
  } catch (error) {
    if (server) {
      console.error(server.getStartupOutput());
    }

    throw error;
  } finally {
    if (server?.child && !server.child.killed) {
      server.child.kill('SIGTERM');
      await sleep(500);

      if (!server.child.killed) {
        server.child.kill('SIGKILL');
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
