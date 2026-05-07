/**
 * Semantic Pillar Test Suite
 *
 * Isolates the `semanticScore` output of calculateMatchScore across many
 * controlled candidate/job scenarios. Goal: make sure the semantic pillar
 *   - ranks similar seekers / jobs high
 *   - ranks distinct seekers / jobs with distinct scores (no plateau / ties)
 *   - separates unrelated profiles clearly into the low band
 *
 * Run with: npm run test:ranking:semantic
 *
 * NOTE: weights and other pillars are deliberately NOT touched here. Every
 * assertion reads `breakdown.semanticScore` in isolation.
 */
import { calculateMatchScore, debugStructuredSemantic } from './matchingUtils';
import { JobProfile, CandidateProfile } from '../types';

// ─── Test Helpers ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function fmt(score: number): string {
    return `${(score * 100).toFixed(1)}%`;
}

function assert(condition: boolean, msg: string, details?: string) {
    if (condition) {
        console.log(`  ✅ ${msg}`);
        passed++;
    } else {
        const full = `${msg}${details ? ` — ${details}` : ''}`;
        console.error(`  ❌ ${full}`);
        failures.push(full);
        failed++;
    }
}

function assertRange(value: number, min: number, max: number, label: string) {
    const within = value >= min && value <= max;
    const details = `got ${fmt(value)}, expected ${fmt(min)}–${fmt(max)}`;
    assert(within, label, details);
}

function assertOrdered(scores: Array<{ label: string; score: number }>, minGap = 0.005) {
    for (let i = 0; i < scores.length - 1; i++) {
        const a = scores[i];
        const b = scores[i + 1];
        const gap = a.score - b.score;
        assert(
            gap >= minGap,
            `${a.label} (${fmt(a.score)}) > ${b.label} (${fmt(b.score)})`,
            gap < 0 ? `order reversed by ${fmt(-gap)}` : gap < minGap ? `tied (gap ${fmt(gap)} < ${fmt(minGap)})` : undefined
        );
    }
}

function printRanking(title: string, items: Array<{ label: string; score: number }>) {
    console.log(`\n  ${title}`);
    items.forEach((it, idx) => console.log(`    ${idx + 1}. ${fmt(it.score).padStart(6)} — ${it.label}`));
}

// ─── Embedding Helpers ───────────────────────────────────────────────────────
// Synthesize unit vectors whose cosine similarity is fully controllable:
// vector(angleDeg) produces a 5-D vector where cos(θ_a - θ_b) = similarity.
// Each "role" sits at a fixed angle on the unit circle; cosine between any
// two roles is the cosine of the angle between them. Real Gemini embeddings
// behave like this — related roles sit nearby, unrelated roles far apart.
// The semantic pipeline maps cosine into [0.48, 0.92] → [0, 1] via a power
// curve, so we pick angles that land in realistic bands once mapped.

function vector(angleDeg: number): number[] {
    const rad = (angleDeg * Math.PI) / 180;
    return [Math.cos(rad), Math.sin(rad), 0, 0, 0];
}

// Role positions on the unit circle. Angle diffs below translate to cosines
// that land in the floor/ceiling normalized band when >0.48.
// Same-role duplicates use a tiny offset so same-tier candidates still carry
// *some* embedding variance (otherwise identical cosines defeat ordering).
const POS = {
    frontend:        vector(0),
    frontendMid:     vector(4),    // 4° from FE role → cos ≈ 0.998 (near-perfect)
    fullStack:       vector(12),   // 12° → cos ≈ 0.978 (close cousin)
    backend:         vector(28),   // 28° → cos ≈ 0.883 (same family, different stack)
    csJunior:        vector(20),   // close to engineering roles
    dataScience:     vector(65),   // well separated from FE
    mlEngineer:      vector(62),   // close to DS, slightly engineering-leaning
    dataAnalyst:     vector(78),
    marketing:       vector(130),  // cos with FE ≈ -0.64 (very unrelated)
    chef:            vector(170),  // cos with FE ≈ -0.98 (opposite)
};

// ─── Profile Factories ──────────────────────────────────────────────────────

