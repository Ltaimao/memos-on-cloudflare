-- 为 displayTime 查询创建索引（不包含 creator_id，用于全局日期过滤）

CREATE INDEX idx_memo_created_ts ON memo(created_ts DESC);
