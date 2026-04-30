/* ============================================================
   祈鸳的图书馆 — Cloudflare Worker
   功能：R2 文件存储 API（上传 / 列表 / 下载 / 删除 / 重命名 / 新建文件夹）
   R2 Bucket 绑定名称：LIBRARY（在 wrangler.toml 中配置）
   ============================================================

   路由设计：
     GET    /api/files                  → 列出文件（支持 ?prefix=xxx）
     POST   /api/files/upload           → 上传文件（multipart/form-data）
     DELETE /api/files?key=xxx          → 删除文件或文件夹
     PATCH  /api/files                  → 重命名文件（JSON: {oldKey, newKey}）
     PUT    /api/files/mkdir            → 创建文件夹（JSON: {prefix}）
     GET    /api/files/download?key=xxx → 下载文件（Worker 代理）

   认证：请求头 X-Lib-Token 必须等于 qiuyu2026
   CORS：允许 qiuyu-library.pages.dev 和 localhost
   ============================================================ */

/* ── 允许的来源列表 ── */
const ALLOWED_ORIGINS = [
  'https://qiuyu-library.pages.dev',
  'http://localhost',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1',
];

/* ── 认证 Token ── */
const AUTH_TOKEN = 'qiuyu2026';

/* ── 上传文件的根前缀 ── */
const UPLOAD_ROOT = 'uploads';


/* ══════════════════════════════════════════
   Worker 入口
   ══════════════════════════════════════════ */
export default {
  async fetch(request, env, ctx) {
    /* 处理 CORS 预检请求 */
    if (request.method === 'OPTIONS') {
      return handleCors(request, new Response(null, { status: 204 }));
    }

    const url      = new URL(request.url);
    const pathname = url.pathname;

    /* 公开图片访问路由（无需认证，用于 <img> 标签内嵌显示） */
    if (pathname.startsWith('/img/') && request.method === 'GET') {
      return handleCors(request, await servePublicImage(request, env));
    }

    /* 认证检查 */
    const token = request.headers.get('X-Lib-Token');
    if (token !== AUTH_TOKEN) {
      return handleCors(request, jsonResponse({ error: '未授权' }, 401));
    }

    try {
      /* 路由分发 */
      if (pathname === '/api/files' && request.method === 'GET') {
        return handleCors(request, await listFiles(request, env));
      }
      if (pathname === '/api/files/upload' && request.method === 'POST') {
        return handleCors(request, await uploadFile(request, env));
      }
      if (pathname === '/api/files' && request.method === 'DELETE') {
        return handleCors(request, await deleteFile(request, env));
      }
      if (pathname === '/api/files' && request.method === 'PATCH') {
        return handleCors(request, await renameFile(request, env));
      }
      if (pathname === '/api/files/mkdir' && request.method === 'PUT') {
        return handleCors(request, await makeFolder(request, env));
      }
      if (pathname === '/api/files/download' && request.method === 'GET') {
        return handleCors(request, await downloadFile(request, env));
      }

      /* 未匹配路由 */
      return handleCors(request, jsonResponse({ error: '路由不存在' }, 404));
    } catch (err) {
      console.error('Worker 错误:', err);
      return handleCors(request, jsonResponse({ error: `服务器错误：${err.message}` }, 500));
    }
  },
};


/* ══════════════════════════════════════════
   GET /api/files — 列出文件
   支持 ?prefix=xxx 过滤文件夹
   返回：{ files: [...], folders: [...] }
   ══════════════════════════════════════════ */
async function listFiles(request, env) {
  const url    = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || '';

  /* 构造 R2 list 参数 */
  const listOptions = {
    limit: 1000,
    delimiter: '/',   // 使用分隔符实现"虚拟文件夹"
  };
  if (prefix) {
    listOptions.prefix = prefix;
  }

  const listed = await env.LIBRARY.list(listOptions);

  /* 文件列表（objects） */
  const files = listed.objects.map(obj => ({
    key:          obj.key,
    size:         obj.size,
    lastModified: obj.uploaded ? obj.uploaded.toISOString() : null,
    /* 生成公开访问 URL（如果 R2 bucket 开启了公开访问） */
    url: `/api/files/download?key=${encodeURIComponent(obj.key)}`,
  }));

  /* 文件夹列表（delimitedPrefixes，即虚拟子目录） */
  const folders = listed.delimitedPrefixes || [];

  return jsonResponse({ files, folders });
}


