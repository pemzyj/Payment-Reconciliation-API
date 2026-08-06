ALTER TABLE invoices
  ADD CONSTRAINT uq_invoices_merchant_reference_code
  UNIQUE (merchant_id, reference_code);
