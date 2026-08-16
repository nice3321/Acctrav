CREATE TABLE commission_cycles (
      id            TEXT PRIMARY KEY,
      period_id     TEXT NOT NULL UNIQUE REFERENCES periods(id) ON DELETE CASCADE,
      state         TEXT NOT NULL DEFAULT 'draft'
                    CHECK (state IN ('draft','review','approved','paid','void')),
      model         TEXT NOT NULL CHECK (model IN ('target','legacy')),
      -- Frozen copy of the policy + totals the figures were produced from, so an
      -- approved cycle stays explainable even after the live policy changes.
      snapshot      TEXT NOT NULL,
      pool_halalas  INTEGER NOT NULL DEFAULT 0,
      computed_at   TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_by   TEXT, reviewed_at TEXT,
      approved_by   TEXT, approved_at TEXT,
      paid_by       TEXT, paid_at     TEXT,
      void_reason   TEXT
    );

    CREATE TABLE commission_items (
      cycle_id       TEXT NOT NULL REFERENCES commission_cycles(id) ON DELETE CASCADE,
      employee_id    TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      base_halalas   INTEGER NOT NULL DEFAULT 0 CHECK (base_halalas >= 0),
      vat_halalas    INTEGER NOT NULL DEFAULT 0 CHECK (vat_halalas  >= 0),
      detail         TEXT NOT NULL,
      PRIMARY KEY (cycle_id, employee_id)
    );

    CREATE TABLE department_incentives (
      cycle_id       TEXT NOT NULL REFERENCES commission_cycles(id) ON DELETE CASCADE,
      department_id  TEXT NOT NULL,
      name           TEXT NOT NULL,
      rate_bp        INTEGER NOT NULL DEFAULT 0,
      amount_halalas INTEGER NOT NULL DEFAULT 0 CHECK (amount_halalas >= 0),
      vat_halalas    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (cycle_id, department_id)
    );

    CREATE TABLE adjustments (
      id             TEXT PRIMARY KEY,
      cycle_id       TEXT NOT NULL REFERENCES commission_cycles(id) ON DELETE CASCADE,
      employee_id    TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      amount_halalas INTEGER NOT NULL,
      note           TEXT NOT NULL,
      created_by     TEXT NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_adj_cycle ON adjustments(cycle_id);

    CREATE TABLE payouts (
      id              TEXT PRIMARY KEY,
      cycle_id        TEXT NOT NULL REFERENCES commission_cycles(id) ON DELETE CASCADE,
      -- One payout run per cycle: the unique key is what makes a double-click,
      -- a retry, or two CFOs clicking at once land as a single transfer.
      idempotency_key TEXT NOT NULL UNIQUE,
      total_halalas   INTEGER NOT NULL CHECK (total_halalas >= 0),
      paid_by         TEXT NOT NULL,
      paid_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE name_matches (
      id            TEXT PRIMARY KEY,
      raw_name      TEXT NOT NULL,
      source        TEXT NOT NULL,
      suggested_id  TEXT REFERENCES employees(id) ON DELETE SET NULL,
      confidence    TEXT NOT NULL,
      resolved      INTEGER NOT NULL DEFAULT 0,
      resolution    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
