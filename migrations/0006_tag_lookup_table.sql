-- 标签查找表：将 payload.tags JSON 数组拆分为独立行，支持索引查询
CREATE TABLE IF NOT EXISTS memo_tag (
  memo_id INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  FOREIGN KEY (memo_id) REFERENCES memo(id) ON DELETE CASCADE
);

CREATE INDEX idx_memo_tag_tag ON memo_tag(tag);
CREATE INDEX idx_memo_tag_memo_id ON memo_tag(memo_id);
CREATE INDEX idx_memo_tag_creator_tag ON memo_tag(creator_id, tag);

-- 回填现有标签数据
INSERT INTO memo_tag (memo_id, creator_id, tag)
  SELECT m.id, m.creator_id, je.value
  FROM memo m, json_each(m.payload, '$.tags') je
  WHERE json_array_length(json_extract(m.payload, '$.tags')) > 0;

-- 标记评论 memo，避免查询时 json_extract 解析
ALTER TABLE memo ADD COLUMN is_comment INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_memo_is_comment ON memo(is_comment);

-- 回填评论标记
UPDATE memo SET is_comment = 1
  WHERE json_extract(payload, '$.parent') IS NOT NULL
    AND json_extract(payload, '$.parent') != '';
