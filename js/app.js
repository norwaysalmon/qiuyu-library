/* ============================================
   祈鸳的图书馆 - 主应用逻辑
   ============================================ */

(function () {
  'use strict';

  // ── Auth Check ──
  if (!sessionStorage.getItem('lib_auth')) {
    window.location.href = 'index.html';
    return;
  }

  // ── State ──
  let searchIndex = [];
  let currentView = 'dashboard';

  // ── DOM Helpers ──
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ── Initialize ──
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

    const hash = window.location.hash.slice(1) || 'dashboard';
    navigateTo(hash);
  }

  // ── Search Index ──
  async function loadSearchIndex() {
    try {
      const resp = await fetch('data/search-index.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      searchIndex = await resp.json();
    } catch (e) {
      console.error('Failed to load search index:', e);
      searchIndex = [];
    }
  }

  // ── Navigation ──
  function setupNavigation() {
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        navigateTo(view);
        window.location.hash = view;
        if (window.innerWidth <= 900) {
          $('#sidebar').classList.remove('open');
        }
      });
    });

    $('#sidebar-toggle').addEventListener('click', () => {
      $('#sidebar').classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 900) {
        const sidebar = $('#sidebar');
        const toggle = $('#sidebar-toggle');
        if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
          sidebar.classList.remove('open');
        }
      }
    });
  }

  function navigateTo(view) {
    currentView = view;
    $$('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });
    $$('.view').forEach(v => v.classList.add('hidden'));
    const target = $(`#view-${view}`);
    if (target) target.classList.remove('hidden');

    switch (view) {
      case 'dashboard':  renderRecentItems(); break;
      case 'briefings':  renderBriefings();   break;
      case 'notes':      renderNotes();        break;
      case 'files':      renderFiles();        break;
      case 'links':      renderLinks();        break;
    }
  }

  // ── Render Functions ──
  function renderBriefings() {
    const items = searchIndex.filter(i => i.type === 'briefing').sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const container = $('#briefings-list');
    if (items.length === 0) { container.innerHTML = '<p class="empty-state">暂无简报</p>'; return; }
    container.innerHTML = items.map(createListItem).join('');
    attachItemListeners(container);
  }

  function renderNotes() {
    const items = searchIndex.filter(i => i.type === 'note').sort((a, b) => b.date.localeCompare(a.date));
    const container = $('#notes-list');
    if (items.length === 0) { container.innerHTML = '<p class="empty-state">暂无笔记</p>'; return; }
    container.innerHTML = items.map(createListItem).join('');
    attachItemListeners(container);
  }

  function renderFiles() {
    const items = searchIndex.filter(i => i.type === 'file').sort((a, b) => b.date.localeCompare(a.date));
    const container = $('#files-list');
    if (items.length === 0) { container.innerHTML = '<p class="empty-state">暂无文件</p>'; return; }
    container.innerHTML = items.map(createListItem).join('');
    attachItemListeners(container);
  }

  function renderLinks() {
    const items = searchIndex.filter(i => i.type === 'link').sort((a, b) => b.date.localeCompare(a.date));
    const container = $('#links-list');
    if (items.length === 0) { container.innerHTML = '<p class="empty-state">暂无链接</p>'; return; }
    container.innerHTML = items.map(createListItem).join('');
    attachItemListeners(container);
  }

  function renderRecentItems() {
    const items = [...searchIndex].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 8);
    const container = $('#dash-recent-list');
    if (items.length === 0) { container.innerHTML = '<p class="empty-state">暂无内容</p>'; return; }
    container.innerHTML = items.map(createListItem).join('');
    attachItemListeners(container);
  }

  // ── Briefing Type Helpers ──
  function getBriefingType(id) {
    if (!id) return null;
    if (id.endsWith('-noon')) {
      return {
        label: '午间', emoji: '🌅',
        color: 'var(--color-noon)',
        badgeBg: 'rgba(212,149,74,0.12)',
        badgeColor: '#e8a85a',
        badgeBorder: 'rgba(212,149,74,0.25)',
      };
    }
    if (id.endsWith('-close')) {
      return {
        label: '收盘', emoji: '🌙',
        color: 'var(--color-close)',
        badgeBg: 'rgba(155,48,80,0.12)',
        badgeColor: '#c96080',
        badgeBorder: 'rgba(155,48,80,0.28)',
      };
    }
    if (id.endsWith('-evening')) {
      return {
        label: '补充', emoji: '📡',
        color: 'var(--color-evening)',
        badgeBg: 'rgba(61,127,193,0.12)',
        badgeColor: '#6aaee0',
        badgeBorder: 'rgba(61,127,193,0.28)',
      };
    }
    if (id.endsWith('-weekend')) {
      return {
        label: '周末特刊', emoji: '📅',
        color: 'var(--color-weekend)',
        badgeBg: 'rgba(124,92,191,0.12)',
        badgeColor: '#a888e0',
        badgeBorder: 'rgba(124,92,191,0.28)',
      };
    }
    return null;
  }

  // ── Create List Item ──
  function createListItem(item) {
    const icon = getTypeIcon(item.type);
    const tags = (item.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');

    // Briefing-specific enhancements
    let extraClass = '';
    let extraStyles = '';
    let typeBadgeHtml = '';

    if (item.type === 'briefing') {
      const btype = getBriefingType(item.id);
      if (btype) {
        extraClass = ' briefing-item';
        extraStyles = `style="--briefing-color:${btype.color}"`;
        typeBadgeHtml = `
          <div class="briefing-type-badge"
               style="--badge-bg:${btype.badgeBg};--badge-color:${btype.badgeColor};--badge-border:${btype.badgeBorder}">
            ${btype.emoji} ${btype.label}
          </div>`;
      }
    }

    return `
      <div class="content-item${extraClass}" ${extraStyles} data-id="${escapeHtml(item.id)}">
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

  function attachItemListeners(container) {
    container.querySelectorAll('.content-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const item = searchIndex.find(i => i.id === id);
        if (item) openItem(item);
      });
    });
  }

  // ── Badges & Stats ──
  function updateBadges() {
    const counts = { briefing: 0, note: 0, file: 0, link: 0 };
    searchIndex.forEach(i => { if (counts[i.type] !== undefined) counts[i.type]++; });
    $('#badge-briefings').textContent = counts.briefing;
    $('#badge-notes').textContent = counts.note;
    $('#badge-files').textContent = counts.file;
    $('#badge-links').textContent = counts.link;
  }

  function updateStats() {
    const counts = { briefing: 0, note: 0, file: 0, link: 0 };
    searchIndex.forEach(i => { if (counts[i.type] !== undefined) counts[i.type]++; });
    $('#stat-briefings').textContent = counts.briefing;
    $('#stat-notes').textContent = counts.note;
    $('#stat-files').textContent = counts.file;
    $('#stat-links').textContent = counts.link;
  }

  // ── Gold Price Card ──
  function updateGoldPrice() {
    const priceEl = $('#dash-gold-price');
    const summaryEl = $('#dash-gold-summary');
    const sourceEl = $('#dash-gold-source');
    if (!priceEl) return;

    // Find the most recent briefing (sort by date desc, then id desc for same-day)
    const briefings = searchIndex
      .filter(i => i.type === 'briefing')
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    if (briefings.length === 0) {
      priceEl.textContent = '暂无数据';
      return;
    }

    const latest = briefings[0];
    const summary = latest.summary || '';

    // Extract first gold price ($X,XXX or $X,XXX.XX)
    const priceMatch = summary.match(/\$([0-9,]+(?:\.\d+)?)/);
    const price = priceMatch ? priceMatch[0] : null;

    // Detect trend from Chinese keywords
    let trendHtml = '';
    if (/下挫|下跌|跌|走低|承压|回落|低|下行/.test(summary)) {
      trendHtml = `<span class="gold-trend down">↓</span>`;
    } else if (/上涨|走高|升|强势|突破|涨|高|上行/.test(summary)) {
      trendHtml = `<span class="gold-trend up">↑</span>`;
    }

    if (price) {
      priceEl.innerHTML = `<span class="gold-price-num">${escapeHtml(price)}</span>${trendHtml}`;
    } else {
      priceEl.textContent = '查看最新简报';
    }

    // Show a trimmed excerpt of the summary (first sentence)
    if (summaryEl) {
      const firstSentence = summary.replace(/。.*/, '').slice(0, 60) + (summary.length > 60 ? '…' : '');
      summaryEl.textContent = firstSentence;
    }

    if (sourceEl) {
      const btype = getBriefingType(latest.id);
      const typeLabel = btype ? `${btype.emoji} ${btype.label} · ` : '';
      sourceEl.textContent = `${typeLabel}${latest.date}`;
    }
  }

  // ── Search ──
  function setupSearch() {
    const input = $('#search-input');
    const filters = $('#search-filters');

    input.addEventListener('focus', () => filters.classList.add('open'));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) {
        filters.classList.remove('open');
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performSearch();
        filters.classList.remove('open');
      }
    });
    $('#search-type').addEventListener('change', performSearch);
    $('#search-date-from').addEventListener('change', performSearch);
    $('#search-date-to').addEventListener('change', performSearch);
  }

  function performSearch() {
    const query = $('#search-input').value.trim().toLowerCase();
    const type = $('#search-type').value;
    const dateFrom = $('#search-date-from').value;
    const dateTo = $('#search-date-to').value;

    if (!query && !dateFrom && !dateTo) {
      navigateTo('dashboard');
      return;
    }

    let results = [...searchIndex];
    if (type !== 'all') results = results.filter(i => i.type === type);
    if (dateFrom) results = results.filter(i => i.date >= dateFrom);
    if (dateTo)   results = results.filter(i => i.date <= dateTo);
    if (query) {
      results = results.filter(i => {
        const text = `${i.title} ${i.summary} ${(i.tags || []).join(' ')} ${(i.content || '')}`.toLowerCase();
        return text.includes(query);
      });
    }
    results.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    $$('.view').forEach(v => v.classList.add('hidden'));
    $('#view-search').classList.remove('hidden');
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    currentView = 'search';

    const summary = query
      ? `找到 ${results.length} 条与「${escapeHtml(query)}」相关的结果`
      : `找到 ${results.length} 条结果`;
    $('#search-summary').textContent = summary;

    const container = $('#search-results');
    if (results.length === 0) {
      container.innerHTML = '<p class="empty-state">未找到匹配的内容</p>';
      return;
    }
    container.innerHTML = results.map(item => {
      const icon = getTypeIcon(item.type);
      const title = query ? highlightText(escapeHtml(item.title), query) : escapeHtml(item.title);
      const summaryText = query ? highlightText(escapeHtml(item.summary || ''), query) : escapeHtml(item.summary || '');
      const tags = (item.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');

      let extraClass = '';
      let extraStyles = '';
      let typeBadgeHtml = '';
      if (item.type === 'briefing') {
        const btype = getBriefingType(item.id);
        if (btype) {
          extraClass = ' briefing-item';
          extraStyles = `style="--briefing-color:${btype.color}"`;
          typeBadgeHtml = `<div class="briefing-type-badge" style="--badge-bg:${btype.badgeBg};--badge-color:${btype.badgeColor};--badge-border:${btype.badgeBorder}">${btype.emoji} ${btype.label}</div>`;
        }
      }

      return `
        <div class="content-item${extraClass}" ${extraStyles} data-id="${escapeHtml(item.id)}">
          <div class="content-item-icon">${icon}</div>
          <div class="content-item-body">
            <div class="content-item-title">${title}</div>
            ${typeBadgeHtml}
            <div class="content-item-summary">${summaryText}</div>
            ${tags ? `<div class="content-item-tags">${tags}</div>` : ''}
          </div>
          <div class="content-item-date">${formatDate(item.date)}</div>
        </div>
      `;
    }).join('');
    attachItemListeners(container);
  }

  // ── Modal ──
  function setupModal() {
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal-overlay').addEventListener('click', (e) => {
      if (e.target === $('#modal-overlay')) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  async function openItem(item) {
    $('#modal-title').textContent = item.title;

    const btype = item.type === 'briefing' ? getBriefingType(item.id) : null;
    const typeBadge = btype
      ? `<span class="briefing-type-badge" style="--badge-bg:${btype.badgeBg};--badge-color:${btype.badgeColor};--badge-border:${btype.badgeBorder}">${btype.emoji} ${btype.label}</span>`
      : '';
    $('#modal-meta').innerHTML = `
      <span>${getTypeIcon(item.type)} ${getTypeLabel(item.type)}</span>
      ${typeBadge}
      <span>📅 ${item.date}</span>
      ${(item.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
    `;

    let html = item.content || '';
    if (item.url && !item.content) {
      try {
        const resp = await fetch(item.url);
        if (resp.ok) {
          const text = await resp.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'text/html');
          html = doc.querySelector('body')?.innerHTML || text;
        } else {
          html = `<p>无法加载内容。${item.url ? `<a href="${item.url}" target="_blank">点击此处直接打开 ↗</a>` : ''}</p>`;
        }
      } catch (e) {
        html = `<p>加载失败。${item.url ? `<a href="${item.url}" target="_blank">点击此处直接打开 ↗</a>` : ''}</p>`;
      }
    }

    // Set content
    const bodyEl = $('#modal-body');
    bodyEl.innerHTML = html;

    // Post-process: wrap all bare tables for horizontal scrolling
    bodyEl.querySelectorAll('table').forEach(table => {
      if (!table.parentElement.classList.contains('table-wrap')) {
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
      }
    });

    $('#modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $('#modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }

  // ── Clock ──
  function startClock() {
    function update() {
      const now = new Date();
      const timeOpts = { timeZone: 'Asia/Shanghai', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' };
      const dateOpts = { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
      const timeStr = now.toLocaleTimeString('zh-CN', timeOpts);
      const dateStr = now.toLocaleDateString('zh-CN', dateOpts);

      const clockTime = $('#clock-time');
      const clockDate = $('#clock-date');
      if (clockTime) clockTime.textContent = timeStr;
      if (clockDate) clockDate.textContent = dateStr;

      const dashTime = $('#dash-clock-time');
      const dashDate = $('#dash-clock-date');
      if (dashTime) dashTime.textContent = timeStr;
      if (dashDate) dashDate.textContent = dateStr;
    }
    update();
    setInterval(update, 1000);
  }

  // ── Weather ──
  async function fetchWeather() {
    try {
      const resp = await fetch('https://wttr.in/Shanghai?format=j1');
      const data = await resp.json();
      const current = data.current_condition[0];
      const temp = current.temp_C;
      const desc = (current.lang_zh && current.lang_zh[0]) ? current.lang_zh[0].value : current.weatherDesc[0].value;
      const emoji = getWeatherEmoji(parseInt(current.weatherCode));
      const feelsLike = current.FeelsLikeC;
      const humidity = current.humidity;

      const weatherText = `${temp}°C · ${desc} · 体感 ${feelsLike}°C · 湿度 ${humidity}%`;

      const wi = $('#weather-icon');   if (wi) wi.textContent = emoji;
      const wt = $('#weather-temp');   if (wt) wt.textContent = `${temp}°C`;
      const wd = $('#weather-desc');   if (wd) wd.textContent = desc;

      const dwi = $('#dash-weather-icon');  if (dwi) dwi.textContent = emoji;
      const dwt = $('#dash-weather-text');  if (dwt) dwt.textContent = weatherText;
    } catch (e) {
      console.error('Weather fetch failed:', e);
      const wd = $('#weather-desc');  if (wd) wd.textContent = '天气加载失败';
      const dwt = $('#dash-weather-text');  if (dwt) dwt.textContent = '天气数据暂不可用';
    }
  }

  // ── Logout ──
  function setupLogout() {
    $('#logout-btn').addEventListener('click', () => {
      sessionStorage.removeItem('lib_auth');
      sessionStorage.removeItem('lib_auth_time');
      window.location.href = 'index.html';
    });
  }

  // ── Utility ──
  function getTypeIcon(type) {
    return { briefing: '📊', note: '📝', file: '📁', link: '🔗' }[type] || '📄';
  }

  function getTypeLabel(type) {
    return { briefing: '简报', note: '笔记', file: '文件', link: '链接' }[type] || type;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekdays = ['日','一','二','三','四','五','六'];
    return `${month}月${day}日 周${weekdays[d.getDay()]}`;
  }

  function getWeatherEmoji(code) {
    if (code === 113) return '☀️';
    if (code === 116) return '⛅';
    if (code === 119 || code === 122) return '☁️';
    if (code >= 263 && code <= 311) return '🌧️';
    if (code >= 320 && code <= 395) return '❄️';
    if (code >= 386 && code <= 395) return '⛈️';
    if (code >= 200 && code <= 232) return '⛈️';
    return '🌤️';
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function highlightText(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }

  // ── Hash Change ──
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash && hash !== 'search') navigateTo(hash);
  });

  // ── Start ──
  init();
})();
