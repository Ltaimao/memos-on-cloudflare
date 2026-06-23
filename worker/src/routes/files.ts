import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Env, UserPayload } from "../types";
import { authOptional } from "../middleware/auth";
import { verifyRefreshToken } from "../auth/jwt";
import * as shareDB from "../db/share";

type FileApp = { Bindings: Env; Variables: { user: UserPayload } };

export const fileRoutes = new Hono<FileApp>();

const UNSAFE_MIME_TYPES = new Set([
  "text/html",
  "text/xml",
  "image/svg+xml",
  "application/xhtml+xml",
]);

const THUMBNAIL_PREFIX = "thumb__";
const THUMBNAIL_SM_PREFIX = "thumb_sm__";

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

function parseRangeHeader(rangeHeader: string | undefined, totalSize: number) {
  if (!rangeHeader || totalSize <= 0) {
    return undefined;
  }

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return undefined;
  }

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) {
    return undefined;
  }

  let start: number;
  let end: number;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return undefined;
    }
    start = Math.max(totalSize - suffixLength, 0);
    end = totalSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : totalSize - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= totalSize) {
    return undefined;
  }

  end = Math.min(end, totalSize - 1);
  return { start, end, length: end - start + 1 };
}

const resolveUserFromRequest = async (c: { req: { header: (name: string) => string | undefined }; env: Env; get: (key: "user") => UserPayload | undefined }) => {
  const existingUser = c.get("user");
  if (existingUser) {
    return existingUser;
  }

  const refreshToken = getCookie(c as any, "memos_refresh");
  if (!refreshToken) {
    return undefined;
  }

  try {
    const claims = await verifyRefreshToken(refreshToken, c.env.JWT_SECRET);
    return {
      id: Number(claims.sub),
      username: claims.name,
      role: claims.role,
      status: claims.status,
    };
  } catch {
    return undefined;
  }
};

async function hasValidShareTokenForAttachment(db: D1Database, token: string | undefined, memoId: number | null) {
  if (!token || !memoId) {
    return false;
  }

  const share = await shareDB.getShareByUid(db, token);
  if (!share || share.memo_id !== memoId) {
    return false;
  }

  return !share.expires_ts || share.expires_ts >= Math.floor(Date.now() / 1000);
}