/* ══════════════════════════════════════════
   POST /api/files/upload — 上传文件
   请求体：multipart/form-data
     - file: 文件
     - folder: （可选）目标文件夹名称
   自动生成 key：uploads/YYYY-MM-DD/filename
   或：uploads/foldername/filename
   ══════════════════════════════════════════ */
async function uploadFile(request, env) {
  const formData = await request.formData();
  const file     = formData.get('file');
  const folder   = formData.get('folder') || '';

  if (!file || typeof file === 'string') {
    return jsonResponse({ error: '未找到上传文件' }, 400);
  }

  /* 生成存储 key */
  let key;
  if (folder) {
    /* 用户指定了文件夹 */
    const cleanFolder = folder.replace(/^\/+|\/+$/g, ''); // 去除首尾斜杠
    key = `${UPLOAD_ROOT}/${cleanFolder}/${file.name}`;
  } else {
    /* 默认按日期分组 */
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    key = `${UPLOAD_ROOT}/${today}/${file.name}`;
  }

  /* 上传到 R2 */
  await env.LIBRARY.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
    },
    customMetadata: {
      originalName: file.name,
      uploadedAt:   new Date().toISOString(),
    },
  });

  return jsonResponse({
    success: true,
    key,
    size: file.size,
    message: `文件「${file.name}」上传成功`,
  });
}


/* ══════════════════════════════════════════
   DELETE /api/files?key=xxx — 删除文件或文件夹
   如果 key 以 / 结尾，则删除该前缀下所有文件
   ══════════════════════════════════════════ */
async function deleteFile(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (!key) {
    return jsonResponse({ error: '缺少 key 参数' }, 400);
  }

  /* 如果是文件夹（以 / 结尾），批量删除该前缀下所有文件 */
  if (key.endsWith('/')) {
    const listed = await env.LIBRARY.list({ prefix: key, limit: 1000 });
    const deletePromises = listed.objects.map(obj => env.LIBRARY.delete(obj.key));
    await Promise.all(deletePromises);
    return jsonResponse({ success: true, message: `文件夹「${key}」及其内容已删除`, count: listed.objects.length });
  }

  /* 删除单个文件 */
  await env.LIBRARY.delete(key);
  return jsonResponse({ success: true, message: `文件「${key}」已删除` });
}


/* ══════════════════════════════════════════
   PATCH /api/files — 重命名文件
   请求体 JSON：{ oldKey: string, newKey: string }
   实现：复制到新 key → 删除旧 key
   ══════════════════════════════════════════ */
async function renameFile(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求体 JSON 解析失败' }, 400);
  }

  const { oldKey, newKey } = body;
  if (!oldKey || !newKey) {
    return jsonResponse({ error: '缺少 oldKey 或 newKey 参数' }, 400);
  }
  if (oldKey === newKey) {
    return jsonResponse({ error: '新旧文件名相同' }, 400);
  }

  /* 获取原文件 */
  const original = await env.LIBRARY.get(oldKey);
  if (!original) {
    return jsonResponse({ error: `文件「${oldKey}」不存在` }, 404);
  }

  /* 复制到新 key（保留元数据） */
  await env.LIBRARY.put(newKey, original.body, {
    httpMetadata:   original.httpMetadata,
    customMetadata: {
      ...original.customMetadata,
      renamedAt: new Date().toISOString(),
      renamedFrom: oldKey,
    },
  });

  /* 删除旧 key */
  await env.LIBRARY.delete(oldKey);

  return jsonResponse({ success: true, oldKey, newKey, message: `已重命名为「${newKey}」` });
}


