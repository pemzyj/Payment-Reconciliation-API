DROP POLICY IF EXISTS merchant_isolation ON customers;
CREATE POLICY merchant_isolation ON customers
  USING (merchant_id = current_setting('app.merchant_id', true)::uuid);

DROP POLICY IF EXISTS merchant_isolation ON invoices;
CREATE POLICY merchant_isolation ON invoices
  USING (merchant_id = current_setting('app.merchant_id', true)::uuid);

DROP POLICY IF EXISTS merchant_isolation ON transactions;
CREATE POLICY merchant_isolation ON transactions
  USING (merchant_id = current_setting('app.merchant_id', true)::uuid);

DROP POLICY IF EXISTS merchant_isolation ON match_attempts;
CREATE POLICY merchant_isolation ON match_attempts
  USING (merchant_id = current_setting('app.merchant_id', true)::uuid);

DROP FUNCTION IF EXISTS current_merchant_id();
