-- 把 payload 里的布尔属性（hasLink/hasCode/hasTaskList/hasIncompleteTask）
-- 改成虚拟生成列 + 索引，避免 json_extract 在 WHERE 里造成全表扫描。

ALTER TABLE memo ADD COLUMN has_link INTEGER
  GENERATED ALWAYS AS (COALESCE(json_extract(payload, '$.property.hasLink'), 0)) VIRTUAL;

ALTER TABLE memo ADD COLUMN has_code INTEGER
  GENERATED ALWAYS AS (COALESCE(json_extract(payload, '$.property.hasCode'), 0)) VIRTUAL;

ALTER TABLE memo ADD COLUMN has_task_list INTEGER
  GENERATED ALWAYS AS (COALESCE(json_extract(payload, '$.property.hasTaskList'), 0)) VIRTUAL;

ALTER TABLE memo ADD COLUMN has_incomplete_task INTEGER
  GENERATED ALWAYS AS (COALESCE(json_extract(payload, '$.property.hasIncompleteTask'), 0)) VIRTUAL;

CREATE INDEX IF NOT EXISTS idx_memo_has_link ON memo(has_link);
CREATE INDEX IF NOT EXISTS idx_memo_has_code ON memo(has_code);
CREATE INDEX IF NOT EXISTS idx_memo_has_task_list ON memo(has_task_list);
CREATE INDEX IF NOT EXISTS idx_memo_has_incomplete_task ON memo(has_incomplete_task);