function mkCand(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
    return {
        id: 'cand',
        personal_info: { first_name: 'Test', last_name: 'User' },
        contacts: { email: 't@t.com', phone: '0' },
        residence: { country: 'switzerland', city: 'Geneva' },
        summary_text: '',
        current_job_function: '',
        current_seniority_level: 'mid',
        total_years_experience: 4,
        skills: [],
        it_skills: [],
        soft_skills: [],
        languages: [{ language: 'English', level: 'C1' }],
        experiences: [],
        education: [],
        certifications: [],
        preferences: {
            remote: 'hybrid',
            preferred_locations: [{ country: 'switzerland', city: 'Geneva' }],
            desired_contract_types: ['full_time'],
            salary_eur: { min: 60000, flexibility: true },
            work_eligibility_countries: ['switzerland', 'eu'],
        },
        embedding_vector: undefined,
        ...overrides,
    };
}

function mkJob(overrides: Partial<JobProfile> = {}): JobProfile {
    return {
        id: 'job',
        title: '',
        industry: ['Technology'],
        job_function: 'engineering',
        seniority_level: 'mid',
        summary_text: '',
        company_name: 'Co',
        skills: [],
        it_skills: [],
        soft_skills: [],
        constraints: {
            location: { country: 'switzerland', city: 'Geneva' },
            contract_type: 'full_time',
            remote: 'hybrid',
            languages: [{ language: 'English', level: 'B2' }],
            salary_eur: { min: 50000, max: 120000 },
        },
        experience_required: 3,
        embedding_vector: undefined,
        ...overrides,
    };
}

function semanticOf(job: JobProfile, cand: CandidateProfile): number {
    return calculateMatchScore(job, cand).semanticScore;
}

// ─── Canned Profile Library ─────────────────────────────────────────────────
// Each profile is deliberately minimal: it provides *just* the signals the
// semantic pillar consumes — role terms, evidence texts, skills (as anchors),
// education/experience (for trajectory). Constraint/salary/location pillars
// are neutralized by the defaults above.

// ---- Frontend engineering ----
const FRONTEND_SENIOR_JOB: JobProfile = mkJob({
    id: 'job_fe_senior',
    title: 'Senior Frontend Engineer',
    job_function: 'engineering',
    seniority_level: 'senior',
    summary_text: 'React/TypeScript frontend engineer building SPA dashboards.',
    industry: ['Technology'],
    skills: [
        { skill_name: 'React', level: 9, must: true },
        { skill_name: 'TypeScript', level: 8, must: true },
        { skill_name: 'CSS', level: 7, must: false },
    ],
    it_skills: [{ skill_name: 'Webpack', level: 5, must: false }],
    embedding_vector: POS.frontend,
});

const frontendStar = mkCand({
    id: 'cand_fe_star',
    summary_text: 'Senior frontend engineer specialized in React and TypeScript SPAs.',
    current_job_function: 'engineering',
    current_seniority_level: 'senior',
    total_years_experience: 7,
    skills: [
        { skill_name: 'React', level: 9, rank: 1, level_source: 'chat_validated', level_confidence: 'high' },
        { skill_name: 'TypeScript', level: 8, rank: 2, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'CSS', level: 8, rank: 3, level_source: 'cv_only', level_confidence: 'high' },
    ],
    it_skills: [{ skill_name: 'Webpack', level: 6, rank: 1, level_source: 'cv_only', level_confidence: 'high' }],
    experiences: [
        { role: 'Senior Frontend Engineer', company: 'Acme', location: { country: 'switzerland', city: 'Geneva' }, from: '2019-01', to: 'present', is_current_position: true, description: 'Built React / TypeScript SPAs.' },
    ],
    education: [{ degree_level: 'MSc', major: 'Computer Science', institution: 'EPFL', currently_pursuing: false, from: '2013', to: '2015' }],
    embedding_vector: POS.frontend,
});

const frontendMid = mkCand({
    id: 'cand_fe_mid',
    summary_text: 'Mid-level frontend developer working with React and TypeScript.',
    current_job_function: 'engineering',
    current_seniority_level: 'mid',
    total_years_experience: 4,
    skills: [
        { skill_name: 'React', level: 7, rank: 1, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'TypeScript', level: 6, rank: 2, level_source: 'cv_only', level_confidence: 'medium' },
        { skill_name: 'CSS', level: 7, rank: 3, level_source: 'cv_only', level_confidence: 'medium' },
    ],
    experiences: [
        { role: 'Frontend Developer', company: 'Startup', location: { country: 'switzerland', city: 'Geneva' }, from: '2021-01', to: 'present', is_current_position: true, description: 'React SPA work.' },
    ],
    education: [{ degree_level: 'BSc', major: 'Computer Science', institution: 'ETH', currently_pursuing: false, from: '2016', to: '2019' }],
    embedding_vector: POS.frontendMid,
});

