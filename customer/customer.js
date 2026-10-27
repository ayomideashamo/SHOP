/* ================= STATE ================= */
const S = { 
    items: [], 
    cart: {},
    searchQuery: '',
    loading: true, 
    cartMessage: null,
    confirmation: null,
    showConfirmModal: false,
    selectedOwner: null
};

const SHOP_NAME = "The Counter";
const SHOP_TAGLINE = "Order it. We'll have it ready.";

/* ================= STORAGE (scoped to the selected shop owner) ================= */
async function loadItemsFromSupabase(){
    const ownerId = S.selectedOwner?.id;

    if (!ownerId) {
        throw new Error('No shop owner selected.');
    }

    const { data, error } = await db
        .from('shop_items')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Could not load shop items:', error);
        throw error;
    }

    return (data || []).map(item => ({
    ...item,
    reservedStock: item.reserved_stock || 0
    }));
}
async function loadOrdersFromStorage(){
    const ownerId = S.selectedOwner?.id || loadStored('shop-owner', null)?.id;
    return loadStoredForOwner('shop-orders', [], ownerId);
}
async function saveOrdersToStorage(orders){
    const ownerId = S.selectedOwner?.id || loadStored('shop-owner', null)?.id;
    return saveStoredForOwner('shop-orders', orders, ownerId);
}

async function loadSelectedOwnerFromStorage(){
    return loadStored('shop-owner', null);
}

async function init(){
    try {
        S.selectedOwner = await loadSelectedOwnerFromStorage();

        if (!S.selectedOwner) {
            throw new Error('No shop owner selected.');
        }

        S.items = await loadItemsFromSupabase();

        console.log('Customer shop items loaded from Supabase:', S.items);

        S.loading = false;
        render();
    } catch (error) {
        console.error('Failed to load customer shop:', error);
        S.loading = false;
        S.items = [];
        S.cartMessage = {
            type: 'error',
            text: error.message
        };
        render();
    }
}

// Live update: if the owner adds stock / changes prices in another tab, refresh the shelf.
window.addEventListener('storage', async (e) => {
    if (e.key && e.key.startsWith('shop-items')){
        S.items = await loadItemsFromStorage();
        render();
    }
    if (e.key && e.key.startsWith('shop-orders')){
        S.orders = await loadOrdersFromStorage();
        render();
    }
});

