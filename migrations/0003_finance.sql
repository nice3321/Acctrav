CREATE TABLE expense_categories (
      id    TEXT PRIMARY KEY,
      name  TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6E6E73'
    );

    CREATE TABLE expenses (
      id             TEXT PRIMARY KEY,
      spent_on       TEXT NOT NULL,
      category_id    TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
      description    TEXT NOT NULL,
      vendor         TEXT,
      amount_halalas INTEGER NOT NULL CHECK (amount_halalas > 0),
      method         TEXT NOT NULL DEFAULT 'bank' CHECK (method IN ('bank','cash')),
      created_by     TEXT NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_expense_month ON expenses(spent_on);

    CREATE TABLE budgets (
      ym                    TEXT PRIMARY KEY,
      revenue_halalas       INTEGER NOT NULL DEFAULT 0 CHECK (revenue_halalas      >= 0),
      gross_profit_halalas  INTEGER NOT NULL DEFAULT 0 CHECK (gross_profit_halalas >= 0),
      expenses_halalas      INTEGER NOT NULL DEFAULT 0 CHECK (expenses_halalas     >= 0)
    );
