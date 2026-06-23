-- 清理冗余索引

-- idx_memo_tag_covering (tag, memo_id) 已完全覆盖 idx_memo_tag_tag (tag)
-- 覆盖索引以 tag 开头，能服务所有 tag 查询场景，且额外包含 memo_id 避免回表
DROP INDEX IF EXISTS idx_memo_tag_tag;

-- idx_memo_creator_status_pinned_created (creator_id, row_status, pinned, created_ts DESC)
-- 已完全覆盖 idx_memo_creator_created_ts (creator_id, created_ts DESC)
DROP INDEX IF EXISTS idx_memo_creator_created_ts;
