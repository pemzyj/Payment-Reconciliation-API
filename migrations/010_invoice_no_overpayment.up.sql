ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_amount_paid_le_amount
  CHECK (amount_paid <= amount);
