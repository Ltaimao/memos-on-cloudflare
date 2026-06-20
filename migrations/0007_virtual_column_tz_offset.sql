-- 重建虚拟列，加入 UTC+8 时区偏移（28800 秒）
-- 解决 strftime('%Y-%m-%w', created_ts, 'unixepoch') 按 UTC 计算导致的时区 bug

-- 1. 删除旧索引
DROP INDEX IF EXISTS idx_memo_month_day;
DROP INDEX IF EXISTS idx_memo_year;
DROP INDEX IF EXISTS idx_memo_year_day;
DROP INDEX IF EXISTS idx_memo_year_month_weekday;
DROP INDEX IF EXISTS idx_memo_creator_month_day;
DROP INDEX IF EXISTS idx_memo_creator_year;
DROP INDEX IF EXISTS idx_memo_creator_year_day;
DROP INDEX IF EXISTS idx_memo_creator_year_month_weekday;

-- 2. 删除旧虚拟列
ALTER TABLE memo DROP COLUMN month_day;
ALTER TABLE memo DROP COLUMN year;
ALTER TABLE memo DROP COLUMN year_day;
ALTER TABLE memo DROP COLUMN year_month_weekday;

-- 3. 重建虚拟列，加入 UTC+8 偏移（28800 = 8 * 3600 秒）
ALTER TABLE memo ADD COLUMN month_day TEXT
  GENERATED ALWAYS AS (strftime('%m-%d', created_ts + 28800, 'unixepoch')) VIRTUAL;

ALTER TABLE memo ADD COLUMN year TEXT
  GENERATED ALWAYS AS (strftime('%Y', created_ts + 28800, 'unixepoch')) VIRTUAL;

ALTER TABLE memo ADD COLUMN year_day TEXT
  GENERATED ALWAYS AS (strftime('%Y-%d', created_ts + 28800, 'unixepoch')) VIRTUAL;

ALTER TABLE memo ADD COLUMN year_month_weekday TEXT
  GENERATED ALWAYS AS (strftime('%Y-%m-%w', created_ts + 28800, 'unixepoch')) VIRTUAL;

-- 4. 重建索引
CREATE INDEX idx_memo_month_day ON memo(month_day);
CREATE INDEX idx_memo_year ON memo(year);
CREATE INDEX idx_memo_year_day ON memo(year_day);
CREATE INDEX idx_memo_year_month_weekday ON memo(year_month_weekday);

CREATE INDEX idx_memo_creator_month_day ON memo(creator_id, month_day);
CREATE INDEX idx_memo_creator_year ON memo(creator_id, year);
CREATE INDEX idx_memo_creator_year_day ON memo(creator_id, year_day);
CREATE INDEX idx_memo_creator_year_month_weekday ON memo(creator_id, year_month_weekday);
