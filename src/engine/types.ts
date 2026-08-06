export type MatchType = "exact_reference" | "amount_time" | "fuzzy_name" | "none";

export interface InvoiceCandidateRow {
  invoice_id: string;
  invoice_amount: string; // NUMERIC comes back as string from pg 
  amount_paid: string;
  reference_code: string;
  due_date: string; // date
  customer_name: string;
  ref_in_narration: boolean;
  days_off: number; // |occurred_at date - due_date|, in days
  name_similarity: number; // pg_trgm similarity(), 0..1
}

export interface ScoredCandidate {
  invoice_id: string;
  match_type: MatchType;
  score: number;
  reasoning: Record<string, unknown>;
  remaining: number;
  invoice_amount: number;
}

export interface TransactionRow {
  id: string;
  merchant_id: string;
  amount: string;
  sender_name: string;
  narration: string;
  occurred_at: string;
}
