const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

const supabaseUrl = 'https://xcqzhoietkrlwcczgjiu.supabase.co';
const supabaseKey = 'sb_publishable_Kg3qg9gHBlqx0EPJodHMVg_kVtjA6wK';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createSampleJobs() {
    console.log('Authenticating as admin...');

    // First authenticate as recruiter
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'recruiter@test.com',
        password: 'password123',
    });

    if (authError) {
        console.error('Authentication failed:', authError);
        return;
    }

    console.log('✅ Authenticated as admin, creating sample jobs...');

    const sampleJobs = [
        {
            title: "Senior Software Engineer",
            company_name: "TechCorp Inc.",
            industry: ["Technology", "SaaS"],
            job_function: "software_engineering",
            seniority_level: "senior",
            experience_required: 5,
            job_description: "We are looking for a Senior Software Engineer to join our team. You will be responsible for designing, developing, and maintaining high-quality software solutions.",
            skills: [
                { skill_name: "JavaScript", level: 8, must: true },
                { skill_name: "React", level: 7, must: true },
                { skill_name: "Node.js", level: 7, must: false }
            ],
            it_skills: [
                { skill_name: "TypeScript", level: 6, must: false },
                { skill_name: "PostgreSQL", level: 5, must: false }
            ],
            soft_skills: [
                { skill_name: "Teamwork", must: true },
                { skill_name: "Problem Solving", must: true }
            ],
            constraints: {
                location: {
                    city: "San Francisco",
                    country: "United States"
                },
                contract_type: "full_time",
                remote: "hybrid",
                salary_range: {
                    min: 120000,
                    max: 180000,
                    currency: "USD"
                }
            },
            benefits: ["Health Insurance", "401k", "Remote Work"],
            application_deadline: "2026-12-31"
        },
        {
            title: "Product Manager",
            company_name: "InnovateLabs",
            industry: ["Technology", "FinTech"],
            job_function: "product_management",
            seniority_level: "mid",
            experience_required: 3,
            job_description: "Join our product team as a Product Manager. You will drive product strategy, work with engineering teams, and ensure we deliver value to our customers.",
            skills: [
                { skill_name: "Product Strategy", level: 7, must: true },
                { skill_name: "Data Analysis", level: 6, must: true }
            ],
            it_skills: [
                { skill_name: "SQL", level: 5, must: false },
                { skill_name: "Tableau", level: 4, must: false }
            ],
            soft_skills: [
                { skill_name: "Leadership", must: true },
                { skill_name: "Communication", must: true }
            ],
            constraints: {
                location: {
                    city: "New York",
                    country: "United States"
                },
                contract_type: "full_time",
                remote: "full_remote",
                salary_range: {
                    min: 100000,
                    max: 140000,
                    currency: "USD"
                }
            },
            benefits: ["Health Insurance", "Stock Options", "Flexible Hours"],
            application_deadline: "2026-11-30"
        },
        {
            title: "UX Designer",
            company_name: "DesignStudio",
            industry: ["Technology", "Design"],
            job_function: "design",
            seniority_level: "mid",
            experience_required: 4,
            job_description: "We are seeking a talented UX Designer to create intuitive and beautiful user experiences. You will work closely with product and engineering teams.",
            skills: [
                { skill_name: "User Research", level: 7, must: true },
                { skill_name: "Wireframing", level: 8, must: true },
                { skill_name: "Prototyping", level: 7, must: true }
            ],
            it_skills: [
                { skill_name: "Figma", level: 8, must: true },
                { skill_name: "Adobe Creative Suite", level: 6, must: false }
            ],
            soft_skills: [
                { skill_name: "Creativity", must: true },
                { skill_name: "Attention to Detail", must: true }
            ],
            constraints: {
                location: {
                    city: "Los Angeles",
                    country: "United States"
                },
                contract_type: "full_time",
                remote: "hybrid",
                salary_range: {
                    min: 90000,
                    max: 130000,
                    currency: "USD"
                }
            },
            benefits: ["Health Insurance", "Creative Tools Budget", "Learning Allowance"],
            application_deadline: "2026-10-31"
        }
    ];

    console.log('Creating sample jobs...');

    for (const jobData of sampleJobs) {
        try {
            // Generate a unique UUID for the job
            const jobId = randomUUID();

            // Insert the job into the database using the authenticated admin user
            const { error } = await supabase
                .from('jobs')
                .insert({
                    id: jobId,
                    content: jobData,
                    recruiter_id: authData.user.id // Use the authenticated admin's ID
                });

            if (error) {
                console.error(`❌ Failed to create job: ${jobData.title}`, error);
            } else {
                console.log(`✅ Created job: ${jobData.title} (ID: ${jobId})`);
            }
        } catch (error) {
            console.error(`❌ Failed to create job: ${jobData.title}`, error);
        }
    }

    console.log('Sample job creation complete!');

    // Sign out
    await supabase.auth.signOut();
}

createSampleJobs();