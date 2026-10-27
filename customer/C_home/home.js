const profileForm = document.getElementById('profile-form');
const profileStatus = document.getElementById('profile-status');
const shopForm = document.getElementById('shop-form');
const commentForm = document.getElementById('comment-form');
const shopList = document.getElementById('shop-list');
const orderHistory = document.getElementById('order-history');
const commentList = document.getElementById('comment-list');
const activityList = document.getElementById('activity-list');
const profilePhotoInput = document.getElementById('profile-photo');
const profilePhotoPreview = document.getElementById('profile-photo-preview');
const statsOrders = document.getElementById('stats-orders');
const statsPending = document.getElementById('stats-pending');
const statsShops = document.getElementById('stats-shops');
const statsComments = document.getElementById('stats-comments');

const initialOrders = [
  { id: 'ORD-1024', item: 'Rice & Palm oil bundle', status: 'Delivered' },
  { id: 'ORD-1025', item: 'Weekly pantry pack', status: 'In transit' }
];

const state = {
  profile: null,
  shops: [],
  orders: initialOrders,
  comments: [],
  activity: [{ title: 'Welcome', text: 'Your home dashboard is ready.', time: 'Just now' }],
  profilePhoto: ''
};


function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function getProfile() {
  if (state.profile) return state.profile;
  const user = loadStored('shop-user', null, { sessionFallback: true });
  const profile = loadStored('shop-profile', null, { sessionFallback: true });
  const merged = { name: '', email: '', phone: '', address: '', paymentMethod: 'Cash on delivery', password: '' };
  if (user) Object.assign(merged, user);
  if (profile) Object.assign(merged, profile);
  state.profile = merged;
  return state.profile;
}

function getShopScope() {
  const profile = getProfile();
  return profile.email || profile.name || 'guest';
}

function hydrateState() {
  state.profile = getProfile();
  const ownerScope = getShopScope();
  state.shops = loadStored('shop-list', [], { sessionFallback: true, ownerId: ownerScope });
  state.orders = loadStored('shop-orders', initialOrders, { sessionFallback: true, ownerId: ownerScope });
  state.comments = loadStored('shop-comments', [], { sessionFallback: true, ownerId: ownerScope });
  state.activity = loadStored('shop-activity', [{ title: 'Welcome', text: 'Your home dashboard is ready.', time: 'Just now' }], { sessionFallback: true, ownerId: ownerScope });
  state.profilePhoto = loadStored('shop-profile-photo', '', { sessionFallback: true, ownerId: ownerScope });
}

function populateProfile() {
  const profile = getProfile();
  document.getElementById('profile-name').value = profile.name || '';
  document.getElementById('profile-email').value = profile.email || '';
  document.getElementById('profile-phone').value = profile.phone || '';
  document.getElementById('profile-address').value = profile.address || '';
  document.getElementById('profile-payment').value = profile.paymentMethod || 'Cash on delivery';
  document.getElementById('profile-password').value = profile.password || '';
  if (state.profilePhoto) {
    profilePhotoPreview.src = state.profilePhoto;
    profilePhotoPreview.style.display = 'block';
  } else {
    profilePhotoPreview.style.display = 'none';
  }
  profileStatus.textContent = profile.name ? `Hi, ${profile.name}` : 'Ready to update';
}

function pushActivity(title, text) {
  state.activity.unshift({ title, text, time: new Date().toLocaleString() });
  state.activity = state.activity.slice(0, 8);
  saveStored('shop-activity', state.activity, { ownerId: getShopScope() });
  renderActivity();
}

function saveProfile(event) {
  event.preventDefault();
  const profile = {
    name: document.getElementById('profile-name').value.trim(),
    email: document.getElementById('profile-email').value.trim(),
    phone: document.getElementById('profile-phone').value.trim(),
    address: document.getElementById('profile-address').value.trim(),
    paymentMethod: document.getElementById('profile-payment').value,
    password: document.getElementById('profile-password').value.trim()
  };

  if (!profile.name || !profile.email) {
    profileStatus.textContent = 'Please fill in your name and email.';
    profileStatus.style.background = 'rgba(183, 156, 108, 0.18)';
    return;
  }

  const sanitizedProfile = { ...profile, password: '' };
  state.profile = sanitizedProfile;
  const userProfile = { ...sanitizedProfile, authenticated: true };
  saveStored('shop-user', userProfile, { alsoSession: true, ownerId: getShopScope() });
  saveStored('shop-profile', sanitizedProfile, { alsoSession: true, ownerId: getShopScope() });
  profileStatus.textContent = 'Profile saved';
  profileStatus.style.background = 'rgba(111,162,135,.16)';
  pushActivity('Profile updated', `${profile.name} updated their profile.`);
}

function handlePhotoUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.profilePhoto = reader.result;
    const ok = saveStored('shop-profile-photo', state.profilePhoto, { alsoSession: true, ownerId: getShopScope() });
    if (!ok) {
      profileStatus.textContent = 'Photo upload could not be saved in this browser.';
      profileStatus.style.background = 'rgba(183, 156, 108, 0.18)';
      return;
    }
    profilePhotoPreview.src = state.profilePhoto;
    profilePhotoPreview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function renderShops() {
  if (!state.shops?.length) {
    shopList.innerHTML = '<div class="mini-card"><p>No shops added yet. Create your first one above.</p></div>';
    return;
  }

  shopList.innerHTML = state.shops.map(shop => `
    <div class="mini-card">
      <h4>${escapeHtml(shop.name)}</h4>
      <p>${escapeHtml(shop.description)}</p>
    </div>
  `).join('');
}

function addShop(event) {
  event.preventDefault();
  const shopName = document.getElementById('shop-name')?.value.trim();
  const shopDescription = document.getElementById('shop-description')?.value.trim();

  if (!shopName || !shopDescription) {
    return;
  }

  const shop = {
    id: `shop_${Date.now()}`,
    name: shopName,
    description: shopDescription
  };

  state.shops.unshift(shop);
  saveStored('shop-list', state.shops, { ownerId: getShopScope() });
  shopForm?.reset();
  renderShops();
  renderSummary();
  pushActivity('New shop added', `${shop.name} is now in your list of shops.`);
}

function renderOrders() {
  if (!state.orders.length) {
    orderHistory.innerHTML = '<div class="mini-card"><p>No orders yet.</p></div>';
    return;
  }

  orderHistory.innerHTML = state.orders.map(order => `
    <div class="mini-card">
      <h4>${escapeHtml(order.id)}</h4>
      <p>${escapeHtml(order.item)} — ${escapeHtml(order.status)}</p>
    </div>
  `).join('');
}

function renderComments() {
  if (!state.comments.length) {
    commentList.innerHTML = '<li>No comments yet. Start the conversation.</li>';
    return;
  }

  commentList.innerHTML = state.comments.map(comment => `
    <li>
      <strong>${escapeHtml(comment.author)}</strong>
      <span>${escapeHtml(comment.text)}</span>
    </li>
  `).join('');
}

function addComment(event) {
  event.preventDefault();
  const profile = getProfile();
  const text = document.getElementById('comment-text').value.trim();
  if (!text) return;

  state.comments.unshift({
    author: profile.name || 'Guest',
    text
  });
  saveStored('shop-comments', state.comments, { ownerId: getShopScope() });
  commentForm.reset();
  renderComments();
  renderSummary();
  pushActivity('New comment', `${profile.name || 'Guest'} shared feedback.`);
}

function renderActivity() {
  activityList.innerHTML = state.activity.map(activity => `
    <li>
      <strong>${escapeHtml(activity.title)}</strong>
      <span>${escapeHtml(activity.text)} · ${escapeHtml(activity.time)}</span>
    </li>
  `).join('');
}

function renderSummary() {
  const pending = state.orders.filter(order => order.status && order.status.toLowerCase().includes('transit')).length;
  statsOrders.textContent = state.orders.length;
  statsPending.textContent = pending;
  statsShops.textContent = state.shops.length;
  statsComments.textContent = state.comments.length;
}

profileForm.addEventListener('submit', saveProfile);
shopForm.addEventListener('submit', addShop);
commentForm.addEventListener('submit', addComment);
profilePhotoInput.addEventListener('change', handlePhotoUpload);

hydrateState();
populateProfile();
renderShops();
renderOrders();
renderComments();
renderActivity();
renderSummary();