/* ══════════════════════════════════════════
   PUT /api/files/mkdir — 创建文件夹
   请求体 JSON：{ prefix: string }
   R2 没有真正的文件夹，通过写入一个占位文件实现
   ══════════════════════════════════════════ */
async function makeFolder(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求体 JSON 解析失败' }, 400);
  }

  let { prefix } = body;
  if (!prefix) {
    return jsonResponse({ error: '缺少 prefix 参数' }, 400);
  }

  /* 确保 prefix 以 / 结尾 */
  if (!prefix.endsWith('/')) prefix += '/';

  /* 写入占位文件（.keep），使文件夹在列表中可见 */
  const placeholderKey = `${UPLOAD_ROOT}/${prefix}.keep`;
  await env.LIBRARY.put(placeholderKey, '', {
    httpMetadata: { contentType: 'text/plain' },
    customMetadata: { isPlaceholder: 'true', createdAt: new Date().toISOString() },
  });

  return jsonResponse({ success: true, prefix, message: `文件夹「${prefix}」创建成功` });
}


/* ══════════════════════════════════════════
   GET /api/files/download?key=xxx — 下载文件
   Worker 代理 R2 对象，支持 Content-Disposition
   ══════════════════════════════════════════ */
async function downloadFile(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (!key) {
    return jsonResponse({ error: '缺少 key 参数' }, 400);
  }

  /* 从 R2 获取对象 */
  const object = await env.LIBRARY.get(key);
  if (!object) {
    return jsonResponse({ error: `文件「${key}」不存在` }, 404);
  }

  /* 提取文件名 */
  const fileName = key.split('/').pop() || 'download';

  /* 构造响应头 */
  const headers = new Headers();
  /* 透传 Content-Type */
  if (object.httpMetadata?.contentType) {
    headers.set('Content-Type', object.httpMetadata.contentType);
  } else {
    headers.set('Content-Type', 'application/octet-stream');
  }
  /* 强制下载 */
  headers.set(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
  );
  /* 缓存控制 */
  headers.set('Cache-Control', 'private, max-age=3600');

  return new Response(object.body, { status: 200, headers });
}


/* ══════════════════════════════════════════
   GET /img/:key — 公开图片访问（无需认证）
   用于 <img> 标签内嵌显示，仅允许图片类型
   ══════════════════════════════════════════ */
async function servePublicImage(request, env) {
  const url = new URL(request.url);
  /* 去掉 /img/ 前缀，得到 R2 key */
  const key = decodeURIComponent(url.pathname.slice(5)); // "/img/uploads/xxx.png" → "uploads/xxx.png"

  if (!key) {
    return jsonResponse({ error: '缺少文件路径' }, 400);
  }

  const object = await env.LIBRARY.get(key);
  if (!object) {
    return jsonResponse({ error: `文件「${key}」不存在` }, 404);
  }

  /* 安全检查：仅允许图片类型 */
  const contentType = object.httpMetadata?.contentType || '';
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(contentType)) {
    return jsonResponse({ error: '仅允许访问图片文件' }, 403);
  }

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'public, max-age=86400');
  /* 不设置 Content-Disposition，让浏览器直接显示而非下载 */

  return new Response(object.body, { status: 200, headers });
}


/* ══════════════════════════════════════════
   工具函数
   ══════════════════════════════════════════ */

/**
 * 构造 JSON 响应
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * 为响应添加 CORS 头
 * 根据请求来源动态设置 Access-Control-Allow-Origin
 */
function handleCors(request, response) {
  const origin = request.headers.get('Origin') || '';

  /* 判断来源是否在白名单中（也允许 localhost 任意端口） */
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  const allowOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];

  /* 克隆响应并追加 CORS 头 */
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin',  allowOrigin);
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, X-Lib-Token');
  newHeaders.set('Access-Control-Max-Age',       '86400');
  if (isAllowed) {
    newHeaders.set('Vary', 'Origin');
  }

  return new Response(response.body, {
    status:  response.status,
    headers: newHeaders,
  });
}
