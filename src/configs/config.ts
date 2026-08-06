/*
Tunable thresholds for the matching engine. Pulled into one place so the
confidence bands are easy to see and adjust without hunting through logic.

Design decision (worth calling out explicitly): only exact_reference ever
auto-matches. amount_time and fuzzy_name always land in the review queue,
even at their highest possible score — an amount+time coincidence or a
name that merely resembles the customer isn't grounds to touch money
without a human confirming it. This is stricter than "medium confidence"
can sometimes auto-match", but it's the safer default for a payments
product, and it's a deliberate choice.
*/

export const AUTO_MATCH_THRESHOLD = 0.9; // only exact_reference can reach this 
// i.e. the scoring algorithm is intentionally designed so that only an exact reference match 
// can ever achieve 0.9 or above.
export const REVIEW_FLOOR = 0.3; // below this, nothing is worth surfacing at all

export const AMOUNT_TIME_WINDOW_DAYS = 7; // "plausible date range" for amount+time matching
export const FUZZY_LOOKBACK_DAYS = 30; // wider net for fuzzy name candidates
export const FUZZY_NAME_SIMILARITY_FLOOR = 0.35; // trigram similarity, below this we don't even 
// log it as a candidate. filters out obviously unrelated names before they even become candidates.

// Only log a match_attempts row if the score clears this. keeps the audit
// trail meaningful instead of recording every invoice x transaction pair.
export const LOG_FLOOR = 0.05;
