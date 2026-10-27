/* ================= STATE ================= */
const S = {
    items: [], 
    orders: [], 
    loading: true, 
    storageError: null,
    ownerTab: 'tickets', 
    receiptOrder: null, 
    showReceiptModal: false,
    toast: null
};
const SHOP_NAME = "The Counter";
const SHOP_TAGLINE = "Order it. We'll have it ready.";

/* ================= STORAGE (scoped to the selected shop owner) ================= */
function defaultItems(){
    return [
        {id:'itm_bread', name:'Bread', price:3.00, stock:20, reservedStock:0},
        {id:'itm_milk', name:'Milk', price:2.50, stock:15, reservedStock:0},
        {id:'itm_eggs', name:'Eggs (dozen)', price:4.20, stock:10, reservedStock:0},
        {id:'itm_coffee', name:'Coffee', price:7.50, stock:8, reservedStock:0},
        {id:'itm_apples', name:'Apples (kg)', price:2.80, stock:25, reservedStock:0},
        {id:'itm_soap', name:'Soap', price:1.90, stock:30, reservedStock:0}
    ];
}
async function getOwnerId() {
    const {
        data: { user },
        error
    } = await db.auth.getUser();

    if (error) {
        console.error('Could not get authenticated user:', error);
        return null;
    }

    if (!user) {
        console.error('No authenticated user found.');
        return null;
    }

    console.log('Current owner UUID:', user.id);

    return user.id;
}

async function loadItemsFromSupabase() {
    const ownerId = await getOwnerId();

    if (!ownerId) {
        throw new Error('No authenticated owner found.');
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

    return data || [];
}
async function loadOrdersFromSupabase() {
    const ownerId = await getOwnerId();

    if (!ownerId) {
        throw new Error('No authenticated owner found.');
    }

    const { data, error } = await db
        .from('shop_orders')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Could not load shop orders:', error);
        throw error;
    }

    return data || [];
}
async function saveOrdersToStorage(orders){
    const ownerId = await getOwnerId();
    return saveStoredForOwner('shop-orders', orders, ownerId);
}

async function init() {
    try {
        S.items = await loadItemsFromSupabase();

        console.log('Shop items loaded from Supabase:', S.items);

        S.orders = await loadOrdersFromSupabase();

        console.log('Shop orders loaded from Supabase:', S.orders);
        
        S.loading = false;
        render();
    } catch (error) {
        console.error('Failed to load shop:', error);
        S.storageError = error.message;
        S.loading = false;
        render();
    }
}

// Live update: when the Customer Counter sends a ticket in another tab, this fires immediately.
window.addEventListener('storage', async (e) => {
    if (e.key && e.key.startsWith('shop-orders')){
        const before = S.orders.length;
        S.orders = await loadOrdersFromStorage();
        if (S.orders.length > before){
            S.toast = 'New ticket received!';
            setTimeout(() => { S.toast = null; render(); }, 4000);
        }
        render();
    }
    if (e.key && e.key.startsWith('shop-items')){
        S.items = await loadItemsFromStorage();
        render();
    }
});

/* ================= UTIL ================= */
function money(n){ 
    return '₦' + Number(n).toFixed(2); }
