-- Bank feeds occasionally resend the same transfer notification. Fuzzy
-- fields (amount, sender_name, occurred_at) aren't safe to dedupe on since
-- two genuinely different transfers can share all of them. When the feed
-- provides its own stable transaction/reference id, store it here and get a
-- real dedup guarantee; when it doesn't, leave it null (no false positives).
ALTER TABLE transactions ADD COLUMN external_txn_id TEXT;

CREATE UNIQUE INDEX uq_transactions_merchant_external_txn_id
  ON transactions (merchant_id, external_txn_id)
  WHERE external_txn_id IS NOT NULL;
