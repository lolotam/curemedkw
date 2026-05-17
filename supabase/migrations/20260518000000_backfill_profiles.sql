-- Backfill profiles for auth users who signed up before the profiles table
-- was created or before the on_auth_user_created trigger was installed.
INSERT INTO public.profiles (id, full_name, phone)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1), ''),
  COALESCE(u.raw_user_meta_data->>'phone', '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
