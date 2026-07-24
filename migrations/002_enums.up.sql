CREATE TYPE invoice_status AS ENUM ('pending', 'partial', 'matched', 'overdue');

CREATE TYPE transaction_match_status AS ENUM (
  'unmatched',    -- not yet processed / no candidate found
  'matched',      -- fully matched to one invoice
  'partial',      -- matched but amount < invoice amount
  'needs_review'  -- one or more candidate matches, none confident enough to auto-match
);

CREATE TYPE match_type AS ENUM (
  'exact_reference', -- reference_code found verbatim in narration
  'amount_time',      -- amount equals an outstanding invoice within a date window
  'fuzzy_name',        -- sender name vs customer name similarity + amount
  'none'               -- logged when no candidate cleared the minimum score (review queue entry)
);
