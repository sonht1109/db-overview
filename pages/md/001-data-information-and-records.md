Every database system exists to answer one question: *how do we keep track of things that matter?* Before you write a single line of SQL, it helps to be precise about what "keeping track" actually means — and that starts with distinguishing three terms that people often blur together: **data**, **information**, and **records**.

## Data vs. Information

**Data** is raw, uninterpreted values. The number `32`, the string `"Paris"`, the timestamp `2024-03-15 09:00:00` — each is just a value sitting in isolation. By themselves they mean nothing. You don't know whether 32 is a temperature, an age, a score, or a row count.

**Information** is data that has been given context and meaning. Once you know that `32` is the current outside temperature in degrees Celsius in a city called `"Paris"` recorded at `2024-03-15 09:00:00`, those three values become a single piece of information: *it was 32 °C in Paris on the morning of March 15, 2024.*

> **Note:** This distinction isn't just philosophy — it drives database design. A column named `val REAL` stores data. A column named `temperature_celsius REAL` stores data *with enough context* to become information the moment someone reads it.

The job of a database is to store data in a structured way so that the context is always recoverable and queries can reconstruct information reliably.

## Records: Data Organized for Retrieval

A **record** is a named, structured collection of related data values that describe a single real-world entity or event. In a relational database a record maps directly to a **row** in a table, and each column in that row holds one attribute of the entity.

| Column | Value | What it represents |
|---|---|---|
| `observation_id` | 4821 | A unique identifier for this measurement |
| `city` | Paris | Where the reading was taken |
| `temperature_celsius` | 32.0 | The measured value |
| `recorded_at` | 2024-03-15 09:00:00 | When it was taken |

Every row in the table has the same columns (the same **schema**), so the database can retrieve, compare, and aggregate records consistently. That uniform structure is what separates a database from a pile of text files.

### What makes a good record?

Three properties matter most:

1. **Atomicity of fields** — each column should hold one indivisible value. Storing `"Paris, France"` in a single column is tempting, but splitting it into `city` and `country` lets you query by country without string-parsing.
2. **A unique identifier** — every record needs something that distinguishes it from all others. This is the **primary key** (more on keys in a later chapter).
3. **Consistent types** — a column defined as `REAL` should never sneak in a string like `"N/A"`. Type discipline lets the database enforce meaning automatically.

## Seeing It Live

The widget below creates a tiny `weather_observations` table and seeds it with a few records. Run the default query to see the raw rows, then try changing the `WHERE` clause to filter by city or temperature — you are turning data into information by adding the context of a specific question.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Data vs. Records</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE weather_observations (observation_id INTEGER PRIMARY KEY, city TEXT NOT NULL, country TEXT NOT NULL, temperature_celsius REAL NOT NULL, recorded_at TEXT NOT NULL); INSERT INTO weather_observations VALUES (1,'Paris','France',32.0,'2024-03-15 09:00:00'); INSERT INTO weather_observations VALUES (2,'Tokyo','Japan',18.5,'2024-03-15 09:00:00'); INSERT INTO weather_observations VALUES (3,'Cairo','Egypt',27.3,'2024-03-15 09:00:00'); INSERT INTO weather_observations VALUES (4,'Paris','France',29.1,'2024-03-16 09:00:00'); INSERT INTO weather_observations VALUES (5,'Tokyo','Japan',20.2,'2024-03-16 09:00:00');">SELECT city, country, temperature_celsius, recorded_at
FROM weather_observations
WHERE city = 'Paris'
ORDER BY recorded_at;</textarea>
  </div>
</div>

Notice that the same raw number `32.0` carries full meaning only because the surrounding columns supply the *who*, *where*, and *when*. Strip those away and you are back to plain data.

## The Takeaway

| Term | Definition | Database analog |
|---|---|---|
| Data | Raw, context-free values | Individual cell values |
| Information | Data + context + interpretation | A query result with meaningful column names |
| Record | A structured set of data describing one entity | A row in a table |

These three concepts underpin everything else in this guide. When you design a table you are deciding *which data to capture*, *how to give it context through column names and types*, and *how to group it into records* that represent the real-world things you care about.