/* ================= UTIL ================= */
function money(n){ return '₦' + Number(n).toFixed(2); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function genId(){ return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function getNextTicketNumber(orders){
    const highest = orders.reduce((max, order) => {
        const match = String(order.ticketNumber || '').match(/\d+/);
        return match ? Math.max(max, parseInt(match[0], 10)) : max;
    }, 0);
    return '#' + String(highest + 1).padStart(4,'0');
}
function cartTotal(){
    return Object.entries(S.cart).reduce((sum,[id,qty]) => {
        const it = S.items.find(i => i.id === id);
        return it ? sum + it.price*qty : sum;
    }, 0);
}

/* ================= ACTIONS ================= */
function changeCartQty(itemId, delta){
    const item = S.items.find(i => i.id === itemId);
    if (!item) return;
    const current = S.cart[itemId] || 0;
    const available = Math.max(0, (item.stock || 0) - ((item.reservedStock || 0)));
    const next = Math.max(0, Math.min(available, current + delta));
    if (next === 0) delete S.cart[itemId];
    else S.cart[itemId] = next;
    S.cartMessage = null;
    render();
}

function removeCartItem(itemId){
    if (S.cart[itemId]){
        delete S.cart[itemId];
        S.cartMessage = null;
        render();
    }
}

function openConfirmModal(){
    if (Object.keys(S.cart).length === 0){
        S.cartMessage = {type:'error', text:'Add at least one item before reviewing your ticket.'};
        render();
        return;
    }
    S.showConfirmModal = true;
    S.cartMessage = null;
    render();
}

function closeConfirmModal(){
    S.showConfirmModal = false;
    render();
}

function confirmOrder(){
    S.showConfirmModal = false;
    sendTicket();
}

async function sendTicket(){
    const nameInput = document.getElementById('customer-name-input');
    const customerName = (nameInput && nameInput.value.trim()) || 'Guest';
    const cartEntries = Object.entries(S.cart);
    if (cartEntries.length === 0){
        S.cartMessage = {type:'error', text:'Add at least one item before sending your list.'};
        render();
        return;
    }

    const latestItems = [...S.items];
    const availabilityIssue = cartEntries.find(([id, qty]) => {
        const it = latestItems.find(i => i.id === id);
        const available = (it?.stock || 0) - ((it?.reservedStock) || 0);
        return !it || available < qty;
    });
    if (availabilityIssue) {
        const [id, qty] = availabilityIssue;
        const item = latestItems.find(i => i.id === id);
        const available = item ? Math.max(0, (item.stock || 0) - ((item.reservedStock) || 0)) : 0;
        S.cartMessage = {type:'error', text:`${item?.name || 'An item'} only has ${available} left right now.`};
        render();
        return;
    }

    const orderItems = cartEntries.map(([id,qty]) => {
        const it = latestItems.find(i => i.id === id);
        return {id: it.id, name: it.name, price: it.price, qty};
    });
    const total = orderItems.reduce((s,i) => s + i.price*i.qty, 0);

    latestItems.forEach(item => {
        const qty = S.cart[item.id] || 0;
        if (qty > 0) {
            item.reservedStock = (item.reservedStock || 0) + qty;
        }
    });

    const { data: existingOrders, error: ordersError } = await db
    .from('shop_orders')
    .select('ticket_number')
    .eq('owner_id', S.selectedOwner.id)
    .order('ticket_number', { ascending: false })
    .limit(1);

if (ordersError) {
    throw ordersError;
}

const ticketNumber = existingOrders?.length
    ? existingOrders[0].ticket_number + 1
    : 1;

const { error: insertOrderError } = await db
    .from('shop_orders')
    .insert({
        owner_id: S.selectedOwner.id,
        customer_name: customerName,
        ticket_number: ticketNumber,
        items: orderItems,
        total: total,
        status: 'pending'
    });

if (insertOrderError) {
    throw insertOrderError;
}

const ok = true;
    const savedItemsOk = await saveStoredForOwner('shop-items', latestItems, S.selectedOwner?.id || loadStored('shop-owner', null)?.id);
    if (!ok || !savedItemsOk){
        S.cartMessage = {type:'error', text:"Couldn't reach the shop right now. Try sending again."};
        render();
        return;
    }
    S.items = latestItems;
    S.cart = {};
    S.cartMessage = {type:'success', text: `Sent! Ticket ${ticketNumber} is on its way to the owner.`};
    if (nameInput) nameInput.value = '';
    render();
}

/* ================= RENDER ================= */
function render(){
    const app = document.getElementById('app');
    if (S.loading){
        app.innerHTML = `<div style="text-align:center;
        padding:80px 0;font-family:'Special Elite';color:var(--paper-2);">Opening the shop…</div>`;
        return;
    }
    app.innerHTML = renderCustomer();
}

function setSearchQuery(value){
    const input = document.querySelector('.search-input');
    const cursor = input ? input.selectionStart : 0;
    S.searchQuery = value;
    render();
    const nextInput = document.querySelector('.search-input');
    if (nextInput) {
        nextInput.focus();
        const safeCursor = Math.min(cursor + 1, nextInput.value.length);
        nextInput.setSelectionRange(safeCursor, safeCursor);
    }
}
function renderCustomer(){
    const cartEntries = Object.entries(S.cart);
    const searchTerm = S.searchQuery.trim().toLowerCase();
    const visibleItems = searchTerm
        ? S.items.filter(item => item.name.toLowerCase().includes(searchTerm))
        : S.items;
    const shelfHtml = visibleItems.length === 0
        ? `<div class="empty-note">The shelf is bare right now — check back soon.</div>`
        : `<div class="shelf-grid">${visibleItems.map(renderItemCard).join('')}</div>`;

    const ticketRows = cartEntries.length === 0
        ? `<div class="empty-note">Your ticket is empty — pick items from the shelf to start one.</div>`
        : cartEntries.map(([id,qty]) => {
            const it = S.items.find(i => i.id === id);
            return `<div class="ticket-row">
            <span class="li-name">${escapeHtml(it.name)}</span>
            <span class="li-qty">${qty}×</span>
            <span class="li-price">${money(it.price*qty)}</span>
            </div>`;
        }).join('');

    const msg = S.cartMessage ? `<div class="note ${S.cartMessage.type}">${escapeHtml(S.cartMessage.text)}</div>` : '';
    const confirmModal = S.showConfirmModal ? renderConfirmModal() : '';


    return `
    <header>
        <div>
        <div class="shop-title display">${escapeHtml(SHOP_NAME)}</div>
        <div class="shop-tagline">${escapeHtml(SHOP_TAGLINE)}${S.selectedOwner ? ' — ' + escapeHtml(S.selectedOwner.name) : ''}</div>
        </div>
        <div class="badge">Customer Counter</div>
    </header>
    <div class="customer-grid">
    <div class = "panel">
        <div class="shelf-title">On the shelf</div>
        <div class="shelf-toolbar">
            <label class="sr-only" for="customer-search">Search shelf items</label>
            <input
                id="customer-search"
                class="search-input"
                type="search"
                placeholder="Search shelf items…"
                value="${escapeHtml(S.searchQuery)}"
                oninput="setSearchQuery(this.value)"
            >
        </div>
        ${shelfHtml}
    </div>
    <div class="panel ticket">
        <div class="ticket-header">Order ticket</div>
        <input type="text" id="customer-name-input" placeholder="Your name (optional)">
        ${ticketRows}
        <div class="ticket-total"><span>Total</span><span>${money(cartTotal())}</span></div>
        <button class="send-btn" onclick="openConfirmModal()" ${cartEntries.length===0?'disabled':''}>Review ticket</button>
        ${msg}
        </div>
    </div>
    ${confirmModal}`;
}

function renderConfirmModal(){
    const cartEntries = Object.entries(S.cart);
    if (!S.showConfirmModal || cartEntries.length === 0) return '';
    const cartHtml = cartEntries.map(([id,qty]) => {
        const it = S.items.find(i => i.id === id) || {name:'Unknown item', stock:0, reservedStock:0};
        const available = Math.max(0, (it.stock || 0) - ((it.reservedStock || 0)));
        const remaining = Math.max(0, available - qty);
        return `
    <div class="confirm-ticket-row">
        <div>${escapeHtml(it.name)}</div>
        <div class="confirm-qty-controls">
            <button onclick="changeCartQty('${id}', -1)" ${qty===0?'disabled':''}>−</button>
            <span>${qty}</span>
            <button onclick="changeCartQty('${id}', 1)" ${remaining===0?'disabled':''}>+</button>
            <button class="remove-x" onclick="removeCartItem('${id}')" title="Remove item">🗑</button>
        </div>
    </div>`;
    }).join('');
    const availableItems = S.items.filter(item => (item.stock || 0) - ((item.reservedStock || 0)) > (S.cart[item.id] || 0)).map(item => {
        const canAdd = (item.stock || 0) - ((item.reservedStock || 0)) > (S.cart[item.id] || 0);
        return `
    <div class="confirm-add-row">
        <span>${escapeHtml(item.name)} ${item.stock - (S.cart[item.id]||0)} left</span>
        <button class="btn-fill" onclick="changeCartQty('${item.id}', 1)" ${canAdd ? '' : 'disabled'}>Add</button>
    </div>`;
    }).join('');
    return `
<div class="modal-overlay" onclick="if(event.target===this) closeConfirmModal()">
    <div class="modal-card confirm-modal-box">
        <div class="r-center" style="margin-bottom:12px;">
            <div style="font-family:'Special Elite';font-size:16px;color:#1b1b1b;">Confirm your order</div>
            <div style="font-size:12px;color:#8a8273;">Review, update quantities, add more items, or remove items before sending.</div>
        </div>
        <div class="r-divider"></div>
        <div class="r-item" style="color:#1b1b1b;">${cartHtml}</div>
        <div class="r-total" style="margin-top:10px;color:#1b1b1b;"><span>Subtotal</span><span>${money(cartTotal())}</span></div>
        <div class="r-divider"></div>
        <div class="confirm-title">Add more items</div>
        <div class="modal-actions" style="margin-top:18px;">
            <button class="btn-fill" onclick="confirmOrder()">Confirm order</button>
            <button class="btn-outline" onclick="closeConfirmModal()">Cancel</button>
        </div>
    </div>
</div>`;
}

function renderItemCard(item){
    const inCart = S.cart[item.id] || 0;
    const available = Math.max(0, (item.stock || 0) - ((item.reservedStock || 0)));
    const remaining = available - inCart;
    const isOut = available <= 0;
    return `
    <div class="item-card ${isOut?'out':''}">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-price ledger-num">${money(item.price)}</div>
        <div class="item-stock">${isOut ? 'Out of stock' : remaining + ' left'}</div>
        <div class="qty-row">
        <div class="stepper">
            <button onclick="changeCartQty('${item.id}', -1)" ${inCart===0?'disabled':''}>−</button>
            <span>${inCart}</span>
            <button onclick="changeCartQty('${item.id}', 1)" ${remaining<=0?'disabled':''}>+</button>
        </div>
        </div>
    </div>`;
}

init();