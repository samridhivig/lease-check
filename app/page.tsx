'use client';

import { useState, useRef } from 'react';
import type { AnalysisResult } from '@/types';

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

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [translateDocument, setTranslateDocument] = useState(false);
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
      const json = await res.json();
      throw new Error(json.error ?? 'Unexpected error');
    }

    return (await res.json()) as AnalysisResult;
  }

  async function requestTranslation(selectedFile: File) {
    const body = new FormData();
    body.append('file', selectedFile);

    const res = await fetch('/api/translate', { method: 'POST', body });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? 'Unexpected error');
    }

    return (await res.json()) as TranslationResult;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setTranslationError(null);
    setResult(null);
    setTranslation(null);

    try {
      const [analysisResponse, translationResponse] = await Promise.allSettled([
        requestAnalysis(file),
        translateDocument ? requestTranslation(file) : Promise.resolve(null),
      ]);

      if (analysisResponse.status === 'fulfilled') {
        setResult(analysisResponse.value);
      } else {
        setError(
          analysisResponse.reason instanceof Error
            ? analysisResponse.reason.message
            : 'Something went wrong'
        );
      }

      if (!translateDocument) {
        return;
      }

      if (translationResponse.status === 'fulfilled') {
        setTranslation(translationResponse.value);
      } else {
        setTranslationError(
          translationResponse.reason instanceof Error
            ? translationResponse.reason.message
            : 'Translation failed'
        );
      }
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
                <p className="text-xs text-gray-400 mt-1">Rental contracts only</p>
              </>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 text-sm">
            <input
              type="checkbox"
              checked={translateDocument}
              onChange={(e) => setTranslateDocument(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span className="space-y-1">
              <span className="block font-medium text-gray-800">
                Translate Dutch documents to English
              </span>
              <span className="block text-gray-500">
                Detection runs automatically. Only Dutch files are translated for now, and
                analysis still uses the original document.
              </span>
            </span>
          </label>

          {translateDocument && (
            <p className="text-xs text-gray-500">
              The first translation can take a bit longer while the model downloads and warms up.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="submit"
              disabled={!file || loading}
              className="w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              {loading ? 'Processing…' : 'Analyze Contract'}
            </button>

            <button
              type="button"
              disabled={!file || loading}
              onClick={handleTranslateOnly}
              className="w-full border border-gray-300 text-gray-800 rounded-lg py-3 text-sm font-medium disabled:opacity-40 hover:border-gray-400 transition-colors"
            >
              {loading ? 'Processing…' : 'Translate Document'}
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
                  English translation preview. Analysis has not been changed to use this text yet.
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
        This is an automated analysis for Flemish residential leases signed from 1 January 2019 onward, not legal advice.
      </p>
    </main>
  );
}
