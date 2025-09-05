// State and rendering for listings (with favorites)
const state = {
  q: '',
  tab: 'all', // all | active | sold
  sort: 'latest', // latest | priceAsc | priceDesc
  page: 1,
  pageSize: 24,
  items: [],
  loading: false,
  error: null,
  onlyFav: false,
  favorites: new Set()
};

const FAV_STORAGE_KEY = 'upt:favorites';
const RECENT_Q_KEY = 'upt:recent-q';

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    state.favorites = new Set((arr || []).map(Number));
  } catch (_) {
    state.favorites = new Set();
  }
}
function saveFavorites() {
  try {
    localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(Array.from(state.favorites)));
  } catch (_) { /* ignore */ }
}

function loadRecentQueries() {
  try {
    const raw = localStorage.getItem(RECENT_Q_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, 5) : [];
  } catch (_) {
    return [];
  }
}
function saveRecentQueries(list) {
  try { localStorage.setItem(RECENT_Q_KEY, JSON.stringify(list.slice(0,5))); } catch(_) {}
}
function addRecentQuery(q) {
  q = (q || '').trim();
  if (!q) return;
  const list = loadRecentQueries();
  const filtered = list.filter(x => x !== q);
  filtered.unshift(q);
  saveRecentQueries(filtered);
}

function isFav(id) { return state.favorites.has(Number(id)); }
function toggleFav(id) {
  id = Number(id);
  if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
  saveFavorites();
}

function formatPrice(n) {
  try {
    return '\u20A9 ' + new Intl.NumberFormat('ko-KR').format(Number(n || 0));
  } catch (_) {
    const s = String(Math.floor(n || 0));
    return '\u20A9 ' + s.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
  }
}

function formatDate(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const [y, m, d] = yyyyMmDd.split('-');
  return `${y}.${m}.${d}`;
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function applyFilters(items) {
  const q = state.q.trim().toLowerCase();
  let out = items;

  // 1) keyword
  if (q) {
    out = out.filter(it => (it.title || '').toLowerCase().includes(q));
  }

  // favorites filter
  if (state.onlyFav) {
    out = out.filter(it => isFav(it.id));
  }

  // 2) tab filter
  if (state.tab === 'active') out = out.filter(it => it.status === 'active');
  if (state.tab === 'sold') out = out.filter(it => it.status === 'sold');

  // 3) sort
  const s = state.sort;
  out = out.slice().sort((a, b) => {
    if (s === 'latest') {
      // listedAt desc
      const da = new Date(a.listedAt);
      const db = new Date(b.listedAt);
      return db - da;
    } else if (s === 'priceAsc') {
      return Number(a.price) - Number(b.price);
    } else if (s === 'priceDesc') {
      return Number(b.price) - Number(a.price);
    }
    return 0;
  });

  return out;
}

function scrollToTopSmooth() {
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { window.scrollTo(0,0); }
}

// Price formatter (KRW, no decimals)
function formatPriceKR(n) {
  try {
    const fmt = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });
    return fmt.format(Number(n || 0));
  } catch (_) {
    const s = String(Math.floor(n || 0));
    return '\u20A9 ' + s.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
  }
}

// URL sync helpers
function buildUrlFromState() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.tab && state.tab !== 'all') params.set('tab', state.tab);
  if (state.sort && state.sort !== 'latest') params.set('sort', state.sort);
  if (state.page && state.page !== 1) params.set('page', String(state.page));
  const qs = params.toString();
  const base = location.pathname;
  return qs ? `${base}?${qs}` : base;
}

function applyUrlToState(search) {
  const params = new URLSearchParams(search || '');
  state.q = (params.get('q') || '').trim();
  const tab = params.get('tab');
  state.tab = (tab === 'active' || tab === 'sold') ? tab : 'all';
  const sort = params.get('sort');
  state.sort = (sort === 'priceAsc' || sort === 'priceDesc') ? sort : 'latest';
  const page = Number(params.get('page') || '1');
  state.page = Number.isFinite(page) && page >= 1 ? page : 1;
}

function syncUrl(push = false) {
  const url = buildUrlFromState();
  if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
}

