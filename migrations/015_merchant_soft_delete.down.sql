DROP TRIGGER IF EXISTS trg_block_merchant_hard_delete ON merchants;
DROP FUNCTION IF EXISTS block_merchant_hard_delete();
ALTER TABLE merchants DROP COLUMN IF EXISTS deleted_at;
