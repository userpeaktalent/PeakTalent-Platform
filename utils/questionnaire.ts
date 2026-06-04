import { CandidateProfile, JobProfile, TestResult } from '../types';

export const getJobQuestionnaireCount = (job?: JobProfile | null): number =>
    Array.isArray(job?.technical_test?.questions) ? job!.technical_test!.questions.length : 0;

export const isJobQuizEnabled = (job?: JobProfile | null): boolean => {
    if (!job) return false;
    const hasQuestions = getJobQuestionnaireCount(job) > 0;
    if (!hasQuestions) return false;
    if (typeof job.requires_quiz === 'boolean') {
        return job.requires_quiz;
    }
    return hasQuestions;
};

export const normalizeJobQuestionnaireState = (job: JobProfile): JobProfile => {
    const quizEnabled = isJobQuizEnabled(job);
    return {
        ...job,
        requires_quiz: quizEnabled,
        technical_test: quizEnabled ? job.technical_test : undefined,
    };
};

const getQuizVersionTimestamp = (job?: JobProfile | null): number | null => {
    const rawValue = job?.technical_test?.generated_at;
    if (!rawValue) return null;
    const parsed = Date.parse(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
};

const getResultCompletionTimestamp = (result?: TestResult | null): number | null => {
    const rawValue = result?.completed_at;
    if (!rawValue) return null;
    const parsed = Date.parse(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
};

export const isQuizResultCurrent = (job: JobProfile, result?: TestResult | null): boolean => {
    if (!result || result.job_id !== job.id || !result.completed_at || !isJobQuizEnabled(job)) {
        return false;
    }

    if (result.questionnaire_generated_at && job.technical_test?.generated_at) {
        return result.questionnaire_generated_at === job.technical_test.generated_at;
    }

    const quizVersionTimestamp = getQuizVersionTimestamp(job);
    const completionTimestamp = getResultCompletionTimestamp(result);

    if (quizVersionTimestamp === null || completionTimestamp === null) {
        return true;
    }

    return completionTimestamp >= quizVersionTimestamp;
};

export const getCurrentQuizResult = (candidate: CandidateProfile | null | undefined, job: JobProfile): TestResult | undefined =>
    candidate?.test_results?.find((result) => isQuizResultCurrent(job, result));

export const hasCurrentQuizResult = (candidate: CandidateProfile | null | undefined, job: JobProfile): boolean =>
    Boolean(getCurrentQuizResult(candidate, job));
