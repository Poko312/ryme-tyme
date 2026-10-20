-- Run this ONCE in the Supabase SQL Editor after you've signed up in the app.
-- It makes the account with this email an admin.
update public.user_settings
set is_admin = true
where user_id = (select id from auth.users where email = 'jnluongo250@gmail.com');

-- Check it worked (should show one row with is_admin = true):
select u.email, s.is_admin
from public.user_settings s join auth.users u on u.id = s.user_id
where s.is_admin;
