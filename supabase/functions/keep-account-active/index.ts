// GDPR re-engagement endpoint — called when user clicks the keep-alive link in the inactivity email.
// GET /functions/v1/keep-account-active?token=<token>
// Validates the token, clears inactivity_notice_sent_at and inactivity_token, redirects to the app.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const getEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token')?.trim();
  const siteUrl = Deno.env.get('PUBLIC_SITE_URL')?.trim() || 'https://www.peaktalent.it';

  const redirect = (path: string) =>
    Response.redirect(`${siteUrl.replace(/\/$/, '')}${path}`, 302);

  if (!token) return redirect('/?inactivity=invalid');

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile, error } = await adminClient
      .from('profiles')
      .select('id')
      .eq('inactivity_token', token)
      .not('inactivity_notice_sent_at', 'is', null)
      .maybeSingle();

    if (error || !profile) return redirect('/?inactivity=invalid');

    await adminClient
      .from('profiles')
      .update({ inactivity_notice_sent_at: null, inactivity_token: null })
      .eq('id', profile.id);

    return redirect('/?inactivity=kept');
  } catch (err) {
    console.error('keep-account-active error:', err);
    return redirect('/?inactivity=error');
  }
});
