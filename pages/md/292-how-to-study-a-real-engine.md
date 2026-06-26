Reading about databases is useful; reading the source code of a real database engine is transformative. When you trace a `SELECT` through PostgreSQL's executor or watch an LSM-tree compaction happen in RocksDB, the abstractions you have been studying become concrete machinery. This page gives you a structured approach to studying a real engine without drowning in millions of lines of code.

## Why Read Source Code?

Documentation describes the intended behavior. Source code describes the actual behavior — including the edge cases, the workarounds, and the TODOs that reveal which problems turned out to be hard. Engineers who have read production database source code develop intuitions that no blog post can give: why a particular lock is held, why a certain data structure was chosen, why an optimization was deliberately not made.

The goal is not to understand every line — that's impossible and unnecessary. The goal is to build a **mental map**: which subsystem lives where, how data flows between them, and where to look when something goes wrong.

## Choosing an Engine to Study

Start with **SQLite** or **PostgreSQL**. Both are open source, extensively documented, and widely read by engineers.

| Engine | Why study it | Best starting point |
|---|---|---|
| **SQLite** | ~150k lines of C, single-file architecture, entire stack visible | `sqlite3.c` amalgamation; `btree.c` for storage |
| **PostgreSQL** | Full production RDBMS; excellent inline comments | `src/backend/executor/` for query execution |
| **RocksDB** | LSM-tree in production; used by MySQL, CockroachDB, TiKV | `db/db_impl/` for write path; `compaction/` for compaction |
| **Redis** | In-memory key-value; readable C; great for data structures | `src/t_hash.c`, `src/ae.c` for event loop |
| **CockroachDB** | Distributed SQL in Go; modern architecture | `pkg/storage/` for KV layer; `pkg/sql/` for SQL |

## A Structured Approach

### Step 1 — Draw the Subsystem Map First

Before reading any code, draw a box diagram of the major subsystems from documentation. For PostgreSQL, that is: parser → rewriter → planner → executor → storage (heap + indexes) + WAL + buffer pool. For RocksDB: MemTable → WAL → SSTable files → Compaction. Having this map prevents you from getting lost when you encounter a function that calls into a subsystem you haven't read yet.

<figure class="diagram">
<svg viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PostgreSQL subsystem map: SQL string flows through parser, rewriter, planner, executor, then storage layer with buffer pool and WAL">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>
  <!-- SQL Input -->
  <rect x="10" y="110" width="80" height="40" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="50" y="135" text-anchor="middle" font-size="12" fill="var(--text)">SQL string</text>
  <line x1="92" y1="130" x2="118" y2="130" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Parser -->
  <rect x="120" y="110" width="80" height="40" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="160" y="135" text-anchor="middle" font-size="12" fill="var(--text)">Parser</text>
  <line x1="202" y1="130" x2="228" y2="130" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Rewriter -->
  <rect x="230" y="110" width="80" height="40" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="270" y="135" text-anchor="middle" font-size="12" fill="var(--text)">Rewriter</text>
  <line x1="312" y1="130" x2="338" y2="130" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Planner -->
  <rect x="340" y="110" width="80" height="40" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="380" y="135" text-anchor="middle" font-size="12" fill="var(--text)">Planner</text>
  <line x1="422" y1="130" x2="448" y2="130" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Executor -->
  <rect x="450" y="110" width="80" height="40" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="490" y="135" text-anchor="middle" font-size="12" fill="var(--text)">Executor</text>
  <!-- Down to storage -->
  <line x1="490" y1="152" x2="490" y2="178" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Storage row -->
  <rect x="340" y="180" width="100" height="40" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="390" y="205" text-anchor="middle" font-size="12" fill="var(--text)">Buffer Pool</text>
  <rect x="450" y="180" width="80" height="40" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="490" y="205" text-anchor="middle" font-size="12" fill="var(--text)">Heap/Index</text>
  <rect x="540" y="180" width="80" height="40" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="580" y="205" text-anchor="middle" font-size="12" fill="var(--text)">WAL</text>
  <!-- connections -->
  <line x1="490" y1="180" x2="440" y2="180" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="532" y1="200" x2="542" y2="200" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- labels -->
  <text x="320" y="28" text-anchor="middle" font-size="12" fill="var(--muted)">PostgreSQL query pipeline</text>
