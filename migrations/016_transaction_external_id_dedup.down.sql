DROP INDEX IF EXISTS uq_transactions_merchant_external_txn_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS external_txn_id;