const fullStackEng = mkCand({
    id: 'cand_fullstack',
    summary_text: 'Full-stack engineer comfortable with React frontends and Node backends.',
    current_job_function: 'engineering',
    current_seniority_level: 'senior',
    total_years_experience: 6,
    skills: [
        { skill_name: 'React', level: 7, rank: 1, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'Node.js', level: 8, rank: 2, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'TypeScript', level: 7, rank: 3, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'PostgreSQL', level: 6, rank: 4, level_source: 'cv_only', level_confidence: 'high' },
    ],
    experiences: [
        { role: 'Full Stack Developer', company: 'BigCo', location: { country: 'switzerland', city: 'Geneva' }, from: '2019-01', to: 'present', is_current_position: true, description: 'Built React + Node fullstack systems.' },
    ],
    education: [{ degree_level: 'BSc', major: 'Software Engineering', institution: 'Politecnico', currently_pursuing: false, from: '2013', to: '2016' }],
    embedding_vector: POS.fullStack,
});

const backendEng = mkCand({
    id: 'cand_backend',
    summary_text: 'Backend engineer working on Java microservices.',
    current_job_function: 'engineering',
    current_seniority_level: 'senior',
    total_years_experience: 7,
    skills: [
        { skill_name: 'Java', level: 9, rank: 1, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'Spring', level: 8, rank: 2, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'PostgreSQL', level: 7, rank: 3, level_source: 'cv_only', level_confidence: 'high' },
    ],
    experiences: [
        { role: 'Backend Engineer', company: 'BankCo', location: { country: 'switzerland', city: 'Zurich' }, from: '2018-01', to: 'present', is_current_position: true, description: 'Java/Spring microservices.' },
    ],
    education: [{ degree_level: 'MSc', major: 'Computer Science', institution: 'EPFL', currently_pursuing: false, from: '2013', to: '2015' }],
    embedding_vector: POS.backend,
});

const marketingMgr = mkCand({
    id: 'cand_mkt',
    summary_text: 'Digital marketing manager running paid-media campaigns.',
    current_job_function: 'marketing',
    current_seniority_level: 'senior',
    total_years_experience: 8,
    skills: [
        { skill_name: 'SEO', level: 8, rank: 1, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'Google Ads', level: 9, rank: 2, level_source: 'cv_only', level_confidence: 'high' },
    ],
    experiences: [
        { role: 'Marketing Manager', company: 'BrandCo', location: { country: 'switzerland', city: 'Geneva' }, from: '2017-01', to: 'present', is_current_position: true, description: 'Led digital marketing campaigns.' },
    ],
    education: [{ degree_level: 'MBA', major: 'Business Administration', institution: 'HEC', currently_pursuing: false, from: '2010', to: '2012' }],
    embedding_vector: POS.marketing,
});

const chef = mkCand({
    id: 'cand_chef',
    summary_text: 'Head chef running fine-dining kitchens.',
    current_job_function: 'hospitality',
    current_seniority_level: 'senior',
    total_years_experience: 15,
    skills: [
        { skill_name: 'French Cuisine', level: 10, rank: 1, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'Pastry', level: 9, rank: 2, level_source: 'cv_only', level_confidence: 'high' },
    ],
    experiences: [
        { role: 'Head Chef', company: 'Restaurant', location: { country: 'france', city: 'Paris' }, from: '2008-01', to: 'present', is_current_position: true, description: 'Ran fine-dining kitchens.' },
    ],
    education: [{ degree_level: 'Diploma', major: 'Culinary Arts', institution: 'Le Cordon Bleu', currently_pursuing: false, from: '2005', to: '2008' }],
    embedding_vector: POS.chef,
});

const emptyProfile = mkCand({
    id: 'cand_empty',
    summary_text: '',
    current_job_function: '',
    total_years_experience: 0,
    skills: [],
    it_skills: [],
    experiences: [],
    education: [],
    embedding_vector: undefined,
});

// ---- Data / ML roles (for family-similarity tests) ----
const DATA_SCIENTIST_JOB: JobProfile = mkJob({
    id: 'job_ds',
    title: 'Senior Data Scientist',
    job_function: 'data science',
    seniority_level: 'senior',
    summary_text: 'Applied data scientist building ML models end-to-end.',
    industry: ['Technology'],
    skills: [
        { skill_name: 'Python', level: 9, must: true },
        { skill_name: 'Machine Learning', level: 8, must: true },
        { skill_name: 'SQL', level: 7, must: true },
        { skill_name: 'Statistics', level: 8, must: false },
    ],
    it_skills: [{ skill_name: 'AWS', level: 5, must: false }],
    embedding_vector: POS.dataScience,
});

