-- Assumption: overpayment is not allowed (no credit-balance model). If you
-- later want to support credit balances, drop this constraint and handle the
-- "paid more than owed" case explicitly in application logic instead.
ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_amount_paid_le_amount
  CHECK (amount_paid <= amount);
