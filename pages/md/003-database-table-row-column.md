Every database system organizes data around four concepts that show up everywhere: the **database**, the **table**, the **row**, and the **column**. Master these four and you have the mental model that underlies almost every query you will ever write.

## The Building Blocks

Think of a **database** as a named container — a single file or a managed set of files that holds related data together. A business might have one database for its product catalog and a separate one for its HR records. Keeping them apart prevents unrelated data from mixing and makes access control simpler.

Inside a database you have **tables**. A table is a two-dimensional structure: rows going down, columns going across — exactly like a spreadsheet tab, but with stricter rules. Every table has a fixed set of columns declared upfront, and every row must conform to that structure.

| Concept | Analogy | Holds |
|---------|---------|-------|
| Database | A filing cabinet | One or more tables |
| Table | A drawer with labeled slots | Rows that share the same columns |
| Row | A single filled-in form | One record's worth of data |
| Column | A field on the form | One attribute, same type in every row |

A **column** (also called a *field* or *attribute*) describes one property of the thing you are tracking. Each column has a **data type** — `INTEGER`, `TEXT`, `REAL`, `DATE`, etc. — that tells the database what values are allowed. Declaring types upfront catches mistakes early: you cannot accidentally store the word "hello" in a column meant for prices.

A **row** (also called a *record* or *tuple*) is one complete entry in the table. If the table is `employees`, each row is one employee. Rows do not have a guaranteed order unless you ask for one with `ORDER BY`.

## A Concrete Example

Imagine you are building a small bookshop app. You might start with a single table called `books`:

| id | title | author | price |
|----|-------|--------|-------|
| 1 | The Pragmatic Programmer | Hunt & Thomas | 49.95 |
| 2 | Designing Data-Intensive Applications | Kleppmann | 54.99 |
| 3 | Database Internals | Petrov | 44.99 |

- The **database** might be named `bookshop`.
- The **table** is `books`.
- Each horizontal line of data is a **row** — one book.
- `id`, `title`, `author`, and `price` are the four **columns**.

Notice that `id` is an integer, `title` and `author` are text, and `price` is a decimal number. Those type distinctions matter: the database will refuse to store a price like `"free"` if the column is declared as `REAL`.

> **Note:** The `id` column here acts as a *primary key* — a value that uniquely identifies each row. Primary keys are introduced in a later chapter, but you will see them in almost every real table.

## Try It Live

The widget below creates the `books` table, inserts the three rows above, and runs a simple `SELECT`. Edit the query and hit **Run** to explore.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Books table basics</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, author TEXT, price REAL); INSERT INTO books VALUES (1, 'The Pragmatic Programmer', 'Hunt & Thomas', 49.95); INSERT INTO books VALUES (2, 'Designing Data-Intensive Applications', 'Kleppmann', 54.99); INSERT INTO books VALUES (3, 'Database Internals', 'Petrov', 44.99);">SELECT id, title, price
FROM books
ORDER BY price ASC;</textarea>
  </div>
</div>

Try changing `ORDER BY price ASC` to `ORDER BY title ASC`, or add a `WHERE price < 50` clause to filter rows. Each experiment reinforces the relationship between columns (the structure) and rows (the data).

## Why the Separation Matters

Splitting data into tables, rows, and columns is not bureaucracy for its own sake. It enables three things that scale:

1. **Consistency** — the column definition enforces the same shape for every row. You never get a customer record with a missing phone-number field and another with two.
2. **Efficient retrieval** — the database can skip straight to the columns you need instead of scanning unstructured blobs of text.
3. **Relationships** — columns in one table can reference rows in another (via foreign keys), letting you link customers to orders, orders to products, and so on — without duplicating data.

These four concepts — database, table, row, column — are the grammar of every SQL statement you will write. Every `SELECT`, `INSERT`, `UPDATE`, and `DELETE` is just a way of reading or changing rows in tables.
