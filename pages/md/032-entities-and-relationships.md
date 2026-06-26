Every real-world domain is full of *things* that matter and *connections* between them. Data modeling is the art of naming those things precisely and deciding how they relate — before you write a single `CREATE TABLE`. Get this step right and everything downstream (queries, indexes, application logic) becomes easier. Get it wrong and you spend months untangling it.

## Entities: the things you track

An **entity** is any distinct object or concept worth storing information about. In an online bookstore you might identify:

- **Book** — title, ISBN, year published
- **Author** — name, nationality
- **Customer** — email, shipping address
- **Order** — date placed, total amount

Each entity becomes a table. Each *instance* of that entity (a specific book, a specific customer) becomes a row. The properties you record about an entity are its **attributes**, which map to columns.

> **Note:** Not every noun deserves its own entity. A book's *genre* might just be a column if it is a simple string; it warrants its own table only when you need to store extra facts about genres or link them in complex ways.

## Relationships: how entities connect

Entities rarely live in isolation. The interesting work is capturing how they relate. Every relationship has a **cardinality** — the maximum number of instances on each side.

| Cardinality | Real-world example | How you implement it |
|---|---|---|
| One-to-many (1 : N) | One author writes many books | Foreign key on the "many" side |
| Many-to-many (M : N) | Many authors co-write many books | Junction (bridge) table |
| One-to-one (1 : 1) | One customer has one loyalty profile | Foreign key + UNIQUE constraint |

One-to-many is by far the most common. You saw foreign keys in Chapter 2.2 — they are the mechanical expression of a relationship in a relational database.

### Junction tables for many-to-many

When the relationship itself carries data (for example, *which role* an author played on a book — writer, editor, translator), a junction table is the right tool. It holds foreign keys to both sides plus any attributes of the relationship itself.

```sql
-- Entities
CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE books   (id INTEGER PRIMARY KEY, title TEXT NOT NULL);

-- Junction table: one row per author-book pairing
CREATE TABLE book_authors (
    author_id INTEGER REFERENCES authors(id),
    book_id   INTEGER REFERENCES books(id),
    role      TEXT DEFAULT 'writer',   -- attribute of the relationship
    PRIMARY KEY (author_id, book_id)
);
```

The composite primary key `(author_id, book_id)` ensures no duplicate pairing is recorded.

## From diagram to tables

Designers often sketch an **Entity-Relationship (ER) diagram** before writing SQL — boxes for entities, lines (with crow's-foot or UML notation) for relationships. The translation rules are mechanical:

1. Each entity box → one table.
2. Each 1:N line → foreign key column on the N side.
3. Each M:N line → new junction table with two foreign keys.
4. Relationship attributes → columns on the junction table.

Try the widget below to see a small bookstore schema in action. The `JOIN` stitches the relationship back together at query time.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Entities &amp; Relationships</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, year INTEGER);
CREATE TABLE book_authors (author_id INTEGER, book_id INTEGER, role TEXT DEFAULT 'writer', PRIMARY KEY (author_id, book_id));
INSERT INTO authors VALUES (1, 'Gabriel García Márquez'), (2, 'Isabel Allende'), (3, 'Mario Vargas Llosa');
INSERT INTO books VALUES (1, 'One Hundred Years of Solitude', 1967), (2, 'Love in the Time of Cholera', 1985), (3, 'The House of the Spirits', 1982), (4, 'The City and the Dogs', 1963);
INSERT INTO book_authors VALUES (1, 1, 'writer'), (1, 2, 'writer'), (2, 3, 'writer'), (3, 4, 'writer');">-- List each book with its author and their role in the relationship
SELECT
    b.title,
    b.year,
    a.name  AS author,
    ba.role
FROM books b
JOIN book_authors ba ON ba.book_id   = b.id
JOIN authors      a  ON a.id         = ba.author_id
ORDER BY b.year;</textarea>
  </div>
</div>

Try adding a second author to one of the books — insert a row into `book_authors` with the same `book_id` but a different `author_id` and `role`, then re-run the query to see how the junction table fans out.

## Why modeling matters before coding

Skipping the modeling step and jumping straight to `CREATE TABLE` statements is tempting but costly. Structural mistakes — like storing multiple values in one column, or conflating two distinct entities — are hard to fix once data accumulates. Taking even thirty minutes to list your entities, name their attributes, and draw the relationships on a whiteboard pays dividends every time you write a query.
