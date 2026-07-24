-- BUG FOUND BY TESTING: transactionsfk is a composite FK on
-- (merchant_id, matched_invoice_id) with ON DELETE SET NULL. Postgres's
-- default SET NULL behavior for a composite FK nulls *every* column in the
-- FK when the referenced row is deleted -- not just matched_invoice_id.
-- That means deleting an invoice was setting transactions.merchant_id to
-- NULL too, which violates its NOT NULL constraint and aborts the delete
-- entirely (a merchant could never delete an invoice that had any matched
-- transaction against it).
--
-- Fix: Postgres 15+ supports naming exactly which column(s) get nulled via
-- ON DELETE SET NULL (column_list). Restrict it to matched_invoice_id only.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactionsfk;

ALTER TABLE transactions
  ADD CONSTRAINT transactionsfk
  FOREIGN KEY (merchant_id, matched_invoice_id)
  REFERENCES invoices (merchant_id, id)
  ON DELETE SET NULL (matched_invoice_id);
