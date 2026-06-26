Duplication is the quiet enemy of a healthy database. When the same fact is stored in more than one place, you create two problems: extra storage (the minor one) and the risk that copies drift out of sync (the serious one). This page shows you how duplication enters a schema, what harm it causes, and the design moves that eliminate it.

## What Counts as Duplication?

A single fact — say, a customer's city — should be recorded exactly once. If it appears in multiple rows or multiple tables, any update must touch every copy simultaneously. Miss even one, and your database holds contradictory information. That contradiction has a name: **data anomaly**.

There are three classic anomaly types:

| Anomaly | What goes wrong |
|---------|----------------|
| **Update anomaly** | You change a value in one row but forget the copies in other rows |
| **Insertion anomaly** | You cannot record a new entity without also recording something else |
| **Deletion anomaly** | Removing one thing accidentally destroys an unrelated fact |

All three stem from storing multiple independent facts in a single table. The solution is to give each fact its own home.

## Spotting Duplication in Practice

Consider an `employees` table that also tries to record department information:

```sql
CREATE TABLE employees (
  id         INTEGER PRIMARY KEY,
  name       TEXT,
  dept_name  TEXT,
  dept_floor INTEGER   -- which floor the department sits on
);
```

A sample of the data:

| id | name    | dept_name   | dept_floor |
|----|---------|-------------|------------|
| 1  | Ada     | Engineering | 3          |
| 2  | Bruno   | Engineering | 3          |
| 3  | Carmen  | Marketing   | 2          |

`dept_floor` is a fact *about the department*, not about the employee. It repeats for every person in Engineering. If Engineering moves to floor 4, you must update every Engineering row — and the database will not stop you from setting them to different values.

The fix is to **extract the repeating group** into its own table and link back by key:

```sql
CREATE TABLE departments (
  id    INTEGER PRIMARY KEY,
  name  TEXT UNIQUE,
  floor INTEGER
);

CREATE TABLE employees (
  id      INTEGER PRIMARY KEY,
  name    TEXT,
  dept_id INTEGER REFERENCES departments(id)
);
```

Now `dept_floor` lives in exactly one row. Update it once and every employee in that department sees the correct value through a join.

Try it yourself. The setup creates both the duplicated design and the normalized design. Compare what an update looks like in each:

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Spotting and fixing duplication</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT UNIQUE, floor INTEGER); INSERT INTO departments VALUES (1, 'Engineering', 3), (2, 'Marketing', 2); CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, dept_id INTEGER REFERENCES departments(id)); INSERT INTO employees VALUES (1, 'Ada', 1), (2, 'Bruno', 1), (3, 'Carmen', 2);">-- One update propagates to all employees in Engineering
UPDATE departments SET floor = 4 WHERE name = 'Engineering';

-- Verify: both Ada and Bruno now show floor 4
SELECT e.name, d.name AS dept, d.floor
FROM employees e
JOIN departments d ON d.id = e.dept_id;</textarea>
  </div>
</div>

> **Note:** Because `dept_floor` depends on the department, not on any individual employee, it belongs in `departments`. This intuition — *where does this fact naturally belong?* — is the everyday test for duplication.

## The Functional Dependency Test

A more precise way to spot misplaced facts is to think about **functional dependencies**: column A *determines* column B if knowing A always tells you B.

- `employee_id` → `employee_name` (one employee, one name — belongs together)
- `dept_name` → `dept_floor` (one department, one floor — belongs in a departments table)
- `employee_id` → `dept_name` (one employee, one department at a time — a foreign key is the right link)

When a non-key column is determined by *another non-key column* rather than by the primary key, you have a **transitive dependency** — a reliable sign of hidden duplication. Extract the dependent column into its own table, keyed by its true determinant.

## One Fact, One Place

The design principle that follows from all of this is sometimes called **single source of truth**: each piece of information should be stored in exactly one row of exactly one table, and every other reference to it should use a key pointing back to that row.

This principle is why relational databases lean on foreign keys rather than copying data. A foreign key is essentially a promise: "the real value lives over there; I am just pointing to it."

Here is a quick pattern reference:

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Same value repeated in many rows | Attribute belongs to a different entity | Move it to a separate table, add a foreign key |
| Can't insert X without also inserting Y | Two entities share a table | Split into two tables |
| Deleting a row removes unrelated info | Unrelated facts are co-located | Normalize into separate tables |

Keeping duplication out of a schema is not just academic tidiness. It is what makes a database trustworthy: when you read a value, you know it is *the* value — not one of several possibly-stale copies.
