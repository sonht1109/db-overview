Our transaction implementation achieves atomicity in the happy path — but it is not crash-safe. If the process dies halfway through a commit, the data file ends up in an inconsistent state: some rows written, some not, with no way to tell which half of a multi-row transaction made it to disk. **Recovery** is the machinery that fixes this. The solution, used by virtually every serious database, is a **write-ahead log (WAL)**.

## The Write-Ahead Log Principle

The WAL rule is simple and profound:

> **Before changing any data on disk, write what you are about to do to the log. The log record must reach durable storage before the data change does.**

Because the log is written sequentially (append-only), it is faster than random data file writes. Because it is written before the data, the database can always reconstruct the correct state after a crash by replaying or undoing log records.

```
CRASH SCENARIO WITHOUT WAL:
  data file: [Row0][Row1][PARTIAL Row2]   ← corrupt, no clue what happened

CRASH SCENARIO WITH WAL:
  log file:  [BEGIN txn1][INSERT Row2][INSERT Row3][COMMIT txn1]
  data file: [Row0][Row1]                ← may be behind, but log is truth
  → recovery replays log → data file ends up correct
```

## Log Record Format

Each log record is a fixed-size header plus a variable payload:

```python
import struct, json

# Header: 4B record length, 1B record type, 4B transaction id
LOG_HEADER = struct.Struct(">IBI")
LOG_HDR_SIZE = LOG_HEADER.size  # 9 bytes

LOG_BEGIN  = 0x01
LOG_INSERT = 0x02
LOG_COMMIT = 0x03
LOG_ABORT  = 0x04

def write_log_record(log_fh, rec_type: int, txn_id: int, payload: bytes = b""):
    header = LOG_HEADER.pack(len(payload), rec_type, txn_id)
    log_fh.write(header + payload)
    log_fh.flush()   # force OS to write to durable storage

def read_log_records(log_fh):
    log_fh.seek(0)
    while True:
        hdr = log_fh.read(LOG_HDR_SIZE)
        if len(hdr) < LOG_HDR_SIZE:
            break
        plen, rec_type, txn_id = LOG_HEADER.unpack(hdr)
        payload = log_fh.read(plen)
        yield rec_type, txn_id, payload
```

## WAL-Enabled Transaction

Now we rewrite `Transaction.commit()` to log-before-write:

```python
class WalTransaction:
    def __init__(self, table, log_fh, txn_id: int):
        self.table   = table
        self.log_fh  = log_fh
        self.txn_id  = txn_id
        self._writes = []
        write_log_record(log_fh, LOG_BEGIN, txn_id)

    def insert(self, row: dict):
        payload = json.dumps(row).encode()
        write_log_record(self.log_fh, LOG_INSERT, self.txn_id, payload)
        self._writes.append(row)     # also buffer for the data file

    def commit(self):
        # 1. Write COMMIT to log (durable before data file changes)
        write_log_record(self.log_fh, LOG_COMMIT, self.txn_id)
        # 2. Now write to the data file (may be interrupted — log recovers us)
        for row in self._writes:
            self.table.write_row(row)

    def rollback(self):
        write_log_record(self.log_fh, LOG_ABORT, self.txn_id)
        self._writes.clear()
```

<figure class="diagram">
<svg viewBox="0 0 660 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="WAL write sequence: log records written before data file; crash recovery replays log">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
    <marker id="arrm" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--muted)"/>
    </marker>
  </defs>

  <!-- Transaction box -->
  <rect x="10" y="80" width="130" height="80" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="75" y="104" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Transaction</text>
  <text x="75" y="122" text-anchor="middle" font-size="10" fill="var(--muted)">INSERT Row2</text>
  <text x="75" y="137" text-anchor="middle" font-size="10" fill="var(--muted)">INSERT Row3</text>
  <text x="75" y="152" text-anchor="middle" font-size="10" fill="var(--muted)">COMMIT</text>

  <!-- Arrow to WAL -->
  <line x1="142" y1="110" x2="188" y2="90" stroke="var(--accent)" stroke-width="2" marker-end="url(#arr)"/>
  <text x="162" y="90" text-anchor="middle" font-size="10" fill="var(--accent)">1. log first</text>

  <!-- WAL file -->
  <rect x="190" y="40" width="160" height="130" rx="6" fill="var(--accent)" opacity="0.08" stroke="var(--accent)" stroke-width="2"/>
  <text x="270" y="62" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">WAL (log file)</text>
  <text x="270" y="80" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="monospace">BEGIN  txn1</text>
  <text x="270" y="95" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="monospace">INSERT txn1 Row2</text>
  <text x="270" y="110" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="monospace">INSERT txn1 Row3</text>
  <text x="270" y="125" text-anchor="middle" font-size="10" fill="var(--accent)" font-family="monospace" font-weight="600">COMMIT txn1 ←durable</text>
  <text x="270" y="155" text-anchor="middle" font-size="10" fill="var(--muted)">sequential append</text>

  <!-- Arrow to data file -->
  <line x1="352" y1="100" x2="398" y2="100" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arrm)"/>
  <text x="372" y="91" text-anchor="middle" font-size="10" fill="var(--muted)">2. data write</text>
  <text x="372" y="115" text-anchor="middle" font-size="10" fill="var(--muted)">(may crash)</text>

  <!-- Data file -->
  <rect x="400" y="60" width="130" height="90" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="465" y="83" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Data File</text>
  <text x="465" y="101" text-anchor="middle" font-size="10" fill="var(--muted)">Row 0</text>
  <text x="465" y="116" text-anchor="middle" font-size="10" fill="var(--muted)">Row 1</text>
  <text x="465" y="131" text-anchor="middle" font-size="10" fill="var(--muted)">Row 2 ← may be partial</text>

  <!-- Recovery arrow -->
  <line x1="270" y1="172" x2="270" y2="205" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrm)"/>
  <rect x="190" y="207" width="160" height="30" rx="4" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="270" y="226" text-anchor="middle" font-size="11" fill="var(--text)">Recovery: replay log →</text>
