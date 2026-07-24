CREATE TABLE match_attempts (
  id             UUID           PRIMARY KEY             DEFAULT gen_random_uuid(),
  merchant_id    UUID           NOT NULL                REFERENCES merchants(id)    ON DELETE CASCADE,
  transaction_id UUID           NOT NULL                REFERENCES transactions(id) ON DELETE CASCADE,
  invoice_id     UUID           REFERENCES invoices(id) ON DELETE CASCADE, -- null when match_type = 'none'
  match_type     match_type     NOT NULL,
  score          NUMERIC(5, 4)  NOT NULL                CHECK (score >= 0 AND score <= 1),
  reasoning      JSONB          NOT NULL                DEFAULT '{}'::jsonb, -- e.g. {"name_similarity":0.82,"days_off":2}
  created_at     TIMESTAMPTZ    NOT NULL                DEFAULT now()
);

CREATE INDEX idx_match_attempts_merchant ON match_attempts(merchant_id);
CREATE INDEX idx_match_attempts_transaction ON match_attempts(transaction_id);
CREATE INDEX idx_match_attempts_invoice ON match_attempts(invoice_id);
