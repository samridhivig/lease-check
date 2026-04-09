export interface Flag {
  clause: string;
  issue: string;
  severity: 'high' | 'medium' | 'low';
}

export interface Explanation {
  clause: string;
  explanation: string;
}

export interface AnalysisResult {
  summary: string;
  flags: Flag[];
  explanations: Explanation[];
}

export interface ExtractedFields {
  rentAmount: number | null;
  noticePeriod: number | null;
  lateFee: number | null;
  autoRenewal: boolean | null;
}
