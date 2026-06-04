import React from 'react';
import { useLanguage } from './LanguageProvider';
import LegalPageLayout from './LegalPageLayout';

const TermsAndConditionsPage: React.FC = () => {
  const { text } = useLanguage();

  return (
    <LegalPageLayout
      title={text('Terms & Conditions', 'Termini e Condizioni')}
      description={text(
        'The rules that govern access to and use of the PeakTalent platform and services.',
        'Le regole che disciplinano accesso e utilizzo della piattaforma e dei servizi PeakTalent.'
      )}
    >
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Last updated: May 2026</p>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">1. Introduction</h2>
            <p>Welcome to PeakTalent (“PeakTalent”, “we”, “our”, or “us”). These Terms and Conditions (“Terms”) govern access to and use of the website www.peaktalent.it (http://www.peaktalent.it) and all related services, technologies, software, assessments, and functionalities offered by PeakTalent (collectively, the “Services”).</p>
            <p>By accessing or using the Services, you agree to be bound by these Terms. If you do not agree with these Terms, you must not use the Services.</p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">2. About PeakTalent</h2>
            <p>PeakTalent provides technology-enabled recruitment and talent assessment services aimed at facilitating connections between candidates, employers, recruiters, and referral partners.</p>
            <p>The Services may include:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>candidate sourcing and matching;</li>
              <li>AI-supported screening and evaluation;</li>
              <li>skill and competency assessments;</li>
              <li>job application management;</li>
              <li>recruitment analytics and reporting.</li>
            </ul>
            <p>PeakTalent acts solely as an intermediary technology platform and does not act as an employer, employment agency, or guarantor of employment outcomes unless explicitly stated otherwise.</p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">3. Eligibility</h2>
            <p>By using the Services, you confirm that:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>you are at least 18 years old;</li>
              <li>the information you provide is accurate, current, and complete;</li>
              <li>you have the legal authority to enter into binding agreements;</li>
              <li>you will use the Services in compliance with applicable laws and regulations.</li>
            </ul>
            <p>Employers and recruiters further represent that they are authorized to publish job opportunities and process candidate information through the platform.</p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">4. User Accounts</h2>
            <p>Certain Services may require account registration.</p>
            <p>Users are responsible for:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>maintaining the confidentiality of their credentials;</li>
              <li>all activities conducted through their account;</li>
              <li>keeping their information updated and accurate.</li>
            </ul>
            <p>PeakTalent reserves the right to suspend or terminate accounts that:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>contain false or misleading information;</li>
              <li>violate these Terms;</li>
              <li>attempt unauthorized access to the platform;</li>
              <li>engage in fraudulent, abusive, discriminatory, or unlawful conduct.</li>
            </ul>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">5. AI-Assisted Assessments and Matching</h2>
            <p>PeakTalent may use artificial intelligence, machine learning systems, automated analysis tools, and algorithmic models to support candidate evaluation, profiling, ranking, recommendation, and matching activities.</p>
            <p>These technologies are intended exclusively to support recruitment processes and human decision-making.</p>
            <p>Users acknowledge and accept that:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>AI-generated outputs are probabilistic and may not always be accurate or complete;</li>
              <li>automated assessments do not constitute final hiring decisions;</li>
              <li>employers and recruiters remain solely responsible for employment decisions;</li>
              <li>PeakTalent does not guarantee hiring outcomes, interview opportunities, or candidate suitability.</li>
            </ul>
            <p>PeakTalent is committed to promoting transparency, fairness, explainability, and bias mitigation in accordance with applicable laws and industry best practices.</p>
            <p>Where required by applicable law, users may request additional information regarding automated processing activities.</p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">6. Candidate Obligations</h2>
            <p>Candidates agree:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>to provide truthful and accurate information;</li>
              <li>not to impersonate other individuals;</li>
              <li>not to manipulate assessments or platform functionalities;</li>
              <li>not to use bots, scripts, or unauthorized automated methods;</li>
              <li>not to upload unlawful, defamatory, discriminatory, or infringing content.</li>
            </ul>
            <p>Candidates are solely responsible for the information and materials they submit through the platform.</p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">7. Employer and Recruiter Obligations</h2>
            <p>Employers and recruiters agree:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>to process candidate information lawfully and fairly;</li>
              <li>to comply with applicable employment, anti-discrimination, and privacy laws;</li>
              <li>not to publish misleading, fraudulent, or unlawful job opportunities;</li>
              <li>to maintain appropriate human oversight in hiring decisions where legally required.</li>
            </ul>
            <p>Employers are solely responsible for evaluating candidates and making recruitment decisions.</p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">8. Intellectual Property</h2>
            <p>All intellectual property rights related to the Services, including software, algorithms, trademarks, designs, interfaces, content, assessment methodologies, and platform materials, are owned by or licensed to PeakTalent.</p>
            <p>Users are granted a limited, non-exclusive, non-transferable right to access and use the Services solely for their intended purposes.</p>
            <p>Users may not:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>reproduce, distribute, or commercially exploit the platform;</li>
              <li>reverse engineer or attempt to extract source code or algorithms;</li>
              <li>copy or reuse platform content without prior written authorisation.</li>
            </ul>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">9. Privacy and Data Protection</h2>
            <p>PeakTalent processes personal data in accordance with applicable data protection laws, including Regulation (EU) 2016/679 (“GDPR”).</p>
            <p>Information regarding:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>categories of personal data processed;</li>
              <li>purposes and legal bases of processing;</li>
              <li>retention periods;</li>
              <li>user rights;</li>
              <li>international data transfers;</li>
              <li>automated decision-making activities;</li>
            </ul>
            <p>is available in the Privacy Policy published on the website.</p>
            <p>Users acknowledge that certain Services may involve automated processing and AI-supported analysis.</p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">10. Service Availability</h2>
            <p>PeakTalent does not guarantee uninterrupted or error-free operation of the Services.</p>
            <p>We reserve the right to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>modify or discontinue functionalities;</li>
              <li>perform maintenance activities;</li>
              <li>update algorithms, interfaces, and platform features at any time.</li>
            </ul>
            <p>Temporary interruptions may occur without prior notice.</p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">11. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, PeakTalent shall not be liable for:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>indirect, incidental, or consequential damages;</li>
              <li>loss of profits, opportunities, or business;</li>
              <li>hiring or employment outcomes;</li>
              <li>inaccuracies or limitations in AI-generated outputs;</li>
              <li>actions or omissions of users or third parties.</li>
            </ul>
            <p>The Services are provided on an “as is” and “as available” basis without warranties of any kind.</p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">12. Indemnification</h2>
            <p>You agree to indemnify and hold harmless PeakTalent, its affiliates, directors, employees, and partners from any claims, damages, liabilities, losses, or expenses arising from:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>your use of the Services;</li>
              <li>your violation of these Terms;</li>
              <li>your infringement of applicable laws or third-party rights.</li>
            </ul>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">13. Suspension and Termination</h2>
            <p>PeakTalent may suspend or terminate access to the Services at any time if:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>users violate these Terms;</li>
              <li>unlawful or fraudulent conduct is suspected;</li>
              <li>continued access may expose PeakTalent or other users to legal, operational, or reputational risks.</li>
            </ul>
            <p>Termination does not affect accrued rights or obligations.</p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">14. Governing Law and Jurisdiction</h2>
            <p>These Terms shall be governed by the laws of Italy.</p>
            <p>Any disputes arising from or related to these Terms shall be subject to the exclusive jurisdiction of the courts of Milan, Italy, unless mandatory consumer protection laws provide otherwise.</p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">15. Contact Information</h2>
            <p>PeakTalent Srl</p>
            <p>Website: https://www.peaktalent.it</p>
            <p>Email: info@peaktalent.it</p>
            <p>For any questions regarding these Terms, please contact us using the details above.</p>
          </section>
    </LegalPageLayout>
  );
};

export default TermsAndConditionsPage;
