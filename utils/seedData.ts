import { CandidateProfile, JobProfile, User, RecruiterProfile, TechnicalTest, QuizQuestion } from '../types';
import { BLANK_CANDIDATE_PROFILE, BLANK_RECRUITER_PROFILE } from '../constants';
import { MOCK_CANDIDATES } from './mockData';

const CANDIDATE_STORE = 'candidates';
const JOB_STORE = 'jobs';
const USER_STORE = 'users';
const RECRUITER_STORE = 'recruiters';

/**
 * Creates 30 unique, high-difficulty questions for seeded dummy jobs.
 */
export const createDummyTest = (role: 'mechanical' | 'project'): TechnicalTest => {
    const questions: QuizQuestion[] = [];

    if (role === 'mechanical') {
        const mechQuestions = [
            {
                text: "In Geometric Dimensioning and Tolerancing (GD&T), what does the symbol for 'Maximum Material Condition' (MMC) imply when applied to a hole dimension?",
                options: ["The hole is at its smallest allowable diameter.", "The hole is at its largest allowable diameter.", "The part weighs the least possible.", "The tolerance zone is at its minimum size."],
                correct: 0
            },
            {
                text: "Which material property describes a metal's ability to undergo significant plastic deformation before rupture?",
                options: ["Hardness", "Brittleness", "Ductility", "Elasticity"],
                correct: 2
            },
            {
                text: "In SolidWorks, which feature is best used to create a complex internal cavity that follows a non-linear path?",
                options: ["Extruded Cut", "Swept Cut", "Revolved Cut", "Boundary Boss/Base"],
                correct: 1
            },
            {
                text: "What is the primary purpose of an 'Annealing' heat treatment process?",
                options: ["To increase hardness", "To reduce internal stresses and soften the material", "To create a wear-resistant surface", "To increase tensile strength"],
                correct: 1
            },
            {
                text: "A 'Clevis' joint is primarily designed to handle which type of loading?",
                options: ["Torsional only", "Pure Compression", "Tension and limited rotation", "High-speed oscillation"],
                correct: 2
            },
            {
                text: "In a 4-bar linkage mechanism, if the sum of the shortest and longest links is less than the sum of the other two, it is known as:",
                options: ["Grashof's Law", "Hooke's Principle", "Euler's Theorem", "Bernoulli's Criterion"],
                correct: 0
            },
            {
                text: "Which manufacturing process is most suitable for producing 50,000 identical complex plastic enclosures?",
                options: ["3D Printing (SLA)", "CNC Machining", "Injection Molding", "Vacuum Forming"],
                correct: 2
            },
            {
                text: "The 'Young's Modulus' of a material is the ratio of:",
                options: ["Stress to Strain in the elastic region", "Force to Area", "Change in length to original length", "Ultimate strength to yield strength"],
                correct: 0
            },
            {
                text: "Which thread type is commonly used for power transmission where high efficiency and low friction are required?",
                options: ["Metrical (M)", "Acme Thread", "Unified Fine (UNF)", "Whitworth"],
                correct: 1
            },
            {
                text: "In thermodynamics, an 'Isothermal' process is one where which variable remains constant?",
                options: ["Pressure", "Volume", "Entropy", "Temperature"],
                correct: 3
            },
            {
                text: "What is the main advantage of using a 'Planetary Gear' set compared to a standard spur gear reduction?",
                options: ["Lower manufacturing cost", "Easier lubrication", "Higher power density in a compact space", "Zero backlash"],
                correct: 2
            },
            {
                text: "When selecting a bearing for high axial loads and low radial loads, which type is most appropriate?",
                options: ["Deep Groove Ball Bearing", "Thrust Ball Bearing", "Needle Roller Bearing", "Cylindrical Roller Bearing"],
                correct: 1
            },
            {
                text: "The term 'FOS' in engineering design typically stands for:",
                options: ["Force On Surface", "Factor Of Safety", "Feature Of Size", "Format Of Standard"],
                correct: 1
            },
            {
                text: "In fluid mechanics, 'Cavitation' in a pump is usually caused by:",
                options: ["High fluid viscosity", "Local pressure falling below vapor pressure", "Excessive shaft speed", "Air bubbles in the footer section"],
                correct: 1
            },
            {
                text: "Which NDT (Non-Destructive Testing) method is best for detecting surface cracks in non-ferrous metals like Aluminum?",
                options: ["Magnetic Particle Inspection", "Dye Penetrant Inspection", "X-Ray Radiography", "Ultrasonic Testing"],
                correct: 1
            },
            {
                text: "A 'Cantilever' beam is fixed at:",
                options: ["Both ends", "One end only", "Middle point", "Two points near the ends"],
                correct: 1
            },
            {
                text: "In a CAD assembly, a 'Limit Mate' is used to:",
                options: ["Lock two parts together permanently", "Define a range of motion between two values", "Align axes of two cylinders", "Ensure parts do not overlap"],
                correct: 1
            },
            {
                text: "What does the 'Yield Point' on a stress-strain curve signify?",
                options: ["The start of elastic behavior", "The point where the material breaks", "The transition from elastic to plastic deformation", "The maximum stress the material can handle"],
                correct: 2
            },
            {
                text: "Which tool is used to measure the pitch of a screw thread precisely?",
                options: ["Vernier Caliper", "Thread Pitch Gauge", "Micrometer", "Feeler Gauge"],
                correct: 1
            },
            {
                text: "In CNC programming, what does the G-code 'G01' represent?",
                options: ["Rapid Positioning", "Linear Interpolation (Feed)", "Circular Interpolation", "Dwell Time"],
                correct: 1
            },
            {
                text: "Which of the following is a 'Ferrous' metal?",
                options: ["Copper", "Titanium", "Stainless Steel", "Magnesium"],
                correct: 2
            },
            {
                text: "The 'Poisson's Ratio' is the ratio of:",
                options: ["Longitudinal strain to Lateral strain", "Lateral strain to Longitudinal strain", "Stress to Strain", "Density to Volume"],
                correct: 1
            },
            {
                text: "A 'Keyway' in a shaft and hub assembly is primarily intended to:",
                options: ["Prevent axial sliding", "Transmit torque", "Provide lubrication paths", "Reduce weight"],
                correct: 1
            },
            {
                text: "In heat transfer, 'Convection' occurs primarily through:",
                options: ["Direct contact between solids", "Electromagnetic waves", "Movement of fluids (liquids or gases)", "Internal atomic vibration"],
                correct: 2
            },
            {
                text: "Which type of fit occurs when the shaft is always larger than the hole?",
                options: ["Clearance Fit", "Transition Fit", "Interference Fit", "Loose Fit"],
                correct: 2
            },
            {
                text: "What is the primary function of a 'Flywheel' in an engine?",
                options: ["To increase fuel efficiency", "To smooth out fluctuations in rotational speed", "To cool the cylinder heads", "To synchronize the valves"],
                correct: 1
            },
            {
                text: "In SolidWorks, 'PDM' stands for:",
                options: ["Part Design Manager", "Product Data Management", "Physical Drafting Module", "Parallel Design Mode"],
                correct: 1
            },
            {
                text: "Which belt type is most effective for preventing slippage in high-torque timing applications?",
                options: ["V-Belt", "Flat Belt", "Synchronous (Toothed) Belt", "Round Belt"],
                correct: 2
            },
            {
                text: "The 'Endurance Limit' of a material refers to its resistance to:",
                options: ["High temperature", "Corrosive environments", "Fatigue failure under cyclic loading", "Impact loads"],
                correct: 2
            },
            {
                text: "Which additive manufacturing process uses a laser to sinter powdered metal?",
                options: ["FDM", "SLA", "SLS / DMLS", "PolyJet"],
                correct: 2
            }
        ];

        mechQuestions.forEach((mq, i) => {
            questions.push({
                id: `q_mech_${i + 1}`,
                text: mq.text,
                options: mq.options,
                correct_option_index: mq.correct,
                difficulty: 5
            });
        });
    } else {
        const projQuestions = [
            { text: "What does CPM stand for in project scheduling?", options: ["Critical Path Method", "Cumulative Project Management", "Complete Phase Milestone", "Cost Per Mile"], correct: 0 },
            { text: "A 'Work Breakdown Structure' (WBS) is used to:", options: ["List all employees", "Divide project into manageable sections", "Track daily expenses", "Assign office seating"], correct: 1 },
            { text: "In Earned Value Management, if SPI < 1.0, the project is:", options: ["Ahead of schedule", "Behind schedule", "On budget", "Over budget"], correct: 1 },
            { text: "What is the primary goal of a Kick-off meeting?", options: ["Review final results", "Align stakeholders and define objectives", "Celebrate project end", "Discuss individual salaries"], correct: 1 },
            { text: "An 'EPC' contract typically stands for:", options: ["Engineering, Procurement, Construction", "Electronic Project Control", "Estimated Project Cost", "Environmental Policy Compliance"], correct: 0 },
            { text: "The 'Float' or 'Slack' in a project activity refers to:", options: ["Amount of unused budget", "Time an activity can be delayed without affecting end date", "Excess material on site", "Employee downtime"], correct: 1 },
            { text: "Which risk response involves moving the risk to a third party?", options: ["Avoidance", "Mitigation", "Transference", "Acceptance"], correct: 2 },
            { text: "What is a 'Gantt Chart' primarily used for?", options: ["Budget tracking", "Project scheduling visualization", "Resource hiring", "Quality control testing"], correct: 1 },
            { text: "In HSE, what does 'PPE' stand for?", options: ["Personal Protective Equipment", "Project Planning Element", "Preventative Process Engineering", "Primary Power Engine"], correct: 0 },
            { text: "A 'Change Order' is required when:", options: ["A team member takes a day off", "The project scope is modified", "The office runs out of paper", "A milestone is reached on time"], correct: 1 },
            { text: "Stakeholder analysis is performed to:", options: ["Determine project costs", "Identify interests and influence of people involved", "Order construction materials", "Schedule vacation time"], correct: 1 },
            { text: "The 'Triple Constraint' of project management includes:", options: ["Time, Cost, Scope", "Quality, Speed, Color", "Hiring, Firing, Training", "Design, Build, Test"], correct: 0 },
            { text: "What is the purpose of a 'Risk Register'?", options: ["To list all project costs", "To track and manage potential threats", "To store employee contact info", "To archive old emails"], correct: 1 },
            { text: "A 'Milestone' in a schedule has a duration of:", options: ["One day", "Zero days", "One week", "Variable depending on task"], correct: 1 },
            { text: "What does 'SLA' stand for in procurement/service context?", options: ["Service Level Agreement", "Schedule Limit Analysis", "System Log Archive", "Standard Logistics Arrangement"], correct: 0 },
            { text: "Quality Assurance (QA) is focused on:", options: ["Inspecting the final product", "The processes used to create the product", "Lowering the cost of materials", "Increasing the speed of shipping"], correct: 1 },
            { text: "In procurement, an 'RFP' is a:", options: ["Request for Proposal", "Reason for Planning", "Register for Personnel", "Request for Payment"], correct: 0 },
            { text: "A project 'Lifecycle' generally starts with:", options: ["Execution", "Planning", "Initiation", "Closure"], correct: 2 },
            { text: "Resource leveling is done to:", options: ["Hire more people", "Smooth out resource demand over time", "Calculate tax deductions", "Buy more heavy machinery"], correct: 1 },
            { text: "What is a 'Sunk Cost'?", options: ["A future expense", "A cost already incurred that cannot be recovered", "The cost of shipping by sea", "A variable project cost"], correct: 1 },
            { text: "The 'Critical Path' is the path with:", options: ["The most activities", "The highest cost", "The longest duration through the network", "The most complex engineering"], correct: 2 },
            { text: "What does 'CAPEX' stand for?", options: ["Capital Expenditure", "Capacity Expansion", "Case Planning Exercise", "Calculated Project Expense"], correct: 0 },
            { text: "A 'Stakeholder' is anyone who:", options: ["Owns shares in the company", "Is affected by the project outcome", "Works for the government", "Is a project manager"], correct: 1 },
            { text: "The 'Baseline' of a project is the:", options: ["Original plan used for performance measurement", "The floor level of a building", "The minimum salary for a role", "The start date of the company"], correct: 0 },
            { text: "What is a 'Lump Sum' contract?", options: ["A fixed price for a defined scope", "Payment by the hour", "Cost plus a percentage fee", "Unlimited budget agreement"], correct: 0 },
            { text: "What is the purpose of 'Lessons Learned' session?", options: ["To assign blame for failures", "To improve future projects", "To celebrate with the team", "To update the WBS"], correct: 1 },
            { text: "In project management, 'Gold Plating' refers to:", options: ["Adding extra features not in scope", "Using expensive materials", "Finishing ahead of schedule", "Applying high-end finishes"], correct: 0 },
            { text: "A 'Punch List' is created during:", options: ["Project Initiation", "Project Planning", "Project Closure/Handover", "Risk Assessment"], correct: 2 },
            { text: "What is 'Scope Creep'?", options: ["Uncontrolled changes to project scope", "Slow construction speed", "Small insects on site", "Expanding the project team"], correct: 0 },
            { text: "The 'Project Charter' is a document that:", options: ["Formally authorizes the project", "Lists every task in detail", "Is used for daily logs", "Is a map of the construction site"], correct: 0 }
        ];
        projQuestions.forEach((pq, i) => {
            questions.push({
                id: `q_proj_${i + 1}`,
                text: pq.text,
                options: pq.options,
                correct_option_index: pq.correct,
                difficulty: 5
            });
        });
    }
    return { questions };
};

