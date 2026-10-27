async function loadOwnersFromSupabase(){
    const { data, error } = await db
        .from('shop_owners')
        .select('id, name, email')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Could not load shop owners:', error);
        throw error;
    }

    return (data || []).map(owner => ({
        id: owner.id,
        name: owner.name,
        description: 'Shop owner'
    }));
}
const state = {
    selectedOwnerId: null,
    user: null,
    shops: []
};

const ownerList = document.getElementById('owner-list');
const continueBtn = document.getElementById('continue-btn');
const ownerWelcome = document.getElementById('owner-welcome');

function loadUser(){
    return loadStored('shop-user', null, { sessionFallback: true });
}

function loadSavedShops(){
    const ownerScope = state.user?.email || state.user?.name || 'guest';
    return loadStored('shop-list', [], { ownerId: ownerScope });
}

function getOwnerList(){
    return state.shops;
}

function renderOwners(){
    ownerList.innerHTML = getOwnerList().map(owner => {
        const active = owner.id === state.selectedOwnerId ? 'active' : '';
        return `
            <button type="button" class="owner-tile ${active}" data-owner="${owner.id}">
                <h3>${escapeHtml(owner.name)}</h3>
                <p>${escapeHtml(owner.description)}</p>
            </button>
        `;
    }).join('');
    document.querySelectorAll('.owner-tile').forEach(tile => {
        tile.addEventListener('click', () => selectOwner(tile.dataset.owner));
    });
}

function escapeHtml(s){
    return String(s).replace(/[&<>"]+/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function selectOwner(ownerId){
    state.selectedOwnerId = ownerId;
    continueBtn.disabled = false;
    renderOwners();
}

function saveSelectedOwner(owner){
    saveStored('shop-owner', owner);
}

function continueToCustomer(){
    if (!state.selectedOwnerId) return;
    const selected = getOwnerList().find(owner => owner.id === state.selectedOwnerId);
    if (!selected) return;
    saveSelectedOwner(selected);
    window.location.href = '/customer/customer.html';
}

async function init(){
    try {
        state.user = loadUser();

        state.shops = await loadOwnersFromSupabase();

        console.log('Shop owners loaded from Supabase:', state.shops);

        if (state.user && state.user.name) {
            ownerWelcome.textContent =
                `Welcome back, ${state.user.name}. Pick a shop owner to start shopping.`;
        }

        continueBtn.addEventListener('click', continueToCustomer);
        renderOwners();

    } catch (error) {
        console.error('Failed to load shop owners:', error);

        ownerWelcome.textContent =
            'Could not load the shops right now. Please try again.';
    }
}

init();