# Project Name — Payment Reconciliation API

## Overview

One paragraph: what this system does and why.
Given a stream of incoming bank transfers (amount, sender name, timestamp, garbage/partial reference) and a list of expected payments (invoices with amount, customer, due date), automatically match them using a confidence score and a manual-review queue for anything ambiguous.

## Schema

[ERD image or dbdiagram.io link]
<https://dbdiagram.io/d/Reconciliatoin-Schema-relationship-table-6a5fd187067336e1dec59598>

## API Contract

[Key endpoints with request/response shapes]

## Design Decisions & Tradeoffs

- Why I chose UUIDs over Serial IDs? The major problem with UUIDs is the random insert which could end up splitting the B-tree.

- Answer: Most of the queries won't use UUIDs alone. The queries will use where merchant_id = $1 AND status = 'pending' or AND name % 'John'. This second part of the queries will make lookup fast. Also, based on present requirements of between 10-100 merchants, PostgreSQL can handle this amount of UUIDs perfectly.

- Problem: Merchants could see each others data. Invoices and customers have to be unique to each merchants while the transactions have to be unique to each invoices and merchants.

- Solution: Added Row Level Security to all tables.This ensures that all queries used the WHERE Merchant_id = $1. Added composite unique keys to the customer and invoice tables and composite foreign keys to ensure that merchants can access only it own customers, invoices, and transactions.

## At 10x Scale

- What breaks first
- How I'd fix it
