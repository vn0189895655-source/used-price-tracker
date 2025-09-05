// State and rendering for listings (with favorites)
const state = {
  q: '',
  tab: 'all', // all | active | sold
  sort: 'latest', // latest | priceAsc | priceDesc
  page: 1,
  pageSize: 20,
  items: [],
  onlyFav: false,
  favorites: new Set()
};

const FAV_STORAGE_KEY = 'upt:favorites';

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

function isFav(id) { return state.favorites.has(Number(id)); }
function toggleFav(id) {
  id = Number(id);
  if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
  saveFavorites();
}

function formatPrice(n) {
  try {
    return '?? + new Intl.NumberFormat('ko-KR').format(Number(n || 0));
  } catch (_) {
    const s = String(Math.floor(n || 0));
    return '?? + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

  // results
  const cards = pageItems.map(it => {
    const safeTitle = (it.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const alt = `${safeTitle} ?�네??;
    const fav = isFav(it.id);
    const favText = fav ? '??즐겨찾기' : '??즐겨찾기';
    return `
      <article class="card" data-id="${it.id}">
        <span class="badge" aria-label="?�랫??>${it.platform || ''}</span>
        <img class="thumb" src="${it.image}" alt="${alt}">
        <div class="content">
          <h3 class="title">${safeTitle}</h3>
          <div class="price">${formatPrice(it.price)}</div>
          <div class="meta">${formatDate(it.listedAt)}</div>
          <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
            <a href="${it.url}" target="_blank" rel="noopener" aria-label="${it.platform || '?�랫??}?�서 바로가�?>바로가�?/a>
            <button class="fav-btn${fav ? ' active' : ''}" aria-pressed="${fav ? 'true' : 'false'}" aria-label="즐겨찾기">${favText}</button>
          </div>
        </div>
      </article>`;
  }).join('');
  resultsEl.innerHTML = cards || '<p>결과가 ?�습?�다.</p>';

  if (pageItems.length === 0) {
    resultsEl.innerHTML = '<p class="empty-hint">검??결과가 ?�습?�다</p>';
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
    const res = await fetch('/data/listings.json');
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
      showSkeletons(8);
      await nextFrame();
      render();
      updateChartForQuery();
    });
  }
  if (qInput) {
    qInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        state.q = (qInput.value || '').trim();
        state.page = 1;
        showSkeletons(8);
        await nextFrame();
        render();
        updateChartForQuery();
      }
    });
  }

  if (tabAll) tabAll.addEventListener('click', () => { state.tab = 'all'; state.page = 1; setActiveTabButton('all'); render(); });
  if (tabActive) tabActive.addEventListener('click', () => { state.tab = 'active'; state.page = 1; setActiveTabButton('active'); render(); });
  if (tabSold) tabSold.addEventListener('click', () => { state.tab = 'sold'; state.page = 1; setActiveTabButton('sold'); render(); });

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      state.sort = sortSelect.value;
      render();
    });
  }

  if (pagerEl) {
    pagerEl.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.id === 'prevPage') { state.page -= 1; render(); }
      if (t.id === 'nextPage') { state.page += 1; render(); }
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

  // Initial UI
  setActiveTabButton(state.tab);
  if (sortSelect) sortSelect.value = state.sort;
  if (qInput) qInput.value = state.q;
  render();
  updateChartForQuery();
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
      const res = await fetch('/data/listings.json');
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
    file = '/data/prices-iphone-13.json';
  } else if (q.includes('a7c')) {
    file = '/data/prices-sony-a7c.json';
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
          backgroundColor: 'rgba(44, 123, 229, 0.2)',
          tension: 0.25,
          pointRadius: 2,
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

