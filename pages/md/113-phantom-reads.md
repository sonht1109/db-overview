A **phantom read** is the subtlest of the three classic read anomalies in concurrency control (the others being dirty reads and non-repeatable reads). It happens when a transaction re-runs a query that filters rows by a *condition* and gets a *different set of rows* the second time — not because existing rows changed, but because another transaction **inserted or deleted** rows that match the filter in between. The rows that appear or vanish are called **phantoms**.

## Why Phantoms Are Different

Earlier anomalies affect *existing rows*. A dirty read sees an uncommitted value in a row that already existed. A non-repeatable read sees a committed update to a row that already existed. Both violations are about the *value* of a known row changing under you.

A phantom read is different: the rows themselves come and go. Your query's result set grows or shrinks because the *population* matching your `WHERE` clause changed, even though you never touched those rows directly.

| Anomaly | What changes under the transaction | Example |
|---|---|---|
| Dirty read | A row's value — uncommitted | Balance reads another txn's not-yet-committed debit |
| Non-repeatable read | A row's value — committed | Same row read twice; another txn updated it in between |
| **Phantom read** | **The set of matching rows** | Row count query returns 10, then 11 after another txn inserts |

## A Concrete Example

Imagine a booking system. Transaction A is checking seat availability for a flight:

```sql
-- Transaction A, step 1
SELECT COUNT(*) FROM bookings WHERE flight_id = 42 AND status = 'confirmed';
-- Returns 148 — 2 seats left on a 150-seat flight
```

Before Transaction A finishes, Transaction B runs and commits:

```sql
-- Transaction B (concurrent, commits before A reads again)
INSERT INTO bookings (flight_id, passenger_id, status)
VALUES (42, 9901, 'confirmed');
COMMIT;
```

Now Transaction A re-runs its check (perhaps before deciding to allow a booking):

```sql
-- Transaction A, step 2 — same query, same transaction
SELECT COUNT(*) FROM bookings WHERE flight_id = 42 AND status = 'confirmed';
-- Returns 149 — only 1 seat left now!
```

Transaction A never asked about row 9901. It never locked that row. But the *range of rows* matching `flight_id = 42 AND status = 'confirmed'` changed anyway. That is a phantom.

<figure class="diagram">
<svg viewBox="0 0 640 310" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline showing Transaction A and Transaction B running concurrently, with Transaction B inserting a new row between Transaction A's two reads, causing a phantom.">
  <!-- Time axis -->
  <line x1="60" y1="40" x2="60" y2="280" stroke="var(--border)" stroke-width="2"/>
  <text x="64" y="36" fill="var(--text)" font-size="12" font-style="italic">time</text>
  <polygon points="60,20 54,38 66,38" fill="var(--border)"/>

  <!-- Txn A label -->
  <text x="160" y="36" fill="var(--accent)" font-size="14" font-weight="bold" text-anchor="middle">Transaction A</text>
  <!-- Txn B label -->
  <text x="450" y="36" fill="var(--text)" font-size="14" font-weight="bold" text-anchor="middle">Transaction B</text>

  <!-- Txn A bar -->
  <rect x="100" y="50" width="120" height="220" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <!-- Txn B bar -->
  <rect x="390" y="110" width="120" height="100" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>

  <!-- A: first read -->
  <rect x="108" y="70" width="104" height="32" rx="4" fill="var(--accent)" opacity="0.18"/>
  <text x="160" y="84" fill="var(--text)" font-size="12" text-anchor="middle">SELECT COUNT(*)</text>
  <text x="160" y="97" fill="var(--text)" font-size="11" text-anchor="middle">→ 148 rows</text>

  <!-- B: INSERT -->
  <rect x="398" y="128" width="104" height="32" rx="4" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="450" y="142" fill="var(--text)" font-size="12" text-anchor="middle">INSERT new booking</text>
  <text x="450" y="155" fill="var(--text)" font-size="11" text-anchor="middle">COMMIT</text>

  <!-- Arrow: insert affects A's range -->
  <line x1="398" y1="144" x2="214" y2="180" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="5,3"/>
  <polygon points="214,180 224,172 222,183" fill="var(--border)"/>
  <text x="310" y="155" fill="var(--text)" font-size="11" text-anchor="middle" font-style="italic">new row in range</text>

  <!-- A: second read -->
  <rect x="108" y="195" width="104" height="32" rx="4" fill="var(--accent)" opacity="0.35"/>
  <text x="160" y="209" fill="var(--text)" font-size="12" text-anchor="middle">SELECT COUNT(*)</text>
  <text x="160" y="222" fill="var(--text)" font-size="11" text-anchor="middle">→ 149 rows ⚠</text>

  <!-- tick marks on time axis -->
  <line x1="56" y1="86" x2="64" y2="86" stroke="var(--border)" stroke-width="1"/>
  <line x1="56" y1="144" x2="64" y2="144" stroke="var(--border)" stroke-width="1"/>
  <line x1="56" y1="211" x2="64" y2="211" stroke="var(--border)" stroke-width="1"/>
