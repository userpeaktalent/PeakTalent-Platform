// GDPR service — account deletion, AI data deletion, and data portability export.

import JSZip from 'jszip';
import { CandidateProfile } from '../types';
import { supabase } from './supabaseClient';
import { getCandidateCvRecord, downloadCandidateCv } from './candidateAssetsService';

// ── Account deletion ──────────────────────────────────────────────────────────

export const deleteAccount = async (): Promise<void> => {
  const { error } = await supabase.functions.invoke('delete-account', { body: {} });

  if (!error) return;

  // Try to pull a human-readable message from the response body
  const response = (error as any)?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      if (payload?.error) throw new Error(payload.error);
    } catch (inner) {
      if (inner instanceof Error && inner.message !== 'Failed to fetch') throw inner;
    }
  }

  throw new Error(
    error instanceof Error ? error.message : 'Account deletion failed. Please try again.'
  );
};

// ── AI interview data deletion ────────────────────────────────────────────────

export const deleteAiInterviewData = async (candidate: Pick<CandidateProfile, 'id'>): Promise<void> => {
  // Resolve the profile UUID (profiles.id == candidates.user_id, but we need the auth user id)
  const { data: authData } = await supabase.auth.getUser();
  const profileId = authData?.user?.id;
  if (!profileId) throw new Error('Not authenticated');

  // Delete the chat transcript rows
  const { error: chatError } = await supabase
    .from('candidate_refinement_chats')
    .delete()
    .eq('candidate_profile_id', profileId);

  if (chatError) throw chatError;

  // Reset AI refinement metadata inside candidates.content. The candidates table
  // stores profile fields as JSON, not as top-level ai_refined columns.
  let { data: candidateRow, error: candidateReadError } = await supabase
    .from('candidates')
    .select('id, content')
    .eq('user_id', profileId)
    .maybeSingle();

  if (candidateReadError) throw candidateReadError;

  if (!candidateRow && candidate.id) {
    const fallbackResult = await supabase
      .from('candidates')
      .select('id, content')
      .eq('id', candidate.id)
      .maybeSingle();

    if (fallbackResult.error) throw fallbackResult.error;
    candidateRow = fallbackResult.data;
  }

  if (!candidateRow?.id) {
    throw new Error('Candidate profile could not be found while resetting AI refinement status.');
  }

  const nextContent = {
    ...((candidateRow.content || {}) as CandidateProfile),
    id: ((candidateRow.content || {}) as CandidateProfile).id || candidateRow.id,
    ai_refined: false,
    ai_refined_at: null,
  };

  const { error: candidateError } = await supabase
    .from('candidates')
    .update({ content: nextContent })
    .eq('id', candidateRow.id);

  if (candidateError) throw candidateError;
};

// ── Data export (GDPR Article 20 — portability) ───────────────────────────────

export const exportUserData = async (candidate: CandidateProfile): Promise<void> => {
  const { data: authData } = await supabase.auth.getUser();
  const profileId = authData?.user?.id;
  if (!profileId) throw new Error('Not authenticated');

  const zip = new JSZip();

  // 1. Profile JSON
  const profileExport = {
    exported_at: new Date().toISOString(),
    profile: candidate,
  };
  zip.file('profile.json', JSON.stringify(profileExport, null, 2));

  // 2. AI interview transcript
  const { data: chatRows } = await supabase
    .from('candidate_refinement_chats')
    .select('*')
    .eq('candidate_profile_id', profileId);

  if (chatRows && chatRows.length > 0) {
    zip.file('ai_interview.json', JSON.stringify(chatRows, null, 2));
  }

  // 3. Job applications
  const candidateIds = [candidate.id, profileId].filter(Boolean);
  const { data: appRows } = await supabase
    .from('applications')
    .select('job_id, status, applied_at, updated_at')
    .in('candidate_id', candidateIds);

  if (appRows && appRows.length > 0) {
    zip.file('applications.json', JSON.stringify(appRows, null, 2));
  }

  // 4. CV file — download separately (binary blob can't be easily zipped in-browser without extra work)
  //    We include a placeholder note, then trigger the CV download after the ZIP.
  const cvRecord = await getCandidateCvRecord({ id: candidate.id, email: candidate.contacts?.email });
  if (cvRecord) {
    zip.file(
      'cv_note.txt',
      `Your CV file (${cvRecord.file_name}) is downloaded separately alongside this ZIP.`
    );
  }

  // Generate ZIP blob and trigger download
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `peaktalent-data-export-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Download CV file separately
  if (cvRecord) {
    // Small delay so the browser doesn't block two simultaneous downloads
    await new Promise(r => setTimeout(r, 500));
    await downloadCandidateCv(cvRecord);
  }
};
