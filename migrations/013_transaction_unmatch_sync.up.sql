-- transactionsfk uses ON DELETE SET NULL: if a matched invoice is deleted,
-- matched_invoice_id goes null but match_status was never brought back in
-- sync automatically. This closes that gap for both the FK-driven case and
-- any application code that clears matched_invoice_id directly.
CREATE OR REPLACE FUNCTION trg_transactions_unmatch_on_null_invoice()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.matched_invoice_id IS NULL AND OLD.matched_invoice_id IS NOT NULL THEN
    NEW.match_status := 'unmatched';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_unmatch_on_null_invoice
BEFORE UPDATE OF matched_invoice_id ON transactions
FOR EACH ROW EXECUTE FUNCTION trg_transactions_unmatch_on_null_invoice();
