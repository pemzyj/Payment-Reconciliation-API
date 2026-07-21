CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- trigram similarity for fuzzy name matching
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch; -- levenshtein()


CREATE TYPE invoice_status AS ENUM ('pending', 'partial', 'matched', 'overdue');

CREATE TYPE transaction_match_status AS ENUM (
  'unmatched',        -- not yet processed / no candidate found
  'matched',           -- fully matched to one invoice
  'partial',           -- matched but amount < invoice amount
  'needs_review'       -- one or more candidate matches, none confident enough to auto-match
);

CREATE TYPE match_type AS ENUM (
  'exact_reference',   -- reference_code found verbatim in narration
  'amount_time',        -- amount equals an outstanding invoice within a date window
  'fuzzy_name',         -- sender name vs customer name similarity + amount
  'none'                -- logged when no candidate cleared the minimum score (review queue entry)
);


CREATE TABLE merchants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL    DEFAULT now()
);

CREATE TABLE customers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID        NOT NULL    REFERENCES merchants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),

  UNIQUE (merchant_id, id),
  FOREIGN KEY (merchant_id, customer_id) REFERENCES customers (merchant_id, id)
);

CREATE INDEX idx_customers_merchant ON customers(merchant_id);
-- trigram index so similarity()/% lookups against sender names are fast
CREATE INDEX idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);


CREATE TABLE invoices (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID            NOT NULL    REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id     UUID            NOT NULL    REFERENCES customers(id) ON DELETE RESTRICT,
  amount          NUMERIC(14, 2)  NOT NULL    CHECK (amount > 0),
  amount_paid     NUMERIC(14, 2)  NOT NULL    DEFAULT 0 CHECK (amount_paid >= 0),
  reference_code  TEXT            NOT NULL,
  due_date        DATE            NOT NULL,
  status          invoice_status  NOT NULL    DEFAULT 'pending',
  created_at      TIMESTAMPTZ     NOT NULL    DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL    DEFAULT now(),

  UNIQUE(merchant_id, id) -- invoices are unique to the merchants
);

CREATE INDEX idx_invoices_merchant_status ON invoices(merchant_id, status);
CREATE INDEX idx_invoices_reference_code ON invoices(merchant_id, reference_code);
CREATE INDEX idx_invoices_amount ON invoices(merchant_id, amount);
CREATE INDEX idx_invoices_due_date ON invoices(merchant_id, due_date);


CREATE TABLE transactions (
  id                 UUID                     PRIMARY KEY             DEFAULT gen_random_uuid(),
  merchant_id        UUID                     NOT NULL                REFERENCES merchants(id) ON DELETE CASCADE,
  amount             NUMERIC(14, 2)           NOT NULL                CHECK (amount > 0),
  sender_name        TEXT                     NOT NULL,
  narration          TEXT                     NOT NULL                DEFAULT '',   -- raw, often garbage/partial bank narration
  occurred_at        TIMESTAMPTZ              NOT NULL,
  matched_invoice_id UUID                     REFERENCES invoices(id) ON DELETE SET NULL,
  match_status       transaction_match_status NOT NULL                DEFAULT 'unmatched',
  created_at         TIMESTAMPTZ              NOT NULL                DEFAULT now(),

  FOREIGN KEY (merchant_id, matched_invoice_id) REFERENCES invoices (merchant_id, id)
);

CREATE INDEX idx_transactions_merchant ON transactions(merchant_id);
CREATE INDEX idx_transactions_matched_invoice ON transactions(matched_invoice_id);
CREATE INDEX idx_transactions_amount ON transactions(amount);
CREATE INDEX idx_transactions_occurred_at ON transactions(occurred_at);
CREATE INDEX idx_transactions_sender_name_trgm ON transactions USING gin (sender_name gin_trgm_ops);
-- narration search: exact-substring reference lookups happen a lot (step 1 of the engine)
CREATE INDEX idx_transactions_narration_trgm ON transactions USING gin (narration gin_trgm_ops);


CREATE TABLE match_attempts (
  id             UUID           PRIMARY KEY             DEFAULT gen_random_uuid(),
  transaction_id UUID           NOT NULL                REFERENCES transactions(id) ON DELETE CASCADE,
  invoice_id     UUID           REFERENCES invoices(id) ON DELETE CASCADE, -- null when match_type = 'none'
  match_type     match_type     NOT NULL,
  score          NUMERIC(5, 4)  NOT NULL                CHECK (score >= 0 AND score <= 1),
  reasoning      JSONB          NOT NULL                DEFAULT '{}'::jsonb, -- e.g. {"name_similarity":0.82,"days_off":2}
  created_at     TIMESTAMPTZ    NOT NULL                DEFAULT now()
);

CREATE INDEX idx_match_attempts_transaction ON match_attempts(transaction_id);
CREATE INDEX idx_match_attempts_invoice ON match_attempts(invoice_id);


CREATE OR REPLACE FUNCTION set_updated_at() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- Potential issues
-- merchants name aint unique
-- index on UUID fields which is a random inserts
