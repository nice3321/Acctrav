CREATE TABLE employees (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','excluded')),
      target_halalas INTEGER NOT NULL DEFAULT 0 CHECK (target_halalas >= 0),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE employee_aliases (
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      alias       TEXT NOT NULL,
      PRIMARY KEY (employee_id, alias)
    );
    CREATE INDEX idx_alias ON employee_aliases(alias);

    CREATE TABLE users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      salt          TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('owner','cfo','sales_manager','employee')),
      employee_id   TEXT REFERENCES employees(id) ON DELETE SET NULL,
      active        INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_session_user ON sessions(user_id);

    CREATE TABLE periods (
      id                   TEXT PRIMARY KEY,
      label                TEXT NOT NULL,
      start_date           TEXT NOT NULL,
      end_date             TEXT NOT NULL,
      source               TEXT,
      monthly_cost_halalas INTEGER NOT NULL DEFAULT 0 CHECK (monthly_cost_halalas >= 0),
      created_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_period_start ON periods(start_date);

    CREATE TABLE sales_rows (
      period_id      TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
      employee_id    TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      sales_halalas  INTEGER NOT NULL DEFAULT 0,
      profit_halalas INTEGER NOT NULL DEFAULT 0,
      sale_count     INTEGER,
      refund_count   INTEGER,
      PRIMARY KEY (period_id, employee_id)
    );

    CREATE TABLE transactions (
      id             TEXT PRIMARY KEY,
      period_id      TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
      employee_id    TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      tx_date        TEXT NOT NULL,
      service        TEXT,
      price_halalas  INTEGER NOT NULL DEFAULT 0,
      profit_halalas INTEGER NOT NULL DEFAULT 0,
      channel        TEXT,
      notes          TEXT
    );
    CREATE INDEX idx_tx_period_emp ON transactions(period_id, employee_id);

    CREATE TABLE policy (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      body        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
      approved_by TEXT,
      approved_at TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE audit_events (
      id         TEXT PRIMARY KEY,
      at         TEXT NOT NULL DEFAULT (datetime('now')),
      actor_id   TEXT,
      actor_name TEXT NOT NULL,
      action     TEXT NOT NULL,
      entity     TEXT,
      entity_id  TEXT,
      details    TEXT NOT NULL
    );
    CREATE INDEX idx_audit_at ON audit_events(at DESC);
