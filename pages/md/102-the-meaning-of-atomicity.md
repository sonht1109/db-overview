When a database says an operation is **atomic**, it means exactly what the word suggests from chemistry: indivisible. Either the whole operation happens, or none of it does. There is no halfway state that other parts of the system can observe. This single guarantee turns out to be the foundation on which everything else about transactions is built.

## The Classic Example: A Bank Transfer

The go-to illustration of atomicity is a money transfer, and it earns that status because the problem is painfully obvious.

Suppose Alice wants to send $200 to Bob. In the database that means two writes:

1. Subtract $200 from Alice's balance.
2. Add $200 to Bob's balance.

If the database crashes — or the network drops, or the application throws an exception — right between step 1 and step 2, something terrible happens: Alice is $200 poorer and Bob received nothing. The money has vanished from the ledger.

```sql
-- Without atomicity, a crash here leaves the database in a broken state:
UPDATE accounts SET balance = balance - 200 WHERE name = 'Alice';
-- <-- crash, power cut, or error here -->
UPDATE accounts SET balance = balance + 200 WHERE name = 'Bob';
```

Atomicity is the promise that this intermediate state can never be made permanent. The database guarantees that both writes commit together, or neither one does.

## What "All or Nothing" Actually Means

Atomicity does **not** mean the two statements run in a single CPU instruction. Under the hood the engine executes them one at a time. What it means is that the engine tracks the full set of changes belonging to one transaction and, when something goes wrong before the transaction finishes, it **rolls back** every change in that set — restoring the database to the state it was in before the transaction started.

The mechanism that makes this possible (the write-ahead log, covered in Chapter 10) records every intended change to durable storage before it is applied to the actual data pages. If the system crashes mid-transaction, recovery replays the log on restart, finds the incomplete transaction, and undoes its partial changes.

> **Note:** Atomicity is one of the four ACID properties. The others — Consistency, Isolation, and Durability — each add a further guarantee. But atomicity is the prerequisite: if you cannot guarantee all-or-nothing, the other three have nothing to stand on.

## Atomicity in Practice: BEGIN / COMMIT / ROLLBACK

Applications control transaction boundaries with three SQL statements:

| Statement | Effect |
|---|---|
| `BEGIN` | Start a new transaction; changes are now grouped |
| `COMMIT` | Make all changes in the transaction permanent |
| `ROLLBACK` | Discard all changes in the transaction; return to previous state |

The interactive example below lets you see atomicity in action. A `ROLLBACK` after two updates leaves the balances completely unchanged, as if the updates never ran.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Atomicity with ROLLBACK</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE accounts (name TEXT PRIMARY KEY, balance INTEGER NOT NULL); INSERT INTO accounts VALUES ('Alice', 1000); INSERT INTO accounts VALUES ('Bob', 500);">-- Start the transaction
BEGIN;

-- Debit Alice
UPDATE accounts SET balance = balance - 200 WHERE name = 'Alice';

-- Credit Bob
UPDATE accounts SET balance = balance + 200 WHERE name = 'Bob';

-- Something goes wrong — roll back everything
ROLLBACK;

-- Both balances should be unchanged
SELECT name, balance FROM accounts ORDER BY name;</textarea>
  </div>
</div>

Try it: change `ROLLBACK` to `COMMIT` and re-run. Now the transfer sticks and the balances reflect the move. Change it back to `ROLLBACK` and the database returns to its original state every time.

### What happens inside a failed COMMIT

A `COMMIT` can also fail — for example if a disk write error occurs while flushing the log. In that case the database treats the transaction as if `ROLLBACK` had been issued: no partial changes escape. From the application's perspective the commit either succeeds completely or raises an error and leaves the data untouched.

## Why This Matters Beyond Transfers

Bank transfers get all the press, but atomicity matters any time multiple rows or tables need to change as a single logical unit:

- Creating an order **and** decrementing inventory in the same operation.
- Inserting a user account **and** sending a welcome-email record to a queue table.
- Deleting a parent row **and** all its child rows (when cascades are not available).

In every case, the application needs confidence that readers will never see a universe where one half of the update happened and the other did not. Atomicity is that confidence, stated as a hard guarantee by the database engine.