// Serve attachment file
fileRoutes.get("/attachments/:uid/:filename", authOptional, async (c) => {
  const uid = c.req.param("uid");
  const filename = c.req.param("filename");

  // 提前检查 CDN 边缘缓存：只有被判定为公开可访问的响应才会被写入缓存（见下方 cacheControl 分支），
  // 命中即可安全跳过权限校验和 D1 查询。Range 请求不走快速路径。
  if (!c.req.header("Range")) {
    const edgeCache = caches.default;
    const cachedHit = await edgeCache.match(c.req.raw);
    if (cachedHit) {
      const resp = new Response(cachedHit.body, cachedHit);
      resp.headers.set("X-Cache", "HIT");
      return resp;
    }
  }

  const att = await c.env.DB.prepare(
    "SELECT * FROM attachment WHERE uid = ?"
  ).bind(uid).first<{ id: number; creator_id: number; type: string; size: number; reference: string; memo_id: number | null; filename: string }>();

  if (!att) return c.notFound();

  let cacheControl = "private, no-store";
  const hasShareAccess = await hasValidShareTokenForAttachment(c.env.DB, c.req.query("share_token") || c.req.query("shareToken"), att.memo_id);

  // Check visibility via memo
  if (att.memo_id) {
    const memo = await c.env.DB.prepare(
      "SELECT visibility, creator_id FROM memo WHERE id = ?"
    ).bind(att.memo_id).first<{ visibility: string; creator_id: number }>();

    if (memo) {
      if (!hasShareAccess) {
        const user = await resolveUserFromRequest(c);
        if (memo.visibility === "PRIVATE" && (!user || user.id !== memo.creator_id)) {
          return c.json({ error: "Permission denied" }, 403);
        }
        if (memo.visibility === "PROTECTED" && !user) {
          return c.json({ error: "Authentication required" }, 401);
        }
        if (memo.visibility === "PUBLIC") {
          cacheControl = "public, max-age=31536000, immutable";
        } else if (user?.id === memo.creator_id) {
          cacheControl = "private, max-age=300";
        }
      }
    } else {
      const user = await resolveUserFromRequest(c);
      if (!user || (user.id !== att.creator_id && user.role !== "ADMIN")) {
        return c.json({ error: "Permission denied" }, 403);
      }
    }
  } else {
    const user = await resolveUserFromRequest(c);
    if (!user || (user.id !== att.creator_id && user.role !== "ADMIN")) {
      return c.json({ error: "Permission denied" }, 403);
    }
  }

  // Serve thumbnail if requested
  const isThumbnailRequest = c.req.query("thumbnail") === "true" || c.req.query("thumbnail") === "small";
  const isSmallThumbnail = c.req.query("thumbnail") === "small";
  let r2Key = att.reference;
  let responseContentType = att.type || "application/octet-stream";

  if (isThumbnailRequest && responseContentType.startsWith("image/") && !UNSAFE_MIME_TYPES.has(responseContentType)) {
    const thumbRef = isSmallThumbnail ? thumbnailSmKey(att.reference) : thumbnailKey(att.reference);
    const thumbObject = await c.env.BUCKET.get(thumbRef);
    if (thumbObject) {
      r2Key = thumbRef;
      responseContentType = "image/webp";
      cacheControl = "public, max-age=31536000, immutable";
    } else if (isSmallThumbnail) {
      // 小缩略图不存在时 fallback 到大缩略图
      const fallbackRef = thumbnailKey(att.reference);
      const fallbackObject = await c.env.BUCKET.get(fallbackRef);
      if (fallbackObject) {
        r2Key = fallbackRef;
        responseContentType = "image/webp";
        cacheControl = "public, max-age=31536000, immutable";
      }
    }
  }

  // CDN 边缘缓存：公开图片首次请求后，后续请求 CDN 直接返回，跳过 D1 + R2
  if (cacheControl.startsWith("public")) {
    const cache = caches.default;
    const cached = await cache.match(c.req.raw);
    if (cached) {
      const resp = new Response(cached.body, cached);
      resp.headers.set("X-Cache", "HIT");
      return resp;
    }
  }

  const range = parseRangeHeader(c.req.header("Range"), att.size);
  const r2Object = range
    ? await c.env.BUCKET.get(r2Key, { range: { offset: range.start, length: range.length } })
    : await c.env.BUCKET.get(r2Key);
  if (!r2Object) {
    return c.notFound();
  }

  if (UNSAFE_MIME_TYPES.has(responseContentType)) {
    responseContentType = "application/octet-stream";
  }

  const headers: Record<string, string> = {
    "Content-Type": responseContentType,
    "Cache-Control": cacheControl,
    "Accept-Ranges": "bytes",
  };

  if (r2Object.httpEtag) {
    headers["ETag"] = r2Object.httpEtag;
    // 304 Not Modified: 浏览器缓存仍有效时跳过传输
    if (c.req.header("If-None-Match") === r2Object.httpEtag) {
      return new Response(null, { status: 304, headers: { ETag: r2Object.httpEtag, "Cache-Control": cacheControl } });
    }
  }

  if (range) {
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${att.size}`;
    headers["Content-Length"] = String(range.length);
    return new Response(r2Object.body, { status: 206, headers });
  }

  if (r2Object.size) {
    headers["Content-Length"] = String(r2Object.size);
  }

  const response = new Response(r2Object.body, { status: 200, headers });

  // 写入 CDN 边缘缓存（仅公开图片）
  if (cacheControl.startsWith("public") && !range) {
    c.executionCtx.waitUntil(caches.default.put(c.req.raw, response.clone()));
  }

  return response;
});

// Serve user avatar
fileRoutes.get("/users/:identifier/avatar", async (c) => {
  const identifier = c.req.param("identifier");

  const user = await c.env.DB.prepare(
    "SELECT avatar_url FROM user WHERE username = ? OR id = ?"
  ).bind(identifier, Number(identifier) || 0).first<{ avatar_url: string }>();

  if (!user || !user.avatar_url) {
    // Return default avatar SVG
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="50" fill="#e2e8f0"/>
      <circle cx="50" cy="35" r="18" fill="#94a3b8"/>
      <ellipse cx="50" cy="85" rx="30" ry="25" fill="#94a3b8"/>
    </svg>`;
    return new Response(svg, {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
    });
  }

  // If avatar is an R2 reference
  if (user.avatar_url.startsWith("avatars/")) {
    const r2Object = await c.env.BUCKET.get(user.avatar_url);
    if (r2Object) {
      return new Response(r2Object.body, {
        headers: {
          "Content-Type": r2Object.httpMetadata?.contentType || "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  // Redirect to external URL
  return Response.redirect(user.avatar_url, 302);
});
