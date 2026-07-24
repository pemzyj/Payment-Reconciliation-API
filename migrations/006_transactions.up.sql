CREATE TABLE transactions (
  id                 UUID                     PRIMARY KEY             DEFAULT gen_random_uuid(),
  merchant_id        UUID                     NOT NULL                REFERENCES merchants(id) ON DELETE CASCADE,
  amount             NUMERIC(14, 2)           NOT NULL                CHECK (amount > 0),
  sender_name        TEXT                     NOT NULL,
  narration          TEXT                     NOT NULL                DEFAULT '',   -- raw, often garbage/partial bank narration
  occurred_at        TIMESTAMPTZ              NOT NULL,
  matched_invoice_id UUID,
  match_status       transaction_match_status NOT NULL                DEFAULT 'unmatched',
  created_at         TIMESTAMPTZ              NOT NULL                DEFAULT now(),

  CONSTRAINT transactionsfk
  FOREIGN KEY (merchant_id, matched_invoice_id)
  REFERENCES invoices (merchant_id, id)
  ON DELETE SET NULL
);

CREATE INDEX idx_transactions_merchant ON transactions(merchant_id);
CREATE INDEX idx_transactions_matched_invoice ON transactions(matched_invoice_id);
CREATE INDEX idx_transactions_merchant_amount ON transactions(merchant_id, amount);
CREATE INDEX idx_transactions_merchant_occurred_at ON transactions(merchant_id, occurred_at);
CREATE INDEX idx_transactions_sender_name_trgm ON transactions USING gin (sender_name gin_trgm_ops);
-- narration search: exact-substring reference lookups happen a lot (step 1 of the engine)
CREATE INDEX idx_transactions_narration_trgm ON transactions USING gin (narration gin_trgm_ops);
