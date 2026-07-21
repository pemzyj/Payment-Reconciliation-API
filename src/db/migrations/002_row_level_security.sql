-- 002_row_level_security.sql
--
-- App-layer WHERE merchant_id = $1 is the primary isolation mechanism and
-- must stay in every query. RLS here is defense-in-depth: if a query is ever
-- written without that clause (a bug, a rushed feature, a bad join), the
-- database refuses to return or touch another merchant's rows instead of
-- silently leaking them.
--
-- Mechanism: every request sets a session-local variable naming the current
-- merchant, and every policy checks rows against it. No variable set = no
-- rows visible (fails closed, not open).

-- customers, invoices, transactions all carry merchant_id directly.
ALTER TABLE customers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- FORCE is required too, or the table owner (usually the app's own DB role)
-- bypasses RLS by default, which defeats the point.
ALTER TABLE customers    FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices     FORCE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_isolation ON customers
  USING (merchant_id = current_setting('app.merchant_id', true)::uuid);

CREATE POLICY merchant_isolation ON invoices
  USING (merchant_id = current_setting('app.merchant_id', true)::uuid);

CREATE POLICY merchant_isolation ON transactions
  USING (merchant_id = current_setting('app.merchant_id', true)::uuid);

-- match_attempts has no merchant_id column of its own (it hangs off
-- transaction_id/invoice_id). Two options: denormalize merchant_id onto it,
-- or scope via a join. Denormalizing is simpler, faster, and makes this
-- table's RLS policy consistent with the others, so that's what we do.
ALTER TABLE match_attempts ADD COLUMN merchant_id UUID;

UPDATE match_attempts ma
SET merchant_id = t.merchant_id
FROM transactions t
WHERE t.id = ma.transaction_id;

ALTER TABLE match_attempts ALTER COLUMN merchant_id SET NOT NULL;
ALTER TABLE match_attempts
  ADD CONSTRAINT fk_match_attempts_merchant
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE;

CREATE INDEX idx_match_attempts_merchant ON match_attempts(merchant_id);

ALTER TABLE match_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_isolation ON match_attempts
  USING (merchant_id = current_setting('app.merchant_id', true)::uuid);

-- merchants itself is not merchant-scoped (there's nothing above it to scope
-- against) — access to that table stays controlled at the app layer, e.g.
-- only an internal/admin role queries it directly.