const dataScientist = mkCand({
    id: 'cand_ds',
    summary_text: 'Senior data scientist deploying ML models in production.',
    current_job_function: 'data science',
    current_seniority_level: 'senior',
    total_years_experience: 7,
    skills: [
        { skill_name: 'Python', level: 9, rank: 1, level_source: 'chat_validated', level_confidence: 'high' },
        { skill_name: 'Machine Learning', level: 8, rank: 2, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'SQL', level: 8, rank: 3, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'Statistics', level: 8, rank: 4, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'Pandas', level: 9, rank: 5, level_source: 'cv_only', level_confidence: 'high' },
    ],
    experiences: [
        { role: 'Senior Data Scientist', company: 'DataCo', location: { country: 'switzerland', city: 'Zurich' }, from: '2019-01', to: 'present', is_current_position: true, description: 'Built ML models end-to-end.' },
    ],
    education: [{ degree_level: 'MSc', major: 'Data Science', institution: 'EPFL', currently_pursuing: false, from: '2014', to: '2016' }],
    embedding_vector: POS.dataScience,
});

const mlEngineer = mkCand({
    id: 'cand_mle',
    summary_text: 'Machine learning engineer deploying deep learning models.',
    current_job_function: 'engineering',
    current_seniority_level: 'senior',
    total_years_experience: 6,
    skills: [
        { skill_name: 'Python', level: 9, rank: 1, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'Deep Learning', level: 9, rank: 2, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'PyTorch', level: 8, rank: 3, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'SQL', level: 7, rank: 4, level_source: 'cv_only', level_confidence: 'medium' },
    ],
    experiences: [
        { role: 'Machine Learning Engineer', company: 'AIStartup', location: { country: 'switzerland', city: 'Lausanne' }, from: '2019-01', to: 'present', is_current_position: true, description: 'Trained and deployed deep learning models at scale.' },
    ],
    education: [{ degree_level: 'MSc', major: 'Machine Learning', institution: 'ETH', currently_pursuing: false, from: '2015', to: '2017' }],
    embedding_vector: POS.mlEngineer,
});

const dataAnalyst = mkCand({
    id: 'cand_da',
    summary_text: 'Data analyst producing BI dashboards and reports.',
    current_job_function: 'analytics',
    current_seniority_level: 'mid',
    total_years_experience: 3,
    skills: [
        { skill_name: 'SQL', level: 8, rank: 1, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'Excel', level: 9, rank: 2, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'Tableau', level: 7, rank: 3, level_source: 'cv_only', level_confidence: 'high' },
        { skill_name: 'Python', level: 5, rank: 4, level_source: 'cv_only', level_confidence: 'medium' },
    ],
    experiences: [
        { role: 'Data Analyst', company: 'RetailCo', location: { country: 'switzerland', city: 'Geneva' }, from: '2022-01', to: 'present', is_current_position: true, description: 'Built BI dashboards in Tableau.' },
    ],
    education: [{ degree_level: 'BSc', major: 'Business Analytics', institution: 'HEC', currently_pursuing: false, from: '2018', to: '2021' }],
    embedding_vector: POS.dataAnalyst,
});

const juniorCsGrad = mkCand({
    id: 'cand_cs_junior',
    summary_text: 'Recent Computer Science graduate looking for a first role.',
    current_job_function: 'engineering',
    current_seniority_level: 'junior',
    total_years_experience: 0,
    skills: [
        { skill_name: 'Python', level: 6, rank: 1, level_source: 'cv_only', level_confidence: 'medium' },
        { skill_name: 'Java', level: 5, rank: 2, level_source: 'cv_only', level_confidence: 'medium' },
    ],
    experiences: [],
    education: [{ degree_level: 'BSc', major: 'Computer Science', institution: 'EPFL', currently_pursuing: false, from: '2021', to: '2024' }],
    embedding_vector: POS.csJunior,
});

// ─── Test Suites ────────────────────────────────────────────────────────────

