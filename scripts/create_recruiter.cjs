const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://xcqzhoietkrlwcczgjiu.supabase.co';
const supabaseKey = 'sb_publishable_Kg3qg9gHBlqx0EPJodHMVg_kVtjA6wK';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createRecruiterUser() {
  try {
    console.log('Creating recruiter user...');

    // Sign up the recruiter user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: 'recruiter@test.com',
      password: 'password123',
    });

    if (authError && authError.message !== 'User already registered') {
      console.error('Auth error:', authError);
      return;
    }

    const userId = authData?.user?.id;
    if (!userId) {
      console.log('Recruiter user already exists');
      return;
    }

    // Create recruiter profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        role: 'recruiter',
        email: 'recruiter@test.com'
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
    } else {
      console.log('✅ Recruiter user created successfully!');
    }

    // Create a sample recruiter record
    const { error: recruiterError } = await supabase
      .from('recruiters')
      .insert({
        id: userId,
        content: {
          company_name: 'Test Company',
          contact_email: 'recruiter@test.com',
          contact_phone: '+1234567890',
          company_description: 'A test company for development purposes'
        }
      });

    if (recruiterError) {
      console.error('Recruiter record creation error:', recruiterError);
    } else {
      console.log('✅ Recruiter record created successfully!');
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

createRecruiterUser();