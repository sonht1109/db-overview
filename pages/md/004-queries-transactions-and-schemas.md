Every time you ask a database "who are my top customers?" or "how much stock is left?", three distinct concepts are at work under the hood: a **query** that fetches the answer, a **transaction** that keeps changes safe, and a **schema** that defines the shape of the data. Understanding each — and how they relate — is the foundation for everything else in this guide.

## Schemas: the blueprint

A **schema** is a formal description of how data is organized: which tables exist, what columns each table has, and what type of value each column holds. It is the contract between the application and the database.

```sql
CREATE TABLE orders (
    id      INTEGER PRIMARY KEY,
    customer TEXT    NOT NULL,
    amount  REAL    NOT NULL,
    placed  TEXT    NOT NULL   -- stored as ISO date string in SQLite
);
```

The schema says: every order must have an `id`, a `customer` name, a numeric `amount`, and a `placed` date. The database enforces this — try inserting a row with a missing `amount` and it will refuse.

Think of a schema as the spreadsheet's column headers, but with rules attached: required vs. optional, integers vs. text, references to other tables. Those rules are called **constraints**, and they are what let you trust the data you get back.

> **Note:** "Schema" sometimes refers to a single table's structure, and sometimes to the full set of tables in a database. The meaning is usually clear from context.

## Queries: asking questions

A **query** is a request sent to the database — typically written in SQL (Structured Query Language). The database engine interprets the query, finds the relevant rows, and returns a result set.

SQL queries are *declarative*: you say **what** you want, not **how** to find it. The database figures out the efficient path on its own.

The core of most queries is `SELECT … FROM … WHERE`:

| Clause | Purpose |
|--------|---------|
| `SELECT` | Which columns to include in the result |
| `FROM` | Which table(s) to read |
| `WHERE` | Filter rows to only those matching a condition |
| `ORDER BY` | Sort the result |
| `LIMIT` | Cap the number of rows returned |

Try the widget below. The setup creates an `orders` table with five rows. The default query finds orders above a threshold — edit the amount or add an `ORDER BY` clause to explore.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · queries</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, amount REAL NOT NULL, placed TEXT NOT NULL);
INSERT INTO orders VALUES (1,'Alice',120.00,'2026-01-03'),(2,'Bob',45.50,'2026-01-04'),(3,'Alice',300.00,'2026-01-05'),(4,'Chidi',88.00,'2026-01-06'),(5,'Bob',210.00,'2026-01-07');">SELECT customer, amount, placed
FROM orders
WHERE amount > 100
ORDER BY amount DESC;</textarea>
  </div>
</div>

## Transactions: keeping changes safe

A **transaction** is a group of database operations that are treated as a single, indivisible unit. Either every operation in the group succeeds and is committed to disk, or — if anything goes wrong — none of them are, and the database is rolled back to where it started.

The classic example is a bank transfer. Moving $200 from account A to account B involves two writes:

1. Deduct $200 from A.
2. Add $200 to B.

If a crash happens between step 1 and step 2, the money vanishes. A transaction prevents this by wrapping both steps in a single commit. The database guarantees they happen together or not at all.

Transactions are governed by four properties, collectively known as **ACID**:

| Property | What it means |
|----------|--------------|
| **Atomicity** | All operations in the transaction succeed, or none do |
| **Consistency** | The transaction can only leave the database in a valid state (all constraints still satisfied) |
| **Isolation** | Concurrent transactions don't see each other's partial work |
| **Durability** | Once committed, the change survives crashes and power loss |

The widget below simulates the two-step transfer. Watch what happens when you run it — then try commenting out the `COMMIT` line (prepend `--`) and re-running: the change is visible inside the transaction but is never finalized.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · transactions</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE accounts (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, balance REAL NOT NULL);
INSERT INTO accounts VALUES (1,'Alice',500.00),(2,'Bob',100.00);">BEGIN;
UPDATE accounts SET balance = balance - 200 WHERE owner = 'Alice';
UPDATE accounts SET balance = balance + 200 WHERE owner = 'Bob';
COMMIT;

-- Now check the result:
SELECT owner, balance FROM accounts;</textarea>
  </div>
</div>

## How the three fit together

Schemas, queries, and transactions operate at different layers but depend on each other:

- The **schema** defines *what* can exist in the database and enforces correctness at write time.
- **Queries** read (and write) data within the structure the schema defines.
- **Transactions** wrap queries into safe, atomic units so that concurrent users and unexpected failures can't corrupt the data.

Remove any one of the three and the system breaks down: a schemaless store has no guarantees about shape; a store without queries can't be asked meaningful questions; a store without transactions can't safely handle more than one writer at a time.
