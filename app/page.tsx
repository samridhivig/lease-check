'use client';

import { useState, useRef } from 'react';
import type { AnalysisResult, ExtractionMeta } from '@/types';

type TranslationResult = {
  detectedLanguage: string;
  detectedLanguageCode: string;
  translatedText: string | null;
  skippedReason: string | null;
};

const SEVERITY_CARD: Record<string, string> = {
  high: 'bg-red-50 border-red-200 text-red-800',
  medium: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  low: 'bg-blue-50 border-blue-200 text-blue-800',
};

const SEVERITY_BADGE: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-700',
};

const STATUS_DOT: Record<string, string> = {
  found: 'bg-green-500',
  derived: 'bg-blue-400',
  missing: 'bg-gray-300',
  ambiguous: 'bg-yellow-500',
};

const LANGUAGE_LABELS: Record<string, string> = {
  nl: 'Dutch',
  fr: 'French',
  en: 'English',
  unknown: 'Unknown',
};

function formatFieldId(id: string): string {
  return id
    .split('.')
    .map((part, i) =>
      i === 0
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : part.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
    )
    .join(': ');
}

async function parseErrorResponse(res: Response): Promise<string> {
  if (res.status === 413) {
    return 'This file is too large. The maximum size is 10 MB.';
  }
  if (res.status === 429) {
    return 'You are sending requests too quickly. Please wait a moment and try again.';
  }
  try {
    const json = await res.json();
    return json.error ?? 'Unexpected error';
  } catch {
    return 'Unexpected error';
  }
}

function ScopeWarning({ extraction }: { extraction: ExtractionMeta }) {
  if (extraction.documentTypeConfidence >= 0.55) return null;

  if (extraction.documentTypeConfidence < 0.35) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        <p className="font-medium">This does not appear to be a residential lease</p>
        <p className="mt-1">
          The document matched very few lease-related keywords. The analysis below may not
          be relevant to your document.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
      <p className="font-medium">Low confidence that this is a residential lease</p>
      <p className="mt-1">
        Some lease-related terms were found, but fewer than expected. Results should be
        reviewed carefully.
      </p>
    </div>
  );
}

