import { UserRole } from '../types';
import { loadAdminImpersonation } from './impersonationService';
import { supabase } from './supabaseClient';

export type ActivityLogStatus = 'success' | 'error';

export interface ActivityLogRecord {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_role: UserRole | null;
  effective_profile_id: string | null;
  effective_email: string | null;
  effective_role: UserRole | null;
  effective_name: string | null;
  is_impersonating: boolean;
  event_type: string;
  status: ActivityLogStatus;
  source: string;
  function_name: string | null;
  purpose: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  model_id: string | null;
  provider_slot: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
}

interface ActivityActorSnapshot {
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: UserRole | null;
  effectiveProfileId: string | null;
  effectiveEmail: string | null;
  effectiveRole: UserRole | null;
  effectiveName: string | null;
  isImpersonating: boolean;
  actorMetadata: Record<string, unknown>;
}

export interface ActivityLogInput {
  eventType: string;
  source: string;
  summary: string;
  status?: ActivityLogStatus;
  functionName?: string | null;
  purpose?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  modelId?: string | null;
  providerSlot?: string | null;
  metadata?: Record<string, unknown>;
}

const sanitizeMetadata = (metadata?: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(metadata || {}).filter(([, value]) => value !== undefined)
  );

const resolveClientActor = async (): Promise<ActivityActorSnapshot> => {
  const impersonation = loadAdminImpersonation();
  const { data: authData } = await supabase.auth.getUser();
  const actorUserId = authData.user?.id ?? null;
  const actorEmailFromAuth = authData.user?.email?.trim() || null;

  let actorRole: UserRole | null = null;
  let actorEmail = actorEmailFromAuth;
  let actorName: string | null = null;

  if (actorUserId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, email, full_name')
      .eq('id', actorUserId)
      .maybeSingle();

    actorRole = (profile?.role as UserRole | undefined) ?? null;
    actorEmail = profile?.email?.trim() || actorEmailFromAuth;
    actorName = profile?.full_name?.trim() || null;
  }

  return {
    actorUserId,
    actorEmail,
    actorRole,
    effectiveProfileId: impersonation?.profileId || actorUserId,
    effectiveEmail: impersonation?.email?.trim() || actorEmail,
    effectiveRole: (impersonation?.role as UserRole | undefined) ?? actorRole,
    effectiveName: impersonation?.fullName?.trim() || actorName,
    isImpersonating: Boolean(impersonation),
    actorMetadata: impersonation
      ? {
          impersonated_by_user_id: actorUserId,
          impersonated_by_email: actorEmail,
          impersonated_by_role: actorRole,
          impersonated_profile_id: impersonation.profileId,
        }
      : {},
  };
};

export const logActivity = async (input: ActivityLogInput): Promise<void> => {
  try {
    const actor = await resolveClientActor();
    if (!actor.actorUserId) return;

    const { error } = await supabase.from('activity_logs').insert({
      actor_user_id: actor.actorUserId,
      actor_email: actor.actorEmail,
      actor_role: actor.actorRole,
      effective_profile_id: actor.effectiveProfileId,
      effective_email: actor.effectiveEmail,
      effective_role: actor.effectiveRole,
      effective_name: actor.effectiveName,
      is_impersonating: actor.isImpersonating,
      event_type: input.eventType,
      status: input.status || 'success',
      source: input.source,
      function_name: input.functionName || null,
      purpose: input.purpose || null,
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      entity_label: input.entityLabel || null,
      model_id: input.modelId || null,
      provider_slot: input.providerSlot || null,
      summary: input.summary,
      metadata: {
        ...actor.actorMetadata,
        ...sanitizeMetadata(input.metadata),
      },
    });

    if (error) {
      console.warn('Activity log insert failed:', error);
    }
  } catch (error) {
    console.warn('Activity log insert failed before request completed:', error);
  }
};

export const listActivityLogs = async (limit = 120): Promise<ActivityLogRecord[]> => {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    const message = `${error.message || ''} ${error.details || ''}`.trim();
    if (error.code === '42P01' || message.toLowerCase().includes('activity_logs')) {
      throw new Error("Logs table missing. Run 'supabase/activity_logs.sql' in Supabase SQL Editor.");
    }
    throw error;
  }

  return (data || []) as ActivityLogRecord[];
};
