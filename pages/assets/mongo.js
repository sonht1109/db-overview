/* mongo.js — an in-browser MongoDB shell simulator for the DB-learning pages.
 *
 * Library used: mingo (https://github.com/kofrasa/mingo), MIT licensed, vendored
 * as assets/mingo.min.js. mingo implements the real MongoDB query language in
 * JavaScript — query operators ($gt/$in/$regex/$elemMatch/$exists/...), dot-path
 * field access, projection operators ($slice/$elemMatch), the aggregation
 * pipeline ($match/$group/$sort/$project/$unwind/$lookup), and update operators
 * ($set/$inc/$unset/$push/$pull/$addToSet/...). We wrap it in a small shell so
 * readers type genuine MongoDB commands (db.users.find({...})) instead of SQL.
 *
 * What this layer adds on top of mingo:
 *   - a `db.<collection>.<method>()` shell with find/findOne/insert/update/
 *     delete/aggregate/countDocuments/distinct/createIndex/explain
 *   - shell niceties: use / show dbs / show collections / help, // comments
 *   - an `explain()` that reports IXSCAN vs COLLSCAN from the index metadata
 *   - a collections panel so readers can see documents and indexes
 */
(function (global) {
  "use strict";

  var SQL_HINT = "MongoDB has no SQL and no tables: it stores JSON-like documents, and you query them with db.<collection>.find({ field: value }).";
  var HELP_TEXT = "Shell basics: db.<coll>.find({...}).sort({...}).limit(n) · insertOne/insertMany · updateOne/updateMany · deleteOne/deleteMany · aggregate([...]) · countDocuments() · distinct() · createIndex({...}) · find(...).explain(). Server: show dbs, show collections, use <db>, db.stats().";

  function engine() {
    var m = global.mingo;
    if (!m) throw new Error("Document engine (mingo) is not loaded");
    return m;
  }

  /* ================= value helpers ================= */
  /* ObjectId is represented as { __oid: "<hex>" }. The key deliberately does
   * NOT start with "$": mingo (and MongoDB) would read a "$"-prefixed key as a
   * query operator, whereas an ordinary nested key matches by field equality. */
  function makeOid(hex) { return { __oid: hex }; }
  var OID_PREFIX = "65f1a2b3c4d5e6f7a8b9";

  function isOid(v) {
    return v && typeof v === "object" && !Array.isArray(v) &&
      typeof v.__oid === "string" && Object.keys(v).length === 1;
  }

  function deepClone(v) {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(deepClone);
    var o = {};
    for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = deepClone(v[k]);
    return o;
  }

  function getPath(o, path) {
    var parts = String(path).split(".");
    for (var i = 0; i < parts.length; i++) {
      if (o === null || o === undefined) return undefined;
      o = o[parts[i]];
    }
    return o;
  }

  function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function isIdent(k) { return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k); }
  function fmtKey(k) { return isIdent(k) ? k : JSON.stringify(k); }

  /* ================= shell-style value formatting ================= */
  function compact(v) {
    if (v === undefined) return "undefined";
    if (v === null) return "null";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v === "string") return JSON.stringify(v);
    if (typeof v === "function") return "[function]";
    if (v instanceof Collection) return '[collection "' + v.name + '"]';
    if (isOid(v)) return 'ObjectId("' + v.__oid + '")';
    if (Array.isArray(v)) return "[" + v.map(compact).join(", ") + "]";
    if (typeof v === "object") {
      var ks = Object.keys(v);
      if (!ks.length) return "{}";
      return "{ " + ks.map(function (k) { return fmtKey(k) + ": " + compact(v[k]); }).join(", ") + " }";
    }
    return String(v);
  }

  function pretty(v, level) {
    var pad = new Array(level + 1).join("  ");
    var pad2 = pad + "  ";
    if (v === null || typeof v !== "object" || isOid(v) || v instanceof Collection) return compact(v);
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      return "[\n" + v.map(function (x) { return pad2 + pretty(x, level + 1); }).join(",\n") + "\n" + pad + "]";
    }
    var ks = Object.keys(v);
    if (!ks.length) return "{}";
    return "{\n" + ks.map(function (k) { return pad2 + fmtKey(k) + ": " + pretty(v[k], level + 1); }).join(",\n") + "\n" + pad + "}";
  }

  function fmtValue(v) {
    var c = compact(v);
    if (c.length <= 110 && c.indexOf("\n") < 0) return c;
    return pretty(v, 0);
  }

  /* ================= database model ================= */
  function Collection(name, db) {
    this.name = name;
    this.db = db;
    this.docs = [];
    this.indexes = [{ name: "_id_", key: { _id: 1 }, unique: true }];
  }

  Collection.prototype._newId = function () {
    this.db.server.oid = (this.db.server.oid || 0) + 1;
    var hex = this.db.server.oid.toString(16);
    while (hex.length < 4) hex = "0" + hex;
    return makeOid(OID_PREFIX + hex.slice(-4));
  };

  Collection.prototype.find = function (filter, projection) { return new Cursor(this, filter, projection); };

  Collection.prototype.findOne = function (filter, projection) {
    var c = new Cursor(this, filter, projection);
    var docs = c.toArray();
    return docs.length ? docs[0] : null;
  };

  Collection.prototype.insertOne = function (doc) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("insertOne expects a document object");
    var d = deepClone(doc);
    if (d._id === undefined) d._id = this._newId();
    this.docs.push(d);
    return { acknowledged: true, insertedId: d._id };
  };

  Collection.prototype.insertMany = function (arr) {
    if (!Array.isArray(arr) || !arr.length) throw new Error("insertMany expects a non-empty array of documents");
    var ids = [];
    var self = this;
    arr.forEach(function (doc) { ids.push(self.insertOne(doc).insertedId); });
    return { acknowledged: true, insertedCount: ids.length, insertedIds: ids };
  };

  Collection.prototype._applyUpsert = function (filter, update) {
    var base = {};
    Object.keys(filter || {}).forEach(function (k) {
      var v = filter[k];
      if (k.charAt(0) === "$") return;
      if (v && typeof v === "object" && !Array.isArray(v) && !isOid(v) && Object.keys(v).some(function (x) { return x.charAt(0) === "$"; })) return;
      base[k] = deepClone(v);
    });
    engine().update(base, deepClone(update));
    if (base._id === undefined) base._id = this._newId();
    this.docs.push(base);
    return base._id;
  };

  Collection.prototype.updateOne = function (filter, update, options) {
    options = options || {};
    var res = engine().updateOne(this.docs, filter || {}, deepClone(update));
    var out = { acknowledged: true, matchedCount: res.matchedCount, modifiedCount: res.modifiedCount };
    if (res.matchedCount === 0 && options.upsert) out.upsertedId = this._applyUpsert(filter || {}, update);
    return out;
  };

  Collection.prototype.updateMany = function (filter, update, options) {
    options = options || {};
    var res = engine().updateMany(this.docs, filter || {}, deepClone(update));
    var out = { acknowledged: true, matchedCount: res.matchedCount, modifiedCount: res.modifiedCount };
    if (res.matchedCount === 0 && options.upsert) out.upsertedId = this._applyUpsert(filter || {}, update);
    return out;
  };

  Collection.prototype.replaceOne = function (filter, doc, options) {
    options = options || {};
    var q = new (engine().Query)(filter || {});
    for (var i = 0; i < this.docs.length; i++) {
      if (!q.test(this.docs[i])) continue;
      var repl = deepClone(doc);
      if (repl._id === undefined) repl._id = this.docs[i]._id;
      this.docs[i] = repl;
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    }
    if (options.upsert) {
      var id = this._applyUpsert(filter || {}, { $set: doc });
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: id };
    }
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
  };

  Collection.prototype._delete = function (filter, many) {
    var q = new (engine().Query)(filter || {});
    var before = this.docs.length;
    var kept = [];
    var removed = 0;
    for (var i = 0; i < this.docs.length; i++) {
      if (q.test(this.docs[i]) && (many || removed === 0)) { removed++; continue; }
      kept.push(this.docs[i]);
    }
    this.docs = kept;
    return { acknowledged: true, deletedCount: before - kept.length };
  };

  Collection.prototype.deleteOne = function (filter) { return this._delete(filter, false); };
  Collection.prototype.deleteMany = function (filter) { return this._delete(filter, true); };

  Collection.prototype.countDocuments = function (filter) {
    return new (engine().Query)(filter || {}).find(this.docs).all().length;
  };
  Collection.prototype.count = Collection.prototype.countDocuments;
  Collection.prototype.estimatedDocumentCount = function () { return this.docs.length; };

  Collection.prototype.distinct = function (field, filter) {
    var q = new (engine().Query)(filter || {});
    var out = [];
    var self = this;
    this.docs.forEach(function (d) {
      if (!q.test(d)) return;
      var v = getPath(d, field);
      var vals = Array.isArray(v) ? v : [v];
      vals.forEach(function (x) {
        if (x === undefined) return;
        if (!out.some(function (y) { return deepEqual(y, x); })) out.push(x);
      });
    });
    return out;
  };

  Collection.prototype.aggregate = function (pipeline) {
    var self = this;
    var stages = (pipeline || []).map(function (stage) {
      if (stage && stage.$lookup && typeof stage.$lookup.from === "string") {
        var s = deepClone(stage);
        var coll = self.db.collections[stage.$lookup.from];
        s.$lookup.from = coll ? deepClone(coll.docs) : [];
        return s;
      }
      return stage;
    });
    return engine().aggregate(this.docs, stages);
  };

  Collection.prototype.createIndex = function (key, options) {
    options = options || {};
    if (!key || typeof key !== "object" || Array.isArray(key)) throw new Error("createIndex expects a key pattern, e.g. { category: 1 }");
    var name = options.name || Object.keys(key).map(function (k) { return k + "_" + key[k]; }).join("_");
    if (options.unique) {
      var field = Object.keys(key)[0];
      var seen = [];
      for (var i = 0; i < this.docs.length; i++) {
        var vals = getPath(this.docs[i], field);
        (Array.isArray(vals) ? vals : [vals]).forEach(function (v) {
          if (v === undefined) return;
          if (seen.some(function (s) { return deepEqual(s, v); })) throw new Error("E11000 duplicate key error, index: " + name + " dup key: { " + field + ": " + fmtValue(v) + " }");
          seen.push(v);
        });
      }
    }
    this.indexes = this.indexes.filter(function (ix) { return ix.name !== name; });
    this.indexes.push({ name: name, key: key, unique: !!options.unique });
    return name;
  };

  Collection.prototype.getIndexes = function () { return this.indexes.map(deepClone); };

  Collection.prototype.dropIndex = function (name) {
    var before = this.indexes.length;
    this.indexes = this.indexes.filter(function (ix) { return ix.name !== name; });
    if (this.indexes.length === before) throw new Error("index not found with name [" + name + "]");
    return { ok: 1, nIndexesWas: before };
  };

  Collection.prototype.drop = function () {
    this.docs = [];
    this.db._remove(this.name);
    return true;
  };

  Collection.prototype.stats = function () {
    return { ns: this.db.name + "." + this.name, count: this.docs.length, indexes: this.indexes.length, ok: 1 };
  };

  /* ================= cursor ================= */
  function Cursor(coll, filter, projection) {
    this.coll = coll;
    this.filter = filter || {};
    this.projection = projection || null;
    this.sortSpec = null;
    this.limitN = null;
    this.skipN = null;
    this.explainFlag = false;
    this.prettyFlag = false;
  }
  Cursor.prototype.sort = function (spec) { this.sortSpec = spec; return this; };
  Cursor.prototype.limit = function (n) { this.limitN = n; return this; };
  Cursor.prototype.skip = function (n) { this.skipN = n; return this; };
  Cursor.prototype.project = function (p) { this.projection = p; return this; };
  Cursor.prototype.pretty = function () { this.prettyFlag = true; return this; };
  Cursor.prototype.explain = function () { this.explainFlag = true; return this; };
  Cursor.prototype.count = function () { return this.toArray(false).length; };
  Cursor.prototype.toArray = function (applyProjection) {
    var m = engine();
    var docs = m.find(this.coll.docs, this.filter).all();
    if (this.sortSpec) docs = m.find(docs, {}).sort(this.sortSpec).all();
    if (this.skipN) docs = docs.slice(this.skipN);
    if (this.limitN !== null && this.limitN !== undefined) docs = docs.slice(0, this.limitN);
    if (this.projection && applyProjection !== false) docs = m.find(docs, {}, this.projection).all();
    return docs;
  };

  /* ================= explain ================= */
  function collectFields(filter, out) {
    if (!filter || typeof filter !== "object") return;
    Object.keys(filter).forEach(function (k) {
      if (k.charAt(0) === "$") return;
      var v = filter[k];
      if (v && typeof v === "object" && !Array.isArray(v) && !isOid(v)) {
        var ops = Object.keys(v).filter(function (x) { return x.charAt(0) === "$"; });
        if (ops.length === 0) collectFields(v, out);
        else out.push(k);
      } else {
        out.push(k);
      }
    });
  }

  function isMultiKey(coll, field) {
    return coll.docs.some(function (d) { return Array.isArray(getPath(d, field)); });
  }

  function explainPlan(cursor) {
    var coll = cursor.coll;
    var fields = [];
    collectFields(cursor.filter, fields);
    var chosen = null;
    coll.indexes.forEach(function (ix) {
      if (chosen) return;
      var ixFields = Object.keys(ix.key);
      for (var i = 0; i < fields.length && !chosen; i++) {
        for (var j = 0; j < ixFields.length; j++) {
          if (fields[i] === ixFields[j] || fields[i].indexOf(ixFields[j] + ".") === 0 || ixFields[j].indexOf(fields[i] + ".") === 0) {
            chosen = ix;
            break;
          }
        }
      }
    });
    var matched = new (engine().Query)(cursor.filter).find(coll.docs).all().length;
    var total = coll.docs.length;
    var plan = {
      queryPlanner: {
        namespace: coll.db.name + "." + coll.name,
        winningPlan: chosen
          ? { stage: "FETCH", inputStage: { stage: "IXSCAN", indexName: chosen.name, keyPattern: chosen.key, isMultiKey: isMultiKey(coll, Object.keys(chosen.key)[0]) } }
          : { stage: "COLLSCAN", direction: "forward" }
      },
      executionStats: {
        nReturned: matched,
        totalKeysExamined: chosen ? matched : 0,
        totalDocsExamined: chosen ? matched : total
      }
    };
    var note = chosen
      ? "IXSCAN via index \"" + chosen.name + "\" — only " + matched + " document(s) examined (a collection scan would have examined " + total + ")."
      : "COLLSCAN — every one of the " + total + " document(s) was examined. Create an index (createIndex) to turn this into an IXSCAN.";
    return { plan: plan, note: note };
  }

  /* ================= database ================= */
  function Database(name, server) {
    this.name = name;
    this.server = server;
    this.collections = Object.create(null);
    this.order = [];
  }
  Database.prototype.getCollection = function (name) {
    var c = this.collections[name];
    if (!c) {
      c = new Collection(name, this);
      this.collections[name] = c;
      this.order.push(name);
    }
    return c;
  };
  Database.prototype.peek = function (name) { return this.collections[name]; };
  Database.prototype.listCollections = function () {
    var self = this;
    return this.order.filter(function (n) { return self.collections[n]; }).map(function (n) { return self.collections[n]; });
  };
  Database.prototype._remove = function (name) {
    delete this.collections[name];
    this.order = this.order.filter(function (n) { return n !== name; });
  };
  Database.prototype.dropDatabase = function () {
    this.collections = Object.create(null);
    this.order = [];
    return { ok: 1, dropped: this.name };
  };
  Database.prototype.stats = function () {
    var colls = this.listCollections();
    var docs = 0, indexes = 0;
    colls.forEach(function (c) { docs += c.docs.length; indexes += c.indexes.length; });
    return { db: this.name, collections: colls.length, documents: docs, indexes: indexes, ok: 1 };
  };

  var RESERVED = { then: 1, catch: 1, finally: 1, toJSON: 1, inspect: 1, constructor: 1, prototype: 1, toString: 1, valueOf: 1, nodeType: 1 };

  function dbProxy(db) {
    var api = {
      getName: function () { return db.name; },
      getCollection: function (n) { return db.getCollection(n); },
      createCollection: function (n) { db.getCollection(n); return { ok: 1 }; },
      getCollectionNames: function () { return db.listCollections().map(function (c) { return c.name; }); },
      listCollections: function () { return db.listCollections().map(function (c) { return { name: c.name, type: "collection" }; }); },
      stats: function () { return db.stats(); },
      version: function () { return "7.0.0"; },
      dropDatabase: function () { return db.dropDatabase(); },
      serverStatus: function () { return { host: "localhost", version: "7.0.0", uptime: 1, ok: 1 }; }
    };
    return new Proxy(api, {
      get: function (t, prop) {
        if (typeof prop !== "string") return t[prop];
        if (Object.prototype.hasOwnProperty.call(t, prop)) return t[prop];
        if (RESERVED[prop]) return undefined;
        return db.getCollection(prop);
      },
      has: function (t, prop) { return typeof prop === "string" ? true : prop in t; }
    });
  }

  /* ================= server / shell ================= */
  function createServer(dbName) {
    var srv = { dbName: dbName || "test", dbs: {}, oid: 0 };
    function getDb(name) {
      var d = srv.dbs[name];
      if (!d) { d = new Database(name, srv); srv.dbs[name] = d; }
      return d;
    }
    srv.current = function () { return getDb(srv.dbName); };
    srv.getDb = getDb;
    return srv;
  }

  function prompt(srv) { return srv.dbName + "> "; }

  function looksLikeSql(s) {
    return /(^|[;\s])(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|FROM\s+\w+\s+WHERE)\b/i.test(s);
  }

  function stripComments(s) {
    var out = "", q = null;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) {
        out += c;
        if (c === "\\") { if (i + 1 < s.length) out += s[++i]; continue; }
        if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { q = c; out += c; continue; }
      if ((c === "#" || (c === "/" && s[i + 1] === "/")) && (i === 0 || /\s/.test(s[i - 1]))) {
        while (i < s.length && s[i] !== "\n") i++;
        if (i < s.length) out += "\n";
        continue;
      }
      out += c;
    }
    return out;
  }

  // True when every bracket/quote opened in `s` has been closed, i.e. the
  // buffered text is a complete command. Lets the widget accept multi-line
  // db.collection.find({...}) + .sort({...}) the way the real mongo shell does.
  function isComplete(s) {
    var q = null, depth = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) {
        if (c === "\\") { i++; continue; }
        if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { q = c; continue; }
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth--;
    }
    return q === null && depth <= 0;
  }

  function splitStatements(s) {
    var out = [], cur = "", q = null, depth = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) {
        cur += c;
        if (c === "\\") { if (i + 1 < s.length) cur += s[++i]; continue; }
        if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { q = c; cur += c; continue; }
      if (c === "(" || c === "[" || c === "{") depth++;
      if (c === ")" || c === "]" || c === "}") depth--;
      if (c === ";" && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function runStatement(srv, stmt) {
    var s = stmt.trim();
    var m;
    if ((m = /^use\s+([A-Za-z0-9_.\-]+)$/i.exec(s))) {
      srv.dbName = m[1];
      return { display: "switched to db " + m[1] };
    }
    if (/^show\s+dbs$/i.test(s)) {
      var names = Object.keys(srv.dbs);
      if (!names.length) return { display: "(no databases yet)" };
      return { display: names.map(function (n) {
        var d = srv.dbs[n];
        var docs = 0;
        d.listCollections().forEach(function (c) { docs += c.docs.length; });
        return n + (n === srv.dbName ? "  (current)" : "") + "  — " + d.listCollections().length + " collection(s), " + docs + " document(s)";
      }).join("\n") };
    }
    if (/^show\s+(collections|tables)$/i.test(s)) {
      var colls = srv.current().listCollections();
      if (!colls.length) return { display: "(no collections in " + srv.dbName + ")" };
      return { display: colls.map(function (c) { return c.name; }).join("\n") };
    }
    if (/^help$/i.test(s)) return { display: "", note: HELP_TEXT };
    if (/^db$/i.test(s)) return { display: srv.dbName };

    var db = dbProxy(srv.current());
    var oidCounter = srv;
    function ObjectId(x) {
      if (x !== undefined) return makeOid(String(x));
      oidCounter.oid = (oidCounter.oid || 0) + 1;
      var hex = oidCounter.oid.toString(16);
      while (hex.length < 4) hex = "0" + hex;
      return makeOid(OID_PREFIX + hex.slice(-4));
    }
    function ISODate(x) { return String(x); }
    function UUID(x) { return String(x); }
    function NumberLong(x) { return Number(x); }
    function NumberDecimal(x) { return Number(x); }

    var fn = new Function("db", "ObjectId", "ISODate", "UUID", "NumberLong", "NumberDecimal",
      '"use strict"; return (' + s + ');');
    return { value: fn(db, ObjectId, ISODate, UUID, NumberLong, NumberDecimal) };
  }

  function describe(v) {
    if (v instanceof Cursor) {
      if (v.explainFlag) {
        var ex = explainPlan(v);
        return { text: fmtValue(ex.plan), note: ex.note };
      }
      var docs = v.toArray();
      if (!docs.length) return { text: "", note: "Fetched 0 document(s)" };
      return { text: docs.map(fmtValue).join("\n"), note: "Fetched " + docs.length + " document(s)" };
    }
    if (Array.isArray(v)) {
      if (!v.length) return { text: "", note: "0 document(s)" };
      return { text: v.map(fmtValue).join("\n"), note: v.length + " document(s)" };
    }
    if (v instanceof Collection) {
      return { text: '[collection "' + v.name + '"]', note: v.docs.length + " document(s), " + v.indexes.length + " index(es)" };
    }
    if (v === undefined) return { text: "(no output)", note: null };
    return { text: fmtValue(v), note: null };
  }

  function formatPart(part) {
    if (part.error) return { error: part.error, sql: part.sql };
    if (part.display !== undefined) return { text: part.display, note: part.note || null, display: true };
    var d = describe(part.value);
    return { text: d.text, note: part.note || d.note, display: false };
  }

  function execute(srv, raw) {
    var line = String(raw).replace(/\s+$/, "");
    if (!line.trim()) return null;
    if (/^\s*(\/\/|#)/.test(line)) return { kind: "comment", text: line.trim() };
    var command = stripComments(line).replace(/\s+$/, "");
    if (!command.trim()) return null;
    var p = prompt(srv);
    var statements = splitStatements(command);
    var parts = [];
    statements.forEach(function (st) {
      try {
        parts.push(formatPart(runStatement(srv, st)));
      } catch (e) {
        parts.push({ error: (e && e.message) || String(e), sql: looksLikeSql(st) });
      }
    });
    if (!parts.length) return null;
    return { kind: "cmd", prompt: p, line: command, parts: parts };
  }

  /* ================= rendering ================= */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function Console(out) {
    this.pre = document.createElement("pre");
    this.pre.className = "mongo-out";
    out.appendChild(this.pre);
  }
  Console.prototype.write = function (text, cls) {
    var span = document.createElement("span");
    if (cls) span.className = cls;
    span.textContent = text;
    this.pre.appendChild(span);
  };
  Console.prototype.nl = function () { this.pre.appendChild(document.createTextNode("\n")); };

  function writeResult(con, r) {
    if (r.kind === "comment") { con.write(r.text, "rcmt"); con.nl(); return; }
    con.write(r.prompt, "rp");
    con.write(r.line, "rc");
    con.nl();
    r.parts.forEach(function (part) {
      if (part.error) {
        con.write("uncaught exception: " + part.error, "rerr");
        con.nl();
        if (part.sql) { con.write("hint: " + SQL_HINT, "rhint"); con.nl(); }
        return;
      }
      if (part.text) { con.write(part.text, part.display ? "rnote" : "rval"); con.nl(); }
      if (part.note) { con.write(part.note, "rnote"); con.nl(); }
    });
  }

  function sampleFields(c) {
    var fields = [];
    c.docs.forEach(function (d) {
      Object.keys(d).forEach(function (k) { if (k !== "_id" && fields.indexOf(k) === -1 && fields.length < 6) fields.push(k); });
    });
    return fields.length ? fields.join(", ") : "—";
  }

  function renderCollections(out, srv) {
    var db = srv.current();
    var colls = db.listCollections();
    var wrap = document.createElement("div");
    wrap.className = "mongo-collections";
    var head = document.createElement("div");
    head.className = "rk-head";
    head.textContent = "Database \"" + db.name + "\" · " + colls.length + " collection" + (colls.length === 1 ? "" : "s");
    wrap.appendChild(head);
    if (!colls.length) {
      var empty = document.createElement("div");
      empty.className = "rk-empty";
      empty.textContent = "(empty — no collections in this database)";
      wrap.appendChild(empty);
      out.appendChild(wrap);
      return;
    }
    var html = "<table><thead><tr><th>collection</th><th>docs</th><th>indexes</th><th>fields</th></tr></thead><tbody>";
    colls.forEach(function (c) {
      var idx = c.indexes.map(function (ix) { return ix.name; }).join(", ");
      html += "<tr><td><code>" + esc(c.name) + "</code></td><td>" + c.docs.length + "</td><td><code>" + esc(idx) + "</code></td><td>" + esc(sampleFields(c)) + "</td></tr>";
    });
    html += "</tbody></table>";
    var holder = document.createElement("div");
    holder.innerHTML = html;
    wrap.appendChild(holder);
    out.appendChild(wrap);
  }

  /* ================= widget mounting ================= */
  function loadSetup(srv, setup) {
    if (!setup) return;
    setup.split("\n").forEach(function (l) {
      if (!l.trim()) return;
      try { execute(srv, l); } catch (e) { /* setup errors are ignored */ }
    });
  }

  function mountMongo(widget) {
    var ta = widget.querySelector("textarea");
    if (!ta) return;
    var setup = ta.getAttribute("data-setup") || "";
    var body = widget.querySelector(".widget-body") || widget;

    var hint = document.createElement("div");
    hint.className = "mongo-hint";
    hint.textContent = "MongoDB shell — one command per line. Lines starting with // or # are comments. Type help for the command list.";
    if (ta.nextSibling) body.insertBefore(hint, ta.nextSibling); else body.appendChild(hint);

    var btn = document.createElement("button");
    btn.className = "run-btn";
    btn.textContent = "Run ▶";
    var out = document.createElement("div");
    out.className = "result";
    body.appendChild(btn);
    body.appendChild(out);

    btn.addEventListener("click", function () {
      out.innerHTML = "";
      var srv = createServer();
      loadSetup(srv, setup);
      var con = new Console(out);
      var buffer = "";
      function flush(text) {
        var r = execute(srv, text);
        if (r) writeResult(con, r);
      }
      ta.value.split("\n").forEach(function (l) {
        var t = l.trim();
        if (!buffer && (!t || /^(\/\/|#)/.test(t))) { if (t) flush(l); return; }
        if (!buffer && !t) return;
        buffer = buffer ? buffer + "\n" + l : l;
        if (isComplete(buffer)) { flush(buffer); buffer = ""; }
      });
      if (buffer.trim()) flush(buffer);
      renderCollections(out, srv);
    });
  }

  function mountWidgets() {
    document.querySelectorAll('[data-widget="mongo"]').forEach(mountMongo);
  }

  global.MongoSim = { mountWidgets: mountWidgets, createServer: createServer, execute: execute, describe: describe, fmtValue: fmtValue, isComplete: isComplete };
})(typeof window !== "undefined" ? window : this);
