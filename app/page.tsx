'use client';

import { useState, useRef } from 'react';
import type { AnalysisResult, ExtractionMeta } from '@/types';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type TranslationBlock = {
  type: 'heading' | 'clause' | 'list-item' | 'paragraph';
  text: string;
};

type TranslationResult = {
  detectedLanguage: string;
  detectedLanguageCode: string;
  translatedText: string | null;
  blocks: TranslationBlock[];
  skippedReason: string | null;
};

const SEVERITY_HEADER: Record<string, string> = {
  high: 'bg-red-50 hover:bg-red-100/70',
  medium: 'bg-yellow-50 hover:bg-yellow-100/70',
  low: 'bg-blue-50 hover:bg-blue-100/70',
};

const SEVERITY_BADGE: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-700',
};

const TRANSLATION_BLOCK_STYLES: Record<TranslationBlock['type'], string> = {
  heading:
    'text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 pt-2 first:pt-0',
  clause:
    'text-sm leading-7 text-gray-800 font-medium rounded-lg border border-gray-200 bg-gray-50 px-4 py-3',
  'list-item': 'text-sm leading-7 text-gray-700 pl-5 -indent-5',
  paragraph: 'text-sm leading-7 text-gray-700',
};

async function parseErrorResponse(res: Response): Promise<string> {
  if (res.status === 413) {
    return 'This file is too large. The maximum size is 4.5 MB.';
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

export default function Home() {
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [openFlagKey, setOpenFlagKey] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isBusy = isAnalyzing || isTranslating;

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

    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setOpenFlagKey(null);

    window.gtag?.('event', 'analyze_contract');

    try {
      const analysisResponse = await requestAnalysis(file);
      setResult(analysisResponse);
      if (analysisResponse.flags.length > 0) {
        const firstFlag = analysisResponse.flags[0];
        setOpenFlagKey(`${firstFlag.ruleId}-${firstFlag.clause}-0`);
      } else {
        setOpenFlagKey(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong',
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleTranslateOnly() {
    if (!file) return;

    window.gtag?.('event', 'translate_contract');

    setIsTranslating(true);
    setTranslation(null);
    setTranslationError(null);

    try {
      const translated = await requestTranslation(file);
      setTranslation(translated);
    } catch (err) {
      setTranslationError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setIsTranslating(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-2xl">
        <div className="mb-2 flex items-start justify-between">
          <h1 className="text-3xl font-bold tracking-tight">LeaseCheck</h1>
          <div className="flex items-center gap-3 mt-1">
            <a
              href="mailto:samridhivigd.a.v@gmail.com"
              className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600"
            >
              Feedback
            </a>
            <a
              href="https://ko-fi.com/samridhivig"
              target="_blank"
              rel="noreferrer"
              className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
            >
              <span className="sm:hidden">☕</span>
              <span className="hidden sm:inline">☕ Buy me a coffee</span>
            </a>
          </div>
        </div>
        <p className="text-gray-500 mb-3 text-sm">
          Upload your Flemish rental contract for an automated first-pass review.
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
                setOpenFlagKey(null);
              }}
            />
            {file ? (
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
            ) : (
              <>
                <p className="text-sm text-gray-500">Click to select a PDF</p>
                <p className="text-xs text-gray-400 mt-1">
                  Rental contracts only &middot; 4.5 MB max
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Your file is processed in memory and never stored
                </p>
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="submit"
              disabled={!file || isBusy}
              className="w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              {isAnalyzing ? 'Analyzing\u2026' : 'Analyze Contract'}
            </button>

            <button
              type="button"
              disabled={!file || isBusy}
              onClick={handleTranslateOnly}
              className="w-full border border-gray-300 text-gray-800 rounded-lg py-3 text-sm font-medium disabled:opacity-40 hover:border-gray-400 transition-colors"
            >
              {isTranslating ? 'Translating\u2026' : 'Translate to English'}
            </button>
          </div>

          <p className="text-xs text-gray-400">
            Automated checks can miss context, unusual wording, or poorly extracted
            text. Results may be incomplete or incorrect. Use this as a screening
            tool, not a final legal check.
          </p>
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

        {isTranslating && (
          <section className="mt-10 space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-1">Translation</h2>
              <p className="text-sm text-gray-500">
                Preparing an English preview from the uploaded lease.
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-gray-900" />
                  <p className="text-sm font-medium text-gray-900">Translation in progress</p>
                </div>
                <p className="mt-1 pl-6 text-sm text-gray-500">
                  Detecting language, translating paragraphs, and preparing the preview.
                </p>
              </div>

              <div className="space-y-4" aria-hidden="true">
                <div className="h-4 w-32 rounded bg-gray-100" />
                <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
                  <div className="h-3 w-full rounded bg-gray-200" />
                  <div className="h-3 w-11/12 rounded bg-gray-200" />
                  <div className="h-3 w-4/5 rounded bg-gray-200" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-gray-100" />
                  <div className="h-3 w-10/12 rounded bg-gray-100" />
                  <div className="h-3 w-9/12 rounded bg-gray-100" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-gray-100" />
                  <div className="h-3 w-11/12 rounded bg-gray-100" />
                </div>
              </div>
            </div>
          </section>
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
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 border-b border-gray-100 pb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">English translation preview</p>
                    <p className="mt-1 text-sm text-gray-500">
                      Paragraph-aware rendering for easier clause-by-clause reading.
                    </p>
                  </div>
                </div>

                <div className="max-h-[38rem] overflow-y-auto pr-1">
                  <div className="space-y-4">
                    {translation.blocks.map((block, index) => (
                      <p
                        key={`${block.type}-${index}`}
                        className={TRANSLATION_BLOCK_STYLES[block.type]}
                      >
                        {block.text}
                      </p>
                    ))}
                  </div>
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
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm">
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
                    (() => {
                      const key = `${flag.ruleId}-${flag.clause}-${i}`;
                      const panelId = `flag-explanation-${i}`;
                      const buttonId = `flag-trigger-${i}`;
                      const isOpen = openFlagKey === key;
                      const matchedExplanation =
                        result.explanations.find(
                          (exp) =>
                            exp.ruleId === flag.ruleId && exp.clause === flag.clause,
                        ) ??
                        result.explanations.find((exp) => exp.ruleId === flag.ruleId);
                      const explanationText =
                        matchedExplanation?.explanation ??
                        'No additional explanation is available for this flag yet.';
                      const explanationSources =
                        matchedExplanation?.sources.length
                          ? matchedExplanation.sources
                          : flag.sources;

                      return (
                        <li
                          key={key}
                          className="border border-gray-200 rounded-lg text-sm bg-white overflow-hidden"
                        >
                          <button
                            id={buttonId}
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            aria-label={isOpen ? 'Hide explanation details' : 'Show explanation details'}
                            onClick={() =>
                              setOpenFlagKey((prev) => (prev === key ? null : key))
                            }
                            className={`group w-full p-4 text-left text-gray-900 min-h-[44px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-700 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${SEVERITY_HEADER[flag.severity]} ${isOpen ? 'rounded-t-lg' : 'rounded-lg'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
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
                                <p className="text-sm text-gray-700 leading-5">{flag.issue}</p>
                              </div>
                              <div className="mt-0.5 shrink-0 flex items-center gap-2 text-xs font-medium text-gray-600 group-hover:text-gray-700">
                                <span className="hidden sm:inline whitespace-nowrap">Details</span>
                                <span
                                  className={`text-[11px] text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                                  aria-hidden="true"
                                >
                                  &#9654;
                                </span>
                              </div>
                            </div>
                          </button>

                          {isOpen && (
                            <div
                              id={panelId}
                              role="region"
                              aria-labelledby={buttonId}
                              className="px-4 pt-4 pb-4 border-t border-gray-200 bg-white"
                            >
                              <p className="text-gray-700 leading-6">{explanationText}</p>
                              {flag.uncertain && (
                                <p className="text-xs text-amber-700 mt-2">
                                  This check is conservative and should be confirmed
                                  manually.
                                </p>
                              )}
                              <div className="mt-3 flex flex-wrap gap-2">
                                {explanationSources.map((source) => (
                                  <a
                                    key={`${flag.ruleId}-${source.url}`}
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={`${source.label} (opens in a new tab)`}
                                    title="Opens in a new tab"
                                    className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-700 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                                  >
                                    <span>{source.label}</span>
                                    <svg
                                      aria-hidden="true"
                                      viewBox="0 0 16 16"
                                      fill="none"
                                      className="h-4 w-4 shrink-0 self-center text-gray-600"
                                    >
                                      <path
                                        d="M5 11L11 5M7 5h4v4"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })()
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
      <footer className="mt-16 text-xs text-gray-400 text-center space-y-1">
        <p>
          Automated review for Flemish residential leases signed from 1 January 2019
          onward. Not legal advice.
        </p>
        <p>
          <a href="/privacy" className="underline underline-offset-2 hover:text-gray-600">
            Privacy policy
          </a>
          {' · '}
          <a
            href="https://github.com/samridhivig/lease-check"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-gray-600"
          >
            Source code (MIT)
          </a>
        </p>
      </footer>
    </main>
  );
}
