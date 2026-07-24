-- Assumption: reference_code (e.g. invoice number) is unique per merchant.
-- If merchants can legitimately reuse the same code across invoices, drop
-- this and give the exact-match matching logic an explicit tiebreaker instead
ALTER TABLE invoices
  ADD CONSTRAINT uq_invoices_merchant_reference_code
  UNIQUE (merchant_id, reference_code);
