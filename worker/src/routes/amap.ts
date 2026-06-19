import { Hono } from 'hono';

const amap = new Hono();

/**
 * 获取高德地图 API Key
 * 前端通过此端点安全地获取 Key，避免直接暴露在客户端代码中
 */
amap.get('/key', (c) => {
  return c.json({
    webServiceKey: c.env.AMAP_WEB_SERVICE_KEY || '',
    jsApiKey: c.env.AMAP_JS_API_KEY || '',
  });
});

export default amap;
