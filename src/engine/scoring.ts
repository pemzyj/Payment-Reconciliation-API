// How confident am I that this transaction belongs to this invoice?

import {
  AMOUNT_TIME_WINDOW_DAYS,
  FUZZY_NAME_SIMILARITY_FLOOR,
} from "../configs/config.js";
import { InvoiceCandidateRow, ScoredCandidate } from "./types.js";

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/*
 Exact reference match: the invoice's reference_code appears verbatim
 (case-insensitive substring) in the transaction narration. This is the
 strongest possible signal — a human or an accounting system deliberately
 put that code there — so it starts high and only nudges up/down slightly
 based on whether the amount lines up too.
*/
export function scoreExactReference(
  row: InvoiceCandidateRow,
  txnAmount: number
): ScoredCandidate | null {
  if (!row.ref_in_narration) return null;

  const invoiceAmount = Number(row.invoice_amount);
  const paid = Number(row.amount_paid);
  const remaining = invoiceAmount - paid;

  let score = 0.95;
  const reasoning: Record<string, unknown> = {
    reference_code: row.reference_code,
    found_in_narration: true,
  };

  if (Math.abs(txnAmount - remaining) < 0.01) {
    // use Math.abs because floating point arithmetic can introduce small errors
    score += 0.04; // exact amount match on top of exact reference: about as sure as this engine gets
    reasoning.amount_match = "exact";
  } else if (txnAmount < remaining) {
    // The engine still believes it found the right invoice because the reference matches and 
    // the transaction amount is less than the remaining balance, but it flags it as a partial payment.
    score -= 0.02; // partial payment — still confident it's the right invoice, just flag it
    reasoning.amount_match = "partial";
    reasoning.remaining_before = remaining;
  } else {
    score -= 0.02; // overpayment — still confident it's the right invoice, just flag it
    reasoning.amount_match = "overpayment";
    reasoning.overpaid_by = round4(txnAmount - remaining);
  }

  return {
    invoice_id: row.invoice_id,
    match_type: "exact_reference",
    score: round4(Math.min(score, 0.99)),
    reasoning,
    remaining,
    invoice_amount: invoiceAmount,
  };
}

/*
 Amount + time window match: transaction amount equals the invoice's full
 remaining balance (not a partial), and it happened within a plausible
 number of days of the due date. No reference code involved at all — this
 is "these two numbers happen to line up", which is a real signal but a
 much weaker one than an explicit reference, so it's capped well below
 the auto-match threshold and decays the further out the date is.
 It asks: "Does the amount exactly equal what's owed, and was it paid near the due date?"
*/
export function scoreAmountTime(
  row: InvoiceCandidateRow,
  txnAmount: number
): ScoredCandidate | null {
  const invoiceAmount = Number(row.invoice_amount);
  const paid = Number(row.amount_paid);
  const remaining = invoiceAmount - paid;

  if (Math.abs(txnAmount - remaining) >= 0.01) return null; // this branch only fires on a full-amount match
  if (row.days_off > AMOUNT_TIME_WINDOW_DAYS) return null;

  const score = 0.75 - 0.03 * row.days_off; // decays slightly the further out the payment is from the due date

  return {
    invoice_id: row.invoice_id,
    match_type: "amount_time",
    score: round4(score),
    reasoning: {
      amount_match: "exact",
      days_off: row.days_off,
      window_days: AMOUNT_TIME_WINDOW_DAYS,
    },
    remaining,
    invoice_amount: invoiceAmount,
  };
}

/*  
 Fuzzy name match: sender name resembles the customer's name (trigram
 similarity, case/whitespace-normalized upstream in SQL) and the amount is
 at least plausible (equal, or a partial payment less than what's owed).
 Weakest signal of the three by design — a resembling name with no
 reference and no exact amount could easily be someone else — so this
 always lands in the review band, never auto-matches.
 */
export function scoreFuzzyName(
  row: InvoiceCandidateRow,
  txnAmount: number
): ScoredCandidate | null {
  if (row.name_similarity < FUZZY_NAME_SIMILARITY_FLOOR) return null;

  const invoiceAmount = Number(row.invoice_amount);
  const paid = Number(row.amount_paid);
  const remaining = invoiceAmount - paid;

  let amountFactor: number;
  const reasoning: Record<string, unknown> = {
    name_similarity: round4(row.name_similarity),
  };

  if (Math.abs(txnAmount - remaining) < 0.01) {
    amountFactor = 1.0;
    reasoning.amount_match = "exact";
  } else if (txnAmount < remaining) {
    const ratio = txnAmount / remaining;
    amountFactor = 0.7 + 0.3 * ratio; // partial payment is plausible, but scale down slightly 
    reasoning.amount_match = "partial";
    reasoning.remaining_before = remaining;
  } else {
    return null; // overpayment with only a fuzzy name and no reference is too weak to surface at all
  }

  const score = (0.15 + 0.55 * row.name_similarity) * amountFactor;

  return {
    invoice_id: row.invoice_id,
    match_type: "fuzzy_name",
    score: round4(score),
    reasoning,
    remaining,
    invoice_amount: invoiceAmount,
  };
}

export function scoreAllCandidates(
  rows: InvoiceCandidateRow[],
  txnAmount: number
): ScoredCandidate[] {
  const scored: ScoredCandidate[] = [];
  for (const row of rows) {
    const exact = scoreExactReference(row, txnAmount);
    if (exact) scored.push(exact);

    const amountTime = scoreAmountTime(row, txnAmount);
    if (amountTime) scored.push(amountTime);

    const fuzzy = scoreFuzzyName(row, txnAmount);
    if (fuzzy) scored.push(fuzzy);
  }
  return scored;
}
