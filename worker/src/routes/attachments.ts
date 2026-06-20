import { Hono } from "hono";
import type { Env, UserPayload } from "../types";
import { authOptional, authRequired } from "../middleware/auth";
import * as settingDB from "../db/setting";
import { createErrorBody } from "../error";
import { deleteCachedKeys } from "../cache";

declare function createImageBitmap(blob: Blob): Promise<ImageBitmap>;
declare class OffscreenCanvas {
  constructor(width: number, height: number);
  getContext(type: "2d"): OffscreenCanvasRenderingContext2D | null;
  convertToBlob(options?: { type?: string; quality?: number }): Promise<Blob>;
}
type ImageBitmap = { width: number; height: number; close(): void };
type OffscreenCanvasRenderingContext2D = {
  drawImage(bitmap: ImageBitmap, x: number, y: number, w: number, h: number): void;
};

type AttApp = { Bindings: Env; Variables: { user: UserPayload } };

export const attachmentRoutes = new Hono<AttApp>();

export interface AttachmentRow {
  id: number;
  uid: string;
  creator_id: number;
  created_ts: number;
  updated_ts: number;
  filename: string;
  type: string;
  size: number;
  memo_id: number | null;
  storage_type: string;
  reference: string;
  payload: string;
}

const THUMBNAIL_PREFIX = "thumb__";
const THUMBNAIL_MAX = 400;
const THUMBNAIL_SM_PREFIX = "thumb_sm__";
const THUMBNAIL_SM_MAX = 200;
const SUPPORTED_THUMB_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function thumbnailKey(ref: string): string {
  const parts = ref.split("/");
  const file = parts.pop()!;
  return [...parts, THUMBNAIL_PREFIX + file].join("/");
}

function thumbnailSmKey(ref: string): string {
  const parts = ref.split("/");
  const file = parts.pop()!;
  return [...parts, THUMBNAIL_SM_PREFIX + file].join("/");
}

async function generateThumbnail(data: ArrayBuffer, mimeType: string, maxSize = THUMBNAIL_MAX): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([data], { type: mimeType }));
    const { width, height } = bitmap;
    let tw: number, th: number;
    if (width > height) {
      tw = Math.min(width, maxSize);
      th = Math.round((tw / width) * height);
    } else {
      th = Math.min(height, maxSize);
      tw = Math.round((th / height) * width);
    }
    const canvas = new OffscreenCanvas(tw, th);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, tw, th);
    bitmap.close();
    return canvas.convertToBlob({ type: "image/webp", quality: 0.7 });
  } catch {
    return null;
  }
}

const nowTs = () => Math.floor(Date.now() / 1000);

function formatAttachment(att: AttachmentRow) {
  return {
    id: att.id,
    name: `attachments/${att.uid}`,
    uid: att.uid,
    creatorId: att.creator_id,
    createTime: new Date(att.created_ts * 1000).toISOString(),
    updateTime: new Date(att.updated_ts * 1000).toISOString(),
    filename: att.filename,
    type: att.type,
    size: att.size,
    memoId: att.memo_id,
    storageType: att.storage_type,
    reference: att.reference,
  };
}

