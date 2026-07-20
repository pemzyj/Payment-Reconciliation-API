import { pool } from "../client";

/**
 * Seed data is deliberately built so every branch of the matching engine
 * (see MVP step 2) has at least 2 real test cases to run against:
 *
 *   - exact_reference : reference_code appears verbatim in narration
 *   - amount_time      : amount matches an open invoice, ref absent/garbled,
 *                        sender name does NOT resemble the customer name
 *   - fuzzy_name       : sender name resembles customer name + amount matches,
 *                        no usable reference
 *   - partial          : transaction amount < invoice amount
 *   - none (review)    : nothing lines up — amount, name, and ref all miss
 *
 * Narrations mimic real Nigerian bank/USSD transfer formats: NIP references,
 * USSD codes, bank short-codes, truncated/garbled names, all-caps, and
 * inconsistent delimiters.
 */

type CustomerSeed = { key: string; name: string };

const CUSTOMERS: CustomerSeed[] = [
  { key: "adaeze", name: "Adaeze Okonkwo" },
  { key: "emeka", name: "Emeka Chukwudi Nwosu" },
  { key: "bilikisu", name: "Bilikisu Abdullahi" },
  { key: "tunde", name: "Tunde Fashola Ventures" },
  { key: "chioma", name: "Chioma Eze" },
  { key: "ibrahim", name: "Ibrahim Sule" },
  { key: "grace", name: "Grace Uduak" },
  { key: "femi", name: "Femi Adeyemi Ltd" },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Clean slate for repeatable demos
    await client.query(
      "TRUNCATE match_attempts, transactions, invoices, customers, merchants RESTART IDENTITY CASCADE"
    );

    const { rows: merchantRows } = await client.query(
      `INSERT INTO merchants (name) VALUES ($1) RETURNING id`,
      ["Adire & Co Wholesale"]
    );
    const merchantId: string = merchantRows[0].id;

    const customerIds: Record<string, string> = {};
    for (const c of CUSTOMERS) {
      const { rows } = await client.query(
        `INSERT INTO customers (merchant_id, name) VALUES ($1, $2) RETURNING id`,
        [merchantId, c.name]
      );
      customerIds[c.key] = rows[0].id;
    }

    type InvoiceSeed = {
      key: string;
      customer: string;
      amount: string;
      reference_code: string;
      due_date: string;
    };

    const invoices: InvoiceSeed[] = [
      { key: "inv1", customer: "adaeze", amount: "185000.00", reference_code: "INV-2401", due_date: "2026-07-10" },
      { key: "inv2", customer: "emeka", amount: "92000.00", reference_code: "INV-2402", due_date: "2026-07-12" },
      { key: "inv3", customer: "bilikisu", amount: "460000.00", reference_code: "INV-2403", due_date: "2026-07-14" },
      { key: "inv4", customer: "tunde", amount: "1250000.00", reference_code: "INV-2404", due_date: "2026-07-15" },
      { key: "inv5", customer: "chioma", amount: "75500.00", reference_code: "INV-2405", due_date: "2026-07-16" },
      { key: "inv6", customer: "ibrahim", amount: "330000.00", reference_code: "INV-2406", due_date: "2026-07-17" },
      { key: "inv7", customer: "grace", amount: "128000.00", reference_code: "INV-2407", due_date: "2026-07-18" },
      { key: "inv8", customer: "femi", amount: "610000.00", reference_code: "INV-2408", due_date: "2026-07-20" },
      { key: "inv9", customer: "adaeze", amount: "54000.00", reference_code: "INV-2409", due_date: "2026-07-22" },
      { key: "inv10", customer: "tunde", amount: "215000.00", reference_code: "INV-2410", due_date: "2026-07-24" },
    ];

    const invoiceIds: Record<string, string> = {};
    for (const inv of invoices) {
      const { rows } = await client.query(
        `INSERT INTO invoices (merchant_id, customer_id, amount, reference_code, due_date)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [merchantId, customerIds[inv.customer], inv.amount, inv.reference_code, inv.due_date]
      );
      invoiceIds[inv.key] = rows[0].id;
    }

    type TxnSeed = {
      amount: string;
      sender_name: string;
      narration: string;
      occurred_at: string;
      scenario: string; // documentation only, not persisted
    };

    const transactions: TxnSeed[] = [
      // --- exact_reference: ref code sits verbatim in messy narration ---
      {
        amount: "185000.00",
        sender_name: "ADAEZE OKONKWO",
        narration: "NIP/FBN/250710113244/ADAEZE OKONKWO/INV-2401",
        occurred_at: "2026-07-10 09:14:00+01",
        scenario: "exact_reference -> inv1",
      },
      {
        amount: "92000.00",
        sender_name: "EMEKA C NWOSU",
        narration: "USSD-GTB-6631/EMEKA NWOSU PAYMENT REF INV-2402 THANKS",
        occurred_at: "2026-07-11 16:02:00+01",
        scenario: "exact_reference -> inv2",
      },
      {
        amount: "460000.00",
        sender_name: "BILIKISU A",
        narration: "*Instant Xfer*ZEN/034212/BILIKISU ABDULLAHI-inv-2403-goods",
        occurred_at: "2026-07-13 11:47:00+01",
        scenario: "exact_reference (lowercase ref) -> inv3",
      },

      // --- amount_time: amount matches, ref missing/garbled, name unrelated ---
      {
        amount: "1250000.00",
        sender_name: "FASHOLA GLOBAL VENTURES NIG LTD",
        narration: "TRF/UBA/882910/CORPORATE PAYMENT BATCH 4",
        occurred_at: "2026-07-16 08:30:00+01",
        scenario: "amount_time -> inv4 (Tunde's holding company account, name diverges)",
      },
      {
        amount: "330000.00",
        sender_name: "MOBILE BANKING USER",
        narration: "MOB/ACC/551029/TRANSFER",
        occurred_at: "2026-07-18 14:10:00+01",
        scenario: "amount_time -> inv6 (generic sender label, 1 day after due date)",
      },

      // --- fuzzy_name: sender resembles customer, amount matches, no usable ref ---
      {
        amount: "75500.00",
        sender_name: "CHIOMA EZE-OKAFOR",
        narration: "NIP/ZEN/220187/SCHOOL FEES REFUND",
        occurred_at: "2026-07-16 10:05:00+01",
        scenario: "fuzzy_name -> inv5 (hyphenated surname addition)",
      },
      {
        amount: "128000.00",
        sender_name: "GRACE UDOAK",
        narration: "USSD/ACCESS/778213/PAYMENT",
        occurred_at: "2026-07-18 09:40:00+01",
        scenario: "fuzzy_name -> inv7 (one-letter typo: Udoak vs Uduak)",
      },

      // --- partial: amount < invoice amount ---
      {
        amount: "300000.00",
        sender_name: "IBRAHIM SULE",
        narration: "NIP/FBN/551200/IBRAHIM SULE/PART PAYMENT INV-2406",
        occurred_at: "2026-07-17 12:00:00+01",
        scenario: "partial -> inv6 (30,000 short, ref present)",
      },
      {
        amount: "40000.00",
        sender_name: "ADAEZE O",
        narration: "MOBILE/GTB/990112/ADAEZE PART PAY",
        occurred_at: "2026-07-21 15:20:00+01",
        scenario: "partial -> inv9 (14,000 short, fuzzy name only)",
      },

      // --- none: nothing lines up, goes straight to manual review ---
      {
        amount: "18500.00",
        sender_name: "PAYSTACK-SETTLEMENT",
        narration: "PSK/SETTLE/998877/BATCH",
        occurred_at: "2026-07-15 06:00:00+01",
        scenario: "none -> unrelated settlement batch, no invoice at this amount",
      },
      {
        amount: "999000.00",
        sender_name: "UNKNOWN SENDER",
        narration: "TRF/000000/",
        occurred_at: "2026-07-19 20:11:00+01",
        scenario: "none -> amount matches nothing, name matches nothing",
      },
    ];

    for (const t of transactions) {
      await client.query(
        `INSERT INTO transactions (merchant_id, amount, sender_name, narration, occurred_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [merchantId, t.amount, t.sender_name, t.narration, t.occurred_at]
      );
    }

    await client.query("COMMIT");
    console.log(`Seeded merchant ${merchantId}`);
    console.log(`  ${CUSTOMERS.length} customers, ${invoices.length} invoices, ${transactions.length} transactions`);
    console.log("Scenario map:");
    for (const t of transactions) console.log(`  - ${t.scenario}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
