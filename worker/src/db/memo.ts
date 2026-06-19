export interface MemoRow {
  id: number;
  uid: string;
  creator_id: number;
  created_ts: number;
  updated_ts: number;
  row_status: string;
  content: string;
  visibility: string;
  pinned: number;
  is_comment: number;
  payload: string;
}

export interface ListMemosOpts {
  creatorId?: number;
  rowStatus?: string;
  visibility?: string;
  visibilities?: string[];
  excludeComments?: boolean;
  pinned?: boolean;
  contentSearch?: string;
  tagSearch?: string;
  createdTsAfter?: number;
  createdTsBefore?: number;
  filterWhere?: string;
  filterParams?: (string | number)[];
  pageSize?: number;
  offset?: number;
  orderBy?: string;
  /** "MM-DD" format, e.g. "06-17" — match past years same month+day */
  sameDayAcrossYears?: string;
  /** "YYYY-DD" format, e.g. "2026-17" — match each month of the current year on the same day */
  sameDayEachMonth?: string;
  /** "YYYY-MM-W" format, e.g. "2026-06-3" — match each same weekday in the month */
  sameWeekdayInMonth?: string;
}

export async function createMemo(
  db: D1Database,
  data: {
    uid: string;
    creatorId: number;
    content: string;
    visibility: string;
    payload?: string;
    createdTs?: number;
    updatedTs?: number;
    pinned?: boolean;
    isComment?: boolean;
  }
): Promise<MemoRow> {
  const payload = data.payload || "{}";
  const pinned = data.pinned ? 1 : 0;
  const isComment = data.isComment ? 1 : 0;

  let query: string;
  let params: (string | number)[];

  if (data.createdTs && data.updatedTs) {
    query = `INSERT INTO memo (uid, creator_id, content, visibility, payload, pinned, is_comment, created_ts, updated_ts)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`;
    params = [data.uid, data.creatorId, data.content, data.visibility, payload, pinned, isComment, data.createdTs, data.updatedTs];
  } else {
    query = `INSERT INTO memo (uid, creator_id, content, visibility, payload, pinned, is_comment)
             VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`;
    params = [data.uid, data.creatorId, data.content, data.visibility, payload, pinned, isComment];
  }

  return (await db.prepare(query).bind(...params).first<MemoRow>())!;
}

export async function getMemoByUid(
  db: D1Database,
  uid: string
): Promise<MemoRow | null> {
  return db.prepare("SELECT * FROM memo WHERE uid = ?").bind(uid).first<MemoRow>();
}

export async function getMemoById(
  db: D1Database,
  id: number
): Promise<MemoRow | null> {
  return db.prepare("SELECT * FROM memo WHERE id = ?").bind(id).first<MemoRow>();
}

export async function listMemos(
  db: D1Database,
  opts: ListMemosOpts
): Promise<{ memos: MemoRow[]; total: number }> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts.creatorId !== undefined) {
    conditions.push("creator_id = ?");
    params.push(opts.creatorId);
  }
  if (opts.rowStatus) {
    conditions.push("row_status = ?");
    params.push(opts.rowStatus);
  }
  if (opts.visibility) {
    conditions.push("visibility = ?");
    params.push(opts.visibility);
  }
  if (opts.visibilities && opts.visibilities.length > 0) {
    const placeholders = opts.visibilities.map(() => "?").join(", ");
    conditions.push(`visibility IN (${placeholders})`);
    params.push(...opts.visibilities);
  }
  if (opts.pinned !== undefined) {
    conditions.push("pinned = ?");
    params.push(opts.pinned ? 1 : 0);
  }
  if (opts.excludeComments) {
    conditions.push("is_comment = 0");
  }
  if (opts.contentSearch) {
    conditions.push("content LIKE ?");
    params.push(`%${opts.contentSearch}%`);
  }
  if (opts.tagSearch) {
    conditions.push("payload LIKE ?");
    params.push(`%${opts.tagSearch}%`);
  }
  if (opts.createdTsAfter !== undefined) {
    conditions.push("created_ts >= ?");
    params.push(opts.createdTsAfter);
  }
  if (opts.createdTsBefore !== undefined) {
    conditions.push("created_ts < ?");
    params.push(opts.createdTsBefore);
  }
  if (opts.filterWhere) {
    conditions.push(`(${opts.filterWhere})`);
    params.push(...(opts.filterParams || []));
  }
  if (opts.sameDayAcrossYears) {
    // 使用虚拟列，可以使用索引（性能提升 10-100 倍）
    conditions.push("memo.month_day = ?");
    // 排除当前年份（今天的"同日"不算"往年同日"）
    conditions.push("memo.year != ?");
    params.push(opts.sameDayAcrossYears, String(new Date().getFullYear()));
  }
  if (opts.sameDayEachMonth) {
    // 使用虚拟列，可以使用索引
    conditions.push("memo.year_day = ?");
    params.push(opts.sameDayEachMonth);
  }
  if (opts.sameWeekdayInMonth) {
    // 使用虚拟列，可以使用索引
    conditions.push("memo.year_month_weekday = ?");
    params.push(opts.sameWeekdayInMonth);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countQuery = `SELECT COUNT(*) as total FROM memo ${where}`;
  const countResult = await db.prepare(countQuery).bind(...params).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  let orderClause = "ORDER BY pinned DESC, created_ts DESC";
  if (opts.orderBy) {
    const allowedOrderColumns = new Set(["id", "created_ts", "updated_ts", "pinned"]);
    const parts = opts.orderBy.split(",").map((p) => p.trim());
    const orderParts: string[] = [];
    for (const part of parts) {
      const [field, dir] = part.split(" ");
      const col = field === "create_time" ? "created_ts" : field === "update_time" ? "updated_ts" : field;
      if (allowedOrderColumns.has(col)) {
        orderParts.push(`${col} ${dir?.toUpperCase() === "ASC" ? "ASC" : "DESC"}`);
      }
    }
    if (orderParts.length > 0) {
      orderClause = `ORDER BY ${orderParts.join(", ")}`;
    }
  }

  const pageSize = opts.pageSize || 50;
  const offset = opts.offset || 0;

  const dataQuery = `SELECT * FROM memo ${where} ${orderClause} LIMIT ? OFFSET ?`;
  const allParams = [...params, pageSize, offset];
  const { results } = await db.prepare(dataQuery).bind(...allParams).all<MemoRow>();

  return { memos: results, total };
}

export async function updateMemo(
  db: D1Database,
  id: number,
  data: Partial<{
    content: string;
    visibility: string;
    pinned: number;
    row_status: string;
    payload: string;
    is_comment: number;
    created_ts: number;
    updated_ts: number;
  }>
): Promise<MemoRow | null> {
  const fields: string[] = [];
  const values: (string | number)[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return getMemoById(db, id);

  if (!data.updated_ts) {
    fields.push("updated_ts = strftime('%s', 'now')");
  }
  values.push(id);

  const query = `UPDATE memo SET ${fields.join(", ")} WHERE id = ? RETURNING *`;
  return db.prepare(query).bind(...values).first<MemoRow>();
}

export async function deleteMemo(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM memo WHERE id = ?").bind(id).run();
}
