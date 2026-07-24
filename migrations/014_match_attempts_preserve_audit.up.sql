-- match_attempts is the audit trail of every match decision (including
-- rejected/low-confidence ones). Cascading it away when an invoice is deleted
-- destroys the exact record you'd want for a reconciliation audit. Switch to
-- SET NULL so the attempt row survives; invoice_id being null on an old
-- attempt means "the invoice this pointed to was later deleted."
ALTER TABLE match_attempts
  DROP CONSTRAINT IF EXISTS match_attempts_invoice_id_fkey;

ALTER TABLE match_attempts
  ADD CONSTRAINT match_attempts_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
