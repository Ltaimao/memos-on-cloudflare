# Changelog

## v1.1.0 (2026-06-20)

### 新功能

- **Workers KV 缓存**：激活 `cfmemos-kv` 命名空间，实例设置、用户统计、链接预览等高频数据走 KV 缓存
- **图片缩略图**：上传时自动生成 400px + 200px 双尺寸 WebP 缩略图，画廊列表加载缩略图而非原图
- **网页剪藏（Web Clipper）**：浏览器书签工具，支持 Readability 正文提取 + 选中文字剪藏 + Markdown 转换
- **地址标签**：手动插入地址标签，高德逆地理编码，WGS-84→GCJ-02 坐标转换
- **标签查询性能优化**：新建 `memo_tag` 查找表，标签过滤从 JSON 全表扫描改为索引查询
- **时间旅行查询索引**：虚拟列 + 索引优化，查询从 >100ms 降至 <10ms

### Bug 修复

- **修复时间旅行时区 bug**：虚拟列加入 UTC+8 偏移常量，修复凌晨创建的 memo 匹配不到的问题
- **修复排除今天逻辑**：排除今天/今年的计算改用用户本地时区
- **修复标签层级匹配**：D1 LIKE 模式从 LIKE 改为 INSTR/SUBSTR，绕过 50 字节限制
- **修复 filter 指定 creator 时私有 memo 不可见**
- **修复地址标签坐标偏移**：高德逆地理编码前将 WGS-84 转换为 GCJ-02
- **修复复制链接功能 undefined**
- **修复日历热力图无数据**
- **修复 location 显示崩溃**

### 性能优化

- **304 Not Modified**：支持 If-None-Match 条件请求，浏览器缓存有效时返回 304 空响应
- **CDN 边缘缓存**：公开图片用 Cloudflare Cache API 缓存，后续请求跳过 Worker
- **srcset 响应式图片**：手机端加载 200px 小图，桌面端加载 400px 大图，移动端流量减 60%
- **fetchpriority**：首屏图片（预览、头像）加 `fetchpriority="high"` 优先加载
- **标签统计 SQL 聚合**：标签计数从 JS 内存解析改为数据库 GROUP BY
- **组合索引**：`idx_memo_creator_created_ts` 优化用户级时间查询

### 品牌

- 替换项目 logo 为 SCSE 品牌标识
- README 加入口号：「为写 20 年而设计的记事本」

### 升级说明

新增 migration `0007_virtual_column_tz_offset.sql`，部署后需执行：

```bash
npm run db:migrate:remote
```

---

## v1.0.7

初始公开版本。
