const authState = {
    mode: 'signin',
    role: 'customer'
};

const roleButtons = Array.from(document.querySelectorAll('.role-card'));
const formTitle = document.getElementById('form-title');
const formSubtitle = document.getElementById('form-subtitle');
const submitBtn = document.getElementById('submit-btn');
const toggleBtn = document.getElementById('toggle-mode');
const statusNote = document.getElementById('status-note');
const authForm = document.getElementById('auth-form');

function updateRoleSelection(role) {
    authState.role = role;

    roleButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.role === role);
    });

    statusNote.textContent =
        `Signing in as a ${role === 'owner' ? 'shop owner' : 'customer'}.`;

    statusNote.style.color = 'var(--ink)';
}

function updateMode(mode) {
    authState.mode = mode;

    if (mode === 'signup') {
        formTitle.textContent = 'Create account';
        formSubtitle.textContent =
            'Create your customer or shop owner account.';
        submitBtn.textContent = 'Create account';
        toggleBtn.textContent = 'Already have an account? Sign in';
    } else {
        formTitle.textContent = 'Sign in';
        formSubtitle.textContent =
            'Pick an account type and continue to the right workspace.';
        submitBtn.textContent = 'Continue';
        toggleBtn.textContent = 'Create account';
    }
}

function showError(message) {
    statusNote.textContent = message;
    statusNote.style.color = '#bf3f3f';
}

function showSuccess(message) {
    statusNote.textContent = message;
    statusNote.style.color = 'var(--ink)';
}

roleButtons.forEach(button => {
    button.addEventListener('click', () => {
        updateRoleSelection(button.dataset.role);
    });
});

toggleBtn.addEventListener('click', () => {
    updateMode(
        authState.mode === 'signin'
            ? 'signup'
            : 'signin'
    );
});

authForm.addEventListener('submit', async event => {
    event.preventDefault();

    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('user-email').value.trim();
    const password = document.getElementById('user-password').value;

    if (!name || !email || !password) {
        showError('Please provide your name, email and password.');
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters.');
        return;
    }

    submitBtn.disabled = true;
    showSuccess('Connecting to Supabase…');

    try {
        if (authState.mode === 'signup') {
            await signUpUser(name, email, password);
        } else {
            await signInUser(email, password);
        }
    } catch (error) {
        console.error('Authentication error:', error);
        showError(error.message || 'Something went wrong.');
        submitBtn.disabled = false;
    }
});


async function signUpUser(name, email, password) {

    /*
     * STEP 1:
     * Create the authentication account.
     */
    const {
        data,
        error
    } = await db.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                name: name,
                role: authState.role
            }
        }
    });

    if (error) {
        throw error;
    }

    if (!data.user) {
        throw new Error('Supabase did not return a user.');
    }

    const userId = data.user.id;

    console.log('Supabase Auth user created:', userId);

    const { data: sessionData } = await db.auth.getSession();

if (!sessionData.session) {
    throw new Error(
        'Account was created, but no authenticated session is available yet.'
    );
}

console.log(
    'Authenticated session confirmed:',
    sessionData.session.user.id
);


    /*
     * STEP 2:
     * If this is a shop owner, create their
     * shop_owners record using the SAME UUID.
     */
    if (authState.role === 'owner') {

        const {
            error: ownerError
        } = await db
            .from('shop_owners')
            .insert({
                id: userId,
                name: name,
                email: email
            });

        if (ownerError) {
            console.error(
                'Could not create shop owner:',
                ownerError
            );

            throw new Error(
                'Account was created, but the shop owner profile could not be created: ' +
                ownerError.message
            );
        }

        console.log(
            'Shop owner created with ID:',
            userId
        );
    }


    /*
     * STEP 3:
     * Save basic session information for your
     * existing pages temporarily.
     */
    const user = {
        id: userId,
        name: name,
        email: email,
        role: authState.role,
        authenticated: true
    };

    saveStored('shop-user', user, {
        alsoSession: true
    });


    showSuccess(
        authState.role === 'owner'
            ? 'Shop owner account created. Redirecting…'
            : 'Customer account created. Redirecting…'
    );

    setTimeout(() => {
        window.location.href =
            authState.role === 'owner'
                ? '../owner/O_home/owner-home.html'
                : '../choose_owner/choose-owner.html';
    }, 700);
}


async function signInUser(email, password) {

    const {
        data,
        error
    } = await db.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        throw error;
    }

    if (!data.user) {
        throw new Error('Supabase did not return a user.');
    }

    const user = data.user;

    console.log('Signed in Supabase user:', user.id);


    /*
     * Get the role we saved during signup.
     */
    const role =
        user.user_metadata?.role || 'customer';

    const name =
        user.user_metadata?.name ||
        user.email;

if (role === 'owner') {
    const { data: existingOwner, error: ownerCheckError } = await db
        .from('shop_owners')
        .select('id, name, email')
        .eq('id', user.id)
        .maybeSingle();

    if (ownerCheckError) {
        throw new Error(
            'Could not check shop owner profile: ' +
            ownerCheckError.message
        );
    }

    if (!existingOwner) {
        const { error: ownerInsertError } = await db
            .from('shop_owners')
            .insert({
                id: user.id,
                name: name,
                email: user.email
            });

        if (ownerInsertError) {
            throw new Error(
                'Could not create shop owner profile: ' +
                ownerInsertError.message
            );
        }

        console.log(
            'Shop owner profile created:',
            user.id
        );
    } else {
        console.log(
            'Shop owner profile already exists:',
            existingOwner
        );
    }
}


    const sessionUser = {
        id: user.id,
        name: name,
        email: user.email,
        role: role,
        authenticated: true
    };

    saveStored('shop-user', sessionUser, {
        alsoSession: true
    });


    showSuccess(
        `Signed in as ${
            role === 'owner'
                ? 'shop owner'
                : 'customer'
        }. Redirecting…`
    );

    setTimeout(() => {
        window.location.href =
            role === 'owner'
                ? '../owner/O_home/owner-home.html'
                : '../choose_owner/choose-owner.html';
    }, 700);
}


updateRoleSelection(authState.role);
updateMode('signin');