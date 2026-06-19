import { Hono } from 'hono';

const osmProxy = new Hono();

// 代理 OpenStreetMap 瓦片
osmProxy.get('/tiles/:z/:x/:y', async (c) => {
  const { z, x, y } = c.req.param();

  // 验证参数合法性
  const zNum = parseInt(z);
  const xNum = parseInt(x);
  const yNum = parseInt(y);

  if (isNaN(zNum) || isNaN(xNum) || isNaN(yNum) ||
      zNum < 0 || zNum > 19 || xNum < 0 || yNum < 0) {
    return c.text('Invalid tile coordinates', 400);
  }

  try {
    // 设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // 从 OSM 获取瓦片
    const response = await fetch(`https://tile.openstreetmap.org/${zNum}/${xNum}/${yNum}.png`, {
      headers: {
        'User-Agent': 'Memos/1.0 (https://github.com/usememos/memos)',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return c.text('Tile not found', 404);
    }

    // 流式传输，不加载到内存
    return new Response(response.body, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error: any) {
    console.error('Failed to fetch OSM tile:', error);
    if (error.name === 'AbortError') {
      return c.text('Request timeout', 504);
    }
    return c.text('Service temporarily unavailable', 503);
  }
});

// 代理 Nominatim 地理编码
osmProxy.get('/reverse', async (c) => {
  const url = new URL(c.req.url);
  const params = url.searchParams;

  // 只允许特定参数
  const allowedParams = ['lat', 'lon', 'format', 'addressdetails', 'zoom', 'accept-language'];
  const filteredParams = new URLSearchParams();

  for (const [key, value] of params.entries()) {
    if (allowedParams.includes(key)) {
      filteredParams.append(key, value);
    }
  }

  try {
    // 设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // 从 Nominatim 获取地理编码
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${filteredParams.toString()}`, {
      headers: {
        'User-Agent': 'Memos/1.0 (https://github.com/usememos/memos)',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return c.json({ error: 'Geocoding failed' }, 500);
    }

    const data = await response.json();
    return c.json(data);
  } catch (error: any) {
    console.error('Failed to fetch Nominatim data:', error);
    if (error.name === 'AbortError') {
      return c.json({ error: 'Request timeout' }, 504);
    }
    return c.json({ error: 'Service temporarily unavailable' }, 503);
  }
});

export default osmProxy;
