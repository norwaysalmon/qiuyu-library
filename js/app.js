/* ============================================
   祈鸳的图书馆 - 主应用逻辑
   ============================================ */

(function () {
  'use strict';

  if (!sessionStorage.getItem('lib_auth')) {
    window.location.href = 'index.html';
    return;
  }

  var searchIndex = [];
  var currentView = 'dashboard';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return document.querySelectorAll(s); };

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
    var hash = window.location.hash.slice(1) || 'dashboard';
    navigateTo(hash);
  }

  async function loadSearchIndex() {
    try {
      var resp = await fetch('data/search-index.json');
      searchIndex = await resp.json();
    } catch (e) {
      console.error('Failed to load search index:', e);
      searchIndex = [];
    }
  }

  function setupNavigation() {
    $$('.nav-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        var view = item.dataset.view;
        navigateTo(view);
        window.location.hash = view;
        if (window.innerWidth <= 900) $('#sidebar').classList.remove('open');
      });
    });
    $('#sidebar-toggle').addEventListener('click', function () {
      $('#sidebar').classList.toggle('open');
    });
  }

  function navigateTo(view) {
    currentView = view;
    $$('.view').forEach(function (v) { v.classList.add('hidden'); });
    var target = $('#view-' + view);
    if (target) target.classList.remove('hidden');
    $$('.nav-item').forEach(function (n) {
      n.classList.toggle('active', n.dataset.view === view);
    });
    if (view === 'briefings') renderViewList('briefing', 'briefings-list');
    else if (view === 'notes') renderViewList('note', 'notes-list');
    else if (view === 'files') renderViewGrid('file', 'files-list');
    else if (view === 'links') renderViewList('link', 'links-list');
  }

  function updateBadges() {
    var counts = { briefing: 0, note: 0, file: 0, link: 0 };
    searchIndex.forEach(function (item) {
      if (counts[item.type] !== undefined) counts[item.type]++;
    });
    var b = $('#badge-briefings'); if (b) { b.textContent = counts.briefing; b.style.display = counts.briefing ? '' : 'none'; }
    var n = $('#badge-notes'); if (n) { n.textContent = counts.note; n.style.display = counts.note ? '' : 'none'; }
    var f = $('#badge-files'); if (f) { f.textContent = counts.file; f.style.display = counts.file ? '' : 'none'; }
    var l = $('#badge-links'); if (l) { l.textContent = counts.link; l.style.display = counts.link ? '' : 'none'; }
  }

  function updateStats() {
    var counts = { briefing: 0, note: 0, file: 0, link: 0 };
    searchIndex.forEach(function (item) { if (counts[item.type] !== undefined) counts[item.type]++; });
    var sb = $('#stat-briefings'); if (sb) sb.textContent = counts.briefing;
    var sn = $('#stat-notes'); if (sn) sn.textContent = counts.note;
    var sf = $('#stat-files'); if (sf) sf.textContent = counts.file;
    var sl = $('#stat-links'); if (sl) sl.textContent = counts.link;
  }

  function renderRecentItems() {
    var sorted = searchIndex.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    var recent = sorted.slice(0, 8);
    var container = $('#recent-list');
    if (!container || recent.length === 0) return;
    container.innerHTML = recent.map(function (item) {
      return '<div class="content-item" data-id="' + item.id + '">' +
        '<div class="content-item-icon">' + getTypeIcon(item.type) + '</div>' +
        '<div class="content-item-body">' +
          '<div class="content-item-title">' + escapeHtml(item.title) + '</div>' +
          '<div class="content-item-summary">' + escapeHtml(item.summary) + '</div>' +
          renderTags(item.tags) +
        '</div>' +
        '<div class="content-item-date">' + formatDate(item.date) + '</div>' +
      '</div>';
    }).join('');
    container.querySelectorAll('.content-item').forEach(function (el) {
      el.addEventListener('click', function () { openItem(el.dataset.id); });
    });
  }

  function renderViewList(type, containerId) {
    var items = searchIndex.filter(function (i) { return i.type === type; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
    var container = $('#' + containerId);
    if (!container) return;
    if (items.length === 0) { container.innerHTML = '<p class="empty-state">暂无内容</p>'; return; }
    container.innerHTML = items.map(function (item) {
      return '<div class="content-item" data-id="' + item.id + '">' +
        '<div class="content-item-icon">' + getTypeIcon(item.type) + '</div>' +
        '<div class="content-item-body">' +
          '<div class="content-item-title">' + escapeHtml(item.title) + '</div>' +
          '<div class="content-item-summary">' + escapeHtml(item.summary) + '</div>' +
          renderTags(item.tags) +
        '</div>' +
        '<div class="content-item-date">' + formatDate(item.date) + '</div>' +
      '</div>';
    }).join('');
    container.querySelectorAll('.content-item').forEach(function (el) {
      el.addEventListener('click', function () { openItem(el.dataset.id); });
    });
  }

  function renderViewGrid(type, containerId) {
    var items = searchIndex.filter(function (i) { return i.type === type; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
    var container = $('#' + containerId);
    if (!container) return;
    if (items.length === 0) { container.innerHTML = '<p class="empty-state">暂无内容</p>'; return; }
    container.innerHTML = items.map(function (item) {
      return '<div class="content-item" data-id="' + item.id + '">' +
        '<div class="content-item-icon">' + getTypeIcon(item.type) + '</div>' +
        '<div class="content-item-body">' +
          '<div class="content-item-title">' + escapeHtml(item.title) + '</div>' +
          '<div class="content-item-summary">' + escapeHtml(item.summary) + '</div>' +
        '</div>' +
        '<div class="content-item-date">' + formatDate(item.date) + '</div>' +
      '</div>';
    }).join('');
    container.querySelectorAll('.content-item').forEach(function (el) {
      el.addEventListener('click', function () { openItem(el.dataset.id); });
    });
  }

  function openItem(id) {
    var item = searchIndex.find(function (i) { return i.id === id; });
    if (!item) return;
    $('#modal-title').textContent = item.title;
    $('#modal-meta').innerHTML =
      '<span>' + getTypeIcon(item.type) + ' ' + getTypeLabel(item.type) + '</span>' +
      '<span>📅 ' + formatDate(item.date) + '</span>' +
      (item.tags ? '<span>' + item.tags.map(function (t) { return '#' + t; }).join(' ') + '</span>' : '');
    if (item.content) {
      $('#modal-body').innerHTML = item.content;
    } else if (item.url) {
      $('#modal-body').innerHTML = '<p>内容文件: <a href="' + item.url + '" target="_blank">' + item.url + '</a></p><p>' + escapeHtml(item.summary) + '</p>';
    } else {
      $('#modal-body').innerHTML = '<p>' + escapeHtml(item.summary) + '</p>';
    }
    $('#modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function setupModal() {
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  function closeModal() {
    $('#modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }

  function setupSearch() {
    var input = $('#search-input');
    var debounceTimer;
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        var query = input.value.trim();
        if (query.length < 1) {
          if (currentView === 'search') navigateTo('dashboard');
          return;
        }
        performSearch(query);
      }, 300);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var query = input.value.trim();
        if (query.length >= 1) performSearch(query);
      }
    });
  }

  function performSearch(query) {
    var q = query.toLowerCase();
    var results = searchIndex.filter(function (item) {
      return (item.title && item.title.toLowerCase().indexOf(q) !== -1) ||
             (item.summary && item.summary.toLowerCase().indexOf(q) !== -1) ||
             (item.tags && item.tags.some(function (t) { return t.toLowerCase().indexOf(q) !== -1; })) ||
             (item.date && item.date.indexOf(q) !== -1);
    }).sort(function (a, b) { return b.date.localeCompare(a.date); });

    navigateTo('search');
    var summary = $('#search-summary');
    summary.textContent = '找到 ' + results.length + ' 条与"' + query + '"相关的结果';

    var container = $('#search-results');
    if (results.length === 0) {
      container.innerHTML = '<p class="empty-state">没有找到相关内容</p>';
      return;
    }
    container.innerHTML = results.map(function (item) {
      return '<div class="content-item" data-id="' + item.id + '">' +
        '<div class="content-item-icon">' + getTypeIcon(item.type) + '</div>' +
        '<div class="content-item-body">' +
          '<div class="content-item-title">' + highlightText(escapeHtml(item.title), query) + '</div>' +
          '<div class="content-item-summary">' + highlightText(escapeHtml(item.summary), query) + '</div>' +
          renderTags(item.tags) +
        '</div>' +
        '<div class="content-item-date">' + formatDate(item.date) + '</div>' +
      '</div>';
    }).join('');
    container.querySelectorAll('.content-item').forEach(function (el) {
      el.addEventListener('click', function () { openItem(el.dataset.id); });
    });
  }

  function setupLogout() {
    $('#logout-btn').addEventListener('click', function () {
      sessionStorage.removeItem('lib_auth');
      sessionStorage.removeItem('lib_auth_time');
      window.location.href = 'index.html';
    });
  }

  function startClock() {
    function update() {
      var now = new Date();
      var h = String(now.getHours()).padStart(2, '0');
      var m = String(now.getMinutes()).padStart(2, '0');
      var s = String(now.getSeconds()).padStart(2, '0');
      var timeStr = h + ':' + m + ':' + s;
      var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      var dateStr = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 周' + weekdays[now.getDay()];

      var ct = $('#clock-time'); if (ct) ct.textContent = timeStr;
      var cd = $('#clock-date'); if (cd) cd.textContent = dateStr;
      var dct = $('#dash-clock-time'); if (dct) dct.textContent = h + ':' + m;
      var dcd = $('#dash-clock-date'); if (dcd) dcd.textContent = dateStr;
    }
    update();
    setInterval(update, 1000);
  }

  function fetchWeather() {
    // Try to get user's location for weather
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          var lat = pos.coords.latitude.toFixed(2);
          var lon = pos.coords.longitude.toFixed(2);
          var url = 'https://wttr.in/' + lat + ',' + lon + '?format=j1';
          fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
              var current = data.current_condition[0];
              var temp = current.temp_C + '°C';
              var desc = current.lang_zh && current.lang_zh[0] ? current.lang_zh[0].value : current.weatherDesc[0].value;
              var code = parseInt(current.weatherCode);
              var emoji = getWeatherEmoji(code);
              updateWeatherUI(emoji, temp, desc);
            })
            .catch(function () { updateWeatherUI('🌤', '--°C', '无法获取'); });
        },
        function () {
          // Fallback: Macau
          fetch('https://wttr.in/Macau?format=j1')
            .then(function (r) { return r.json(); })
            .then(function (data) {
              var current = data.current_condition[0];
              var temp = current.temp_C + '°C';
              var desc = current.lang_zh && current.lang_zh[0] ? current.lang_zh[0].value : current.weatherDesc[0].value;
              var code = parseInt(current.weatherCode);
              var emoji = getWeatherEmoji(code);
              updateWeatherUI(emoji, temp, desc);
            })
            .catch(function () { updateWeatherUI('🌤', '--°C', '无法获取'); });
        },
        { timeout: 5000 }
      );
    } else {
      updateWeatherUI('🌤', '--°C', '无法获取');
    }
  }

  function updateWeatherUI(icon, temp, desc) {
    var wi = $('#weather-icon'); if (wi) wi.textContent = icon;
    var wt = $('#weather-temp'); if (wt) wt.textContent = temp;
    var wd = $('#weather-desc'); if (wd) wd.textContent = desc;
    var dwi = $('#dash-weather-icon'); if (dwi) dwi.textContent = icon;
    var dwt = $('#dash-weather-text'); if (dwt) dwt.textContent = temp + ' ' + desc;
  }

  function getTypeIcon(type) {
    var icons = { briefing: '📊', note: '📝', file: '📁', link: '🔗' };
    return icons[type] || '📄';
  }

  function getTypeLabel(type) {
    var labels = { briefing: '简报', note: '笔记', file: '文件', link: '链接' };
    return labels[type] || type;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T00:00:00');
    var month = d.getMonth() + 1;
    var day = d.getDate();
    var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    var weekday = weekdays[d.getDay()];
    return month + '月' + day + '日 周' + weekday;
  }

  function renderTags(tags) {
    if (!tags || tags.length === 0) return '';
    return '<div class="content-item-tags">' +
      tags.map(function (t) { return '<span class="tag">' + escapeHtml(t) + '</span>'; }).join('') +
    '</div>';
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
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function highlightText(text, query) {
    if (!query) return text;
    var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('(' + escaped + ')', 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  window.addEventListener('hashchange', function () {
    var hash = window.location.hash.slice(1);
    if (hash && hash !== 'search') navigateTo(hash);
  });

  init();
})();