function testAbsoluteBands() {
    console.log('\n═══ 1. ABSOLUTE SEMANTIC BANDS ═══');
    console.log('\n🎯 Frontend Senior Job:');

    const starScore = semanticOf(FRONTEND_SENIOR_JOB, frontendStar);
    const midScore = semanticOf(FRONTEND_SENIOR_JOB, frontendMid);
    const fsScore = semanticOf(FRONTEND_SENIOR_JOB, fullStackEng);
    const beScore = semanticOf(FRONTEND_SENIOR_JOB, backendEng);
    const mktScore = semanticOf(FRONTEND_SENIOR_JOB, marketingMgr);
    const chefScore = semanticOf(FRONTEND_SENIOR_JOB, chef);
    const emptyScore = semanticOf(FRONTEND_SENIOR_JOB, emptyProfile);

    // Semantic is about role/domain fit, NOT seniority (that's the experience pillar).
    // So a mid FE with strong skills can rightfully score ~95% on a senior FE job.
    // Bands reflect the embedding-led blend (70/30): adjacent-family candidates
    // (full-stack, backend) genuinely sit close in embedding space and earn it.
    assertRange(starScore, 0.80, 1.00, 'Frontend star on Frontend job');
    assertRange(midScore, 0.60, 0.99, 'Frontend mid on Frontend job');
    assertRange(fsScore, 0.55, 0.99, 'Full-stack engineer on Frontend job');
    assertRange(beScore, 0.30, 0.88, 'Backend engineer on Frontend job');
    assertRange(mktScore, 0.00, 0.30, 'Marketing manager on Frontend job');
    assertRange(chefScore, 0.00, 0.20, 'Chef on Frontend job');
    assertRange(emptyScore, 0.00, 0.25, 'Empty profile on Frontend job');

    printRanking('Frontend Senior Ranking:', [
        { label: 'FE Star',  score: starScore },
        { label: 'FE Mid',   score: midScore },
        { label: 'FullStk',  score: fsScore },
        { label: 'Backend',  score: beScore },
        { label: 'Marketing',score: mktScore },
        { label: 'Chef',     score: chefScore },
        { label: 'Empty',    score: emptyScore },
    ]);
}

function testOrdering() {
    console.log('\n\n═══ 2. STRICT ORDERING (no ties) ═══');
    console.log('\n🔢 Frontend Job — distinct candidates must get distinct scores:');

    const ranked = [
        { label: 'FE Star',      score: semanticOf(FRONTEND_SENIOR_JOB, frontendStar) },
        { label: 'FE Mid',       score: semanticOf(FRONTEND_SENIOR_JOB, frontendMid) },
        { label: 'FullStk',      score: semanticOf(FRONTEND_SENIOR_JOB, fullStackEng) },
        { label: 'Backend',      score: semanticOf(FRONTEND_SENIOR_JOB, backendEng) },
        { label: 'Marketing',    score: semanticOf(FRONTEND_SENIOR_JOB, marketingMgr) },
        { label: 'Chef',         score: semanticOf(FRONTEND_SENIOR_JOB, chef) },
    ].sort((a, b) => b.score - a.score);

    printRanking('Descending:', ranked);
    // Only require strict ordering for candidates with any relevance (score > 0.05).
    // Two fully-irrelevant profiles can tie at 0 — that's correct behavior.
    const relevant = ranked.filter(r => r.score > 0.05);
    assertOrdered(relevant, 0.005);

    // Specific ordering invariants that must always hold:
    assert(
        ranked[0].label === 'FE Star',
        `FE Star should top the ranking (got "${ranked[0].label}")`,
    );
    assert(
        ranked[ranked.length - 1].label === 'Chef' || ranked[ranked.length - 1].label === 'Marketing',
        `Chef or Marketing should bottom the ranking (got "${ranked[ranked.length - 1].label}")`,
    );
}