function showToast(message, { top = true, duration = 1500, actionText, onAction } = {}) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  if (top) {
    t.style.top = '16px';
    t.style.bottom = 'auto';
  }
  if (actionText) {
    const btn = document.createElement('button');
    btn.className = 'btn-ghost';
    btn.style.marginLeft = '8px';
    btn.textContent = actionText;
    if (onAction) btn.addEventListener('click', onAction);
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';
    wrap.appendChild(document.createTextNode(message));
    wrap.appendChild(btn);
    t.textContent = '';
    t.appendChild(wrap);
  }
  document.body.appendChild(t);
  // force repaint
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 200);
  }, duration);
}

function setLoading(v) { state.loading = !!v; }

async function runQuery(pushHistory = true) {
  setLoading(true);
  showSkeletons(8);
  scrollToTopSmooth();
  await nextFrame();
  render();
  updateChartForQuery();
  setLoading(false);
  syncUrl(pushHistory);
}

function render() {
  const resultsEl = document.getElementById('results');
  const pagerEl = document.getElementById('pager');
  if (!resultsEl || !pagerEl) return;
  resultsEl.setAttribute('aria-busy', 'true');

  const filtered = applyFilters(state.items);

  // 4) paging
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = clamp(state.page, 1, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const pageItems = filtered.slice(start, start + state.pageSize);

  // results (chunked render + eager preload first row)
  {
    const cols = (function(){ try { if (window.matchMedia && window.matchMedia("(min-width: 1024px)").matches) return 4; if (window.matchMedia && window.matchMedia("(min-width: 768px)").matches) return 3; } catch (_) {} return 2; })();
    const firstRowCount = cols;
    const buildCard = (it, idx) => {
      const safeTitle = (it.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const alt = `Preview image of ${safeTitle}`;
      const fav = isFav(it.id);
      const favText = fav ? 'Unfavorite' : 'Favorite';
      const eager = idx < firstRowCount;
      const loading = eager ? 'eager' : 'lazy';
      const priority = eager ? 'high' : 'low';
      return `
      <article class="card" data-id="${it.id}">
        <span class="badge" aria-label="platform">${it.platform || ''}</span>
        <img class="thumb" src="${it.image}" alt="${alt}" loading="${loading}" fetchpriority="${priority}" decoding="async">
        <div class="content">
          <h3 class="title">${safeTitle}</h3>
          <div class="price">${formatPriceKR(it.price)}</div>
          <div class="meta">${formatDate(it.listedAt)}</div>
          <a href="${it.url}" target="_blank" rel="noopener" aria-label="Open">Open</a>
          <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
            <button class="fav-btn${fav ? ' active' : ''}" aria-pressed="${fav ? 'true' : 'false'}" aria-label="Favorite">${favText}</button>
          </div>
        </div>
      </article>`;
    };

    if (pageItems.length === 0) {
      resultsEl.innerHTML = '<div class="empty">�˻� ����� �����ϴ�</div>';
    } else {
      const firstCount = Math.min(12, pageItems.length);
      const firstHTML = pageItems.slice(0, firstCount).map(buildCard).join('');
      resultsEl.innerHTML = firstHTML;
      if (pageItems.length > firstCount) {
        requestAnimationFrame(() => {
          const restHTML = pageItems.slice(firstCount).map(buildCard).join('');
          resultsEl.insertAdjacentHTML('beforeend', restHTML);
        });
      }
    }
  }
  // pager
  const prevDisabled = state.page <= 1;
  const nextDisabled = state.page >= totalPages;
  pagerEl.innerHTML = `
    <button id="prevPage" ${prevDisabled ? 'disabled' : ''} aria-label="?�전 ?�이지">?�전</button>
    <span aria-live="polite">?�이지 ${state.page} / ${totalPages}</span>
    <button id="nextPage" ${nextDisabled ? 'disabled' : ''} aria-label="?�음 ?�이지">?�음</button>
  `;

  resultsEl.setAttribute('aria-busy', 'false');
}

function setActiveTabButton(tab) {
  const all = document.getElementById('tabAll');
  const active = document.getElementById('tabActive');
  const sold = document.getElementById('tabSold');
  const map = { all: all, active: active, sold: sold };
  [all, active, sold].forEach(btn => {
    if (!btn) return;
    const isActive = (map[tab] === btn);
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

async function init() {
  const qInput = document.getElementById('q');
  const searchBtn = document.getElementById('searchBtn');
  const tabAll = document.getElementById('tabAll');
  const tabActive = document.getElementById('tabActive');
  const tabSold = document.getElementById('tabSold');
  const sortSelect = document.getElementById('sortSelect');
  const pagerEl = document.getElementById('pager');
  const onlyFav = document.getElementById('onlyFav');
  const resultsEl = document.getElementById('results');
  const recentEl = document.getElementById('recentSearches');
  // Restore state from URL
  try { applyUrlToState(location.search); } catch (_) { /* ignore */ }

  // favorites
  loadFavorites();
  if (onlyFav) {
    onlyFav.checked = state.onlyFav;
    onlyFav.addEventListener('change', () => {
      state.onlyFav = !!onlyFav.checked;
      state.page = 1;
      render();
    });
  }

  // Load data
  try {
    const res = await fetch('./data/listings.json');
    const data = await res.json();
    state.items = Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('?�이??로드 ?�패', e);
    state.items = [];
  }

  // Handlers
  // Toggle error banner if data failed to load
  (function toggleErrorBannerAfterLoad() {
    const banner = document.getElementById('errorBanner');
    if (!banner) return;
    if (Array.isArray(state.items) && state.items.length > 0) {
      banner.setAttribute('hidden', '');
    } else {
      banner.removeAttribute('hidden');
    }
  })();
  if (searchBtn) {
    searchBtn.addEventListener('click', async () => {
      state.q = (qInput?.value || '').trim();
      state.page = 1;
      addRecentQuery(state.q);
      if (recentEl) renderRecentList(recentEl);
      await runQuery(true);
    });
  }
  if (qInput) {
    qInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        state.q = (qInput.value || '').trim();
        state.page = 1;
        addRecentQuery(state.q);
        if (recentEl) renderRecentList(recentEl);
        await runQuery(true);
      }
    });
    qInput.addEventListener('focus', () => { if (recentEl) renderRecentList(recentEl, true); });
    qInput.addEventListener('input', () => { if (recentEl) renderRecentList(recentEl, true); });
    qInput.addEventListener('blur', () => { setTimeout(() => { if (recentEl) recentEl.setAttribute('hidden',''); }, 120); });
  }

  if (tabAll) tabAll.addEventListener('click', async () => { state.tab = 'all'; state.page = 1; setActiveTabButton('all'); await runQuery(true); });
  if (tabActive) tabActive.addEventListener('click', async () => { state.tab = 'active'; state.page = 1; setActiveTabButton('active'); await runQuery(true); });
  if (tabSold) tabSold.addEventListener('click', async () => { state.tab = 'sold'; state.page = 1; setActiveTabButton('sold'); await runQuery(true); });

  if (sortSelect) {
    sortSelect.addEventListener('change', async () => {
      state.sort = sortSelect.value;
      state.page = 1;
      await runQuery(true);
    });
  }

  if (pagerEl) {
    pagerEl.addEventListener('click', async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.id === 'prevPage') { state.page -= 1; await runQuery(true); }
      if (t.id === 'nextPage') { state.page += 1; await runQuery(true); }
    });
  }

  if (resultsEl) {
    resultsEl.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.classList.contains('fav-btn')) {
        const article = t.closest('article.card');
        const id = article?.getAttribute('data-id');
        if (!id) return;
        toggleFav(id);
        // If only favorites filter is on, we may need to remove the card
        render();
      }
    });
  }

  // Copy link
  const copyLinkBtn = document.getElementById('copyLink');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        showToast('링크�?복사?�습?�다', { top: true, duration: 1500 });
      } catch (_) {
        showToast('링크 복사 ?�패', { top: true, duration: 1500 });
      }
    });
  }

  // Popstate (back/forward)
  window.addEventListener('popstate', () => {
    applyUrlToState(location.search);
    setActiveTabButton(state.tab);
    if (sortSelect) sortSelect.value = state.sort;
    if (qInput) qInput.value = state.q;
    render();
    updateChartForQuery();
  });

  // Initial UI
  setActiveTabButton(state.tab);
  if (sortSelect) sortSelect.value = state.sort;
  if (qInput) qInput.value = state.q;
  render();
  updateChartForQuery();
  syncUrl(false);
}