</svg>
<figcaption>The log is written and flushed before the data file. On crash, recovery reads the log and replays any committed transaction that did not fully reach the data file.</figcaption>
</figure>

## Recovery Algorithm (ARIES-lite)

After a crash, we scan the log forward and redo any committed transaction that is incomplete in the data file:

```python
def recover(table: TableFile, log_fh) -> None:
    """
    Simple redo-only recovery:
    - Find all committed transactions in the log.
    - Re-apply their inserts if the data file is behind.
    """
    committed = set()
    pending   = {}   # txn_id -> [rows]

    for rec_type, txn_id, payload in read_log_records(log_fh):
        if rec_type == LOG_BEGIN:
            pending[txn_id] = []
        elif rec_type == LOG_INSERT:
            row = json.loads(payload)
            pending.setdefault(txn_id, []).append(row)
        elif rec_type == LOG_COMMIT:
            committed.add(txn_id)
        elif rec_type == LOG_ABORT:
            pending.pop(txn_id, None)

    # Redo committed transactions
    current_rows = table.num_rows()
    rows_written = 0
    for txn_id in committed:
        for row in pending.get(txn_id, []):
            if rows_written >= current_rows:   # data file is behind
                table.write_row(row)
            rows_written += 1
```

> **Note:** Real recovery (ARIES) is far more sophisticated — it has an analysis phase, a redo phase, and an undo phase. Our toy does redo-only because we do not support in-place updates (inserts only, no deletes). The concept is the same.

## Log Compaction (Checkpointing)

Without compaction, the log grows forever. Databases periodically write a **checkpoint** record to the log that says "everything before this point is already reflected in the data file — you do not need to redo it." Recovery then starts from the most recent checkpoint, not from the beginning of the log.

```python
def checkpoint(table: TableFile, log_fh):
    """Mark the current data file position as stable."""
    position = table.num_rows()
    write_log_record(log_fh, LOG_CHECKPOINT, 0,
                     struct.pack(">I", position))
```

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · WAL and Recovery Simulation</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE wal_log (seq INTEGER PRIMARY KEY, txn_id INTEGER, rec_type TEXT, payload TEXT); INSERT INTO wal_log VALUES (1,1,'BEGIN',''),(2,1,'INSERT','{id:6,name:Frank}'),(3,1,'INSERT','{id:7,name:Grace}'),(4,1,'COMMIT',''),(5,2,'BEGIN',''),(6,2,'INSERT','{id:8,name:Heidi}'),(7,2,'ABORT',''); CREATE TABLE data_file (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO data_file VALUES (6,'Frank');">-- WAL log contents
SELECT * FROM wal_log;

-- Data file (simulates a partial crash — only Row 6 made it)
-- SELECT * FROM data_file;

-- Recovery: find committed txns whose inserts are missing from data file
-- SELECT DISTINCT txn_id FROM wal_log
-- WHERE rec_type = 'COMMIT'
--   AND txn_id NOT IN (SELECT DISTINCT 2 FROM data_file WHERE id = 7);</textarea>
  </div>
</div>

## Key Takeaways

- The **write-ahead log** rule: write the log record to durable storage before modifying the data file. This makes crash recovery possible.
- **Recovery** replays committed log records to bring the data file up to date, and discards in-progress transactions.
- **Checkpointing** bounds the amount of log that recovery must replay, keeping startup time manageable.
- Log records are **sequential appends** — far cheaper than the random writes needed to update a B-tree or data file directly, which is why WAL is so universally adopted.
- Next we add **concurrency control**, so multiple transactions can run simultaneously without corrupting each other's data.