</svg>
<figcaption>Transaction B inserts a row that falls within Transaction A's filter range, causing the second read to return a different count.</figcaption>
</figure>

## Which Isolation Level Prevents It?

The SQL standard defines four isolation levels. Phantom reads are only fully prevented at the highest level:

| Isolation level | Dirty reads | Non-repeatable reads | Phantom reads |
|---|---|---|---|
| Read Uncommitted | possible | possible | possible |
| Read Committed | prevented | possible | possible |
| Repeatable Read | prevented | prevented | **possible** |
| **Serializable** | prevented | prevented | **prevented** |

> **Note:** Many databases (PostgreSQL, MySQL InnoDB) implement **Repeatable Read** with snapshot isolation (MVCC), which in practice also prevents most phantom reads. The SQL standard's table describes the *permitted* anomalies, not what every engine allows. Always check your database's actual behavior.

### How Serializable Stops Phantoms

The engine must protect not just individual rows but the *predicate* — the search condition. Two main techniques:

- **Predicate locks** (classic approach): a transaction locks the *range* defined by its `WHERE` clause. Any insert or delete that falls in that range blocks until the reading transaction commits.
- **Serializable Snapshot Isolation (SSI)** (PostgreSQL, newer engines): transactions run optimistically on snapshots. The engine tracks read/write dependencies between transactions and aborts any cycle that would make the history non-serializable.

## Try It Yourself

The widget below simulates what phantom reads look like in a single-session context. It seeds a `bookings` table, then shows a query that could see different results if rows were inserted between calls. Modify the `INSERT` and re-run the `SELECT` to see how the count changes — exactly what a concurrent transaction would experience.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Phantom Reads Demo</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE bookings (id INTEGER PRIMARY KEY, flight_id INTEGER NOT NULL, passenger_id INTEGER NOT NULL, status TEXT NOT NULL); INSERT INTO bookings VALUES (1,42,101,'confirmed'); INSERT INTO bookings VALUES (2,42,102,'confirmed'); INSERT INTO bookings VALUES (3,42,103,'confirmed'); INSERT INTO bookings VALUES (4,42,104,'cancelled'); INSERT INTO bookings VALUES (5,99,201,'confirmed');">-- Step 1: check how many confirmed seats are booked on flight 42
SELECT COUNT(*) AS confirmed_count FROM bookings
WHERE flight_id = 42 AND status = 'confirmed';

-- Imagine another transaction runs here and inserts a new confirmed booking:
-- INSERT INTO bookings VALUES (6, 42, 999, 'confirmed');

-- Step 2: uncomment the INSERT above (remove the leading --),
-- then re-run the whole block to see the count jump.
-- That extra row is the 'phantom'.</textarea>
  </div>
</div>

> **Note:** In a real concurrent scenario you would need two separate database connections running simultaneously. Single-session demos can only approximate the effect by manually inserting the row — but the result is identical to what Transaction A would observe.

## The Takeaway

Phantom reads arise from *range queries* in concurrent transactions. Preventing them requires the database to protect the search predicate itself, not just the rows it currently returns. Serializable isolation is the standard guarantee; in practice, snapshot-based engines often handle it transparently at Repeatable Read. Understanding phantoms matters most when your transactions make decisions based on aggregates (`COUNT`, `SUM`, `MIN`, `MAX`) or range scans — any time the *absence* of a row is part of your logic.
