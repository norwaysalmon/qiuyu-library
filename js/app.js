/* ============================================================
   祈鸳的图书馆 — 主应用逻辑（第一阶段 + 第二阶段）
   Phase 2 新增：侧边栏遮罩、列表交错淡入、Modal 增强
   ============================================================ */

(function () {
  'use strict';

  /* ── 鉴权检查 ── */
  if (!sessionStorage.getItem('lib_auth')) {
    window.location.href = 'index.html';
    return;
  }

  /* ── 状态 ── */
  let searchIndex  = [];
  let currentView  = 'dashboard';

  /* ── DOM 快捷选择器 ── */
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);


  /* ══════════════════════════════════════════
     初始化入口
     ══════════════════════════════════════════ */
  async function init() {
    await loadSearchIndex();
    updateBadges();
    updateStats();
    renderRecentItems();
    updateGoldPrice();
    startClock();
    fetchWeather();
    setupNavigation();
    setupSearch();
    setupModal();
    setupLogout();

    /* 根据 URL hash 决定初始视图 */
    const hash = window.location.hash.slice(1) || 'dashboard';
    navigateTo(hash);
  }


  /* ══════════════════════════════════════════
     加载数据索引
     ══════════════════════════════════════════ */
  async function loadSearchIndex() {
    try {
      const resp = await fetch('data/search-index.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      searchIndex = await resp.json();
    } catch (e) {
      console.error('索引加载失败:', e);
      searchIndex = [];
    }
  }


  /* ══════════════════════════════════════════
     导航 + 侧边栏（含移动端遮罩）
     ══════════════════════════════════════════ */
  function setupNavigation() {
    const sidebar = $('#sidebar');
    const overlay = $('#sidebar-overlay');
    const toggle  = $('#sidebar-toggle');

    /* 打开侧边栏（同时显示遮罩） */
    function openSidebar() {
      sidebar.classList.add('open');
      if (overlay) overlay.classList.add('show');
    }

    /* 关闭侧边栏（同时隐藏遮罩） */
    function closeSidebar() {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('show');
    }

    /* 汉堡按钮切换 */
    toggle.addEventListener('click', () => {
      sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });

    /* 遮罩点击关闭 */
    if (overlay) {
      overlay.addEventListener('click', closeSidebar);
    }

    /* 导航项点击 */
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        navigateTo(view);
        window.location.hash = view;
        /* 移动端点击导航后自动收起侧边栏 */
        if (window.innerWidth <= 900) closeSidebar();
      });
    });

    /* 点击内容区时关闭侧边栏（移动端） */
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 900) {
        if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
          closeSidebar();
        }
      }
    });
  }

  /* 切换视图 */
  function navigateTo(view) {
    currentView = view;

    /* 更新导航激活状态 */
    $$('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });

    /* 隐藏所有视图，显示目标视图 */
    $$('.view').forEach(v => v.classList.add('hidden'));
    const target = $(`#view-${view}`);
    if (target) target.classList.remove('hidden');

    /* 按需渲染内容 */
    switch (view) {
      case 'dashboard': renderRecentItems(); break;
      case 'briefings': renderBriefings();   break;
      case 'notes':     renderNotes();        break;
      case 'files':     renderFiles();        break;
      case 'links':     renderLinks();        break;
    }
  }


  /* ══════════════════════════════════════════
     渲染函数（各视图列表）
     ══════════════════════════════════════════ */

  function renderBriefings() {
    const items = searchIndex
      .filter(i => i.type === 'briefing')
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    renderList($('#briefings-list'), items, '暂无简报');
  }

  function renderNotes() {
    const items = searchIndex
      .filter(i => i.type === 'note')
      .sort((a, b) => b.date.localeCompare(a.date));
    renderList($('#notes-list'), items, '暂无笔记');
  }

  function renderFiles() {
    const items = searchIndex
      .filter(i => i.type === 'file')
      .sort((a, b) => b.date.localeCompare(a.date));
    renderList($('#files-list'), items, '暂无文件');
  }

  function renderLinks() {
    const items = searchIndex
      .filter(i => i.type === 'link')
      .sort((a, b) => b.date.localeCompare(a.date));
    renderList($('#links-list'), items, '暂无链接');
  }

  function renderRecentItems() {
    const items = [...searchIndex]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 8);
    renderList($('#dash-recent-list'), items, '暂无内容');
  }

  /**
   * 通用列表渲染（含交错淡入动画）
   * @param {Element} container - 目标容器
   * @param {Array}   items     - 数据数组
   * @param {string}  emptyMsg  - 空状态提示文字
   */
  function renderList(container, items, emptyMsg) {
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = `<p class="empty-state">${emptyMsg}</p>`;
      return;
    }
    /* 交错淡入：每项延迟 50ms，最多延迟 400ms */
    container.innerHTML = items
      .map((item, i) => createListItem(item, i))
      .join('');
    attachItemListeners(container);
  }


  /* ══════════════════════════════════════════
     创建列表项 HTML
     ══════════════════════════════════════════ */
  function createListItem(item, index = 0) {
    const icon  = getTypeIcon(item.type);
    const tags  = (item.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');

    /* 简报类型增强 */
    let extraClass      = '';
    let extraStyles     = '';
    let typeBadgeHtml   = '';

    if (item.type === 'briefing') {
      const btype = getBriefingType(item.id);
      if (btype) {
        extraClass    = ' briefing-item';
        extraStyles   = `style="--briefing-color:${btype.color}"`;
        typeBadgeHtml = `
          <div class="briefing-type-badge"
               style="--badge-bg:${btype.badgeBg};--badge-color:${btype.badgeColor};--badge-border:${btype.badgeBorder}">
            ${btype.emoji} ${btype.label}
          </div>`;
      }
    }

    /* 交错淡入延迟（单位 ms，上限 400ms） */
    const delay = Math.min(index * 55, 400);

    return `
      <div class="content-item animate-in${extraClass}"
           ${extraStyles}
           style="animation-delay:${delay}ms"
           data-id="${escapeHtml(item.id)}">
        <div class="content-item-icon">${icon}</div>
        <div class="content-item-body">
          <div class="content-item-title">${escapeHtml(item.title)}</div>
          ${typeBadgeHtml}
          <div class="content-item-summary">${escapeHtml(item.summary || '')}</div>
          ${tags ? `<div class="content-item-tags">${tags}</div>` : ''}
        </div>
        <div class="content-item-date">${formatDate(item.date)}</div>
      </div>
    `;
  }

  /* 为容器内所有 .content-item 绑定点击事件 */
  function attachItemListeners(container) {
    container.querySelectorAll('.content-item').forEach(el => {
      el.addEventListener('click', () => {
        const id   = el.dataset.id;
        const item = searchIndex.find(i => i.id === id);
        if (item) openItem(item);
      });
    });
  }


  /* ══════════════════════════════════════════
     统计徽章 & 仪表盘数字
     ══════════════════════════════════════════ */
  function updateBadges() {
    const counts = { briefing:0, note:0, file:0, link:0 };
    searchIndex.forEach(i => { if (counts[i.type] !== undefined) counts[i.type]++ });
    $('#badge-briefings').textContent = counts.briefing;
    $('#badge-notes').textContent     = counts.note;
    $('#badge-files').textContent     = counts.file;
    $('#badge-links').textContent     = counts.link;
  }

  function updateStats() {
    const counts = { briefing:0, note:0, file:0, link:0 };
    searchIndex.forEach(i => { if (counts[i.type] !== undefined) counts[i.type]++ });
    $('#stat-briefings').textContent = counts.briefing;
    $('#stat-notes').textContent     = counts.note;
    $('#stat-files').textContent     = counts.file;
    $('#stat-links').textContent     = counts.link;
  }


  /* ══════════════════════════════════════════
     今日金价速览卡片
     ══════════════════════════════════════════ */
  function updateGoldPrice() {
    const priceEl   = $('#dash-gold-price');
    const summaryEl = $('#dash-gold-summary');
    const sourceEl  = $('#dash-gold-source');
    if (!priceEl) return;

    /* 取最新一条简报（同日期按 id 排序，close > noon） */
    const briefings = searchIndex
      .filter(i => i.type === 'briefing')
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    if (briefings.length === 0) {
      priceEl.textContent = '暂无数据';
      return;
    }

    const latest  = briefings[0];
    const summary = latest.summary || '';

    /* 从摘要中提取第一个金价（格式：$X,XXX 或 $X,XXX.XX） */
    const priceMatch = summary.match(/\$([0-9,]+(?:\.\d+)?)/);
    const price      = priceMatch ? priceMatch[0] : null;

    /* 通过关键词判断涨跌方向 */
    let trendHtml = '';
    if (/下挫|下跌|跌|走低|承压|回落|下行/.test(summary)) {
      trendHtml = '<span class="gold-trend down">↓</span>';
    } else if (/上涨|走高|升|强势|突破|涨|上行/.test(summary)) {
      trendHtml = '<span class="gold-trend up">↑</span>';
    }

    priceEl.innerHTML = price
      ? `<span class="gold-price-num">${escapeHtml(price)}</span>${trendHtml}`
      : '查看最新简报';

    /* 摘要第一句（截取 60 字以内） */
    if (summaryEl) {
      const first = summary.replace(/。.*/, '').slice(0, 60);
      summaryEl.textContent = first + (summary.length > 60 ? '…' : '');
    }

    /* 来源标签 */
    if (sourceEl) {
      const btype     = getBriefingType(latest.id);
      const typeLabel = btype ? `${btype.emoji} ${btype.label} · ` : '';
      sourceEl.textContent = `${typeLabel}${latest.date}`;
    }
  }


  /* ══════════════════════════════════════════
     简报类型解析
     ══════════════════════════════════════════ */
  function getBriefingType(id) {
    if (!id) return null;

    if (id.endsWith('-noon')) return {
      label:'午间', emoji:'🌅', color:'var(--color-noon)',
      badgeBg:'rgba(212,149,74,.12)', badgeColor:'#e8a85a', badgeBorder:'rgba(212,149,74,.25)',
    };
    if (id.endsWith('-close')) return {
      label:'收盘', emoji:'🌙', color:'var(--color-close)',
      badgeBg:'rgba(155,48,80,.12)', badgeColor:'#c96080', badgeBorder:'rgba(155,48,80,.28)',
    };
    if (id.endsWith('-evening')) return {
      label:'补充', emoji:'📡', color:'var(--color-evening)',
      badgeBg:'rgba(61,127,193,.12)', badgeColor:'#6aaee0', badgeBorder:'rgba(61,127,193,.28)',
    };
    if (id.endsWith('-weekend')) return {
      label:'周末特刊', emoji:'📅', color:'var(--color-weekend)',
      badgeBg:'rgba(124,92,191,.12)', badgeColor:'#a888e0', badgeBorder:'rgba(124,92,191,.28)',
    };
    return null;
  }


  /* ══════════════════════════════════════════
     搜索
     ══════════════════════════════════════════ */
  function setupSearch() {
    const input    = $('#search-input');
    const filters  = $('#search-filters');

    /* 聚焦时展开过滤面板 */
    input.addEventListener('focus', () => filters.classList.add('open'));

    /* 点击搜索框外部收起面板 */
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) filters.classList.remove('open');
    });

    /* 回车触发搜索 */
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performSearch();
        filters.classList.remove('open');
      }
    });

    /* 过滤条件变更自动重搜 */
    $('#search-type').addEventListener('change',      performSearch);
    $('#search-date-from').addEventListener('change', performSearch);
    $('#search-date-to').addEventListener('change',   performSearch);
  }

  function performSearch() {
    const query    = $('#search-input').value.trim().toLowerCase();
    const type     = $('#search-type').value;
    const dateFrom = $('#search-date-from').value;
    const dateTo   = $('#search-date-to').value;

    /* 无条件时跳回仪表盘 */
    if (!query && !dateFrom && !dateTo) { navigateTo('dashboard'); return; }

    /* 过滤 */
    let results = [...searchIndex];
    if (type !== 'all') results = results.filter(i => i.type === type);
    if (dateFrom)       results = results.filter(i => i.date >= dateFrom);
    if (dateTo)         results = results.filter(i => i.date <= dateTo);
    if (query) {
      results = results.filter(i => {
        const text = `${i.title} ${i.summary} ${(i.tags||[]).join(' ')} ${i.content||''}`.toLowerCase();
        return text.includes(query);
      });
    }
    results.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    /* 切换到搜索结果视图 */
    $$('.view').forEach(v => v.classList.add('hidden'));
    $('#view-search').classList.remove('hidden');
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    currentView = 'search';

    $('#search-summary').textContent = query
      ? `找到 ${results.length} 条与「${escapeHtml(query)}」相关的结果`
      : `找到 ${results.length} 条结果`;

    const container = $('#search-results');
    if (results.length === 0) {
      container.innerHTML = '<p class="empty-state">未找到匹配的内容</p>';
      return;
    }

    /* 搜索结果也带交错淡入 */
    container.innerHTML = results.map((item, i) => {
      const icon        = getTypeIcon(item.type);
      const titleHtml   = query ? highlightText(escapeHtml(item.title),          query) : escapeHtml(item.title);
      const summaryHtml = query ? highlightText(escapeHtml(item.summary || ''),  query) : escapeHtml(item.summary || '');
      const tags        = (item.tags||[]).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');

      let extraClass = '', extraStyles = '', typeBadgeHtml = '';
      if (item.type === 'briefing') {
        const btype = getBriefingType(item.id);
        if (btype) {
          extraClass    = ' briefing-item';
          extraStyles   = `style="--briefing-color:${btype.color};animation-delay:${Math.min(i*55,400)}ms"`;
          typeBadgeHtml = `<div class="briefing-type-badge" style="--badge-bg:${btype.badgeBg};--badge-color:${btype.badgeColor};--badge-border:${btype.badgeBorder}">${btype.emoji} ${btype.label}</div>`;
        }
      }

      const delay = Math.min(i * 55, 400);
      const styleAttr = item.type === 'briefing' && extraStyles
        ? extraStyles  /* 已含 delay */
        : `style="animation-delay:${delay}ms"`;

      return `
        <div class="content-item animate-in${extraClass}" ${styleAttr} data-id="${escapeHtml(item.id)}">
          <div class="content-item-icon">${icon}</div>
          <div class="content-item-body">
            <div class="content-item-title">${titleHtml}</div>
            ${typeBadgeHtml}
            <div class="content-item-summary">${summaryHtml}</div>
            ${tags ? `<div class="content-item-tags">${tags}</div>` : ''}
          </div>
          <div class="content-item-date">${formatDate(item.date)}</div>
        </div>`;
    }).join('');
    attachItemListeners(container);
  }


  /* ══════════════════════════════════════════
     Modal 弹窗
     ══════════════════════════════════════════ */
  function setupModal() {
    $('#modal-close').addEventListener('click', closeModal);
    /* 点击覆盖层（非 .modal 区域）关闭 */
    $('#modal-overlay').addEventListener('click', (e) => {
      if (e.target === $('#modal-overlay')) closeModal();
    });
    /* ESC 关闭 */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  async function openItem(item) {
    /* 填充标题 */
    $('#modal-title').textContent = item.title;

    /* 元信息 */
    const btype    = item.type === 'briefing' ? getBriefingType(item.id) : null;
    const badgeHtml = btype
      ? `<span class="briefing-type-badge" style="--badge-bg:${btype.badgeBg};--badge-color:${btype.badgeColor};--badge-border:${btype.badgeBorder}">${btype.emoji} ${btype.label}</span>`
      : '';
    $('#modal-meta').innerHTML = `
      <span>${getTypeIcon(item.type)} ${getTypeLabel(item.type)}</span>
      ${badgeHtml}
      <span>📅 ${item.date}</span>
      ${(item.tags||[]).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
    `;

    /* 加载内容 */
    let html = item.content || '';
    if (item.url && !item.content) {
      try {
        const resp = await fetch(item.url);
        if (resp.ok) {
          const text = await resp.text();
          html = new DOMParser().parseFromString(text, 'text/html').querySelector('body')?.innerHTML || text;
        } else {
          html = `<p>无法加载内容。${item.url ? `<a href="${item.url}" target="_blank">点击此处直接打开 ↗</a>` : ''}</p>`;
        }
      } catch {
        html = `<p>加载失败。${item.url ? `<a href="${item.url}" target="_blank">点击此处直接打开 ↗</a>` : ''}</p>`;
      }
    }

    /* 写入 DOM */
    const bodyEl = $('#modal-body');
    bodyEl.innerHTML = html;

    /* 后处理：将裸 <table> 包裹进 .table-wrap 实现移动端横向滚动 */
    bodyEl.querySelectorAll('table').forEach(table => {
      if (!table.parentElement.classList.contains('table-wrap')) {
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
      }
    });

    /* 显示弹窗（CSS 动画在 :not(.hidden) 时自动触发） */
    $('#modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $('#modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }


  /* ══════════════════════════════════════════
     时钟（上海时区）
     ══════════════════════════════════════════ */
  function startClock() {
    function update() {
      const now      = new Date();
      const timeOpts = { timeZone:'Asia/Shanghai', hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' };
      const dateOpts = { timeZone:'Asia/Shanghai', year:'numeric', month:'long', day:'numeric', weekday:'long' };
      const timeStr  = now.toLocaleTimeString('zh-CN', timeOpts);
      const dateStr  = now.toLocaleDateString('zh-CN', dateOpts);

      const ct = $('#clock-time');     if (ct) ct.textContent = timeStr;
      const cd = $('#clock-date');     if (cd) cd.textContent = dateStr;
      const dt = $('#dash-clock-time');if (dt) dt.textContent = timeStr;
      const dd = $('#dash-clock-date');if (dd) dd.textContent = dateStr;
    }
    update();
    setInterval(update, 1000);
  }


  /* ══════════════════════════════════════════
     天气（上海，wttr.in）
     ══════════════════════════════════════════ */
  async function fetchWeather() {
    try {
      const resp    = await fetch('https://wttr.in/Shanghai?format=j1');
      const data    = await resp.json();
      const cur     = data.current_condition[0];
      const temp    = cur.temp_C;
      const desc    = (cur.lang_zh && cur.lang_zh[0]) ? cur.lang_zh[0].value : cur.weatherDesc[0].value;
      const emoji   = getWeatherEmoji(parseInt(cur.weatherCode));
      const feels   = cur.FeelsLikeC;
      const hum     = cur.humidity;
      const fullTxt = `${temp}°C · ${desc} · 体感 ${feels}°C · 湿度 ${hum}%`;

      const wi  = $('#weather-icon');      if (wi)  wi.textContent  = emoji;
      const wt  = $('#weather-temp');      if (wt)  wt.textContent  = `${temp}°C`;
      const wd  = $('#weather-desc');      if (wd)  wd.textContent  = desc;
      const dwi = $('#dash-weather-icon'); if (dwi) dwi.textContent = emoji;
      const dwt = $('#dash-weather-text'); if (dwt) dwt.textContent = fullTxt;
    } catch (e) {
      console.error('天气获取失败:', e);
      const wd  = $('#weather-desc');      if (wd)  wd.textContent  = '天气加载失败';
      const dwt = $('#dash-weather-text'); if (dwt) dwt.textContent = '天气数据暂不可用';
    }
  }


  /* ══════════════════════════════════════════
     退出登录
     ══════════════════════════════════════════ */
  function setupLogout() {
    $('#logout-btn').addEventListener('click', () => {
      sessionStorage.removeItem('lib_auth');
      sessionStorage.removeItem('lib_auth_time');
      window.location.href = 'index.html';
    });
  }


  /* ══════════════════════════════════════════
     工具函数
     ══════════════════════════════════════════ */

  /* 类型图标 */
  function getTypeIcon(type) {
    return { briefing:'📊', note:'📝', file:'📁', link:'🔗' }[type] || '📄';
  }

  /* 类型中文名 */
  function getTypeLabel(type) {
    return { briefing:'简报', note:'笔记', file:'文件', link:'链接' }[type] || type;
  }

  /* 日期格式化：M月D日 周X */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d       = new Date(dateStr + 'T00:00:00');
    const weekdays = ['日','一','二','三','四','五','六'];
    return `${d.getMonth()+1}月${d.getDate()}日 周${weekdays[d.getDay()]}`;
  }

  /* 天气代码 → Emoji */
  function getWeatherEmoji(code) {
    if (code === 113)              return '☀️';
    if (code === 116)              return '⛅';
    if (code === 119 || code===122)return '☁️';
    if (code >= 263 && code <= 311)return '🌧️';
    if (code >= 386 && code <= 395)return '⛈️';
    if (code >= 320 && code <= 374)return '❄️';
    if (code >= 200 && code <= 232)return '⛈️';
    return '🌤️';
  }

  /* HTML 转义（防 XSS） */
  function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /* 搜索关键词高亮 */
  function highlightText(text, query) {
    if (!query) return text;
    const esc   = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${esc})`, 'gi'), '<mark>$1</mark>');
  }


  /* ══════════════════════════════════════════
     Hash 变化监听（浏览器前进/后退）
     ══════════════════════════════════════════ */
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash && hash !== 'search') navigateTo(hash);
  });


  /* ── 启动 ── */
  init();

})();