function decodeBase64Content(content: string): ArrayBuffer {
  const base64 = content.includes(",") ? content.slice(content.indexOf(",") + 1) : content;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

type MemoTargetResolution = { memoId: number | null } | { error: string; status: 403 | 404 };

async function resolveWritableMemoId(db: D1Database, user: UserPayload, memoName?: string | number | null): Promise<MemoTargetResolution> {
  if (memoName === undefined || memoName === null || memoName === "") {
    return { memoId: null };
  }

  const memoToken = String(memoName);
  const uid = memoToken.startsWith("memos/") ? memoToken.slice("memos/".length) : memoToken;
  const memo = await db.prepare("SELECT id, creator_id FROM memo WHERE uid = ? OR id = ?")
    .bind(uid, Number(uid) || 0)
    .first<{ id: number; creator_id: number }>();
  if (!memo) {
    return { error: "Memo not found", status: 404 };
  }
  if (memo.creator_id !== user.id && user.role !== "ADMIN") {
    return { error: "Permission denied", status: 403 };
  }
  return { memoId: memo.id };
}

async function findAttachmentByToken(db: D1Database, token: string): Promise<AttachmentRow | null> {
  const normalized = token.startsWith("attachments/") ? token.slice("attachments/".length) : token;
  return db.prepare("SELECT * FROM attachment WHERE uid = ? OR id = ?")
    .bind(normalized, Number(normalized) || 0)
    .first<AttachmentRow>();
}

async function getAttachmentReadDeniedStatus(db: D1Database, att: AttachmentRow, user: UserPayload | undefined): Promise<401 | 403 | undefined> {
  if (!att.memo_id) {
    return user && (att.creator_id === user.id || user.role === "ADMIN") ? undefined : 403;
  }

  const memo = await db.prepare("SELECT visibility, creator_id FROM memo WHERE id = ?")
    .bind(att.memo_id)
    .first<{ visibility: string; creator_id: number }>();
  if (!memo) {
    return user && (att.creator_id === user.id || user.role === "ADMIN") ? undefined : 403;
  }
  if (memo.visibility === "PRIVATE" && (!user || user.id !== memo.creator_id)) {
    return 403;
  }
  if (memo.visibility === "PROTECTED" && !user) {
    return 401;
  }
  return undefined;
}

const DEFAULT_MAX_UPLOAD_SIZE_MB = 100;

const getMaxUploadSizeMb = async (db: D1Database) => {
  const setting = await settingDB.getInstanceSetting(db, "STORAGE");
  if (!setting) {
    return DEFAULT_MAX_UPLOAD_SIZE_MB;
  }
  try {
    const parsed = JSON.parse(setting.value) || {};
    const limit = Number(parsed.uploadSizeLimitMb);
    return limit > 0 ? limit : DEFAULT_MAX_UPLOAD_SIZE_MB;
  } catch {
    return DEFAULT_MAX_UPLOAD_SIZE_MB;
  }
};

// Upload attachment
attachmentRoutes.post("/", authRequired, async (c) => {
  const user = c.get("user");
  const contentType = c.req.header("content-type") || "";
  const maxUploadSizeMb = await getMaxUploadSizeMb(c.env.DB);
  const maxUploadSize = maxUploadSizeMb * 1024 * 1024;

  let filename: string;
  let fileType: string;
  let fileData: ArrayBuffer;
  let memoId: number | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    const file = (formData.get("file") || formData.get("attachment") || formData.get("content")) as File | null;
    if (!file) return c.json({ error: "No file provided" }, 400);
    if (file.size > maxUploadSize) {
      return c.json(
        createErrorBody(`File too large. Maximum upload size is ${maxUploadSizeMb}MB.`, {
          errorKey: "message.maximum-upload-size-is",
          errorParams: { size: maxUploadSizeMb },
        }),
        413,
      );
    }
    filename = file.name;
    fileType = file.type;
    fileData = await file.arrayBuffer();
    const resolvedMemo = await resolveWritableMemoId(c.env.DB, user, formData.get("memo")?.toString() || null);
    if ("error" in resolvedMemo) return c.json({ error: resolvedMemo.error }, resolvedMemo.status);
    memoId = resolvedMemo.memoId;
  } else {
    const body = await c.req.json();
    const attachment = body.attachment || body;
    filename = attachment.filename || "unnamed";
    fileType = attachment.type || "application/octet-stream";
    const resolvedMemo = await resolveWritableMemoId(c.env.DB, user, attachment.memo);
    if ("error" in resolvedMemo) return c.json({ error: resolvedMemo.error }, resolvedMemo.status);
    memoId = resolvedMemo.memoId;

    if (attachment.content) {
      fileData = decodeBase64Content(attachment.content);
      if (fileData.byteLength > maxUploadSize) {
        return c.json(
          createErrorBody(`File too large. Maximum upload size is ${maxUploadSizeMb}MB.`, {
            errorKey: "message.maximum-upload-size-is",
            errorParams: { size: maxUploadSizeMb },
          }),
          413,
        );
      }
    } else {
      return c.json({ error: "No content provided" }, 400);
    }
  }

  const uid = crypto.randomUUID().replace(/-/g, "").slice(0, 22);
  const r2Key = `attachments/${uid}/${filename}`;

  // Store in R2
  await c.env.BUCKET.put(r2Key, fileData, {
    httpMetadata: { contentType: fileType },
  });

  // Best-effort thumbnail generation (runs after response is sent)
  if (SUPPORTED_THUMB_TYPES.has(fileType)) {
    c.executionCtx.waitUntil(
      Promise.all([
        generateThumbnail(fileData, fileType).then(async (blob) => {
          if (blob) {
            await c.env.BUCKET.put(thumbnailKey(r2Key), blob, {
              httpMetadata: { contentType: "image/webp" },
            });
          }
        }),
        generateThumbnail(fileData, fileType, THUMBNAIL_SM_MAX).then(async (blob) => {
          if (blob) {
            await c.env.BUCKET.put(thumbnailSmKey(r2Key), blob, {
              httpMetadata: { contentType: "image/webp" },
            });
          }
        }),
      ]),
    );
  }

  // Store metadata in D1
  const createdTs = nowTs();
  const att = await c.env.DB.prepare(
    `INSERT INTO attachment (uid, creator_id, created_ts, updated_ts, filename, type, size, memo_id, storage_type, reference)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'R2', ?) RETURNING *`
  )
    .bind(uid, user.id, createdTs, createdTs, filename, fileType, fileData.byteLength, memoId, r2Key)
    .first<AttachmentRow>();

  await deleteCachedKeys(c.env.CACHE, ["instance:stats"]);
  return c.json(formatAttachment(att!), 201);
});

