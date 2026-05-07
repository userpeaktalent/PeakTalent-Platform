import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';

// Eager imports: on the critical path for first paint (marketing + auth + chrome).
import Auth from './components/Auth';
import RecruiterAuth from './components/RecruiterAuth';
import RoleSelection from './components/RoleSelection';
import MarketingHomePage from './components/MarketingHomePage';
import Header from './components/Header';
import Footer from './components/Footer';
import BugReportButton from './components/BugReportButton';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy imports: route-level code splitting keeps admin, recruiter and
// seeker-flow bundles out of the initial download.
const RecruiterProfileSetup = lazy(() => import('./components/RecruiterProfileSetup'));
const JobSeekerFlow = lazy(() => import('./components/JobSeekerFlow'));
const RecruiterHomePage = lazy(() => import('./components/RecruiterHomePage'));
const RecruiterFlow = lazy(() => import('./components/RecruiterFlow'));
const QuizEditor = lazy(() => import('./components/QuizEditor'));
const JobSeekerHomePage = lazy(() => import('./components/JobSeekerHomePage'));
const JobDetailsPage = lazy(() => import('./components/JobDetailsPage'));
const JobBoardPage = lazy(() => import('./components/JobBoardPage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const RecruiterMatchesView = lazy(() => import('./components/RecruiterMatchesView'));
const JobEvaluationHub = lazy(() => import('./components/JobEvaluationHub'));
const RecruiterSettingsPage = lazy(() => import('./components/RecruiterSettingsPage'));
const CandidateProfileView = lazy(() => import('./components/CandidateProfileView'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const AdminSettingsPage = lazy(() => import('./components/AdminSettingsPage'));

import { AuthProvider, useAuth } from './components/AuthProvider';
import { LanguageProvider, useLanguage } from './components/LanguageProvider';
import { getCandidate, getRecruiter, applyToJob, getCandidateAssessmentStatuses, getJobById, getNotifications, unapplyFromJob } from './services/dbService';
import { clearPendingJobInterest, loadPendingJobInterest, savePendingJobInterest } from './services/accessLinks';
import { invalidateSeekerMatchCache } from './utils/seekerMatchCache';
import { CandidateProfile, RecruiterProfile, JobProfile } from './types';


// Define types for page navigation if used by children
export type SeekerPage = 'dashboard' | 'application' | 'jobDetails' | 'settings' | 'notifications' | 'profileView' | 'jobBoard' | 'evaluation' | 'logout';
export type RecruiterPage = 'dashboard' | 'jobFlow' | 'editProfile' | 'notifications' | 'settings' | 'profileSetup' | 'matches' | 'jobDetails' | 'quizEditor';

const PUBLIC_SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL || 'https://www.peaktalent.it').replace(/\/$/, '');

const ensureMetaTag = (selector: string, attributes: Record<string, string>, content: string) => {
  if (typeof document === 'undefined') return;

  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    Object.entries(attributes).forEach(([key, value]) => tag!.setAttribute(key, value));
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
};

const ensureLinkTag = (selector: string, attributes: Record<string, string>, href: string) => {
  if (typeof document === 'undefined') return;

  let tag = document.head.querySelector<HTMLLinkElement>(selector);
  if (!tag) {
    tag = document.createElement('link');
    Object.entries(attributes).forEach(([key, value]) => tag!.setAttribute(key, value));
    document.head.appendChild(tag);
  }
  tag.setAttribute('href', href);
};

const updateSeoForPath = (pathname: string) => {
  if (typeof document === 'undefined') return;

  const normalizedPath = pathname || '/';
  const canonicalUrl = normalizedPath === '/' ? `${PUBLIC_SITE_URL}/` : `${PUBLIC_SITE_URL}${normalizedPath}`;
  const isMarketingPage = normalizedPath === '/';

  const title = isMarketingPage
    ? 'PeakTalent | AI recruiting e ricerca talenti con curriculum digitale'
    : 'PeakTalent | Piattaforma AI per recruiting e assessment candidati';
  const description = isMarketingPage
    ? 'PeakTalent è la piattaforma AI per recruiting, screening candidati, ricerca talenti e curriculum digitale. Migliora la selezione con assessment tecnici, ranking trasparente e matching intelligente.'
    : 'Area piattaforma PeakTalent per recruiting, assessment candidati, ranking e gestione del processo di selezione.';
  const robots = isMarketingPage
    ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
    : 'noindex, nofollow, noarchive';

  document.title = title;
  ensureMetaTag('meta[name="description"]', { name: 'description' }, description);
  ensureMetaTag('meta[name="robots"]', { name: 'robots' }, robots);
  ensureMetaTag('meta[name="googlebot"]', { name: 'googlebot' }, robots);
  ensureMetaTag('meta[property="og:title"]', { property: 'og:title' }, title);
  ensureMetaTag('meta[property="og:description"]', { property: 'og:description' }, description);
  ensureMetaTag('meta[property="og:url"]', { property: 'og:url' }, canonicalUrl);
  ensureMetaTag('meta[name="twitter:title"]', { name: 'twitter:title' }, title);
  ensureMetaTag('meta[name="twitter:description"]', { name: 'twitter:description' }, description);
  ensureLinkTag('link[rel="canonical"]', { rel: 'canonical' }, canonicalUrl);
};

// -- Route Guards --

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { text } = useLanguage();
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 text-center">{text('Loading authentication...', 'Caricamento autenticazione...')}</div>;
  if (!user) return <Navigate to="/platform" replace />;
  return children;
};

/** Redirects to "/" if the authenticated user's effective role doesn't match. */
const RequireRole: React.FC<{ role: 'seeker' | 'recruiter' | 'admin'; children: React.ReactNode }> = ({ role, children }) => {
  const { effectiveUserRole, actualUserRole, loading } = useAuth();
  const { text } = useLanguage();
  if (loading) return <div className="p-10 text-center">{text('Loading...', 'Caricamento...')}</div>;
  // Admin check uses actualUserRole so impersonation cannot grant admin access.
  const check = role === 'admin' ? actualUserRole : effectiveUserRole;
  if (check !== role) return <Navigate to="/platform" replace />;
  return <>{children}</>;
};

// -- Helpers --

const RoleSelectionWrapper: React.FC<{ onSelectSeeker: () => void, onSelectRecruiter: () => void, onLogin: () => void }> = ({ onSelectSeeker, onSelectRecruiter, onLogin }) => {
  return <RoleSelection onSelectRole={(role) => role === 'seeker' ? onSelectSeeker() : onSelectRecruiter()} onLogin={onLogin} />;
};

/** Shared hook: loads a job by id, preferring the router state for instant display. */
function useJobLoader(dashboardPath: string) {
  const { text } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [job, setJob] = useState<JobProfile | null>((location.state?.job as JobProfile) || null);
  const [isLoadingJob, setIsLoadingJob] = useState(!location.state?.job);

  useEffect(() => {
    if (job?.title && job.constraints) {
      setIsLoadingJob(false);
      return;
    }
    if (!id) { setIsLoadingJob(false); return; }
    setIsLoadingJob(true);
    getJobById(id).then((fetched) => {
      setJob(fetched || null);
      setIsLoadingJob(false);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadingEl = <div className="p-8 text-center">{text('Loading job...', 'Caricamento job...')}</div>;
  const missingEl = (
    <div className="p-8 text-center mt-20">
      {text('Job reference missing. Please navigate from Dashboard.', 'Riferimento job mancante. Torna alla dashboard.')}
      <br />
      <button className="mt-4 text-orange-500 font-bold hover:underline" onClick={() => navigate(dashboardPath)}>
        {text('Back', 'Indietro')}
      </button>
    </div>
  );

  return { job, setJob, isLoadingJob, loadingEl, missingEl, navigate };
}

const JobDetailsWrapper: React.FC<{ candidate: CandidateProfile | null }> = ({ candidate }) => {
  const { job, setJob, isLoadingJob, loadingEl, missingEl, navigate } = useJobLoader('/seeker/dashboard');
  const { effectiveProfileId, effectiveEmail } = useAuth();
  const [hasAssessmentRequest, setHasAssessmentRequest] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadAssessmentState = async () => {
      if (!effectiveProfileId || !job?.id) {
        if (isMounted) setHasAssessmentRequest(false);
        return;
      }

      try {
        const assessmentStatuses = await getCandidateAssessmentStatuses(
          candidate.contacts.email,
          candidate.id
        ).catch((error) => {
          console.error('Failed to load seeker assessment statuses for job details:', error);
          return {};
        });
        const notifications = await getNotifications(effectiveProfileId).catch((error) => {
          console.error('Failed to load seeker notifications for job details:', error);
          return [];
        });
        const nextValue = Boolean(assessmentStatuses[job.id]) || notifications.some((notification) =>
          notification.type === 'invitation_received' &&
          notification.metadata?.job_id === job.id &&
          notification.metadata?.assessment_requested
        );

        if (isMounted) {
          setHasAssessmentRequest(nextValue);
        }
      } catch (error) {
        console.error('Failed to load assessment request state for seeker job details:', error);
        if (isMounted) {
          setHasAssessmentRequest(false);
        }
      }
    };

    void loadAssessmentState();

    return () => {
      isMounted = false;
    };
  }, [candidate?.contacts.email, candidate?.id, effectiveProfileId, job?.id]);

  if (isLoadingJob || !candidate) return loadingEl;
  if (!job) return missingEl;

  const handleApply = async (jobProfile: JobProfile) => {
    if (!effectiveProfileId) {
      throw new Error('Missing seeker profile id while applying to job.');
    }
    await applyToJob(effectiveProfileId, jobProfile.id);
    invalidateSeekerMatchCache(candidate.id);
    if (effectiveEmail) {
      setJob((cur) => cur ? ({ ...cur, applicant_emails: Array.from(new Set([...(cur.applicant_emails || []), effectiveEmail])) }) : cur);
    }
  };

  const handleUnapply = async (jobProfile: JobProfile) => {
    if (!effectiveProfileId) {
      throw new Error('Missing seeker profile id while removing interest from job.');
    }
    await unapplyFromJob(effectiveProfileId, jobProfile.id);
    invalidateSeekerMatchCache(candidate.id);
    if (effectiveEmail) {
      const email = effectiveEmail.toLowerCase().trim();
      setJob((cur) => cur ? ({ ...cur, applicant_emails: (cur.applicant_emails || []).filter((e) => e.toLowerCase().trim() !== email) }) : cur);
    }
  };

  return (
    <JobDetailsPage
      job={job}
      candidate={candidate}
      hasAssessmentRequest={hasAssessmentRequest}
      onBack={() => navigate(-1)}
      onApply={handleApply}
      onUnapply={handleUnapply}
      onOpenEvaluation={() => navigate(`/seeker/evaluation/${job.id}`, { state: { job } })}
      onOpenProfileRefine={() => navigate('/seeker/profile', { state: { returnTo: `/seeker/evaluation/${job.id}`, startStep: 3 } })}
    />
  );
}

const RecruiterJobDetailsWrapper: React.FC = () => {
  const { job, isLoadingJob, loadingEl, missingEl, navigate } = useJobLoader('/recruiter/dashboard');
  if (isLoadingJob) return loadingEl;
  if (!job) return missingEl;
  return <JobDetailsPage job={job} viewerRole="recruiter" onBack={() => navigate('/recruiter/dashboard')} onApply={async () => { }} onUnapply={async () => { }} />;
}

const RecruiterMatchesWrapper: React.FC = () => {
  const { job, isLoadingJob, loadingEl, missingEl, navigate } = useJobLoader('/recruiter/dashboard');
  if (isLoadingJob) return loadingEl;
  if (!job) return missingEl;
  return <RecruiterMatchesView job={job} onBack={() => navigate('/recruiter/dashboard')} />;
}

const SeekerEvaluationWrapper: React.FC<{
  candidate: CandidateProfile | null;
  onUpdateCandidate: (candidate: CandidateProfile) => void;
}> = ({ candidate, onUpdateCandidate }) => {
  const { job, isLoadingJob, loadingEl, missingEl, navigate } = useJobLoader('/seeker/dashboard');

  if (isLoadingJob || !candidate) return loadingEl;
  if (!job) return missingEl;

  return (
    <JobEvaluationHub
      job={job}
      candidate={candidate}
      onBack={() => navigate('/seeker/dashboard')}
      onUpdateCandidate={onUpdateCandidate}
      onOpenProfileRefine={() => navigate('/seeker/profile', { state: { returnTo: `/seeker/evaluation/${job.id}`, startStep: 3 } })}
    />
  );
};

// -- Main Route Logic --

const AppRoutes: React.FC = () => {
  const { text } = useLanguage();
  const {
    user,
    userRole: actualUserRole,
    effectiveUserRole,
    effectiveProfileId,
    loading: authLoading,
    signOut,
    isImpersonating,
    stopImpersonation,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isDev = import.meta.env.DEV;
  const isMarketingRoute = location.pathname === '/';
  const isSeekerRoute = location.pathname.startsWith('/seeker');
  const isRecruiterMatchesRoute = location.pathname.startsWith('/recruiter/matches');

  useEffect(() => {
    updateSeoForPath(location.pathname);
  }, [location.pathname]);

  // Save current route to sessionStorage for persistence across refreshes
  useEffect(() => {
    if (user && !authLoading && location.pathname !== '/' && location.pathname !== '/platform' && location.pathname !== '/auth' && location.pathname !== '/recruiter-auth') {
      // Don't save routes that are likely loading or error states
      const isLoadingRoute = location.pathname.includes('/loading') || location.pathname.includes('/error');
      if (!isLoadingRoute) {
        sessionStorage.setItem('lastRoute', location.pathname + location.search);
        sessionStorage.setItem('lastRouteState', JSON.stringify(location.state || {}));
      }
    }
  }, [location.pathname, location.search, location.state, user, authLoading]);

  // Restore route on app load if user is authenticated
  useEffect(() => {
    if (!authLoading && user && effectiveUserRole) {
      const savedRoute = sessionStorage.getItem('lastRoute');
      const savedState = sessionStorage.getItem('lastRouteState');

      if (savedRoute && savedRoute !== '/' && savedRoute !== location.pathname + location.search) {
        // Only restore if we're at auth redirect paths (not platform which should be accessible)
        if (location.pathname === '/auth' || location.pathname === '/recruiter-auth') {
          try {
            const parsedState = savedState ? JSON.parse(savedState) : {};
            navigate(savedRoute, { replace: true, state: parsedState });
            return;
          } catch (error) {
            console.warn('Failed to parse saved route state:', error);
          }
        }
      }
    }
  }, [authLoading, user, effectiveUserRole, location.pathname, location.search, navigate]);

  const renderAdminAccessDenied = () => (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h2>
        <p className="text-slate-600 dark:text-slate-400">
          You don&apos;t have permission to access this page.
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-6 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-all duration-200"
        >
          Go Home
        </button>
      </div>
    </div>
  );

  // Local state
  const [currentCandidate, setCurrentCandidate] = useState<CandidateProfile | null>(null);
  const [currentRecruiter, setCurrentRecruiter] = useState<RecruiterProfile | null>(null);

  const finalizePendingSeekerInterest = async (candidateProfile: CandidateProfile | undefined) => {
    const pendingJobId = loadPendingJobInterest();
    const targetCandidateId = effectiveProfileId || candidateProfile?.id;
    if (!targetCandidateId || !pendingJobId) return false;

    try {
      await applyToJob(targetCandidateId, pendingJobId);
      clearPendingJobInterest();

      const linkedJob = await getJobById(pendingJobId);
      toast.success(
        linkedJob?.title
          ? text(`Interest registered for ${linkedJob.title}.`, `Interesse registrato per ${linkedJob.title}.`)
          : text('Interest registered successfully.', 'Interesse registrato con successo.')
      );
      return true;
    } catch (error) {
      console.error('Failed to auto-register seeker interest from shared job link:', error);
      toast.error(
        text(
          'The account was created, but the linked job could not be attached automatically.',
          'L’account è stato creato, ma non è stato possibile collegare automaticamente il job richiesto.'
        )
      );
      return false;
    }
  };

  // Load profile data into local state when user is authenticated.
  // Only clear/reload when the effective identity or role actually changes —
  // otherwise a TOKEN_REFRESHED event (which creates a new User object even
  // when the id is the same) would wipe currentCandidate and force child
  // components like JobSeekerFlow to unmount and lose their state.
  useEffect(() => {
    if (!user || authLoading || !effectiveProfileId) {
      setCurrentCandidate(null);
      setCurrentRecruiter(null);
      return;
    }

    let cancelled = false;
    const loadProfile = async () => {
      if (effectiveUserRole === 'seeker') {
        const profile = await getCandidate(effectiveProfileId);
        if (!cancelled && profile) {
          invalidateSeekerMatchCache(profile.id);
          setCurrentCandidate(profile);
        }
      } else if (effectiveUserRole === 'recruiter') {
        const profile = await getRecruiter(effectiveProfileId);
        if (!cancelled && profile) setCurrentRecruiter(profile);
      }
    };
    loadProfile();
    return () => { cancelled = true; };
  }, [user?.id, effectiveUserRole, effectiveProfileId, authLoading]);


  // Auto-redirect based on role if at root or login (but don't override restored routes)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const linkedJobId = searchParams.get('job');
    if (location.pathname === '/auth' && linkedJobId) {
      savePendingJobInterest(linkedJobId);
    }

    if (!authLoading && user && effectiveUserRole) {
      if (location.pathname === '/platform') {
        if (effectiveUserRole === 'seeker') {
          navigate('/seeker/dashboard', { replace: true });
        }
        if (effectiveUserRole === 'recruiter') {
          navigate('/recruiter/dashboard', { replace: true });
        }
        if (effectiveUserRole === 'admin') {
          navigate('/admin/dashboard', { replace: true });
        }
        return;
      }

      // Only auto-redirect from auth pages when there is no saved route to restore
      const savedRoute = sessionStorage.getItem('lastRoute');
      const hasRestorableRoute = Boolean(savedRoute) && savedRoute !== '/';
      const shouldAutoRedirect = (location.pathname === '/auth' || location.pathname === '/recruiter-auth') &&
                                !hasRestorableRoute;

      if (shouldAutoRedirect) {
        if (effectiveUserRole === 'seeker') {
          navigate('/seeker/dashboard', { replace: true });
        }
        if (effectiveUserRole === 'recruiter') {
          navigate('/recruiter/dashboard', { replace: true });
        }
        if (effectiveUserRole === 'admin') {
          navigate('/admin/dashboard', { replace: true });
        }
      }
    }
  }, [user, effectiveUserRole, authLoading, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!user || effectiveUserRole !== 'seeker' || !currentCandidate) {
      return;
    }

    const pendingJobId = loadPendingJobInterest();
    if (!pendingJobId) {
      return;
    }

    void finalizePendingSeekerInterest(currentCandidate).then((handled) => {
      if (handled && location.pathname !== '/seeker/dashboard') {
        navigate('/seeker/dashboard', { replace: true });
      }
    });
  }, [user, effectiveUserRole, currentCandidate, location.pathname, navigate]);

  useEffect(() => {
    if (
      authLoading ||
      !user ||
      effectiveUserRole !== 'recruiter' ||
      isImpersonating ||
      !currentRecruiter?.must_change_password
    ) {
      return;
    }

    if (location.pathname !== '/recruiter/settings') {
      toast.info(
        text(
          'Please change your temporary password before continuing.',
          'Cambia la password temporanea prima di continuare.'
        )
      );
      navigate('/recruiter/settings', { replace: true, state: { tab: 'security', forcePasswordChange: true } });
    }
  }, [
    authLoading,
    user,
    effectiveUserRole,
    isImpersonating,
    currentRecruiter?.must_change_password,
    location.pathname,
    navigate,
    text,
  ]);


  // --- Handlers ---

  const handleAuthSuccess = async (
    type: 'login' | 'signup',
    role: 'seeker' | 'admin' | 'recruiter',
    profile?: CandidateProfile | RecruiterProfile
  ) => {
    if (role === 'admin') {
      setCurrentCandidate(null);
      setCurrentRecruiter(null);
      navigate('/admin/dashboard', { replace: true });
      return;
    }

    if (role === 'recruiter') {
      const recruiterProfile = profile as RecruiterProfile | undefined;

      if (!recruiterProfile) {
        navigate('/', { replace: true });
        return;
      }

      setCurrentCandidate(null);
      setCurrentRecruiter(recruiterProfile);
      if (type === 'signup') {
        navigate('/recruiter/setup', { replace: true });
      } else {
        navigate('/recruiter/dashboard', { replace: true });
      }
      return;
    }

    const candidateProfile = profile as CandidateProfile | undefined;

    if (!candidateProfile) {
      navigate('/', { replace: true });
      return;
    }

    setCurrentRecruiter(null);
    const linkedInterestHandled = await finalizePendingSeekerInterest(candidateProfile);
    invalidateSeekerMatchCache(candidateProfile.id);
    setCurrentCandidate(candidateProfile);
    if (linkedInterestHandled) {
      navigate('/seeker/dashboard', { replace: true });
      return;
    }

    if (type === 'signup') {
      navigate('/seeker/profile'); // Go to onboarding
    } else {
      navigate('/seeker/dashboard');
    }
  };

  const handleRecruiterAuthSuccess = async (type: 'signin' | 'signup', profile: RecruiterProfile) => {
    setCurrentCandidate(null);
    setCurrentRecruiter(profile);
    if (type === 'signup') {
      navigate('/recruiter/setup');
    } else {
      navigate('/recruiter/dashboard');
    }
  };

  const showRecruiterFlow = () => {
    navigate('/recruiter-auth', { state: { mode: 'signup' } });
  };
  const showSeekerFlow = () => {
    navigate('/auth', { state: { mode: 'signup' } });
  };
  const showLoginFlow = () => {
    navigate('/auth', { state: { mode: 'login' } });
  };

  // --- Render ---

  if (authLoading) return <div className="flex h-screen items-center justify-center">Loading PeakTalent...</div>;

  return (
    <div className={isMarketingRoute ? 'min-h-screen bg-[#f7fafc] text-slate-900' : 'platform-shell flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 transition-colors duration-200 dark:bg-slate-900 dark:text-slate-100'}>
      {!isMarketingRoute && <Header />}

      <main className={isMarketingRoute ? 'w-full' : 'flex-grow w-full pt-[54px] sm:pt-16'}>
        <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<div className="p-10 text-center">{text('Loading...', 'Caricamento...')}</div>}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<MarketingHomePage onEnterPlatform={() => navigate('/platform')} onLogin={showLoginFlow} />} />
          <Route path="/platform" element={<RoleSelectionWrapper onSelectRecruiter={showRecruiterFlow} onSelectSeeker={showSeekerFlow} onLogin={showLoginFlow} />} />
          <Route path="/auth" element={<Auth onAuthSuccess={handleAuthSuccess} />} />
          <Route path="/recruiter-auth" element={<RecruiterAuth onAuthSuccess={handleRecruiterAuthSuccess} />} />
          {isDev && <Route path="/debug" element={<Navigate to="/admin/dashboard" replace />} />}

          {/* Seeker Protected Routes */}
          <Route path="/seeker/dashboard" element={
            <RequireAuth>
              <RequireRole role="seeker">
              {currentCandidate ? (
                <JobSeekerHomePage
                  candidate={currentCandidate}
                  setPage={async (page, data) => {
                    if (page === 'settings') navigate('/seeker/settings', { state: data?.tab ? { tab: data.tab } : null });
                    if (page === 'jobDetails' && data?.job) navigate(`/seeker/job/${data.job.id}`, { state: { job: data.job } });
                    if (page === 'application') navigate('/seeker/profile', { state: data?.startStep ? { startStep: data.startStep } : null });
                    if (page === 'profileView') navigate('/seeker/view-profile');
                    if (page === 'jobBoard') navigate('/seeker/jobs');
                    if (page === 'evaluation' && data?.job) navigate(`/seeker/evaluation/${data.job.id}`, { state: { job: data.job } });
                    if (page === 'logout') {
                      if (isImpersonating) {
                        stopImpersonation();
                        navigate('/admin/dashboard', { replace: true });
                      } else {
                        await signOut();
                        navigate('/', { replace: true });
                      }
                    }
                  }}
                />
              ) : <div>Loading Profile...</div>}
              </RequireRole>
            </RequireAuth>
          } />

          <Route path="/seeker/profile" element={
            <RequireAuth><RequireRole role="seeker">
              {currentCandidate ? (
                <div className="p-4">
                  <JobSeekerFlow
                    candidate={currentCandidate}
                    isEditing={true}
                    initialStep={(location.state as { startStep?: number } | null)?.startStep}
                    onGoToDashboard={() => {
                      const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
                      navigate(returnTo || '/seeker/dashboard');
                    }}
                    onProfileUpdate={async (p) => {
                      invalidateSeekerMatchCache(p.id);
                      setCurrentCandidate(p);
                    }}
                  />
                </div>
              ) : <div>Loading...</div>}
            </RequireRole></RequireAuth>
          } />

          <Route path="/seeker/view-profile" element={
            <RequireAuth><RequireRole role="seeker">
              {currentCandidate ? (
                <CandidateProfileView
                  candidate={currentCandidate}
                  onEdit={() => navigate('/seeker/settings', { state: { tab: 'profile' } })}
                  onBack={() => navigate('/seeker/dashboard')}
                />
              ) : <div>Loading...</div>}
            </RequireRole></RequireAuth>
          } />

          <Route path="/seeker/jobs" element={
            <RequireAuth><RequireRole role="seeker">
              {currentCandidate ? (
                <JobBoardPage
                  candidate={currentCandidate}
                  onBack={() => navigate('/seeker/dashboard')}
                  onViewJob={(job) => navigate(`/seeker/job/${job.id}`, { state: { job } })}
                />
              ) : <div>Loading...</div>}
            </RequireRole></RequireAuth>
          } />

          <Route path="/seeker/job/:id" element={
            <RequireAuth><RequireRole role="seeker">
              <JobDetailsWrapper candidate={currentCandidate} />
            </RequireRole></RequireAuth>
          } />

          <Route path="/seeker/evaluation/:id" element={
            <RequireAuth><RequireRole role="seeker">
              <SeekerEvaluationWrapper
                candidate={currentCandidate}
                onUpdateCandidate={(candidate) => {
                  invalidateSeekerMatchCache(candidate.id);
                  setCurrentCandidate(candidate);
                }}
              />
            </RequireRole></RequireAuth>
          } />

          <Route path="/seeker/settings" element={
            <RequireAuth><RequireRole role="seeker">
              {currentCandidate ? (
                <SettingsPage
                  onBack={() => navigate('/seeker/dashboard')}
                  candidate={currentCandidate}
                  onUpdateProfile={async (p) => {
                    invalidateSeekerMatchCache(p.id);
                    setCurrentCandidate(p);
                  }}
                  onOpenProfileRefine={() => navigate('/seeker/profile', { state: { startStep: 3 } })}
                  onLogout={async () => {
                    if (isImpersonating) {
                      stopImpersonation();
                      navigate('/admin/dashboard', { replace: true });
                    } else {
                      sessionStorage.removeItem('lastRoute');
                      sessionStorage.removeItem('lastRouteState');
                      await signOut();
                      navigate('/', { replace: true });
                    }
                  }}
                  onDeleteAccount={async () => { toast.info('Account deletion is coming soon.'); }}
                  initialTab={(location.state as { tab?: 'profile' | 'privacy_visibility' | 'security' | 'ai_data' | 'notifications' | 'matching' } | null)?.tab}
                />
              ) : <div>Loading...</div>}
            </RequireRole></RequireAuth>
          } />

          {/* Recruiter Protected Routes */}
          <Route path="/recruiter/dashboard" element={
            <RequireAuth><RequireRole role="recruiter">
              {currentRecruiter ? (
                <RecruiterHomePage
                  recruiter={currentRecruiter}
                  onNavigate={(page, data) => {
                    if (page === 'jobFlow') navigate('/recruiter/curate', { state: data });
                    if (page === 'profileSetup' || page === 'editProfile') navigate('/recruiter/settings', { state: { tab: 'profile' } });
                    if (page === 'settings') navigate('/recruiter/settings', { state: data?.tab ? { tab: data.tab } : null });
                    if (page === 'matches' && data?.job) navigate(`/recruiter/matches/${data.job.id}`, { state: { job: data.job } });
                    if (page === 'jobDetails' && data?.job) navigate(`/recruiter/job/${data.job.id}`, { state: { job: data.job } });
                    if (page === 'quizEditor' && data?.job) navigate(`/recruiter/quiz/${data.job.id}`, { state: { job: data.job } });
                  }}
                />
              ) : <div>Recruiter Profile Loading...</div>}
            </RequireRole></RequireAuth>
          } />

          <Route path="/recruiter/setup" element={
            <RequireAuth><RequireRole role="recruiter">
              {currentRecruiter ? (
                <div className="p-4">
                  <RecruiterProfileSetup
                    recruiter={currentRecruiter}
                    isEditing={currentRecruiter.company_name !== ''}
                    onBack={() => navigate('/recruiter/dashboard')}
                    onProfileComplete={(p) => {
                      setCurrentRecruiter(p);
                      navigate('/recruiter/dashboard');
                    }}
                  />
                </div>
              ) : <div>Loading...</div>}
            </RequireRole></RequireAuth>
          } />

          <Route path="/recruiter/curate" element={
            <RequireAuth><RequireRole role="recruiter">
              {currentRecruiter ? (
                <RecruiterFlow
                  recruiter={currentRecruiter}
                  mode={location.state?.mode || 'create'}
                  initialJob={location.state?.job || null}
                  onBack={() => navigate('/recruiter/dashboard')}
                />
              ) : <div className="p-8 text-center">Loading Recruiter Profile...</div>}
            </RequireRole></RequireAuth>
          } />

          <Route path="/recruiter/quiz/:jobId" element={
            <RequireAuth><RequireRole role="recruiter">
              {currentRecruiter && location.state?.job ? (
                <QuizEditor
                  job={location.state.job}
                  onBack={() => navigate('/recruiter/dashboard')}
                  onSaved={() => navigate('/recruiter/dashboard')}
                />
              ) : <div className="p-8 text-center" onClick={() => navigate('/recruiter/dashboard')} style={{cursor:'pointer'}}>Loading... (click to go back to dashboard)</div>}
            </RequireRole></RequireAuth>
          } />

          <Route path="/recruiter/settings" element={
            <RequireAuth><RequireRole role="recruiter">
              {currentRecruiter ? (
                <RecruiterSettingsPage
                  recruiter={currentRecruiter}
                  onUpdateProfile={(profile) => setCurrentRecruiter(profile)}
                  onBack={() => navigate('/recruiter/dashboard')}
                  onLogout={async () => {
                    if (isImpersonating) {
                      stopImpersonation();
                      navigate('/admin/dashboard', { replace: true });
                    } else {
                      sessionStorage.removeItem('lastRoute');
                      sessionStorage.removeItem('lastRouteState');
                      await signOut();
                      navigate('/', { replace: true });
                    }
                  }}
                  initialTab={(location.state as { tab?: 'profile' | 'notifications' | 'security' | 'company' } | null)?.tab}
                  requirePasswordChange={Boolean(
                    currentRecruiter.must_change_password &&
                    (location.state as { forcePasswordChange?: boolean } | null)?.forcePasswordChange
                  )}
                />
              ) : <div>Loading...</div>}
            </RequireRole></RequireAuth>
          } />

          <Route path="/recruiter/matches/:id" element={
            <RequireAuth><RequireRole role="recruiter">
              <RecruiterMatchesWrapper />
            </RequireRole></RequireAuth>
          } />

          <Route path="/recruiter/job/:id" element={
            <RequireAuth><RequireRole role="recruiter">
              <RecruiterJobDetailsWrapper />
            </RequireRole></RequireAuth>
          } />

          {/* Admin Protected Routes */}
          <Route path="/admin/dashboard" element={
            <RequireAuth>
              {actualUserRole === 'admin' ? (
                <AdminDashboard />
              ) : (
                renderAdminAccessDenied()
              )}
            </RequireAuth>
          } />
          <Route path="/admin/settings" element={
            <RequireAuth>
              {actualUserRole === 'admin' ? (
                <AdminSettingsPage
                  onBack={() => navigate('/admin/dashboard')}
                  onLogout={async () => {
                    sessionStorage.removeItem('lastRoute');
                    sessionStorage.removeItem('lastRouteState');
                    await signOut();
                    navigate('/', { replace: true });
                  }}
                />
              ) : (
                renderAdminAccessDenied()
              )}
            </RequireAuth>
          } />

        </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>

      {!isMarketingRoute && <Footer className={isSeekerRoute ? 'mt-[50px]' : isRecruiterMatchesRoute ? 'mt-[30px]' : ''} />}
      {!isMarketingRoute && <BugReportButton />}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster richColors position="top-right" />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
