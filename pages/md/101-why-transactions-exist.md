Databases handle many operations at once — web servers fire queries in parallel, background jobs update rows while users are reading them, and a single user action often requires several writes that must all succeed or all fail together. Without a coordination mechanism, these overlapping operations would corrupt data in ways that are subtle, hard to reproduce, and catastrophic in production. **Transactions** are that mechanism.

## The Two Problems Transactions Solve

Transactions exist because of two distinct failure modes that appear the moment a database does real work:

**1. Partial failure.** A bank transfer needs two updates: subtract from account A and add to account B. If the process crashes after the first write but before the second, money has vanished. No application-level retry logic can reliably fix this after the fact — you need the database to guarantee that both writes either happen together or neither happens at all.

**2. Concurrent interference.** Two sessions reading and writing the same rows at the same time can produce nonsensical results. Session 1 reads a balance, then Session 2 updates it, then Session 1 writes based on its stale read. The second update overwrites the first — a **lost update**. Without isolation, these races happen silently.

A transaction wraps a group of operations into a single logical unit that the database treats atomically. The application marks the boundary with `BEGIN` and either `COMMIT` (make it permanent) or `ROLLBACK` (undo everything).

## ACID: The Four Guarantees

Textbooks describe the guarantees a transaction provides with the acronym **ACID**. Each property addresses a specific failure:

| Property | What it guarantees | Which failure it prevents |
|---|---|---|
| **Atomicity** | All-or-nothing: every operation in the transaction commits, or none do | Partial failure / crash mid-write |
| **Consistency** | The database moves from one valid state to another; constraints are never broken | Invalid data entering the system |
| **Isolation** | Concurrent transactions do not interfere with each other | Lost updates, dirty reads, race conditions |
| **Durability** | A committed transaction survives crashes; it is written to stable storage | Data loss after a confirmed commit |

> **Note:** Consistency in ACID is the odd one out — it depends on the application correctly defining what "valid" means via constraints, foreign keys, and business rules. The database enforces the rules, but you choose what the rules are.

## A Concrete Walk-Through

Imagine a ticketing system. Selling the last ticket requires two steps: decrement `seats_remaining` and insert a row into `bookings`. If those steps are not wrapped in a transaction, a concurrent sale could decrement the counter twice while only one booking row is created — or the server could crash between the two writes, leaving the counter decremented with no booking to show for it.

```sql
BEGIN;

UPDATE events
SET    seats_remaining = seats_remaining - 1
WHERE  id = 42
  AND  seats_remaining > 0;   -- guard against overselling

INSERT INTO bookings (event_id, user_id, booked_at)
VALUES (42, 7, '2024-06-01 14:00:00');

COMMIT;
```

If either statement fails — the seat count was already 0, a constraint fires, or the server dies — the entire transaction rolls back. No partial state leaks into the database.

Try the widget below. It sets up the two tables, runs the transaction, and lets you query the result. Experiment by changing `COMMIT` to `ROLLBACK` to see that neither write survives.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Atomic ticket sale</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE events (id INTEGER PRIMARY KEY, name TEXT NOT NULL, seats_remaining INTEGER NOT NULL CHECK(seats_remaining >= 0)); CREATE TABLE bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL REFERENCES events(id), user_id INTEGER NOT NULL, booked_at TEXT NOT NULL); INSERT INTO events VALUES (42, 'Opening Night', 1);">-- One seat left. Sell it atomically.
BEGIN;

UPDATE events
SET    seats_remaining = seats_remaining - 1
WHERE  id = 42 AND seats_remaining > 0;

INSERT INTO bookings (event_id, user_id, booked_at)
VALUES (42, 7, '2024-06-01 14:00:00');

COMMIT;

-- Check the results of both tables:
SELECT 'events'   AS tbl, id, name, seats_remaining AS seats FROM events
UNION ALL
SELECT 'bookings' AS tbl, id, CAST(event_id AS TEXT), CAST(user_id AS TEXT) FROM bookings;</textarea>
  </div>
</div>

Change `COMMIT` to `ROLLBACK` and re-run — both tables return to their original state, as if the sale never happened.

## Why Not Just Be Careful in Application Code?

It is tempting to think careful application logic could handle this. It cannot, reliably, because:

- **Crashes are unscheduled.** Code cannot "be careful" across a power outage or OOM kill.
- **Concurrency is non-deterministic.** Two threads running the same careful code can still interleave in harmful ways.
- **Retries create duplicates.** Re-running a failed operation without atomicity can insert the same row twice or double-charge a customer.

Transactions push the correctness guarantee down into the storage engine, where it can be enforced unconditionally — regardless of what the application does. That is the fundamental reason they exist.