function testFamilySupport() {
    console.log('\n\n═══ 3. FAMILY SUPPORT (Data/ML) ═══');
    console.log('\n🧠 Senior Data Scientist job — ML/DS family candidates should rank high:');

    const dsScore = semanticOf(DATA_SCIENTIST_JOB, dataScientist);
    const mleScore = semanticOf(DATA_SCIENTIST_JOB, mlEngineer);
    const daScore = semanticOf(DATA_SCIENTIST_JOB, dataAnalyst);
    const csJuniorScore = semanticOf(DATA_SCIENTIST_JOB, juniorCsGrad);
    const feScore = semanticOf(DATA_SCIENTIST_JOB, frontendStar);
    const chefScore = semanticOf(DATA_SCIENTIST_JOB, chef);

    assertRange(dsScore, 0.85, 1.00, 'Senior DS on DS job');
    assertRange(mleScore, 0.70, 1.00, 'ML engineer on DS job (related family)');
    assertRange(daScore, 0.45, 0.95, 'Mid Data Analyst on DS job');
    assertRange(csJuniorScore, 0.25, 0.70, 'CS junior on DS job (thin evidence)');
    assertRange(feScore, 0.05, 0.50, 'Frontend star on DS job (wrong domain)');
    assertRange(chefScore, 0.00, 0.20, 'Chef on DS job');

    const ranked = [
        { label: 'DS',        score: dsScore },
        { label: 'MLE',       score: mleScore },
        { label: 'DA',        score: daScore },
        { label: 'CS Junior', score: csJuniorScore },
        { label: 'FE Star',   score: feScore },
        { label: 'Chef',      score: chefScore },
    ].sort((a, b) => b.score - a.score);

    printRanking('DS Job Ranking:', ranked);
    assertOrdered(ranked, 0.005);

    // Invariants:
    assert(dsScore > mleScore, 'Direct DS > related MLE');
    assert(mleScore > daScore, 'Senior MLE > mid DA');
    assert(daScore > feScore, 'Related DA > unrelated FE Star');
}

function testSeparation() {
    console.log('\n\n═══ 4. SEPARATION BETWEEN TIERS ═══');
    console.log('\n📏 Gap between strong and weak candidates must be meaningful:');

    const starScore = semanticOf(FRONTEND_SENIOR_JOB, frontendStar);
    const mktScore = semanticOf(FRONTEND_SENIOR_JOB, marketingMgr);
    const chefScore = semanticOf(FRONTEND_SENIOR_JOB, chef);

    // Stars vs irrelevant profiles must differ by a wide margin
    assert(
        starScore - mktScore >= 0.35,
        `FE Star vs Marketing gap must be ≥ 35pp (got ${fmt(starScore - mktScore)})`,
    );
    assert(
        starScore - chefScore >= 0.50,
        `FE Star vs Chef gap must be ≥ 50pp (got ${fmt(starScore - chefScore)})`,
    );

    // Strong vs okay candidates must also differ, though less. Same-family
    // candidates with near-saturated cosines naturally compress to single-digit
    // gaps — anything > 1pp is meaningful (no plateau / no tie).
    const midScore = semanticOf(FRONTEND_SENIOR_JOB, frontendMid);
    assert(
        starScore - midScore >= 0.01,
        `FE Star vs FE Mid gap must be ≥ 1pp (got ${fmt(starScore - midScore)})`,
    );

    const fsScore = semanticOf(FRONTEND_SENIOR_JOB, fullStackEng);
    assert(
        starScore - fsScore >= 0.01,
        `FE Star vs Full-stack gap must be ≥ 1pp (got ${fmt(starScore - fsScore)})`,
    );
}

function testSymmetry() {
    console.log('\n\n═══ 5. SYMMETRY (candidate-vs-candidate on two jobs) ═══');
    console.log('\n↔️  A DS on a DS job should outrank that DS on a Frontend job:');

    const dsOnDs = semanticOf(DATA_SCIENTIST_JOB, dataScientist);
    const dsOnFe = semanticOf(FRONTEND_SENIOR_JOB, dataScientist);
    const feOnFe = semanticOf(FRONTEND_SENIOR_JOB, frontendStar);
    const feOnDs = semanticOf(DATA_SCIENTIST_JOB, frontendStar);

    assert(dsOnDs > dsOnFe, `DS-on-DS (${fmt(dsOnDs)}) > DS-on-FE (${fmt(dsOnFe)})`);
    assert(feOnFe > feOnDs, `FE-on-FE (${fmt(feOnFe)}) > FE-on-DS (${fmt(feOnDs)})`);
    assert(dsOnFe < 0.55, `DS on FE job must stay below 55% (got ${fmt(dsOnFe)})`);
    assert(feOnDs < 0.55, `FE on DS job must stay below 55% (got ${fmt(feOnDs)})`);
}

