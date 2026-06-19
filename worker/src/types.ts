export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE?: KVNamespace;
  AI: Ai;
  JWT_SECRET: string;
  INSTANCE_NAME: string;
  APP_VERSION: string;
  AMAP_WEB_SERVICE_KEY: string;  // 高德 Web 服务 API Key
  AMAP_JS_API_KEY: string;       // 高德 Web 端 API Key（可选）
}

export interface UserPayload {
  id: number;
  username: string;
  role: string;
  status: string;
}

export interface JWTClaims {
  sub: string;
  iss: string;
  aud: string;
  name: string;
  role: string;
  status: string;
  exp: number;
  iat: number;
  tid?: string;
}
