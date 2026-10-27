// import { createClient} from '@supabase/supabase-js';

const SUPABASE_URL = 'https://txghogjkujohkyhqyzbi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XRVm4FSFj89h57p1fC-lfw_Zop-_Zi_';

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

console.log('Supabase client created:', db);