function renderRecentList(container, showIfEmpty = false) {
  const list = loadRecentQueries();
  if (!list.length && !showIfEmpty) { container.setAttribute('hidden',''); return; }
  container.removeAttribute('hidden');
  container.innerHTML = list.map((q, i) => `
    <div class="recent-item" role="option" data-q="${q.replace(/</g,'&lt;').replace(/>/g,'&gt;')}">
      <span class="text">${q.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>
      <button class="use-btn" aria-label="??검?�어�?검??>검??/button>
    </div>
  `).join('');

  container.onclick = async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const item = t.closest('.recent-item');
    if (!item) return;
    const q = item.getAttribute('data-q') || '';
    const input = document.getElementById('q');
    if (input) input.value = q;
    state.q = q;
    state.page = 1;
    addRecentQuery(state.q);
    renderRecentList(container);
    await runQuery(true);
  };
}

// Helpers for loading UI
function showSkeletons(count = 8) {
  const resultsEl = document.getElementById('results');
  if (!resultsEl) return;
  resultsEl.setAttribute('aria-busy', 'true');
  const skeletonCard = () => `
    <article class="card skeleton" aria-hidden="true">
      <div class="thumb shimmer"></div>
      <div class="content">
        <div class="line w-80 shimmer"></div>
        <div class="line w-40 shimmer"></div>
        <div class="line w-30 shimmer"></div>
        <div class="line w-50 shimmer" style="margin-top:8px;"></div>
      </div>
    </article>`;
  const html = Array.from({ length: count }).map(skeletonCard).join('');
  resultsEl.innerHTML = html;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// Retry handler for error banner
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.id === 'retryBtn') {
    // Attempt to reload data
    showSkeletons(8);
    try {
      const res = await fetch('./data/listings.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.items = Array.isArray(data) ? data : [];
      const banner = document.getElementById('errorBanner');
      if (banner) banner.setAttribute('hidden', '');
    } catch (_) {
      const banner = document.getElementById('errorBanner');
      if (banner) banner.removeAttribute('hidden');
    }
    render();
    updateChartForQuery();
  }
});