</svg>
<figcaption>Draw the subsystem map before reading code — it prevents you from getting lost when a function crosses subsystem boundaries.</figcaption>
</figure>

### Step 2 — Pick One Entry Point and Follow It

Do not start at `main()`. Pick a specific operation and trace it end-to-end:

- **PostgreSQL INSERT:** `exec_simple_query()` → `pg_parse_query()` → `pg_plan_queries()` → `ExecutorStart()` / `ExecutorRun()` → `ExecInsert()` → `heap_insert()` → `XLogInsert()`.
- **SQLite SELECT:** `sqlite3_exec()` → `sqlite3RunParser()` → `sqlite3FinishCoding()` → VDBE opcodes → `btreeNext()`.
- **RocksDB Put:** `DB::Put()` → `WriteBatch` → `WriteThread::JoinBatchGroup()` → WAL write → MemTable insert.

Each time you hit an unfamiliar function, add it to a list. Don't immediately dive in — finish the current path first, then come back.

### Step 3 — Use Tests as Executable Documentation

Every mature engine has an extensive test suite. Tests are often the clearest illustration of how an API is meant to be used. RocksDB's `db_test.cc`, PostgreSQL's `src/test/regress/`, and SQLite's `test/` directory contain thousands of focused scenarios. When you don't understand what a function does, search the test suite for it — the test probably shows the expected behavior better than the code itself.

### Step 4 — Instrument and Run It

Set up a local build and add logging:

```
# PostgreSQL — enable debug logging
log_min_messages = DEBUG5
log_statement = 'all'

# RocksDB — enable statistics
options.statistics = rocksdb::CreateDBStatistics();
```

Running the engine with a query you understand and watching what it logs closes the loop between code and behavior. Tools like `strace`, `dtrace`, or `perf` show you system calls and hot functions — a different but complementary view.

### Step 5 — Read the Commit History

Git blame and commit history explain *why* code looks the way it does. A 10-line function that seems over-engineered often has a commit message like "fix race condition in concurrent vacuum" that explains every line. For PostgreSQL: `git log --oneline --follow src/backend/storage/buffer/bufmgr.c`. For SQLite: the detailed changelog at `sqlite.org/changes.html` explains every behavioral change.

## Common Patterns to Watch For

When reading any database engine, look for these canonical patterns:

| Pattern | What it looks like in code |
|---|---|
| **Page-oriented I/O** | Buffer pool functions accepting `BlockNumber` / `PageID`; `ReadBuffer()`/`ReleaseBuffer()` pairs |
| **Latch vs. lock** | Lightweight `LWLock` for buffer protection; full `Lock` for transaction isolation |
| **Copy-on-write / MVCC** | Tuple visibility functions (`HeapTupleSatisfiesMVCC`); version chains |
| **Write-ahead log** | Every mutation writes to WAL *before* the page; recovery replays the log |
| **Compaction** | Background thread merging sorted runs; L0 flush triggering |

Recognizing these patterns cuts orientation time dramatically — the first time you see a WAL write it's mysterious; by the third engine it's familiar.

## Practical Tips

**Use a code indexing tool.** `ctags`, `cscope`, or your IDE's "go to definition" is essential. Modern databases have call graphs 10+ levels deep; jumping between definitions manually is hopeless.

**Budget 20 hours for orientation, not 2.** Your first week with a new codebase will feel unproductive. That's normal. The mental map builds slowly and then pays off suddenly.

**Focus on the write path.** Writes touch more subsystems (WAL, buffer pool, indexes, lock manager) than reads. If you understand how a write commits, you understand most of the engine.

**Read the hackers' mailing list.** PostgreSQL's `pgsql-hackers` list and RocksDB's GitHub discussions contain context about why things are the way they are, written by the people who wrote the code.

## Key Takeaways

- Draw the subsystem map before reading a single line of code.
- Pick one operation (INSERT, GET, compaction) and trace it end-to-end before branching.
- Tests are executable documentation; commit history explains the *why*.
- Instrument and run the engine; code + runtime behavior together build durable understanding.
- Budget weeks, not hours — orientation is slow but the return compounds.
