-- 为时间旅行查询添加虚拟列和索引

-- 1. 添加虚拟列（VIRTUAL 类型，不存储数据，每次查询时计算）
ALTER TABLE memo ADD COLUMN month_day TEXT
  GENERATED ALWAYS AS (strftime('%m-%d', created_ts, 'unixepoch')) VIRTUAL;

ALTER TABLE memo ADD COLUMN year TEXT
  GENERATED ALWAYS AS (strftime('%Y', created_ts, 'unixepoch')) VIRTUAL;

ALTER TABLE memo ADD COLUMN year_day TEXT
  GENERATED ALWAYS AS (strftime('%Y-%d', created_ts, 'unixepoch')) VIRTUAL;

ALTER TABLE memo ADD COLUMN year_month_weekday TEXT
  GENERATED ALWAYS AS (strftime('%Y-%m-%w', created_ts, 'unixepoch')) VIRTUAL;

-- 2. 为虚拟列创建索引
CREATE INDEX idx_memo_month_day ON memo(month_day);
CREATE INDEX idx_memo_year ON memo(year);
CREATE INDEX idx_memo_year_day ON memo(year_day);
CREATE INDEX idx_memo_year_month_weekday ON memo(year_month_weekday);

-- 3. 组合索引（包含 creator_id，用于用户级查询）
CREATE INDEX idx_memo_creator_month_day ON memo(creator_id, month_day);
CREATE INDEX idx_memo_creator_year ON memo(creator_id, year);
CREATE INDEX idx_memo_creator_year_day ON memo(creator_id, year_day);
CREATE INDEX idx_memo_creator_year_month_weekday ON memo(creator_id, year_month_weekday);

-- 4. 为 displayTime 查询创建索引（不包含 creator_id，用于全局日期过滤）
CREATE INDEX idx_memo_created_ts ON memo(created_ts DESC);

-- 为用户级时间查询创建组合索引
CREATE INDEX idx_memo_creator_created_ts ON memo(creator_id, created_ts DESC);
