-- A single accidental DELETE FROM merchants cascades through customers,
-- invoices, transactions, and match_attempts with no way back. Add a
-- soft-delete column and block hard deletes outright, forcing the app to use
-- `UPDATE merchants SET deleted_at = now() WHERE id = ...` instead.
--
-- Application code (and RLS policies, if you want deleted merchants fully
-- invisible) should filter `WHERE deleted_at IS NULL` going forward.
ALTER TABLE merchants ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION block_merchant_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'merchants cannot be hard-deleted; set deleted_at instead (merchant id: %)',
    OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_merchant_hard_delete
BEFORE DELETE ON merchants
FOR EACH ROW EXECUTE FUNCTION block_merchant_hard_delete();
