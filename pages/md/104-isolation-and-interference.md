When two transactions run at exactly the same time, they can step on each other's work in surprising ways. **Isolation** is the database property that prevents one transaction from seeing or disrupting the in-progress work of another. Getting isolation wrong leads to subtle, hard-to-reproduce bugs — the kind that only appear under load.

## Why Concurrent Transactions Interfere

A database serves many clients simultaneously. Without any coordination, two transactions reading and writing the same rows can interleave their operations in ways that produce incorrect results. These bad outcomes have standard names:

| Phenomenon | What happens |
|---|---|
| **Dirty read** | Transaction A reads a row that Transaction B has modified but not yet committed. If B rolls back, A has seen data that never officially existed. |
| **Non-repeatable read** | A reads a row, then B commits an update to that row, then A reads the same row again — and gets a different value. |
| **Phantom read** | A runs a range query (e.g. `WHERE amount > 100`). B inserts a new row that matches. A runs the same query and now gets an extra row it didn't see before. |
| **Lost update** | A and B both read the same value, both compute a new value based on it, and both write back — one write silently overwrites the other. |

None of these require malicious intent; they happen naturally when two clients race on overlapping data.

## Isolation Levels

SQL defines four standard isolation levels. Each one prevents a different subset of the phenomena above. Higher isolation means fewer anomalies but more contention (transactions may have to wait for each other).

| Isolation level | Dirty read | Non-repeatable read | Phantom read |
|---|---|---|---|
| **Read Uncommitted** | Possible | Possible | Possible |
| **Read Committed** | Prevented | Possible | Possible |
| **Repeatable Read** | Prevented | Prevented | Possible |
| **Serializable** | Prevented | Prevented | Prevented |

**Read Committed** is the default in PostgreSQL and Oracle. **Repeatable Read** is the default in MySQL/InnoDB. **Serializable** gives you the strongest guarantee: the result is identical to some sequential (non-overlapping) execution of the same transactions, as if they had run one after another.

> **Note:** SQLite's default mode is **Serializable** for writers (it uses a write lock for the entire database), which eliminates most anomalies but limits write concurrency. SQLite's WAL mode softens this for readers.

### How engines enforce isolation

Two main strategies are used in practice:

- **Locking** — a transaction acquires shared or exclusive locks on rows (or pages) before touching them. Other transactions that need conflicting locks must wait.
- **MVCC (Multi-Version Concurrency Control)** — the engine keeps multiple timestamped versions of each row. Readers see a snapshot of the database as it existed at the start of their transaction, so writers don't block readers and vice versa. PostgreSQL, MySQL/InnoDB, and SQLite in WAL mode all use MVCC.

## Seeing Interference in Action

The widget below simulates a classic **lost update** scenario. Two "sessions" both read a bank balance, add a deposit, and write back. Run the setup, then study what the final balance should be versus what it actually is.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Lost update simulation</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE accounts (id INTEGER PRIMARY KEY, owner TEXT, balance INTEGER); INSERT INTO accounts VALUES (1, 'Alice', 1000);">-- Simulating two concurrent sessions that both read then write.
-- In a real DB these would overlap; here we run them sequentially
-- to show the problem.

-- Session A reads balance: sees 1000
-- Session B reads balance: sees 1000  (before A has written)

-- Session A: deposit 200  => writes 1000 + 200 = 1200
UPDATE accounts SET balance = 1000 + 200 WHERE id = 1;

-- Session B: deposit 300  => writes 1000 + 300 = 1300
-- (B used the OLD value it read, so A's deposit is lost)
UPDATE accounts SET balance = 1000 + 300 WHERE id = 1;

-- Final balance: 1300 — but it should be 1500!
SELECT owner, balance,
       1500 AS expected_balance,
       balance - 1500 AS discrepancy
FROM accounts;