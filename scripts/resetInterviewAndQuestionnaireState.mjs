import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const loadDotEnvFile = (filePath) => {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
};

loadDotEnvFile('.env.local');
loadDotEnvFile('.env');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
}

const adminEmail = process.env.ADMIN_EMAIL || process.argv[2] || 'admin@admin.admin';
const adminPassword = process.env.ADMIN_PASSWORD || process.argv[3] || 'password123';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
  email: adminEmail,
  password: adminPassword,
});

if (signInError || !signInData?.user) {
  throw new Error(
    `Admin sign-in failed for ${adminEmail}. Pass credentials as ADMIN_EMAIL/ADMIN_PASSWORD or args.\n` +
      `Original error: ${signInError?.message || 'unknown error'}`
  );
}

const summary = {
  candidatesReset: 0,
  applicationStatusesReset: 0,
  notificationsDeleted: 0,
  refinementChatsDeleted: 0,
};

const { data: candidateRows, error: candidateReadError } = await supabase
  .from('candidates')
  .select('id, content');

if (candidateReadError) {
  throw new Error(`Failed reading candidates: ${candidateReadError.message}`);
}

for (const row of candidateRows || []) {
  const content = row.content && typeof row.content === 'object' ? { ...row.content } : {};
  content.ai_refined = false;
  delete content.ai_refined_at;
  content.test_results = [];

  const { error: updateError } = await supabase
    .from('candidates')
    .update({ content })
    .eq('id', row.id);

  if (updateError) {
    throw new Error(`Failed updating candidate ${row.id}: ${updateError.message}`);
  }

  summary.candidatesReset += 1;
}

const { data: appResetRows, error: appResetError } = await supabase
  .from('applications')
  .update({ status: 'pending' })
  .in('status', ['assessment_requested', 'assessment_completed'])
  .select('id');

if (appResetError) {
  throw new Error(`Failed resetting application statuses: ${appResetError.message}`);
}

summary.applicationStatusesReset = appResetRows?.length || 0;

const { data: notificationDeletedRows, error: notificationDeleteError } = await supabase
  .from('notifications')
  .delete()
  .or(
    [
      'metadata->>assessment_requested.eq.true',
      'metadata->>assessment_completed.eq.true',
      'metadata->>ai_refinement_requested.eq.true',
      'metadata->>requires_ai_refinement.eq.true',
    ].join(',')
  )
  .select('id');

if (notificationDeleteError) {
  const isMissingTable = (notificationDeleteError.message || '').toLowerCase().includes('could not find the table');
  if (!isMissingTable) {
    throw new Error(`Failed deleting request/completion notifications: ${notificationDeleteError.message}`);
  }
}

summary.notificationsDeleted = notificationDeletedRows?.length || 0;

const { data: chatDeletedRows, error: chatDeleteError } = await supabase
  .from('candidate_refinement_chats')
  .delete()
  .not('id', 'is', null)
  .select('id');

if (chatDeleteError) {
  const isMissingTable = (chatDeleteError.message || '').toLowerCase().includes('does not exist');
  if (!isMissingTable) {
    throw new Error(`Failed deleting refinement chats: ${chatDeleteError.message}`);
  }
} else {
  summary.refinementChatsDeleted = chatDeletedRows?.length || 0;
}

await supabase.auth.signOut();

console.log('Reset completed successfully.');
console.log(JSON.stringify(summary, null, 2));
