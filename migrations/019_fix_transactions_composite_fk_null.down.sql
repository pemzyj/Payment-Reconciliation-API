ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactionsfk;

ALTER TABLE transactions
  ADD CONSTRAINT transactionsfk
  FOREIGN KEY (merchant_id, matched_invoice_id)
  REFERENCES invoices (merchant_id, id)
  ON DELETE SET NULL;