// List attachments
attachmentRoutes.get("/", authRequired, async (c) => {
  const user = c.get("user");
  const pageSize = Math.min(Number(c.req.query("pageSize")) || 50, 1000);
  const pageToken = c.req.query("pageToken");
  const filter = c.req.query("filter") || "";
  let offset = 0;
  if (pageToken) {
    try { offset = Number(atob(pageToken)); } catch {}
  }

  const whereConditions = ["creator_id = ?"];
  const params: (string | number | null)[] = [user.id];

  if (filter.includes("memo_id == null") || filter.includes("memo == null")) {
    whereConditions.push("memo_id IS NULL");
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM attachment ${whereClause}`
  ).bind(...params).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM attachment ${whereClause} ORDER BY created_ts DESC LIMIT ? OFFSET ?`
  ).bind(...params, pageSize, offset).all<AttachmentRow>();

  const nextPageToken = offset + pageSize < total ? btoa(String(offset + pageSize)) : "";

  return c.json({
    attachments: results.map(formatAttachment),
    nextPageToken,
    totalSize: total,
  });
});

// Get attachment
attachmentRoutes.get("/:id", authOptional, async (c) => {
  const att = await findAttachmentByToken(c.env.DB, c.req.param("id"));
  if (!att) return c.json({ error: "Not found" }, 404);
  const deniedStatus = await getAttachmentReadDeniedStatus(c.env.DB, att, c.get("user"));
  if (deniedStatus) {
    return c.json({ error: deniedStatus === 401 ? "Authentication required" : "Permission denied" }, deniedStatus);
  }
  return c.json(formatAttachment(att));
});

// Update attachment
attachmentRoutes.patch("/:id", authRequired, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ filename?: string; memoId?: number | null; memo?: string | null }>();

  const att = await findAttachmentByToken(c.env.DB, c.req.param("id"));
  if (!att) return c.json({ error: "Not found" }, 404);
  if (att.creator_id !== user.id && user.role !== "ADMIN") {
    return c.json({ error: "Permission denied" }, 403);
  }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (body.filename !== undefined) { updates.push("filename = ?"); params.push(body.filename); }
  if (body.memoId !== undefined || body.memo !== undefined) {
    const resolvedMemo = await resolveWritableMemoId(c.env.DB, user, body.memo ?? body.memoId ?? null);
    if ("error" in resolvedMemo) return c.json({ error: resolvedMemo.error }, resolvedMemo.status);
    updates.push("memo_id = ?");
    params.push(resolvedMemo.memoId);
  }

  if (updates.length > 0) {
    updates.push("updated_ts = strftime('%s', 'now')");
    params.push(att.id);
    await c.env.DB.prepare(`UPDATE attachment SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...params).run();
  }

  const updated = await c.env.DB.prepare("SELECT * FROM attachment WHERE id = ?")
    .bind(att.id).first<AttachmentRow>();
  return c.json(formatAttachment(updated!));
});

// Delete attachment
attachmentRoutes.delete("/:id", authRequired, async (c) => {
  const user = c.get("user");

  const att = await findAttachmentByToken(c.env.DB, c.req.param("id"));
  if (!att) return c.json({ error: "Not found" }, 404);
  if (att.creator_id !== user.id && user.role !== "ADMIN") {
    return c.json({ error: "Permission denied" }, 403);
  }

  // Delete from R2
  if (att.reference) {
    await c.env.BUCKET.delete(att.reference);
    await c.env.BUCKET.delete(thumbnailKey(att.reference));
    await c.env.BUCKET.delete(thumbnailSmKey(att.reference));
  }

  await c.env.DB.prepare("DELETE FROM attachment WHERE id = ?").bind(att.id).run();
  await deleteCachedKeys(c.env.CACHE, ["instance:stats"]);
  return c.json({});
});

// Batch delete
attachmentRoutes.post("/:action", authRequired, async (c) => {
  const action = c.req.param("action");
  if (action !== "batchDelete") return c.notFound();

  const user = c.get("user");
  const body = await c.req.json<{ ids?: Array<number | string>; names?: string[] }>();

  for (const reference of body.names || body.ids || []) {
    const att = await findAttachmentByToken(c.env.DB, String(reference));
    if (att && (att.creator_id === user.id || user.role === "ADMIN")) {
      if (att.reference) {
        await c.env.BUCKET.delete(att.reference);
        await c.env.BUCKET.delete(thumbnailKey(att.reference));
        await c.env.BUCKET.delete(thumbnailSmKey(att.reference));
      }
      await c.env.DB.prepare("DELETE FROM attachment WHERE id = ?").bind(att.id).run();
    }
  }

  await deleteCachedKeys(c.env.CACHE, ["instance:stats"]);
  return c.json({});
});