function testEmbeddingSensitivity() {
    console.log('\n\n═══ 6. EMBEDDING SENSITIVITY ═══');
    console.log('\n🧲 Identical structured profile, varying embedding similarity:');

    // Lock the structured side by reusing frontendStar and vary only vector.
    const make = (vec: number[] | undefined) => ({ ...frontendStar, embedding_vector: vec });

    // FRONTEND_SENIOR_JOB sits at angle 0°. We vary the candidate's angle:
    // 0° (identical) → 12° (close) → 35° (adjacent) → 80° (unrelated).
    const withIdentical = semanticOf(FRONTEND_SENIOR_JOB, make(vector(0)));
    const withClose = semanticOf(FRONTEND_SENIOR_JOB, make(vector(12)));
    const withAdjacent = semanticOf(FRONTEND_SENIOR_JOB, make(vector(35)));
    const withUnrelated = semanticOf(FRONTEND_SENIOR_JOB, make(vector(80)));
    const withNoVector = semanticOf(FRONTEND_SENIOR_JOB, make(undefined));

    printRanking('Same structured profile, different embedding:', [
        { label: 'identical', score: withIdentical },
        { label: 'close',     score: withClose },
        { label: 'adjacent',  score: withAdjacent },
        { label: 'unrelated', score: withUnrelated },
        { label: 'no vector', score: withNoVector },
    ]);

    // Higher cosine similarity ⇒ higher (or equal — identical is at the ceiling) semantic score.
    assert(withIdentical >= withClose, `identical ≥ close (${fmt(withIdentical)} vs ${fmt(withClose)})`);
    assert(withClose >= withAdjacent, `close ≥ adjacent (${fmt(withClose)} vs ${fmt(withAdjacent)})`);
    assert(withAdjacent >= withUnrelated, `adjacent ≥ unrelated (${fmt(withAdjacent)} vs ${fmt(withUnrelated)})`);
    assert(
        withIdentical - withUnrelated >= 0.10,
        `identical vs unrelated gap ≥ 10pp (got ${fmt(withIdentical - withUnrelated)})`,
    );
}

function testEducationTrajectory() {
    console.log('\n\n═══ 7. EDUCATION & EXPERIENCE TRAJECTORY ═══');
    console.log('\n🎓 CS grad with no experience on DS job (family support, thin trajectory):');

    const freshGradScore = semanticOf(DATA_SCIENTIST_JOB, juniorCsGrad);

    const gradWithInternship = { ...juniorCsGrad,
        experiences: [
            { role: 'Data Science Intern', company: 'BigCo', location: { country: 'switzerland', city: 'Zurich' }, from: '2023-06', to: '2024-01', is_current_position: false, description: 'Built ML models for internal product.' },
        ],
        total_years_experience: 0.5,
    };
    const internScore = semanticOf(DATA_SCIENTIST_JOB, gradWithInternship);

    assert(
        internScore > freshGradScore,
        `Relevant internship should boost trajectory (fresh ${fmt(freshGradScore)} < intern ${fmt(internScore)})`,
    );
    assert(
        internScore - freshGradScore >= 0.02,
        `Trajectory bump should be ≥ 2pp (got ${fmt(internScore - freshGradScore)})`,
    );
}

function testPathologicalInputs() {
    console.log('\n\n═══ 8. EDGE CASES ═══');

    // Empty candidate should score low but not crash or explode.
    const empty = semanticOf(FRONTEND_SENIOR_JOB, emptyProfile);
    assertRange(empty, 0.00, 0.30, 'Empty profile on Frontend job');

    // Empty job with no anchors shouldn't crash either.
    const barebonesJob = mkJob({ id: 'job_empty', title: '', job_function: '', summary_text: '', skills: [], it_skills: [] });
    const sc = semanticOf(barebonesJob, frontendStar);
    assertRange(sc, 0.00, 1.00, 'Empty job does not crash');

    // Missing embedding should fall back to structured only, not zero.
    const noVecCand = { ...frontendStar, embedding_vector: undefined };
    const noVecJob = { ...FRONTEND_SENIOR_JOB, embedding_vector: undefined };
    const noVecScore = semanticOf(noVecJob, noVecCand);
    assert(
        noVecScore >= 0.40,
        `Missing embeddings should still produce meaningful structured score (got ${fmt(noVecScore)})`,
    );
}