export const seedDatabase = (transaction: IDBTransaction) => {
    const candidateStore = transaction.objectStore(CANDIDATE_STORE);
    const userStore = transaction.objectStore(USER_STORE);
    const recruiterStore = transaction.objectStore(RECRUITER_STORE);
    const jobStore = transaction.objectStore(JOB_STORE);

    // Seed mock candidates
    MOCK_CANDIDATES.forEach(candidate => candidateStore.put(candidate));

    // Add seeker test user
    const seekerTestUserEmail = 'mazzitommaso@gmail.com';
    const testUser: User = { email: seekerTestUserEmail, password: 'mt', profileId: `cand_test_user_mazzi`, role: 'seeker' };
    const testCandidateProfile: CandidateProfile = {
        id: `cand_test_user_mazzi`,
        contacts: { email: seekerTestUserEmail, phone: '' },
        ...BLANK_CANDIDATE_PROFILE,
        personal_info: { first_name: 'Tommaso', last_name: 'Mazzi' }
    };
    userStore.put(testUser);
    candidateStore.put(testCandidateProfile);

    // Add recruiter test user
    const recruiterTestUserEmail = 'mazzitommaso@yahoo.com';
    const testRecUser: User = { email: recruiterTestUserEmail, password: 'tm', profileId: `rec_test_user_mazzi`, role: 'recruiter' };
    const testRecruiterProfile: RecruiterProfile = { id: `rec_test_user_mazzi`, email: recruiterTestUserEmail, ...BLANK_RECRUITER_PROFILE };
    userStore.put(testRecUser);
    recruiterStore.put(testRecruiterProfile);

    // Seed Project Engineer Job
    const projectEngineerJob: JobProfile = {
        "id": "job_project_engineer_renewables_01",
        "title": "Project Engineer",
        "industry": ["Renewable Energy & Infrastructure"],
        "job_function": "engineering",
        "skills": [{ "skill_name": "Engineering Principles", "level": 7, "must": true }],
        "constraints": { "contract_type": "full_time", "location": { "country": "it", "city": "Milan" }, "remote": "none" },
        "summary_text": "A mid-level Project Engineer role based in Milan.",
        "full_job_posting_description": "Global Energy Group role.",
        "applicant_emails": ["mazzitommaso@gmail.com"],
        "technical_test": createDummyTest('project'),
        "it_skills": [],
        "soft_skills": []
    };
    jobStore.put(projectEngineerJob);

    // Seed Junior Mechanical Engineer Job (The Persistent Dummy)
    const mechJob: JobProfile = {
        id: "job_junior_mech_01",
        title: 'Junior Mechanical Engineer',
        company_name: 'NovaTech Industrial Solutions',
        industry: ['Industrial Automation'],
        seniority_level: 'junior',
        skills: [{ skill_name: "Mechanical Design", level: 3, must: true }],
        constraints: { contract_type: 'full_time', location: { country: 'it', city: 'Milan' }, remote: 'none' },
        "summary_text": "Support the design and development of mechanical systems.",
        "full_job_posting_description": "NovaTech role.",
        "applicant_emails": ["mazzitommaso@gmail.com"],
        "technical_test": createDummyTest('mechanical'),
        "it_skills": [],
        "soft_skills": []
    };
    jobStore.put(mechJob);
};
