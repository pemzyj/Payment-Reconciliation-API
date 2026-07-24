CREATE TABLE customers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID        NOT NULL    REFERENCES merchants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),

  CONSTRAINT uq_customers UNIQUE (merchant_id, id)
  -- merchant + id uniquely identifies a customer
  -- a foreign key can only reference columns that are guaranteed to uniquely identify a row
);

CREATE INDEX idx_customers_merchant ON customers(merchant_id);
-- trigram index so similarity()/% lookups against sender names are fast
CREATE INDEX idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);
