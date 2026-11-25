/* ============ VANYA — shared app logic ============ */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const fmt = n => '₹' + Number(n).toLocaleString('en-IN');

/* ---------- Cart (localStorage) ---------- */
const Cart = {
  key: 'vanya_cart',
  get() { try { return JSON.parse(localStorage.getItem(this.key)) || []; } catch { return []; } },
  save(items) {
    localStorage.setItem(this.key, JSON.stringify(items));
    this.updateBadge();
    document.dispatchEvent(new CustomEvent('cart:updated'));
  },
  add(product, size, qty = 1) {
    const items = this.get();
    const found = items.find(i => i.id === product.id && i.size === size);
    if (found) found.qty = Math.min(10, found.qty + qty);
    else items.push({
      id: product.id, name: product.name, price: product.price, mrp: product.mrp,
      image: product.image, size, qty
    });
    this.save(items);
  },
  update(id, size, qty) {
    let items = this.get();
    if (qty <= 0) items = items.filter(i => !(i.id === id && i.size === size));
    else {
      const it = items.find(i => i.id === id && i.size === size);
      if (it) it.qty = Math.min(10, qty);
    }
    this.save(items);
  },
  remove(id, size) { this.save(this.get().filter(i => !(i.id === id && i.size === size))); },
  clear() { this.save([]); },
  count() { return this.get().reduce((s, i) => s + i.qty, 0); },
  subtotal() { return this.get().reduce((s, i) => s + i.price * i.qty, 0); },
  mrpTotal() { return this.get().reduce((s, i) => s + (i.mrp || i.price) * i.qty, 0); },
  updateBadge() {
    const n = this.count();
    $$('.badge-count').forEach(b => {
      b.textContent = n;
      b.style.display = n ? 'grid' : 'none';
    });
  }
};

/* ---------- Wishlist ---------- */
const Wish = {
  key: 'vanya_wish',
  get() { try { return JSON.parse(localStorage.getItem(this.key)) || []; } catch { return []; } },
  has(id) { return this.get().includes(id); },
  toggle(id) {
    let w = this.get();
    w = w.includes(id) ? w.filter(x => x !== id) : [...w, id];
    localStorage.setItem(this.key, JSON.stringify(w));
    return w.includes(id);
  }
};

/* ---------- Toast ---------- */
function toast(msg, type = '') {
  let wrap = $('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<span>${type === 'ok' ? '✓' : type === 'err' ? '✕' : '🛍️'}</span><span>${msg}</span>`;
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 320); }, 2800);
}

/* ---------- Navbar ---------- */
function initNavbar() {
  Cart.updateBadge();

  const burger = $('#hamburger');
  const mobile = $('#mobileMenu');
  const close = $('#mmClose');

  burger?.addEventListener('click', () => mobile.classList.add('open'));
  close?.addEventListener('click', () => mobile.classList.remove('open'));
  $$('#mobileMenu a').forEach(a => a.addEventListener('click', () => mobile.classList.remove('open')));

  // mark active nav link
  const page = location.pathname.split('/').pop() || 'index.html';
  $$('.nav-links a, .mobile-menu nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) a.classList.add('active');
  });
}

/* ---------- Product card HTML ---------- */
function productCard(p) {
  const off = Math.round((1 - p.price / p.mrp) * 100);
  const chipClass = { Bestseller: 'chip-best', New: 'chip-new', Trending: 'chip-trend', Premium: 'chip-premium', 'Party Edit': 'chip-party' }[p.badge] || 'chip-best';
  const wished = Wish.has(p.id);
  return `
  <article class="card">
    <div class="card-img">
      <a href="product.html?id=${p.id}"><img src="${p.image}" alt="${p.name}" loading="lazy"></a>
      ${p.badge ? `<span class="chip ${chipClass}">${p.badge}</span>` : ''}
      <button class="wish-btn ${wished ? 'on' : ''}" data-wish="${p.id}" title="Wishlist">${wished ? '♥' : '♡'}</button>
    </div>
    <div class="card-body">
      <span class="card-cat">${p.category}</span>
      <h3 class="card-title"><a href="product.html?id=${p.id}">${p.name}</a></h3>
      <div class="card-rating"><span class="stars">${'★'.repeat(Math.round(p.rating))}</span> ${p.rating} <span>(${p.reviews})</span></div>
      <div class="card-price">
        <span class="price">${fmt(p.price)}</span>
        <span class="mrp">${fmt(p.mrp)}</span>
        <span class="off">${off}% off</span>
      </div>
      <div class="card-cta">
        <button class="btn btn-primary btn-sm" data-quick="${p.id}">Add to Cart</button>
        <a class="btn btn-ghost btn-sm" href="product.html?id=${p.id}">View</a>
      </div>
    </div>
  </article>`;
}

/* Delegated handlers for quick-add + wishlist on any page */
document.addEventListener('click', e => {
  const q = e.target.closest('[data-quick]');
  if (q) {
    e.preventDefault();
    const id = Number(q.dataset.quick);
    fetch(`/api/products/${id}`).then(r => r.json()).then(p => {
      if (p.error) return toast(p.error, 'err');
      Cart.add(p, p.sizes[0], 1);
      toast(`${p.name} added to cart!`, 'ok');
    }).catch(() => toast('Could not add to cart', 'err'));
  }
  const w = e.target.closest('[data-wish]');
  if (w) {
    e.preventDefault();
    const on = Wish.toggle(Number(w.dataset.wish));
    w.classList.toggle('on', on);
    w.textContent = on ? '♥' : '♡';
    toast(on ? 'Added to wishlist ♥' : 'Removed from wishlist');
  }
});

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', initNavbar);
