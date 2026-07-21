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

  CONSTRAINT invoicefk FOREIGN KEY (merchant_id, customer_id) REFERENCES customers (merchant_id, id),

  -- required so transactions.transactionsfk can reference (merchant_id, id) as a pair;
  -- Postgres needs an explicit unique constraint on this exact column set, it won't
  -- infer it from `id` already being a primary key
  CONSTRAINT uq_invoices UNIQUE (merchant_id, id)
);

CREATE INDEX idx_invoices_merchant_status ON invoices(merchant_id, status);
CREATE INDEX idx_invoices_reference_code ON invoices(merchant_id, reference_code) WHERE status IN ('pending','partial');
CREATE INDEX idx_invoices_amount ON invoices(merchant_id, amount);
CREATE INDEX idx_invoices_due_date ON invoices(merchant_id, due_date);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
