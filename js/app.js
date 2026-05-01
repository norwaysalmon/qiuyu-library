/* ============================================================
   祈鸳的图书馆 — 主应用逻辑（第一阶段 + 第二阶段 + 第三阶段 + 第四阶段）
   Phase 3 新增：
     - 简报百叶帘式分页（按日期分组 accordion）
     - 文件上传与管理（R2 + Cloudflare Worker）
   Phase 4 新增：
     - Logo 点击回到仪表盘首页
     - 闲置 30 分钟自动登出
     - 登录页动态问候语（根据时段 + 语言）
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

  /* ── 文件管理状态 ── */
  const FILE_API_BASE = 'https://qiuyu-library-api.norwaysalmon.workers.dev/api/files';  // Worker API 基础路径
  const FILE_TOKEN    = 'qiuyu2026';           // 认证 Token
  let   fileList      = [];                    // 当前文件列表
  let   currentPrefix = '';                    // 当前文件夹前缀（面包屑）
  let   folderList    = [];                    // 已知文件夹列表

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
    setupFileUpload();   // 初始化文件上传模块
    setupLogoHome();     // Logo 点击回到首页
    setupIdleTimeout();  // 闲置自动登出
    initLinkModal();     // 外部链接 Modal

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

  /* ── 功能一：简报百叶帘式分页 ── */
  function renderBriefings() {
    const container = $('#briefings-list');
    if (!container) return;

    const items = searchIndex
      .filter(i => i.type === 'briefing')
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    if (items.length === 0) {
      container.innerHTML = '<p class="empty-state">暂无简报</p>';
      return;
    }

    /* 按日期分组 */
    const groups = groupByDate(items);
    container.innerHTML = renderAccordionGroups(groups, true);
    attachAccordionListeners(container);
    attachItemListeners(container);
  }

  function renderNotes() {
    const items = searchIndex
      .filter(i => i.type === 'note')
      .sort((a, b) => b.date.localeCompare(a.date));
    renderList($('#notes-list'), items, '暂无笔记');
  }

  /* 文件视图由文件上传模块接管，此处仅作兜底 */
  function renderFiles() {
    loadFileList();
  }

  /* ══════════════════════════════════════════
     外部链接模块 — 杂志封面风格卡片
     Phase 4.1
     ══════════════════════════════════════════ */

  const LINKS_STORAGE_KEY = 'lib_external_links';
  let selectedLinkColor = '#c0392b';

  /* 默认链接池（祈鸳指定） */
  const DEFAULT_LINKS = [
    { id: 'time',           name: 'TIME',                          subtitle: 'The World at a Crossroads · 世界时局',       url: 'https://time.com',           color: '#c0392b', builtin: true },
    { id: 'economist',     name: 'The Economist',                 subtitle: 'The Price of Power · 经济学人·全球经济',     url: 'https://www.economist.com',  color: '#c0392b', builtin: true },
    { id: 'ft',            name: 'FINANCIAL HERALD',              subtitle: 'Markets Watch Fed as Growth Cools · 金融时报·市场观察', url: 'https://www.ft.com', color: '#e8b931', builtin: true },
    { id: 'chronicle',     name: 'THE DAILY CHRONICLE',           subtitle: 'Science Breakthrough, A New Era of Discovery · 每日纪事·科学前沿', url: 'https://www.sciencedaily.com', color: '#2980b9', builtin: true },
    { id: 'youtube',       name: 'YouTube',                       subtitle: '视频世界',                                  url: 'https://www.youtube.com',    color: '#c0392b', builtin: true },
    { id: 'bilibili',      name: 'bilibili',                      subtitle: '弹幕宇宙',                                  url: 'https://www.bilibili.com',   color: '#e74c3c', builtin: true },
    { id: 'mit',           name: 'MIT Technology Review',         subtitle: 'The Next Compute Revolution · 麻省理工评论·技术突破', url: 'https://www.technologyreview.com', color: '#27ae60', builtin: true },
    { id: 'literary',      name: 'LITERARY LANTERN',              subtitle: 'Stories That Illuminate Humanity · 文学灯塔·思想与文化', url: 'https://www.literaryhub.com', color: '#8e44ad', builtin: true },
  ];

  /* 读取链接数据（localStorage + 默认合并） */
  function loadLinks() {
    try {
      const stored = JSON.parse(localStorage.getItem(LINKS_STORAGE_KEY));
      if (Array.isArray(stored) && stored.length > 0) return stored;
    } catch (e) { /* ignore */ }
    return [...DEFAULT_LINKS];
  }

  /* 保存链接数据 */
  function saveLinks(links) {
    localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(links));
  }

  /* 渲染外部链接视图 */
  function renderLinks() {
    const links = loadLinks();
    const grid = $('#links-grid');
    if (!grid) return;

    if (links.length === 0) {
      grid.innerHTML = '<p class="empty-state">暂无链接，点击右上角 ＋ 添加</p>';
      return;
    }

    grid.innerHTML = links.map((link, i) => `
      <a class="link-card" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer"
         style="--card-accent: ${link.color || 'rgba(201,149,107,0.15)'}; animation: fadeInUp 0.4s ease ${i * 0.05}s both">
        <button class="link-card-delete" data-id="${escapeHtml(link.id)}" title="删除此链接">&times;</button>
        <div class="link-card-body">
          <div class="link-card-name">${escapeHtml(link.name)}</div>
          <div class="link-card-subtitle">${escapeHtml(link.subtitle || '')}</div>
        </div>
      </a>
    `).join('');

    /* 绑定删除事件 */
    grid.querySelectorAll('.link-card-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id;
        const links = loadLinks();
        const updated = links.filter(l => l.id !== id);
        saveLinks(updated);
        renderLinks();
      });
    });

    /* 更新 badge */
    const badge = $('#badge-links');
    if (badge) badge.textContent = links.length;
  }

  /* ── 添加链接 Modal 逻辑 ── */
  function initLinkModal() {
    const overlay  = $('#link-modal-overlay');
    const addBtn   = $('#links-add-btn');
    const closeBtn = $('#link-modal-close');
    const cancelBtn= $('#link-modal-cancel');
    const saveBtn  = $('#link-modal-save');
    const picker   = $('#link-color-picker');

    if (!overlay || !addBtn) return;

    function openModal() {
      overlay.classList.remove('hidden');
      $('#link-input-name').value = '';
      $('#link-input-subtitle').value = '';
      $('#link-input-url').value = '';
      selectedLinkColor = '#c0392b';
      picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      picker.querySelector('[data-color="#c0392b"]').classList.add('active');
      $('#link-input-name').focus();
    }

    function closeModal() {
      overlay.classList.add('hidden');
    }

    addBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    /* 颜色选择 */
    picker.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        selectedLinkColor = swatch.dataset.color;
      });
    });

    /* 保存 */
    saveBtn.addEventListener('click', () => {
      const name     = $('#link-input-name').value.trim();
      const subtitle = $('#link-input-subtitle').value.trim();
      const url      = $('#link-input-url').value.trim();

      if (!name || !url) {
        /* 简单校验：名称和 URL 必填 */
        if (!name) $('#link-input-name').style.borderColor = 'var(--danger)';
        if (!url)  $('#link-input-url').style.borderColor = 'var(--danger)';
        return;
      }

      const links = loadLinks();
      links.push({
        id: 'custom_' + Date.now(),
        name,
        subtitle: subtitle || '',
        url,
        color: selectedLinkColor,
        builtin: false,
      });
      saveLinks(links);
      closeModal();
      renderLinks();
    });

    /* 输入时清除错误样式 */
    ['link-input-name', 'link-input-url'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => { el.style.borderColor = ''; });
    });
  }

  function renderRecentItems() {
    const items = [...searchIndex]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 8);
    renderList($('#dash-recent-list'), items, '暂无内容');
  }

  /**
   * 通用列表渲染（含交错淡入动画）
   */
  function renderList(container, items, emptyMsg) {
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = `<p class="empty-state">${emptyMsg}</p>`;
      return;
    }
    container.innerHTML = items
      .map((item, i) => createListItem(item, i))
      .join('');
    attachItemListeners(container);
  }


  /* ══════════════════════════════════════════
     百叶帘（Accordion）分组逻辑
     ══════════════════════════════════════════ */

  /**
   * 将简报数组按日期分组，返回 [{date, items}] 数组（日期降序）
   */
  function groupByDate(items) {
    const map = new Map();
    items.forEach(item => {
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date).push(item);
    });
    /* 按日期降序排列 */
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, groupItems]) => ({ date, items: groupItems }));
  }

  /**
   * 渲染百叶帘分组 HTML
   * @param {Array}   groups       - [{date, items}]
   * @param {boolean} openFirst    - 是否默认展开第一组
   */
  function renderAccordionGroups(groups, openFirst = true) {
    return groups.map((group, groupIndex) => {
      const isOpen = openFirst && groupIndex === 0;
      const dateLabel = formatDateFull(group.date);
      const count     = group.items.length;
      const countText = `${count} 份简报`;

      /* 从该日期最新简报摘要中提取金价 */
      const latestItem  = group.items[0];
      const priceMatch  = (latestItem.summary || '').match(/\$([0-9,]+(?:\.\d+)?)/);
      const priceText   = priceMatch ? priceMatch[0] : '';

      /* 简报卡片列表 HTML */
      const cardsHtml = group.items
        .map((item, i) => createListItem(item, i))
        .join('');

      return `
        <div class="accordion-group${isOpen ? ' open' : ''}" data-date="${escapeHtml(group.date)}">
          <div class="accordion-header" role="button" tabindex="0" aria-expanded="${isOpen}">
            <span class="accordion-arrow">${isOpen ? '▼' : '▶'}</span>
            <span class="accordion-date">${escapeHtml(dateLabel)}</span>
            <span class="accordion-meta">
              ${priceText ? `<span class="accordion-price">${escapeHtml(priceText)}</span>` : ''}
              <span class="accordion-count">${escapeHtml(countText)}</span>
            </span>
          </div>
          <div class="accordion-body" style="${isOpen ? '' : 'max-height:0;'}">
            <div class="accordion-content content-list">
              ${cardsHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * 为容器内所有 accordion-header 绑定展开/折叠事件
   */
  function attachAccordionListeners(container) {
    container.querySelectorAll('.accordion-header').forEach(header => {
      const toggle = () => {
        const group = header.closest('.accordion-group');
        const body  = group.querySelector('.accordion-body');
        const arrow = header.querySelector('.accordion-arrow');
        const isOpen = group.classList.contains('open');

        if (isOpen) {
          /* 折叠：先设置当前高度，再归零触发动画 */
          body.style.maxHeight = body.scrollHeight + 'px';
          requestAnimationFrame(() => {
            body.style.maxHeight = '0';
          });
          group.classList.remove('open');
          header.setAttribute('aria-expanded', 'false');
          arrow.textContent = '▶';
        } else {
          /* 展开：设置 scrollHeight */
          body.style.maxHeight = body.scrollHeight + 'px';
          group.classList.add('open');
          header.setAttribute('aria-expanded', 'true');
          arrow.textContent = '▼';
          /* 动画结束后移除固定高度，允许内容自适应 */
          body.addEventListener('transitionend', () => {
            if (group.classList.contains('open')) {
              body.style.maxHeight = 'none';
            }
          }, { once: true });
        }
      };

      header.addEventListener('click', toggle);
      /* 键盘可访问性：Enter / Space 触发 */
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });
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
    $('#badge-links').textContent     = loadLinks().length;
  }

  function updateStats() {
    const counts = { briefing:0, note:0, file:0, link:0 };
    searchIndex.forEach(i => { if (counts[i.type] !== undefined) counts[i.type]++ });
    $('#stat-briefings').textContent = counts.briefing;
    $('#stat-notes').textContent     = counts.note;
    $('#stat-files').textContent     = counts.file;
    $('#stat-links').textContent     = loadLinks().length;
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

    /* 搜索结果中的简报也使用百叶帘分组 */
    const briefingResults = results.filter(i => i.type === 'briefing');
    const otherResults    = results.filter(i => i.type !== 'briefing');

    let html = '';

    /* 非简报结果直接平铺 */
    if (otherResults.length > 0) {
      html += otherResults.map((item, i) => {
        const icon        = getTypeIcon(item.type);
        const titleHtml   = query ? highlightText(escapeHtml(item.title),         query) : escapeHtml(item.title);
        const summaryHtml = query ? highlightText(escapeHtml(item.summary || ''), query) : escapeHtml(item.summary || '');
        const tags        = (item.tags||[]).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
        const delay       = Math.min(i * 55, 400);
        return `
          <div class="content-item animate-in" style="animation-delay:${delay}ms" data-id="${escapeHtml(item.id)}">
            <div class="content-item-icon">${icon}</div>
            <div class="content-item-body">
              <div class="content-item-title">${titleHtml}</div>
              <div class="content-item-summary">${summaryHtml}</div>
              ${tags ? `<div class="content-item-tags">${tags}</div>` : ''}
            </div>
            <div class="content-item-date">${formatDate(item.date)}</div>
          </div>`;
      }).join('');
    }

    /* 简报结果使用百叶帘分组 */
    if (briefingResults.length > 0) {
      const groups = groupByDate(briefingResults);
      html += renderAccordionGroups(groups, true);
    }

    container.innerHTML = html;
    attachAccordionListeners(container);
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
     功能二：文件上传与管理
     ══════════════════════════════════════════ */

  /**
   * 初始化文件上传模块：注入 UI、绑定事件
   */
  function setupFileUpload() {
    const view = $('#view-files');
    if (!view) return;

    /* 在视图顶部注入上传区域 + 文件管理 UI */
    const uploadZoneHtml = `
      <!-- 面包屑导航 -->
      <div class="file-breadcrumb" id="file-breadcrumb">
        <span class="breadcrumb-item breadcrumb-root" data-prefix="">📁 全部文件</span>
      </div>

      <!-- 上传区域 -->
      <div class="file-upload-zone" id="file-upload-zone">
        <div class="upload-drop-area" id="upload-drop-area">
          <div class="upload-drop-icon">☁️</div>
          <div class="upload-drop-text">拖拽文件到此处上传</div>
          <div class="upload-drop-hint">或点击下方按钮选择文件</div>
        </div>
        <div class="upload-controls">
          <label class="upload-btn" for="file-input">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            选择文件
          </label>
          <input type="file" id="file-input" multiple style="display:none">
          <select class="upload-folder-select" id="upload-folder-select">
            <option value="">📂 上传到根目录</option>
          </select>
          <button class="upload-mkdir-btn" id="upload-mkdir-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
            新建文件夹
          </button>
        </div>
        <!-- 上传进度条 -->
        <div class="upload-progress-wrap hidden" id="upload-progress-wrap">
          <div class="upload-progress-label" id="upload-progress-label">上传中...</div>
          <div class="upload-progress-bar">
            <div class="upload-progress-fill" id="upload-progress-fill" style="width:0%"></div>
          </div>
        </div>
      </div>

      <!-- 文件列表区域 -->
      <div class="file-manager" id="file-manager">
        <div class="file-manager-header">
          <span class="file-manager-title">文件列表</span>
          <button class="file-refresh-btn" id="file-refresh-btn" title="刷新">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
            </svg>
            刷新
          </button>
        </div>
        <div class="file-table-wrap" id="file-table-wrap">
          <p class="empty-state">加载中...</p>
        </div>
      </div>
    `;

    /* 替换原有内容区（保留 view-header） */
    const viewHeader = view.querySelector('.view-header');
    /* 移除旧的 content-grid */
    const oldGrid = view.querySelector('#files-list');
    if (oldGrid) oldGrid.remove();

    /* 插入新 UI */
    const wrapper = document.createElement('div');
    wrapper.innerHTML = uploadZoneHtml;
    view.appendChild(wrapper);

    /* 绑定拖拽上传 */
    bindDropZone();
    /* 绑定文件选择 */
    $('#file-input').addEventListener('change', (e) => {
      handleFileUpload([...e.target.files]);
      e.target.value = ''; // 重置，允许重复选同一文件
    });
    /* 绑定新建文件夹 */
    $('#upload-mkdir-btn').addEventListener('click', handleMkdir);
    /* 绑定刷新 */
    $('#file-refresh-btn').addEventListener('click', () => loadFileList());
  }

  /* ── 拖拽上传 ── */
  function bindDropZone() {
    const dropArea = $('#upload-drop-area');
    if (!dropArea) return;

    ['dragenter', 'dragover'].forEach(evt => {
      dropArea.addEventListener(evt, (e) => {
        e.preventDefault();
        dropArea.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(evt => {
      dropArea.addEventListener(evt, (e) => {
        e.preventDefault();
        dropArea.classList.remove('drag-over');
      });
    });
    dropArea.addEventListener('drop', (e) => {
      const files = [...e.dataTransfer.files];
      if (files.length > 0) handleFileUpload(files);
    });
    /* 点击拖拽区也触发文件选择 */
    dropArea.addEventListener('click', () => $('#file-input').click());
  }

  /* ── 上传文件 ── */
  async function handleFileUpload(files) {
    if (!files || files.length === 0) return;

    const folderSelect = $('#upload-folder-select');
    const folder       = folderSelect ? folderSelect.value : '';
    const progressWrap = $('#upload-progress-wrap');
    const progressFill = $('#upload-progress-fill');
    const progressLabel= $('#upload-progress-label');

    progressWrap.classList.remove('hidden');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      progressLabel.textContent = `上传中 (${i + 1}/${files.length})：${file.name}`;
      progressFill.style.width  = '0%';

      const formData = new FormData();
      formData.append('file', file);
      if (folder) formData.append('folder', folder);

      try {
        /* 使用 XMLHttpRequest 以支持进度条 */
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${FILE_API_BASE}/upload`);
          xhr.setRequestHeader('X-Lib-Token', FILE_TOKEN);

          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              progressFill.style.width = Math.round((e.loaded / e.total) * 100) + '%';
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              progressFill.style.width = '100%';
              resolve();
            } else {
              reject(new Error(`上传失败：HTTP ${xhr.status}`));
            }
          });
          xhr.addEventListener('error', () => reject(new Error('网络错误')));
          xhr.send(formData);
        });
      } catch (err) {
        showFileToast(`❌ ${file.name} 上传失败：${err.message}`, 'error');
      }
    }

    progressLabel.textContent = '✅ 上传完成';
    setTimeout(() => progressWrap.classList.add('hidden'), 2000);

    /* 刷新文件列表 */
    loadFileList();
  }

  /* ── 新建文件夹 ── */
  async function handleMkdir() {
    const name = prompt('请输入文件夹名称：');
    if (!name || !name.trim()) return;
    const prefix = name.trim().replace(/[/\\]/g, '-') + '/';

    try {
      const resp = await fetch(`${FILE_API_BASE}/mkdir`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Lib-Token': FILE_TOKEN,
        },
        body: JSON.stringify({ prefix }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      showFileToast(`✅ 文件夹「${name}」创建成功`);
      loadFileList();
    } catch (err) {
      showFileToast(`❌ 创建失败：${err.message}`, 'error');
    }
  }

  /* ── 加载文件列表 ── */
  async function loadFileList() {
    const tableWrap = $('#file-table-wrap');
    if (!tableWrap) return;

    tableWrap.innerHTML = '<p class="empty-state">加载中...</p>';

    try {
      const url  = currentPrefix
        ? `${FILE_API_BASE}?prefix=${encodeURIComponent(currentPrefix)}`
        : FILE_API_BASE;
      const resp = await fetch(url, {
        headers: { 'X-Lib-Token': FILE_TOKEN },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      fileList   = data.files  || [];
      folderList = data.folders || [];

      renderFileTable(tableWrap);
      updateFolderSelect();
      renderBreadcrumb();
    } catch (err) {
      tableWrap.innerHTML = `<p class="empty-state">⚠️ 加载失败：${err.message}</p>`;
    }
  }

  /* ── 渲染文件表格 ── */
  function renderFileTable(container) {
    if (folderList.length === 0 && fileList.length === 0) {
      container.innerHTML = '<p class="empty-state">此文件夹为空</p>';
      return;
    }

    let html = `
      <table class="file-table">
        <thead>
          <tr>
            <th>文件名</th>
            <th>大小</th>
            <th>上传日期</th>
            <th>文件夹</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
    `;

    /* 先渲染文件夹行 */
    folderList.forEach(folder => {
      const folderName = folder.replace(/\/$/, '').split('/').pop();
      html += `
        <tr class="file-row folder-row" data-prefix="${escapeHtml(folder)}">
          <td class="file-name-cell">
            <span class="file-icon">📂</span>
            <span class="file-name folder-link" data-prefix="${escapeHtml(folder)}">${escapeHtml(folderName)}</span>
          </td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
          <td>
            <button class="file-action-btn file-delete-btn" data-key="${escapeHtml(folder)}" title="删除文件夹">🗑️</button>
          </td>
        </tr>
      `;
    });

    /* 渲染文件行 */
    fileList.forEach(file => {
      const fileName   = file.key.split('/').pop();
      const folderPath = file.key.includes('/')
        ? file.key.split('/').slice(0, -1).join('/')
        : '根目录';
      const sizeText   = formatFileSize(file.size);
      const dateText   = file.lastModified
        ? new Date(file.lastModified).toLocaleDateString('zh-CN')
        : '—';

      html += `
        <tr class="file-row" data-key="${escapeHtml(file.key)}">
          <td class="file-name-cell">
            <span class="file-icon">${getFileIcon(fileName)}</span>
            <span class="file-name" data-key="${escapeHtml(file.key)}" title="${escapeHtml(file.key)}">${escapeHtml(fileName)}</span>
            <button class="file-rename-btn" data-key="${escapeHtml(file.key)}" title="重命名">✏️</button>
          </td>
          <td>${escapeHtml(sizeText)}</td>
          <td>${escapeHtml(dateText)}</td>
          <td>${escapeHtml(folderPath)}</td>
          <td class="file-actions-cell">
            <a class="file-action-btn file-download-btn"
               href="${FILE_API_BASE}/download?key=${encodeURIComponent(file.key)}"
               download="${escapeHtml(fileName)}"
               title="下载">⬇️</a>
            <button class="file-action-btn file-delete-btn" data-key="${escapeHtml(file.key)}" title="删除">🗑️</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    /* 绑定文件夹点击（进入子目录） */
    container.querySelectorAll('.folder-link').forEach(el => {
      el.addEventListener('click', () => {
        currentPrefix = el.dataset.prefix;
        loadFileList();
      });
    });

    /* 绑定重命名 */
    container.querySelectorAll('.file-rename-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleRename(btn.dataset.key);
      });
    });

    /* 绑定删除 */
    container.querySelectorAll('.file-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDelete(btn.dataset.key);
      });
    });
  }

  /* ── 重命名文件 ── */
  async function handleRename(oldKey) {
    const oldName = oldKey.split('/').pop();
    const newName = prompt(`重命名文件：`, oldName);
    if (!newName || newName === oldName) return;

    const prefix = oldKey.includes('/')
      ? oldKey.split('/').slice(0, -1).join('/') + '/'
      : '';
    const newKey = prefix + newName;

    try {
      const resp = await fetch(FILE_API_BASE, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Lib-Token': FILE_TOKEN,
        },
        body: JSON.stringify({ oldKey, newKey }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      showFileToast(`✅ 已重命名为「${newName}」`);
      loadFileList();
    } catch (err) {
      showFileToast(`❌ 重命名失败：${err.message}`, 'error');
    }
  }

  /* ── 删除文件/文件夹 ── */
  async function handleDelete(key) {
    const name = key.split('/').filter(Boolean).pop();
    if (!confirm(`确定要删除「${name}」吗？此操作不可撤销。`)) return;

    try {
      const resp = await fetch(`${FILE_API_BASE}?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: { 'X-Lib-Token': FILE_TOKEN },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      showFileToast(`✅ 已删除「${name}」`);
      loadFileList();
    } catch (err) {
      showFileToast(`❌ 删除失败：${err.message}`, 'error');
    }
  }

  /* ── 更新文件夹下拉选择 ── */
  function updateFolderSelect() {
    const select = $('#upload-folder-select');
    if (!select) return;

    /* 收集所有文件夹（从文件列表中提取 + folderList） */
    const allFolders = new Set(folderList);
    fileList.forEach(f => {
      if (f.key.includes('/')) {
        allFolders.add(f.key.split('/').slice(0, -1).join('/') + '/');
      }
    });

    select.innerHTML = '<option value="">📂 上传到根目录</option>';
    [...allFolders].sort().forEach(folder => {
      const name = folder.replace(/\/$/, '');
      const opt  = document.createElement('option');
      opt.value       = name;
      opt.textContent = `📁 ${name}`;
      select.appendChild(opt);
    });
  }

  /* ── 渲染面包屑导航 ── */
  function renderBreadcrumb() {
    const bc = $('#file-breadcrumb');
    if (!bc) return;

    if (!currentPrefix) {
      bc.innerHTML = `<span class="breadcrumb-item breadcrumb-root" data-prefix="">📁 全部文件</span>`;
    } else {
      const parts  = currentPrefix.replace(/\/$/, '').split('/');
      let   html   = `<span class="breadcrumb-item breadcrumb-root" data-prefix="">📁 全部文件</span>`;
      let   cumulative = '';
      parts.forEach((part, i) => {
        cumulative += part + '/';
        const isLast = i === parts.length - 1;
        html += `<span class="breadcrumb-sep">›</span>`;
        if (isLast) {
          html += `<span class="breadcrumb-item breadcrumb-current">${escapeHtml(part)}</span>`;
        } else {
          html += `<span class="breadcrumb-item" data-prefix="${escapeHtml(cumulative)}">${escapeHtml(part)}</span>`;
        }
      });
      bc.innerHTML = html;
    }

    /* 绑定面包屑点击 */
    bc.querySelectorAll('.breadcrumb-item[data-prefix]').forEach(el => {
      el.addEventListener('click', () => {
        currentPrefix = el.dataset.prefix;
        loadFileList();
      });
    });
  }

  /* ── 文件操作提示 Toast ── */
  function showFileToast(msg, type = 'success') {
    let toast = $('#file-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'file-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className   = `file-toast file-toast-${type} show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
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

  /* 日期格式化（完整版）：YYYY年M月D日 周X */
  function formatDateFull(dateStr) {
    if (!dateStr) return '';
    const d        = new Date(dateStr + 'T00:00:00');
    const weekdays = ['日','一','二','三','四','五','六'];
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 周${weekdays[d.getDay()]}`;
  }

  /* 文件大小格式化 */
  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1024/1024).toFixed(2)} MB`;
  }

  /* 根据文件扩展名返回图标 */
  function getFileIcon(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const map  = {
      pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
      ppt: '📋', pptx: '📋', txt: '📃', md: '📃',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
      mp4: '🎬', mov: '🎬', avi: '🎬', mp3: '🎵', wav: '🎵',
      zip: '🗜️', rar: '🗜️', '7z': '🗜️', tar: '🗜️', gz: '🗜️',
      js: '⚙️', ts: '⚙️', json: '⚙️', html: '🌐', css: '🎨',
    };
    return map[ext] || '📎';
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
     Phase 4：Logo 回首页 + 闲置登出
     ══════════════════════════════════════════ */

  /* Logo 点击回到仪表盘首页 */
  function setupLogoHome() {
    const logo = $('#logo-home');
    if (!logo) return;
    logo.style.cursor = 'pointer';
    logo.addEventListener('click', () => {
      navigateTo('dashboard');
      window.location.hash = 'dashboard';
    });
  }

  /* 闲置 30 分钟自动登出 */
  function setupIdleTimeout() {
    const IDLE_LIMIT = 30 * 60 * 1000; // 30 分钟
    let idleTimer = null;

    function resetTimer() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        sessionStorage.removeItem('lib_auth');
        sessionStorage.removeItem('lib_auth_time');
        window.location.href = 'index.html';
      }, IDLE_LIMIT);
    }

    /* 监听用户活动 */
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
      document.addEventListener(evt, resetTimer, { passive: true });
    });

    resetTimer(); // 启动计时
  }


  /* ══════════════════════════════════════════
     Phase 4：登录页动态问候语
     ══════════════════════════════════════════ */

  /**
   * 根据用户所在时区的小时数 + 浏览器语言，生成图书馆管理员风格的问候语。
   * 此函数在 index.html（登录页）中调用，不在 app.js 的 IIFE 内。
   */
  window.getLibraryGreeting = function () {
    const hour = new Date().getHours();
    const lang = (navigator.language || 'en').toLowerCase();
    const isZh = lang.startsWith('zh');

    if (isZh) {
      if (hour >= 0  && hour < 5)  return '夜深了，远道而来的旅者。是什么知识，让你深夜造访此处？';
      if (hour >= 5  && hour < 8)  return '清晨的图书馆格外宁静。愿这里的书卷，为你开启新的一天。';
      if (hour >= 8  && hour < 11) return '日安，求知者。今日的阳光正好，适合翻阅古老的典籍。';
      if (hour >= 11 && hour < 13) return '午后时光，适合沉思。图书馆已为你备好了一切。';
      if (hour >= 13 && hour < 17) return '午后阳光透过彩窗洒落。来吧，知识不会自己跑到你面前。';
      if (hour >= 17 && hour < 19) return '暮色渐浓，烛火已为你点亮。欢迎回到图书馆。';
      if (hour >= 19 && hour < 23) return '夜幕降临，图书馆的魔法正在苏醒。今夜，你想寻找什么？';
      return '夜深了，远道而来的旅者。是什么知识，让你深夜造访此处？';
    }

    if (hour >= 0  && hour < 5)  return 'The night is deep, traveler. What knowledge draws you here at this hour?';
    if (hour >= 5  && hour < 8)  return 'The library is quiet in the early morning. May these volumes begin your day.';
    if (hour >= 8  && hour < 11) return 'Good day, seeker. The light is perfect for exploring ancient tomes.';
    if (hour >= 11 && hour < 13) return 'Midday is a time for reflection. The library awaits your curiosity.';
    if (hour >= 13 && hour < 17) return 'Afternoon light filters through the stained glass. Come, knowledge will not find itself.';
    if (hour >= 17 && hour < 19) return 'Dusk falls, and the candles are lit for you. Welcome back to the library.';
    if (hour >= 19 && hour < 23) return 'Night descends, and the library\'s magic awakens. What do you seek tonight?';
    return 'The night is deep, traveler. What knowledge draws you here at this hour?';
  };


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