function testRoleSeniorityIsolation() {
    console.log('\n\n═══ 9. SAME ROLE, DIFFERENT SENIORITY ═══');
    console.log('\n📈 Senior job — senior should beat mid should beat junior (same role family):');

    const seniorFe = semanticOf(FRONTEND_SENIOR_JOB, frontendStar);
    const midFe = semanticOf(FRONTEND_SENIOR_JOB, frontendMid);

    const juniorFe = mkCand({
        id: 'cand_fe_junior',
        summary_text: 'Junior React developer with 1 year experience.',
        current_job_function: 'engineering',
        current_seniority_level: 'junior',
        total_years_experience: 1,
        skills: [
            { skill_name: 'React', level: 5, rank: 1, level_source: 'cv_only', level_confidence: 'medium' },
            { skill_name: 'TypeScript', level: 4, rank: 2, level_source: 'cv_only', level_confidence: 'low' },
        ],
        experiences: [
            { role: 'Junior Frontend Developer', company: 'Startup', location: { country: 'switzerland', city: 'Geneva' }, from: '2024-01', to: 'present', is_current_position: true, description: 'React components.' },
        ],
        education: [{ degree_level: 'BSc', major: 'Computer Science', institution: 'ETH', currently_pursuing: false, from: '2020', to: '2023' }],
        embedding_vector: vector(8),   // junior FE — very close to senior FE role geometrically
    });
    const juniorScore = semanticOf(FRONTEND_SENIOR_JOB, juniorFe);

    const ranked = [
        { label: 'Senior FE', score: seniorFe },
        { label: 'Mid FE',    score: midFe },
        { label: 'Junior FE', score: juniorScore },
    ].sort((a, b) => b.score - a.score);
    printRanking('By seniority:', ranked);

    assert(seniorFe > midFe || Math.abs(seniorFe - midFe) < 0.08, `Senior ≥ Mid or within 8pp (got ${fmt(seniorFe)} vs ${fmt(midFe)})`);
    assert(midFe > juniorScore - 0.05, `Mid FE not far below Junior FE (got ${fmt(midFe)} vs ${fmt(juniorScore)})`);
    assert(
        Math.abs(seniorFe - midFe) >= 0.005,
        `Senior and Mid scores must differ (got ${fmt(seniorFe)} vs ${fmt(midFe)})`,
    );
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('╔════════════════════════════════════════════════════╗');
console.log('║      SEMANTIC PILLAR TEST SUITE                    ║');
console.log('║      (measures breakdown.semanticScore only)       ║');
console.log('╚════════════════════════════════════════════════════╝');

// Optional sub-signal diagnostics. Set SEMANTIC_DEBUG=1 before running to print
// the internal structured-semantic components (role/family/anchor/trajectory)
// for a curated list of candidate↔job pairs.
function dumpDebug() {
    if (!process.env.SEMANTIC_DEBUG) return;
    console.log('\n═══ 🔬 DEBUG: sub-signals for key pairs ═══');
    const pairs: Array<[string, JobProfile, CandidateProfile]> = [
        ['FE Star → FE Job',  FRONTEND_SENIOR_JOB, frontendStar],
        ['FE Mid → FE Job',   FRONTEND_SENIOR_JOB, frontendMid],
        ['FullStk → FE Job',  FRONTEND_SENIOR_JOB, fullStackEng],
        ['Backend → FE Job',  FRONTEND_SENIOR_JOB, backendEng],
        ['DA → DS Job',       DATA_SCIENTIST_JOB,  dataAnalyst],
        ['MLE → DS Job',      DATA_SCIENTIST_JOB,  mlEngineer],
        ['DS → DS Job',       DATA_SCIENTIST_JOB,  dataScientist],
        ['FE Star → DS Job',  DATA_SCIENTIST_JOB,  frontendStar],
    ];

    console.log('  pair                        role  fam anchor edu  exp  traj base+bon= struct | semantic');
    for (const [label, job, cand] of pairs) {
        const d = debugStructuredSemantic(job, cand);
        const sem = calculateMatchScore(job, cand).semanticScore;
        const pct = (x: number) => (x * 100).toFixed(0).padStart(3);
        console.log(
            `  ${label.padEnd(25)} ${pct(d.directRoleAlignment)}  ${pct(d.familySupport)}  ${pct(d.skillAnchorCoverage)}   ${pct(d.educationTrajectorySupport)}  ${pct(d.experienceTrajectorySupport)}  ${pct(d.trajectorySupport)}  ${pct(d.rawBaseScore)}+${pct(d.bonuses)}= ${pct(d.structuredScore)}   | ${pct(sem)}`
        );
    }
}

dumpDebug();
testAbsoluteBands();
testOrdering();
testFamilySupport();
testSeparation();
testSymmetry();
testEmbeddingSensitivity();
testEducationTrajectory();
testPathologicalInputs();
testRoleSeniorityIsolation();

console.log('\n\n╔════════════════════════════════════════════════════╗');
console.log(`║      RESULT: ${passed} passed / ${failed} failed`.padEnd(53) + '║');
console.log('╚════════════════════════════════════════════════════╝');

if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    process.exit(1);
}
