-- current_setting('app.merchant_id', true)::uuid throws if someone sets a
-- malformed value (not a valid UUID), turning a bad session variable into an
-- unhandled 500 instead of a clean "no rows visible" result. Wrap the cast in
-- a function that catches the error and returns NULL instead -- NULL still
-- fails closed (no row matches merchant_id = NULL), it just does so quietly.
CREATE OR REPLACE FUNCTION current_merchant_id()
RETURNS UUID AS $$
BEGIN
  RETURN current_setting('app.merchant_id', true)::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

DROP POLICY IF EXISTS merchant_isolation ON customers;
CREATE POLICY merchant_isolation ON customers
  USING (merchant_id = current_merchant_id());

DROP POLICY IF EXISTS merchant_isolation ON invoices;
CREATE POLICY merchant_isolation ON invoices
  USING (merchant_id = current_merchant_id());

DROP POLICY IF EXISTS merchant_isolation ON transactions;
CREATE POLICY merchant_isolation ON transactions
  USING (merchant_id = current_merchant_id());

DROP POLICY IF EXISTS merchant_isolation ON match_attempts;
CREATE POLICY merchant_isolation ON match_attempts
  USING (merchant_id = current_merchant_id());

-- Admin/reporting access that legitimately needs to see across merchants
-- should NOT be modeled as a policy here -- create a separate Postgres role
-- with BYPASSRLS out-of-band (this needs superuser privileges to grant, so
-- it doesn't belong in an app migration) and use it only for internal
-- tooling, never the request-serving app role.
