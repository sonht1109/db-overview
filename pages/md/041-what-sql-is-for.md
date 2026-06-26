SQL — Structured Query Language — is the standard language for talking to a relational database. You use it to ask questions ("give me all orders placed in the last 30 days"), to change data ("mark this order as shipped"), and to define structure ("create a table to hold customers"). Almost every relational database you will encounter — PostgreSQL, MySQL, SQLite, SQL Server, Oracle — speaks SQL, even if each adds its own dialect on top.

## The Four Things SQL Does

SQL is divided into sub-languages, each with a distinct job:

| Sub-language | Stands for | What it covers | Example statement |
|---|---|---|---|
| **DML** | Data Manipulation Language | Reading and writing rows | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| **DDL** | Data Definition Language | Creating and altering structure | `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE` |
| **DCL** | Data Control Language | Permissions and access | `GRANT`, `REVOKE` |
| **TCL** | Transaction Control Language | Grouping changes atomically | `BEGIN`, `COMMIT`, `ROLLBACK` |

Day-to-day application work lives almost entirely in DML. DDL appears when you build or migrate a schema. DCL and TCL matter at the operations and reliability level — you will meet them properly in later chapters.

## SQL Describes *What*, Not *How*

The most important thing to understand about SQL is that it is **declarative**. You state what result you want; the database engine figures out how to produce it.

Compare this to a procedural approach you might use in Python:

```python
# Procedural: you specify the steps
results = []
for order in orders:
    if order.total > 100:
        results.append(order)
```

```sql
-- Declarative: you describe the outcome
SELECT * FROM orders WHERE total > 100;
```

Both produce the same rows. The difference is that the database engine can choose the fastest physical path — using an index, parallelising the scan, caching pages — without you having to direct it. This is why SQL scales so well: smarter engines improve performance without changing a line of your query.

> **Note:** "Declarative" does not mean SQL is magic. Poorly written queries still run slowly. Understanding what the engine does *underneath* — indexes, joins, execution plans — is exactly what the rest of this part of the guide is about.

## SQL Operates on Sets, Not Loops

SQL inherits the set-based thinking of the relational model (Chapter 3). Every `SELECT` returns a **relation** — a set of rows — and you can feed that set straight into another query. There is no notion of "process row 1, then row 2"; the engine processes all matching rows as a unit.

This matters in practice: when you write a `WHERE` clause, you are filtering an entire set at once. When you write a `JOIN`, you are combining two sets by a relationship. Thinking in sets — rather than in loops — is the mental shift that makes SQL feel natural.

Try it yourself. The widget below seeds a small `products` table. Run the default query, then try editing the `WHERE` clause to filter by a different category, or remove it entirely to see all rows.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Products table</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price_cents INTEGER NOT NULL); INSERT INTO products VALUES (1, 'Notebook', 'stationery', 299); INSERT INTO products VALUES (2, 'Pen', 'stationery', 99); INSERT INTO products VALUES (3, 'Desk Lamp', 'electronics', 2999); INSERT INTO products VALUES (4, 'USB Hub', 'electronics', 1499); INSERT INTO products VALUES (5, 'Sticky Notes', 'stationery', 149);">SELECT id, name, price_cents / 100.0 AS price
FROM   products
WHERE  category = 'stationery'
ORDER  BY price;</textarea>
  </div>
</div>

Notice that `SELECT` asks for *which columns* (projection), `WHERE` asks for *which rows* (selection), and `ORDER BY` sorts the result — three separate concerns expressed in one readable statement. SQL was designed to be close to plain English precisely so that the intent stays clear even to someone reading the query months later.

## What SQL Is Not

SQL is not a general-purpose programming language. It has no built-in file I/O, no native HTTP calls, and only limited looping constructs. When people add procedural logic to a database they typically use stored procedures (PL/pgSQL, T-SQL, PL/SQL), but those are extensions layered on top of SQL, not SQL itself.

SQL is also not tied to any single database product. The core syntax you learn here works in SQLite, PostgreSQL, MySQL, and most others with only minor adjustments. That portability is one of SQL's greatest practical strengths.