function escapeHtml(s){ 
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function genId(){ 
    return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ================= LEDGER (ITEMS) ACTIONS ================= */
function setOwnerTab(tab){ S.ownerTab = tab; render(); }

async function addItem() {
    const nameEl = document.getElementById('new-item-name');
    const priceEl = document.getElementById('new-item-price');
    const stockEl = document.getElementById('new-item-stock');

    const name = nameEl.value.trim();
    const price = parseFloat(priceEl.value);
    const stock = parseInt(stockEl.value, 10);

    if (!name || Number.isNaN(price) || price < 0 || Number.isNaN(stock) || stock < 0) {
        S.storageError = 'Give the item a name, a price, and a stock count to add it to the shelf.';
        render();
        return;
    }

    try {
        const ownerId = await getOwnerId();

        const { data, error } = await db
            .from('shop_items')
            .insert({
                owner_id: ownerId,
                name,
                price,
                stock,
                reserved_stock: 0
            })
            .select()
            .single();

        if (error) {
            console.error('Could not add item:', error);
            S.storageError = error.message;
            render();
            return;
        }

        console.log('Item added to Supabase:', data);

        S.items.push(data);
        S.storageError = null;

        render();
    } catch (error) {
        console.error('Add item failed:', error);
        S.storageError = error.message;
        render();
    }
}

async function removeItem(itemId) {
    try {
        const ownerId = await getOwnerId();

        const { error } = await db
            .from('shop_items')
            .delete()
            .eq('id', itemId)
            .eq('owner_id', ownerId);

        if (error) {
            console.error('Could not remove item:', error);
            S.storageError = error.message;
            render();
            return;
        }

        S.items = S.items.filter(item => item.id !== itemId);
        S.storageError = null;

        render();
    } catch (error) {
        console.error('Remove item failed:', error);
        S.storageError = error.message;
        render();
    }
}

async function updateItemField(itemId, field, value){
    const latest = await loadItemsFromStorage() || S.items;
    const item = latest.find(i => i.id === itemId);
    if (!item) return;
    if (field === 'price'){
        const v = parseFloat(value);
        if (!isNaN(v) && v >= 0) item.price = v;
    } else if (field === 'stock'){
        const v = parseInt(value, 10);
        if (!isNaN(v) && v >= 0) item.stock = v;
    } else if (field === 'name'){
        if (value.trim()) item.name = value.trim();
    }
    await saveItemsToStorage(latest);
    S.items = latest;
}

/* ================= ORDERS ACTIONS ================= */
async function markFulfilled(orderId){
    const latestOrders = await loadOrdersFromStorage();
    const order = latestOrders.find(o => o.id === orderId);
    if (!order || order.status === 'fulfilled') return;
    order.status = 'fulfilled';

    const latestItems = await loadItemsFromStorage() || S.items;
    order.items.forEach(li => {
        const it = latestItems.find(i => i.id === li.id);
        if (it) {
            it.stock = Math.max(0, it.stock - li.qty);
            it.reservedStock = Math.max(0, (it.reservedStock || 0) - li.qty);
        }
    });

    await saveOrdersToStorage(latestOrders);
    await saveItemsToStorage(latestItems);
    S.orders = latestOrders;
    S.items = latestItems;
    render();
}

function openReceipt(orderId){
    const order = S.orders.find(o => o.id === orderId);
    if (!order) return;
    S.receiptOrder = order;
    S.showReceiptModal = true;
    render();
}
function closeReceiptModal(){ 
    S.showReceiptModal = false; 
    S.receiptOrder = null; render(); 
}
function doPrint(){ window.print(); }

async function clearAllTickets(){
    if (S.orders.length === 0) return;
    const confirmed = window.confirm('Clear all incoming tickets? This cannot be undone. Stock levels will not be affected.');
    if (!confirmed) return;
    const latestItems = await loadItemsFromStorage() || S.items;
    S.orders.forEach(order => {
        order.items.forEach(li => {
            const it = latestItems.find(i => i.id === li.id);
            if (it) {
                it.reservedStock = Math.max(0, (it.reservedStock || 0) - li.qty);
            }
        });
    });
    await saveItemsToStorage(latestItems);
    await saveOrdersToStorage([]);
    S.items = latestItems;
    S.orders = [];
    render();
}

/* ================= RENDER ================= */
function render(){
    const app = document.getElementById('app');
    if (S.loading){
        app.innerHTML = `<div style="text-align:center;padding:80px 0;font-family:'Special Elite';color:var(--paper-2);">Opening the shop…</div>`;
        return;
    }
    const toastHtml = S.toast ? `<div class="toast">🔔 ${escapeHtml(S.toast)}</div>` : '';
    app.innerHTML = `
    ${toastHtml}
    <header>
        <div>
            <div class="shop-title display">${escapeHtml(SHOP_NAME)}</div>
            <div class="shop-tagline">${escapeHtml(SHOP_TAGLINE)}</div>
        </div>
        <div class="header-actions">
            <a href="./O_home/owner-home.html" class="header-home" aria-label="Owner home">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
            </a>
            <div class="badge">Owner's Desk</div>
        </div>
    </header>
    <div class="owner-tabs">
        <button class="${S.ownerTab==='tickets'?'active':''}" onclick="setOwnerTab('tickets')">Incoming Tickets</button>
        <button class="${S.ownerTab==='ledger'?'active':''}" onclick="setOwnerTab('ledger')">Stock Ledger</button>
    </div>
    <div class="panel">
        ${S.ownerTab === 'tickets' ? renderOwnerTickets() : renderOwnerLedger()}
    </div>
    ${S.showReceiptModal ? renderReceiptModal() : ''}`;
}

function renderOwnerTickets(){
    if (S.orders.length === 0){
        return `<div class="empty-note">No tickets yet — orders sent by customers will land here.</div>`;
    }
    const sorted = [...S.orders].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const clearBtn = `<div style="text-align:right;margin-bottom:10px;"><button class="btn-outline" onclick="clearAllTickets()">Clear all tickets</button></div>`;
    return clearBtn + sorted.map(order => {
        const stampColor = order.status === 'fulfilled' ? 'var(--mint)' : 'var(--brass)';
        const itemsHtml = order.items.map(li =>
    `<div class="row"><span>${li.qty}× ${escapeHtml(li.name)}</span><span>${money(li.price*li.qty)}</span></div>`
        ).join('');
        return `
        <div class="ticket-stub">
            <div class="stub-left">
                <div class="stub-customer">${escapeHtml(order.customerName)} <span class="ledger-num" style="color:#8a8273;font-size:12px;">${order.ticketNumber}</span></div>
                <div class="stub-meta">${new Date(order.createdAt).toLocaleString()}</div>
                <div class="stub-items">${itemsHtml}</div>
                <div class="stub-total">Total: ${money(order.total)}</div>
            </div>
            <div class="stub-right">
                <span class="stamp" style="color:${stampColor};border-color:${stampColor};">${order.status}</span>
                <div class="stub-actions">
                <button class="btn-outline" onclick="openReceipt('${order.id}')">Print Receipt</button>
                ${order.status === 'pending' ? `<button class="btn-fill" onclick="markFulfilled('${order.id}')">Mark Fulfilled</button>` : ''}
            </div>
        </div>
    </div>`;
    }).join('');
}

function renderOwnerLedger(){
    const errNote = S.storageError ? `<div class="note error">${escapeHtml(S.storageError)}</div>` : '';
    const rows = S.items.length === 0
        ? `<tr><td colspan="4" class="empty-note">The shelf is bare — add an item below to stock it.</td></tr>`
        : S.items.map(item => `
        <tr>
            <td><input value="${escapeHtml(item.name)}" onchange="updateItemField('${item.id}','name',this.value)"></td>
            <td><input type="number" step="0.01" min="0" value="${item.price}" onchange="updateItemField('${item.id}','price',this.value)"></td>
            <td><input type="number" min="0" value="${item.stock}" onchange="updateItemField('${item.id}','stock',this.value)"></td>
            <td><button class="remove-x" onclick="removeItem('${item.id}')" title="Remove item">×</button></td>
        </tr>`).join('');

    return `
    <table class="ledger">
        <thead><tr><th>Item</th><th>Price</th><th>Stock</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
    </table>
    <div class="add-row">
        <input id="new-item-name" type="text" placeholder="Item name">
        <input id="new-item-price" type="number" step="0.01" min="0" placeholder="Price">
        <input id="new-item-stock" type="number" min="0" placeholder="Stock">
        <button onclick="addItem()">Add item</button>
    </div>
    ${errNote}`;
}

function renderReceiptModal(){
    const order = S.receiptOrder;
    if (!order) return '';
    const itemsHtml = order.items.map(li => `
        <div class="r-row"><span>${li.qty}× ${escapeHtml(li.name)}</span><span>${money(li.price*li.qty)}</span></div>
    `).join('');
    return `
    <div class="modal-overlay" onclick="if(event.target===this) closeReceiptModal()">
        <div class="modal-box">
            <div id="receipt-print-area">
                <div class="r-center" style="margin-bottom:6px;">
                    <div style="font-family:'Special Elite';font-size:15px;">${escapeHtml(SHOP_NAME)}</div>
                    <div style="font-size:11px;">${escapeHtml(SHOP_TAGLINE)}</div>
                </div>
                <div class="r-divider"></div>
                <div class="r-row"><span>Ticket ${order.ticketNumber}</span><span>${new Date(order.createdAt).toLocaleDateString()}</span></div>
                <div class="r-row"><span>Customer:</span><span>${escapeHtml(order.customerName)}</span></div>
                <div class="r-divider"></div>
                ${itemsHtml}
                <div class="r-divider"></div>
                <div class="r-total"><span>TOTAL</span><span>${money(order.total)}</span></div>
                <div class="r-center" style="margin-top:14px;font-size:11px;">THANK YOU — COME AGAIN</div>
                    <div class="r-center" style="margin-top:10px;">
                        <span class="stamp" style="color:var(--stamp);border-color:var(--stamp);">Paid ${order.ticketNumber}</span>
                    </div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="print-btn" onclick="doPrint()">Print</button>
                <button class="close-btn" onclick="closeReceiptModal()">Close</button>
            </div>
        </div>
    </div>`;
}

init();