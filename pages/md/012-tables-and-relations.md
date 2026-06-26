At the heart of a relational database is a deceptively simple idea: store everything in **tables**. Each table represents one kind of thing — customers, orders, products — and the power comes from linking those tables together. This chapter unpacks that structure and explains why it matters for every query you will ever write.

## Anatomy of a Table

A table is a grid of **rows** and **columns** — you have already seen the terms. The important details are the rules that govern it:

| Term | What it means |
|---|---|
| **Column** (field) | One attribute of the entity — its name, data type, and constraints are fixed for every row |
| **Row** (record / tuple) | One instance of the entity — the actual data |
| **Cell** | The intersection of a column and a row; holds exactly one value |
| **Primary key** | A column (or combination) whose value is unique per row and never NULL — it is the row's identity |

A column's **data type** is a hard contract. If a column is declared `INTEGER`, the database rejects text values. This strictness is a feature: it catches bad data at write time rather than at 3 a.m. when a report breaks.

```sql
CREATE TABLE products (
  product_id  INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  in_stock    INTEGER NOT NULL DEFAULT 1   -- 1 = true, 0 = false
);
```

Notice `NOT NULL`, `CHECK`, and `DEFAULT` — these are **constraints**, rules the engine enforces on every insert and update so you never have to police them in application code.

## Relations: Linking Tables Together

"Relational" does not mean rows are related to each other inside a table. It means tables are related to *each other* through shared values — specifically through **foreign keys**.

A foreign key in one table points to the primary key of another table. The database engine enforces that the value you write actually exists in the referenced table (this is called **referential integrity**).

```sql
CREATE TABLE orders (
  order_id   INTEGER PRIMARY KEY,
  customer   TEXT    NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(product_id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0)
);
```

Here `orders.product_id` must match a value in `products.product_id`. You cannot create an order for a product that does not exist; you cannot delete a product that has orders. The engine says no.

### The three common relationship types

- **One-to-many** — one product appears in many order rows. This is the most common relationship and is implemented with a foreign key on the "many" side.
- **Many-to-many** — a student enrolls in many courses, a course has many students. Needs a **junction table** (`enrollments`) with two foreign keys.
- **One-to-one** — rarer; used to split a wide table or store optional detail (e.g., a `user_profiles` table that extends `users`).

## Querying Across Tables with JOIN

Once data lives in separate tables you retrieve it together using a `JOIN`. A `JOIN` matches rows from two tables on a shared column — typically a foreign key to primary key pairing.

Try this widget. It creates a small `products` and `orders` table, seeds them, then runs a JOIN. Edit the query to filter by product or calculate a total — the database is all yours.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Tables &amp; Relations</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE products (product_id INTEGER PRIMARY KEY, name TEXT NOT NULL, price_cents INTEGER NOT NULL); CREATE TABLE orders (order_id INTEGER PRIMARY KEY, customer TEXT NOT NULL, product_id INTEGER NOT NULL REFERENCES products(product_id), quantity INTEGER NOT NULL); INSERT INTO products VALUES (1, 'Notebook', 299), (2, 'Pen', 99), (3, 'Ruler', 149); INSERT INTO orders VALUES (1, 'Alice', 1, 3), (2, 'Bob', 2, 10), (3, 'Alice', 3, 2), (4, 'Bob', 1, 1);">SELECT
  o.order_id,
  o.customer,
  p.name        AS product,
  p.price_cents,
  o.quantity,
  p.price_cents * o.quantity AS total_cents
FROM orders AS o
JOIN products AS p ON o.product_id = p.product_id
ORDER BY o.order_id;</textarea>
  </div>
</div>

> **Note:** A `JOIN` without a `WHERE` or `ON` condition would pair every row in one table with every row in the other — a **Cartesian product** — producing nonsense results. Always specify the matching column.

## Why This Design Matters

Splitting data into related tables rather than one giant flat file is the core of **normalization** — eliminating redundancy. In the example above, a product's name and price live in exactly one row. If you need to update the price, you change one cell; every order that references it automatically reflects the new value. In a flat file you would hunt down every duplicate and hope you caught them all.

Tables and relations are the vocabulary of relational databases. Everything else — indexes, transactions, query plans — is built on top of this foundation.
