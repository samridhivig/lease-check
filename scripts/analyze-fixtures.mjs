import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:3000',
    endpointPath: '/api/analyze',
    fixturesDir: path.join(rootDir, 'test-fixtures', 'advo-recht'),
    outRoot: path.join(rootDir, 'analysis-runs'),
    label: null,
    fixtures: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--base-url' && next) {
      args.baseUrl = next;
      index += 1;
      continue;
    }

    if (arg === '--endpoint-path' && next) {
      args.endpointPath = next.startsWith('/') ? next : `/${next}`;
      index += 1;
      continue;
    }

    if (arg === '--fixtures-dir' && next) {
      args.fixturesDir = path.resolve(next);
      index += 1;
      continue;
    }

    if (arg === '--out-root' && next) {
      args.outRoot = path.resolve(next);
      index += 1;
      continue;
    }

    if (arg === '--label' && next) {
      args.label = next;
      index += 1;
      continue;
    }

    if (arg === '--fixture' && next) {
      args.fixtures.push(path.resolve(next));
      index += 1;
      continue;
    }
  }

  if (!args.label) {
    const today = new Date().toISOString().slice(0, 10);
    args.label = `${today}-manual-run`;
  }

  return args;
}

function sha256(bufferOrText) {
  return createHash('sha256').update(bufferOrText).digest('hex');
}

function safeExec(command) {
  try {
    return execSync(command, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

async function listPdfFixtures(fixturesDir) {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(fixturesDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listPdfFixtures(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

function buildCsv(rows) {
  const header = [
    'fixture',
    'summary',
    'flagCount',
    'highCount',
    'mediumCount',
    'lowCount',
    'detectedLanguage',
    'documentTypeConfidence',
    'foundFields',
    'totalFields',
    'missingFieldsCount',
    'ruleIds',
  ];

  const escape = (value) => {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map((key) => escape(row[key])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

async function waitForServer(baseUrl, maxAttempts = 30) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Keep polling.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Server at ${baseUrl} did not become ready in time.`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function analyzeFixture(baseUrl, endpointPath, fixturePath) {
  const buffer = await readFile(fixturePath);
  const fileName = path.basename(fixturePath);

  let response;
  let responseText = '';
  let parsedBody = null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: 'application/pdf' }), fileName);

    response = await fetch(`${baseUrl}${endpointPath}`, {
      method: 'POST',
      body: formData,
    });

    responseText = await response.text();

    try {
      parsedBody = JSON.parse(responseText);
    } catch {
      parsedBody = { raw: responseText };
    }

    if (response.status !== 429 || attempt === 4) {
      break;
    }

    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    await sleep((Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 60) * 1000 + 250);
  }

  if (!response?.ok) {
    throw new Error(
      `Analyze failed for ${fileName}: ${response?.status} ${response?.statusText} ${JSON.stringify(parsedBody)}`,
    );
  }

  const fileStats = await stat(fixturePath);

  return {
    fixture: {
      fileName,
      relativePath: path.relative(rootDir, fixturePath),
      sizeBytes: fileStats.size,
      sha256: sha256(buffer),
    },
    analyzedAt: new Date().toISOString(),
    result: parsedBody,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.join(args.outRoot, args.label);
  const resultsDir = path.join(outDir, 'results');

  await waitForServer(args.baseUrl);

  const fixtures =
    args.fixtures.length > 0 ? args.fixtures.sort() : await listPdfFixtures(args.fixturesDir);
  if (fixtures.length === 0) {
    throw new Error(`No PDF fixtures found in ${args.fixturesDir}`);
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(resultsDir, { recursive: true });

  const algorithmFiles = [
    'app/api/analyze/route.ts',
    'lib/explanations.ts',
    'lib/extract.ts',
    'lib/rules.ts',
    'types/index.ts',
  ];

  const algorithmFingerprint = {};
  for (const file of algorithmFiles) {
    const contents = await readFile(path.join(rootDir, file), 'utf8');
    algorithmFingerprint[file] = sha256(contents);
  }

  const documents = [];
  const summaryRows = [];

  for (const fixturePath of fixtures) {
    const documentResult = await analyzeFixture(args.baseUrl, args.endpointPath, fixturePath);
    documents.push(documentResult);

    const outputPath = path.join(
      resultsDir,
      `${path.basename(fixturePath, path.extname(fixturePath))}.json`,
    );
    await writeFile(outputPath, `${JSON.stringify(documentResult, null, 2)}\n`);

    const flags = Array.isArray(documentResult.result.flags) ? documentResult.result.flags : [];
    const highCount = flags.filter((flag) => flag.severity === 'high').length;
    const mediumCount = flags.filter((flag) => flag.severity === 'medium').length;
    const lowCount = flags.filter((flag) => flag.severity === 'low').length;
    const ruleIds = flags.map((flag) => flag.ruleId).sort().join('|');
    const extraction = documentResult.result.extraction ?? {};

    summaryRows.push({
      fixture: documentResult.fixture.fileName,
      summary: documentResult.result.summary ?? '',
      flagCount: flags.length,
      highCount,
      mediumCount,
      lowCount,
      detectedLanguage: extraction.detectedLanguage ?? '',
      documentTypeConfidence: extraction.documentTypeConfidence ?? '',
      foundFields: extraction.foundFields ?? '',
      totalFields: extraction.totalFields ?? '',
      missingFieldsCount: Array.isArray(extraction.missingFields)
        ? extraction.missingFields.length
        : '',
      ruleIds,
    });
  }

  const manifest = {
    label: args.label,
    generatedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    endpointPath: args.endpointPath,
    fixturesDir: path.relative(rootDir, args.fixturesDir),
    fixtures: fixtures.map((fixturePath) => path.relative(rootDir, fixturePath)),
    git: {
      commit: safeExec('git rev-parse HEAD'),
      branch: safeExec('git rev-parse --abbrev-ref HEAD'),
      statusShort: safeExec('git status --short'),
    },
    algorithmFingerprint,
    fixtureCount: fixtures.length,
  };

  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summaryRows, null, 2)}\n`);
  await writeFile(path.join(outDir, 'summary.csv'), buildCsv(summaryRows));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
