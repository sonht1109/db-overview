Every table in a relational database needs a way to tell its rows apart, and every relationship between tables needs a way to express "this row over here belongs with that row over there." Primary keys and foreign keys are the two mechanisms that make both of those things possible — and together they form the backbone of the relational model.

## Primary Keys: The Identity of a Row

A **primary key** is a column (or combination of columns) whose value uniquely identifies each row in a table. Three rules apply:

- **Unique** — no two rows may share the same primary key value.
- **Not null** — every row must have one; a missing identity makes no sense.
- **Stable** — the value should not change after the row is created (though the database doesn't always enforce this automatically).

Consider a `customers` table:

| customer_id | name         | email                  |
|-------------|--------------|------------------------|
| 1           | Alice Mwangi | alice@example.com      |
| 2           | Ben Okafor   | ben@example.com        |
| 3           | Clara Souza  | clara@example.com      |

`customer_id` is the primary key. Even if two customers share a name, their IDs keep them distinct.

### Surrogate vs. Natural Keys

You have two broad choices for what to use as a primary key:

- **Surrogate key** — a value invented purely for identification, usually an auto-incrementing integer (`1, 2, 3, …`) or a UUID. It carries no real-world meaning.
- **Natural key** — a value that already exists in the domain, such as a national ID number, an ISBN, or an email address.

Surrogate keys are the more common default because they stay stable even when the real-world data changes (a customer can update their email without breaking anything). Natural keys can be useful when the identifier is truly permanent and unique, like an ISBN for a book.

## Foreign Keys: References Between Tables

A **foreign key** is a column in one table whose values must match a primary key value in another table. It expresses a relationship — "this order belongs to that customer."

```sql
CREATE TABLE orders (
  order_id    INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  placed_at   TEXT    NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);
```

The `FOREIGN KEY … REFERENCES` clause tells the database engine to enforce **referential integrity**: you cannot insert an order for `customer_id = 99` unless a customer with that ID already exists, and you cannot delete a customer who still has orders (unless you tell the database what to do in that case via `ON DELETE CASCADE` or similar).

> **Note:** SQLite parses foreign key syntax but does not enforce it by default. You must run `PRAGMA foreign_keys = ON;` at the start of each connection to activate enforcement. Most other databases enforce foreign keys automatically.

### What Happens Without Foreign Keys?

Without a foreign key constraint, the database has no way to catch **orphan rows** — orders that reference a customer that no longer exists, or never existed. Queries that join the two tables would silently produce wrong results, or no results at all. Foreign keys move this class of bug from application logic into the database itself, where it can be caught at every entry point.

## Seeing It in Action

The widget below sets up a small `customers` / `orders` schema and seeds it with sample data. Try the default query to see how a join uses the foreign key relationship, then experiment — for example, try inserting an order with a `customer_id` that doesn't exist (`99`) and observe what happens with `PRAGMA foreign_keys = ON`.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Primary &amp; Foreign Keys</span></div>
  <div class="widget-body">
    <textarea data-setup="PRAGMA foreign_keys = ON;
CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  email       TEXT    NOT NULL UNIQUE
);
CREATE TABLE orders (
  order_id    INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  item        TEXT    NOT NULL,
  amount      REAL    NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);
INSERT INTO customers VALUES (1, 'Alice Mwangi', 'alice@example.com');
INSERT INTO customers VALUES (2, 'Ben Okafor',   'ben@example.com');
INSERT INTO customers VALUES (3, 'Clara Souza',  'clara@example.com');
INSERT INTO orders VALUES (101, 1, 'Laptop',  999.00);
INSERT INTO orders VALUES (102, 1, 'Mouse',    29.00);
INSERT INTO orders VALUES (103, 2, 'Keyboard', 79.00);
INSERT INTO orders VALUES (104, 3, 'Monitor', 349.00);">-- Join orders with customers using the foreign key relationship
SELECT
  o.order_id,
  c.name        AS customer_name,
  o.item,
  o.amount
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
ORDER BY o.order_id;</textarea>
  </div>
</div>

## Composite Primary Keys

Sometimes no single column is unique on its own, but a *combination* of columns is. For example, a table tracking which students are enrolled in which courses might use both columns together as the primary key:

```sql
CREATE TABLE enrollments (
  student_id INTEGER NOT NULL,
  course_id  INTEGER NOT NULL,
  enrolled_on TEXT   NOT NULL,
  PRIMARY KEY (student_id, course_id)
);
```

This is called a **composite primary key**. It guarantees that a student can enroll in a given course only once, while still allowing the same student in many courses and many students in the same course.

<details class="reveal"><summary>Reveal: Can a foreign key point to a composite primary key?</summary><div class="reveal-body">Yes. A foreign key can reference a composite primary key, but it must include all the same columns. For example, a <code>grades</code> table that references <code>enrollments</code> would need both <code>student_id</code> and <code>course_id</code> as its foreign key columns. In practice, many designers prefer to add a surrogate key to such tables to keep foreign key references simple.</div></details>

Primary keys and foreign keys are not just database bookkeeping — they encode the rules of your data model directly in the schema, making those rules enforceable and self-documenting for anyone who reads the table definitions.
