/* ============================================
   祈鸳的图书馆 - 主应用逻辑
   ============================================ */

(function () {
  'use strict';

  // --- Auth Check ---
  if (!sessionStorage.getItem('lib_auth')) {
    window.location.href = 'index.html';
    return;
  }

  // --- State ---
  let searchIndex = [];
  let currentView = 'dashboard';

  // --- DOM Helpers ---
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // --- Initialize ---
  async function init() {
    await loadSearchIndex();
    updateBadges();
    updateStats();
    renderRecentItems();
    startClock();
    fetchWeather();
    setupNavigation();
    setupSearch();
    setupModal();
    setupLogout();

    const hash = window.location.hash.slice(1) || 'dashboard';
    navigateTo(hash);
  }

  // --- Search Index ---
  async function loadSearchIndex() {
    try {
      const resp = await fetch('data/search-index-v2.json');
      searchIndex = await resp.json();
    } catch (e) {
      console.error('Failed to load search index:', e);
      searchIndex = [];
    }
  }

  // --- Navigation ---
  function setupNavigation() {
    // Sidebar nav items
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        navigateTo(view);
        window.location.hash = view;
        // Close sidebar on mobile
        if (window.innerWidth <= 900) {
          $('#sidebar').classList.remove('open');
        }
      });
    });

    // Sidebar toggle
    $('#sidebar-toggle').addEventListener('click', () => {
      $('#sidebar').classList.toggle('open');
    });

    // Close sidebar when clicking outside on mobile
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
    // Update nav items
    $$('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });
    // Show/hide views
    $$('.view').forEach(v => v.classList.add('hidden'));
    const target = $(`#view-${view}`);
    if (target) target.classList.remove('hidden');

    // Render view content
    switch (view) {
      case 'dashboard': renderRecentItems(); break;
      case 'briefings': renderBriefings(); break;
      case 'notes': renderNotes(); break;
      case 'files': renderFiles(); break;
      case 'links': renderLinks(); break;
    }
  }

  // --- Render Functions ---
  function renderBriefings() {
    const items = searchIndex.filter(i => i.type === 'briefing').sort((a, b) => b.date.localeCompare(a.date));
    const container = $('#briefings-list');
    if (items.length === 0) {
      container.innerHTML = '<p class="empty-state">暂无简报</p>';
      return;
    }
    container.innerHTML = items.map(item => createListItem(item)).join('');
    attachItemListeners(container);
  }

  function renderNotes() {
    const items = searchIndex.filter(i => i.type === 'note').sort((a, b) => b.date.localeCompare(a.date));
    const container = $('#notes-list');
    if (items.length === 0) {
      container.innerHTML = '<p class="empty-state">暂无笔记</p>';
      return;
    }
    container.innerHTML = items.map(item => createListItem(item)).join('');
    attachItemListeners(container);
  }

  function renderFiles() {
    const items = searchIndex.filter(i => i.type === 'file').sort((a, b) => b.date.localeCompare(a.date));
    const container = $('#files-list');
    if (items.length === 0) {
      container.innerHTML = '<p class="empty-state">暂无文件</p>';
      return;
    }
    container.innerHTML = items.map(item => createListItem(item)).join('');
    attachItemListeners(container);
  }

  function renderLinks() {
    const items = searchIndex.filter(i => i.type === 'link').sort((a, b) => b.date.localeCompare(a.date));
    const container = $('#links-list');
    if (items.length === 0) {
      container.innerHTML = '<p class="empty-state">暂无链接</p>';
      return;
    }
    container.innerHTML = items.map(item => createListItem(item)).join('');
    attachItemListeners(container);
  }

  function renderRecentItems() {
    const items = [...searchIndex].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    const container = $('#dash-recent-list');
    if (items.length === 0) {
      container.innerHTML = '<p class="empty-state">暂无内容</p>';
      return;
    }
    container.innerHTML = items.map(item => createListItem(item)).join('');
    attachItemListeners(container);
  }

  function createListItem(item) {
    const icon = getTypeIcon(item.type);
    const tags = (item.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    return `
      <div class="content-item" data-id="${escapeHtml(item.id)}">
        <div class="content-item-icon">${icon}</div>
        <div class="content-item-body">
          <div class="content-item-title">${escapeHtml(item.title)}</div>
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

  // --- Badges & Stats ---
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

  // --- Search ---
  function setupSearch() {
    const input = $('#search-input');
    const filters = $('#search-filters');
    const typeSelect = $('#search-type');
    const dateFrom = $('#search-date-from');
    const dateTo = $('#search-date-to');

    // Show filters on focus
    input.addEventListener('focus', () => filters.classList.add('open'));

    // Hide filters on click outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) {
        filters.classList.remove('open');
      }
    });

    // Search on Enter
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performSearch();
        filters.classList.remove('open');
      }
    });

    // Re-search on filter change
    typeSelect.addEventListener('change', performSearch);
    dateFrom.addEventListener('change', performSearch);
    dateTo.addEventListener('change', performSearch);
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

    // Filter by type
    if (type !== 'all') {
      results = results.filter(i => i.type === type);
    }

    // Filter by date range
    if (dateFrom) {
      results = results.filter(i => i.date >= dateFrom);
    }
    if (dateTo) {
      results = results.filter(i => i.date <= dateTo);
    }

    // Filter by keyword
    if (query) {
      results = results.filter(i => {
        const text = `${i.title} ${i.summary} ${(i.tags || []).join(' ')} ${(i.content || '')}`.toLowerCase();
        return text.includes(query);
      });
    }

    // Sort by date
    results.sort((a, b) => b.date.localeCompare(a.date));

    // Show search view
    $$('.view').forEach(v => v.classList.add('hidden'));
    $('#view-search').classList.remove('hidden');
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    currentView = 'search';

    // Update summary
    const summary = query
      ? `找到 ${results.length} 条与「${escapeHtml(query)}」相关的结果`
      : `找到 ${results.length} 条结果`;
    $('#search-summary').textContent = summary;

    // Render results
    const container = $('#search-results');
    if (results.length === 0) {
      container.innerHTML = '<p class="empty-state">未找到匹配的内容</p>';
      return;
    }
    container.innerHTML = results.map(item => {
      const icon = getTypeIcon(item.type);
      const title = query ? highlightText(escapeHtml(item.title), query) : escapeHtml(item.title);
      const summary_text = query ? highlightText(escapeHtml(item.summary || ''), query) : escapeHtml(item.summary || '');
      const tags = (item.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
      return `
        <div class="content-item" data-id="${escapeHtml(item.id)}">
          <div class="content-item-icon">${icon}</div>
          <div class="content-item-body">
            <div class="content-item-title">${title}</div>
            <div class="content-item-summary">${summary_text}</div>
            ${tags ? `<div class="content-item-tags">${tags}</div>` : ''}
          </div>
          <div class="content-item-date">${formatDate(item.date)}</div>
        </div>
      `;
    }).join('');
    attachItemListeners(container);
  }

  // --- Modal ---
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
    $('#modal-meta').innerHTML = `
      <span>${getTypeIcon(item.type)} ${getTypeLabel(item.type)}</span>
      <span>📅 ${item.date}</span>
      ${(item.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
    `;

    // Try to load content from URL or use inline content
    let html = item.content || '';
    if (item.url && !item.content) {
      try {
        const resp = await fetch(item.url);
        if (resp.ok) {
          const text = await resp.text();
          // Extract body content if it's a full HTML page
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'text/html');
          const body = doc.querySelector('body');
          html = body ? body.innerHTML : text;
        } else {
          html = `<p>无法加载内容。${item.url ? `<a href="${item.url}" target="_blank">点击此处直接打开</a>` : ''}</p>`;
        }
      } catch (e) {
        html = `<p>加载失败。${item.url ? `<a href="${item.url}" target="_blank">点击此处直接打开</a>` : ''}</p>`;
      }
    }

    $('#modal-body').innerHTML = html;
    $('#modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $('#modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }

  // --- Clock ---
  function startClock() {
    function update() {
      const now = new Date();
      const timeOpts = { timeZone: 'Asia/Shanghai', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' };
      const dateOpts = { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };

      const timeStr = now.toLocaleTimeString('zh-CN', timeOpts);
      const dateStr = now.toLocaleDateString('zh-CN', dateOpts);

      // Topbar clock
      $('#clock-time').textContent = timeStr;
      $('#clock-date').textContent = dateStr;

      // Dashboard clock
      const dashTime = $('#dash-clock-time');
      const dashDate = $('#dash-clock-date');
      if (dashTime) dashTime.textContent = timeStr;
      if (dashDate) dashDate.textContent = dateStr;
    }
    update();
    setInterval(update, 1000);
  }

  // --- Weather ---
  async function fetchWeather() {
    try {
      const resp = await fetch('https://wttr.in/Shanghai?format=j1');
      const data = await resp.json();
      const current = data.current_condition[0];
      const temp = current.temp_C;
      const desc = current.lang_zh && current.lang_zh[0] ? current.lang_zh[0].value : current.weatherDesc[0].value;
      const code = parseInt(current.weatherCode);
      const emoji = getWeatherEmoji(code);
      const feelsLike = current.FeelsLikeC;
      const humidity = current.humidity;

      const weatherText = `${temp}°C · ${desc} · 体感${feelsLike}°C · 湿度${humidity}%`;

      // Topbar weather
      $('#weather-icon').textContent = emoji;
      $('#weather-temp').textContent = `${temp}°C`;
      $('#weather-desc').textContent = desc;

      // Dashboard weather
      const dashIcon = $('#dash-weather-icon');
      const dashText = $('#dash-weather-text');
      if (dashIcon) dashIcon.textContent = emoji;
      if (dashText) dashText.textContent = weatherText;
    } catch (e) {
      console.error('Weather fetch failed:', e);
      $('#weather-desc').textContent = '天气加载失败';
      const dashText = $('#dash-weather-text');
      if (dashText) dashText.textContent = '天气数据暂不可用';
    }
  }

  // --- Logout ---
  function setupLogout() {
    $('#logout-btn').addEventListener('click', () => {
      sessionStorage.removeItem('lib_auth');
      sessionStorage.removeItem('lib_auth_time');
      window.location.href = 'index.html';
    });
  }

  // --- Utility Functions ---
  function getTypeIcon(type) {
    const icons = { briefing: '📊', note: '📝', file: '📁', link: '🔗' };
    return icons[type] || '📄';
  }

  function getTypeLabel(type) {
    const labels = { briefing: '简报', note: '笔记', file: '文件', link: '链接' };
    return labels[type] || type;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekday = weekdays[d.getDay()];
    return `${month}月${day}日 周${weekday}`;
  }

  function getWeatherEmoji(code) {
    if (code === 113) return '☀️';
    if (code === 116) return '⛅';
    if (code === 119 || code === 122) return '☁️';
    if (code >= 176 && code <= 311) return '🌧️';
    if (code >= 320 && code <= 395) return '❄️';
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
    const regex = new RegExp(`(${escaped})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  // --- Hash Change ---
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash && hash !== 'search') navigateTo(hash);
  });

  // --- Start ---
  init();
})();
