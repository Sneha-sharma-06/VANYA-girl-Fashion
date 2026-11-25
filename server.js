const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---------- Products API ----------
app.get('/api/products', (req, res) => {
  let products = readJSON(PRODUCTS_FILE, []);
  const { category, sort, search, min, max } = req.query;

  if (category && category !== 'All') {
    products = products.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase();
    products = products.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }
  if (min) products = products.filter(p => p.price >= Number(min));
  if (max) products = products.filter(p => p.price <= Number(max));

  if (sort === 'price-asc') products.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') products.sort((a, b) => b.price - a.price);
  else if (sort === 'rating') products.sort((a, b) => b.rating - a.rating);
  else if (sort === 'discount') products.sort((a, b) => ((b.mrp - b.price) / b.mrp) - ((a.mrp - a.price) / a.mrp));

  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

app.get('/api/categories', (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const cats = [...new Set(products.map(p => p.category))];
  res.json(cats);
});

// ---------- Coupon API ----------
const COUPONS = {
  WELCOME10: { type: 'percent', value: 10, min: 500 },
  FLAT150: { type: 'flat', value: 150, min: 999 },
  NEW20: { type: 'percent', value: 20, min: 1500 }
};

app.post('/api/coupons/validate', (req, res) => {
  const { code, subtotal } = req.body;
  const coupon = COUPONS[(code || '').toUpperCase()];
  if (!coupon) return res.json({ valid: false, message: 'Invalid coupon code' });
  if (subtotal < coupon.min) {
    return res.json({ valid: false, message: `This coupon needs a minimum order of ₹${coupon.min}` });
  }
  const discount = coupon.type === 'percent'
    ? Math.round(subtotal * coupon.value / 100)
    : coupon.value;
  res.json({ valid: true, code: code.toUpperCase(), discount, message: `Coupon applied! You saved ₹${discount}` });
});

// ---------- Orders & Payment API ----------
// Simulated payment gateway — validates card details and "charges" the order.
app.post('/api/orders', (req, res) => {
  const { items, customer, payment } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  if (!customer || !customer.name || !customer.email || !customer.phone || !customer.address || !customer.city || !customer.pincode) {
    return res.status(400).json({ error: 'Please fill in all shipping details' });
  }
  if (!payment || !payment.method) {
    return res.status(400).json({ error: 'Please select a payment method' });
  }

  // Recompute prices server-side (never trust client prices)
  const products = readJSON(PRODUCTS_FILE, []);
  let subtotal = 0;
  const orderItems = [];
  for (const item of items) {
    const product = products.find(p => p.id === Number(item.id));
    if (!product) return res.status(400).json({ error: `Product ${item.id} not found` });
    const qty = Math.max(1, Math.min(10, Number(item.qty) || 1));
    const size = item.size || product.sizes[0];
    subtotal += product.price * qty;
    orderItems.push({
      id: product.id, name: product.name, image: product.image,
      price: product.price, qty, size
    });
  }

  let discount = 0;
  if (req.body.couponCode) {
    const c = COUPONS[req.body.couponCode.toUpperCase()];
    if (c && subtotal >= c.min) {
      discount = c.type === 'percent' ? Math.round(subtotal * c.value / 100) : c.value;
    }
  }

  const shipping = subtotal - discount >= 1499 ? 0 : 79;
  const tax = Math.round((subtotal - discount) * 0.05);
  const codFee = payment.method === 'cod' ? 20 : 0;
  const total = subtotal - discount + shipping + tax + codFee;

  // Validate payment details (simulated gateway)
  if (payment.method === 'card') {
    if (!payment.cardNumber || !/^\d{16}$/.test(payment.cardNumber.replace(/\s/g, ''))) {
      return res.status(400).json({ error: 'Please enter a valid 16-digit card number' });
    }
    if (!payment.expiry || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(payment.expiry)) {
      return res.status(400).json({ error: 'Please enter a valid expiry (MM/YY)' });
    }
    if (!payment.cvv || !/^\d{3,4}$/.test(payment.cvv)) {
      return res.status(400).json({ error: 'Please enter a valid CVV' });
    }
    if (!payment.cardName) {
      return res.status(400).json({ error: 'Please enter the name on card' });
    }
  }
  if (payment.method === 'upi' && !/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(payment.upiId || '')) {
    return res.status(400).json({ error: 'Please enter a valid UPI ID (e.g. yourname@upi)' });
  }
  if (payment.method === 'netbanking' && !payment.bank) {
    return res.status(400).json({ error: 'Please select your bank' });
  }

  const orders = readJSON(ORDERS_FILE, []);
  const order = {
    id: 'VNY' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase(),
    createdAt: new Date().toISOString(),
    items: orderItems,
    customer,
    payment: { method: payment.method, status: 'paid', transactionId: 'TXN' + crypto.randomBytes(6).toString('hex').toUpperCase() },
    couponCode: req.body.couponCode ? req.body.couponCode.toUpperCase() : null,
    subtotal, discount, shipping, tax, codFee, total,
    status: 'Confirmed'
  };

  // Small simulated processing delay is done client-side; store here.
  orders.push(order);
  writeJSON(ORDERS_FILE, orders);

  res.status(201).json({
    success: true,
    order: {
      id: order.id, total: order.total, status: order.status,
      paymentMethod: order.payment.method, transactionId: order.payment.transactionId,
      items: orderItems, customer: { name: customer.name }
    }
  });
});

app.get('/api/orders/:id', (req, res) => {
  const orders = readJSON(ORDERS_FILE, []);
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// ---------- Contact API ----------
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Please fill in all fields' });
  }
  const contacts = readJSON(path.join(__dirname, 'data', 'contacts.json'), []);
  contacts.push({ name, email, message, at: new Date().toISOString() });
  writeJSON(path.join(__dirname, 'data', 'contacts.json'), contacts);
  res.json({ success: true, message: 'Thanks! We will get back to you within 24 hours.' });
});

// SPA fallback for HTML pages
app.get('*', (req, res) => {
  const file = path.join(__dirname, 'public', req.path);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return res.sendFile(file);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Vanya is live →  http://localhost:${PORT}\n`);
});
