'use client';

import { useState, useRef } from 'react';
import type { AnalysisResult } from '@/types';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const body = new FormData();
    body.append('file', file);

    try {
      const res = await fetch('/api/analyze', { method: 'POST', body });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Unexpected error');
      }
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight mb-2">LeaseCheck</h1>
        <p className="text-gray-500 mb-10 text-sm">
          Upload your rental contract and get a plain-English breakdown of potential issues.
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

          <button
            type="submit"
            disabled={!file || loading}
            className="w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors"
          >
            {loading ? 'Analyzing…' : 'Analyze Contract'}
          </button>
        </form>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
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
                      </div>
                      <p>{flag.issue}</p>
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
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
