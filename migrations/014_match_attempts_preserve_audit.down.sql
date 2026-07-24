ALTER TABLE match_attempts
  DROP CONSTRAINT IF EXISTS match_attempts_invoice_id_fkey;

ALTER TABLE match_attempts
  ADD CONSTRAINT match_attempts_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
