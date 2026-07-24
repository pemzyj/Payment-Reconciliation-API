-- Moves "does this invoice's paid total and status reflect its matched
-- transactions" out of application code and into the database, so a bug in
-- the matching engine can't silently desync invoices.status from reality.
--
-- Side benefit: recalculate_invoice_totals() does `SELECT ... FOR UPDATE` on
-- the invoice row, so two concurrent transactions matching the same invoice
-- serialize on that row instead of racing each other to an inconsistent total.

CREATE OR REPLACE FUNCTION recalculate_invoice_totals(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_amount     NUMERIC(14, 2);
  v_total_paid NUMERIC(14, 2);
  v_status     invoice_status;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN;
  END IF;

  -- lock the invoice row first: this is what makes concurrent matches against
  -- the same invoice serialize instead of both reading a stale total
  SELECT amount, status INTO v_amount, v_status
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN; -- invoice was deleted concurrently; nothing to reconcile
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM transactions
  WHERE matched_invoice_id = p_invoice_id
    AND match_status IN ('matched', 'partial');

  UPDATE invoices
  SET
    amount_paid = v_total_paid,
    status = CASE
      WHEN v_total_paid >= v_amount THEN 'matched'::invoice_status
      WHEN v_total_paid > 0 THEN 'partial'::invoice_status
      -- nothing paid: leave 'pending'/'overdue' as-is, don't force it back to pending
      ELSE v_status
    END,
    updated_at = now()
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_transactions_reconcile_invoice()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM recalculate_invoice_totals(NEW.matched_invoice_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM recalculate_invoice_totals(NEW.matched_invoice_id);
    -- transaction was reassigned or unmatched from a different invoice:
    -- that invoice's total needs recalculating too
    IF OLD.matched_invoice_id IS DISTINCT FROM NEW.matched_invoice_id
       AND OLD.matched_invoice_id IS NOT NULL THEN
      PERFORM recalculate_invoice_totals(OLD.matched_invoice_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recalculate_invoice_totals(OLD.matched_invoice_id);
  END IF;
  RETURN NULL; -- AFTER trigger, return value ignored
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_reconcile_invoice
AFTER INSERT OR DELETE OR UPDATE OF matched_invoice_id, match_status, amount ON transactions
FOR EACH ROW EXECUTE FUNCTION trg_transactions_reconcile_invoice();
