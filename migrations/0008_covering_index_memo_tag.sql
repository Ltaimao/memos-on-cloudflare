-- Covering index for tag search: allows EXISTS subquery to be satisfied entirely from the index
CREATE INDEX IF NOT EXISTS idx_memo_tag_covering ON memo_tag(tag, memo_id);
