-- Assumption: the bank feed can send genuine reversals/refunds as negative
-- amounts. Loosen the check from "amount > 0" to "amount <> 0" so those
-- aren't silently rejected on insert. (The matching engine, once built,
-- needs its own logic for how a negative transaction affects amount_paid --
-- the reconciliation trigger from migration 012 already sums transactions.amount
-- directly, so a negative reversal will correctly reduce amount_paid once summed.)
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_amount_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_amount_check CHECK (amount <> 0);
