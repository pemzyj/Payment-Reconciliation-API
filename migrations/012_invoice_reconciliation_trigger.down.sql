DROP TRIGGER IF EXISTS trg_transactions_reconcile_invoice ON transactions;
DROP FUNCTION IF EXISTS trg_transactions_reconcile_invoice();
DROP FUNCTION IF EXISTS recalculate_invoice_totals(UUID);