function ExtractionSummary({
  extraction,
  showFieldDetails,
  onToggleDetails,
}: {
  extraction: ExtractionMeta;
  showFieldDetails: boolean;
  onToggleDetails: () => void;
}) {
  const coveragePercent = Math.round(
    (extraction.foundFields / extraction.totalFields) * 100,
  );

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Extraction Summary</h2>
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm space-y-3">
        <div className="flex justify-between">
          <span className="text-gray-500">Detected language</span>
          <span className="font-medium text-gray-800">
            {LANGUAGE_LABELS[extraction.detectedLanguage] ?? extraction.detectedLanguage}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Document confidence</span>
          <span className="font-medium text-gray-800">
            {Math.round(extraction.documentTypeConfidence * 100)}%
          </span>
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-gray-500">Fields extracted</span>
            <span className="font-medium text-gray-800">
              {extraction.foundFields} of {extraction.totalFields}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${coveragePercent}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleDetails}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          {showFieldDetails ? 'Hide field details' : 'Show field details'}
        </button>

        {showFieldDetails && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm pt-2 border-t border-gray-100">
            {extraction.fieldCoverage.map((field) => (
              <div key={field.fieldId} className="flex items-center gap-2 py-0.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[field.status] ?? 'bg-gray-300'}`}
                />
                <span
                  className={
                    field.status === 'missing' ? 'text-gray-400' : 'text-gray-700'
                  }
                >
                  {formatFieldId(field.fieldId)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {extraction.warnings.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <p className="font-medium mb-1">Warnings</p>
          <ul className="list-disc list-inside space-y-0.5">
            {extraction.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [showFieldDetails, setShowFieldDetails] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function requestAnalysis(selectedFile: File) {
    const body = new FormData();
    body.append('file', selectedFile);

    const res = await fetch('/api/analyze', { method: 'POST', body });
    if (!res.ok) {
      throw new Error(await parseErrorResponse(res));
    }

    return (await res.json()) as AnalysisResult;
  }

  async function requestTranslation(selectedFile: File) {
    const body = new FormData();
    body.append('file', selectedFile);

    const res = await fetch('/api/translate', { method: 'POST', body });
    if (!res.ok) {
      throw new Error(await parseErrorResponse(res));
    }

    return (await res.json()) as TranslationResult;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const analysisResponse = await requestAnalysis(file);
      setResult(analysisResponse);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleTranslateOnly() {
    if (!file) return;

    setLoading(true);
    setTranslation(null);
    setTranslationError(null);

    try {
      const translated = await requestTranslation(file);
      setTranslation(translated);
    } catch (err) {
      setTranslationError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight mb-2">LeaseCheck</h1>
        <p className="text-gray-500 mb-10 text-sm">
          Upload a Flanders residential lease to get a source-backed pre-check.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
                setError(null);
                setTranslation(null);
                setTranslationError(null);
              }}
            />
            {file ? (
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
            ) : (
              <>
                <p className="text-sm text-gray-500">Click to select a PDF</p>
                <p className="text-xs text-gray-400 mt-1">
                  Rental contracts only &middot; 10 MB max
                </p>
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="submit"
              disabled={!file || loading}
              className="w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              {loading ? 'Processing\u2026' : 'Analyze Contract'}
            </button>

            <button
              type="button"
              disabled={!file || loading}
              onClick={handleTranslateOnly}
              className="w-full border border-gray-300 text-gray-800 rounded-lg py-3 text-sm font-medium disabled:opacity-40 hover:border-gray-400 transition-colors"
            >
              {loading ? 'Processing\u2026' : 'Translate to English'}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {translationError && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {translationError}
          </div>
        )}

        {translation && (
          <section className="mt-10 space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-1">Translation</h2>
              <p className="text-sm text-gray-500">
                Detected language: {translation.detectedLanguage}
                {translation.detectedLanguageCode !== 'und'
                  ? ` (${translation.detectedLanguageCode})`
                  : ''}
              </p>
            </div>

            {translation.skippedReason ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                {translation.skippedReason}
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="mb-3 text-sm text-gray-500">
                  English translation preview. Analysis has not been changed to use this
                  text yet.
                </p>
                <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-gray-700">
                  {translation.translatedText}
                </div>
              </div>
            )}
          </section>
        )}

        {result && (
          <div className="mt-10 space-y-8">
            <section>
              <h2 className="text-lg font-semibold mb-1">Summary</h2>
              <p className="text-gray-600 text-sm">{result.summary}</p>
            </section>

            <ScopeWarning extraction={result.extraction} />

            <ExtractionSummary
              extraction={result.extraction}
              showFieldDetails={showFieldDetails}
              onToggleDetails={() => setShowFieldDetails((o) => !o)}
            />

            {result.extractedFields.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setFieldsOpen((o) => !o)}
                  className="flex items-center gap-2 text-lg font-semibold hover:text-gray-600 transition-colors"
                >
                  <span
                    className={`text-xs transition-transform ${fieldsOpen ? 'rotate-90' : ''}`}
                  >
                    &#9654;
                  </span>
                  Extracted Data
                  <span className="text-xs font-normal text-gray-400">
                    {result.extractedFields.length} fields
                  </span>
                </button>

                {fieldsOpen && (
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm">
                    {result.extractedFields.map((field) => (
                      <div
                        key={field.label}
                        className="flex justify-between gap-2 py-1 border-b border-gray-100 last:border-0"
                      >
                        <span className="text-gray-500 truncate">{field.label}</span>
                        <span className="font-medium text-gray-800 text-right whitespace-nowrap">
                          {field.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {result.flags.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Flags</h2>
                <ul className="space-y-3">
                  {result.flags.map((flag, i) => (
                    <li
                      key={i}
                      className={`border rounded-lg p-4 text-sm ${SEVERITY_CARD[flag.severity]}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{flag.clause}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_BADGE[flag.severity]}`}
                        >
                          {flag.severity}
                        </span>
                        {flag.uncertain && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/70 text-gray-700 border border-gray-200">
                            manual check
                          </span>
                        )}
                      </div>
                      <p>{flag.issue}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {flag.sources.map((source) => (
                          <a
                            key={`${flag.ruleId}-${source.url}`}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs underline underline-offset-2"
                          >
                            {source.label}
                          </a>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.explanations.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Explanations</h2>
                <ul className="space-y-3">
                  {result.explanations.map((exp, i) => (
                    <li
                      key={i}
                      className="border border-gray-200 rounded-lg p-4 text-sm bg-white"
                    >
                      <p className="font-medium text-gray-800 mb-1">{exp.clause}</p>
                      <p className="text-gray-600">{exp.explanation}</p>
                      {exp.uncertain && (
                        <p className="text-xs text-amber-700 mt-2">
                          This check is conservative and should be confirmed manually.
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {exp.sources.map((source) => (
                          <a
                            key={`${exp.ruleId}-${source.url}`}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-gray-500 underline underline-offset-2"
                          >
                            {source.label}
                          </a>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
      <p className="mt-16 text-xs text-gray-400">
        This is an automated analysis for Flemish residential leases signed from 1 January
        2019 onward, not legal advice.
      </p>
    </main>
  );
}