document.addEventListener('DOMContentLoaded', init);

// Chart logic
let priceChart = null;

function hideChart() {
  const area = document.getElementById('chartArea');
  if (area) area.setAttribute('hidden', '');
  if (priceChart) {
    priceChart.destroy();
    priceChart = null;
  }
}

async function updateChartForQuery() {
  const q = (state.q || '').toLowerCase();
  let file = null;
  if (q.includes('iphone 13')) {
    file = './data/prices-iphone-13.json';
  } else if (q.includes('a7c')) {
    file = './data/prices-sony-a7c.json';
  } else {
    hideChart();
    return;
  }

  try {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.labels) || !Array.isArray(data.avg) || data.labels.length === 0) {
      hideChart();
      return;
    }

    const area = document.getElementById('chartArea');
    const canvas = document.getElementById('priceChart');
    if (!area || !canvas || typeof Chart === 'undefined') {
      // Chart.js not available or element missing
      return;
    }
    area.removeAttribute('hidden');
    // Update avg text (latest average)
    const avgEl = document.getElementById('chartAvg');
    if (avgEl && Array.isArray(data.avg) && data.avg.length) {
      const last = data.avg[data.avg.length - 1];
      try { avgEl.textContent = formatPriceKR(last); } catch (_) { avgEl.textContent = String(last || '-'); }
    }

    const ctx = canvas.getContext('2d');
    if (priceChart) priceChart.destroy();
    priceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: '?�균가',
          data: data.avg,
          borderColor: '#2c7be5',
          backgroundColor: 'rgba(44, 123, 229, 0.08)',
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 1,
          pointHoverRadius: 3,
          hitRadius: 8,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `?�균가: ${formatPrice(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          y: {
            ticks: {
              callback: (v) => formatPrice(v)
            }
          }
        }
      }
    });
  } catch (e) {
    console.error('차트 ?�이??로드 ?�패', e);
    hideChart();
  }
}





