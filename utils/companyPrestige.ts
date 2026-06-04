/**
 * Company Prestige Tier Lookup
 * 
 * Tier 1: Global industry leaders / most prestigious employers (score → 1.0)
 * Tier 2: Major well-known companies (score → 0.75)
 * Tier 3: Strong regional / niche leaders (score → 0.55)
 * Unknown: Not in list (score → 0.35, neutral — not penalized)
 *
 * Names are lowercase-normalized for fuzzy lookup.
 */

export const TIER_1_COMPANIES: string[] = [
    // Tech Giants
    'google', 'alphabet',
    'apple',
    'microsoft',
    'amazon', 'aws',
    'meta', 'facebook',
    'nvidia',
    'tesla',
    'netflix',
    // Consulting
    'mckinsey', 'mckinsey & company',
    'boston consulting group', 'bcg',
    'bain', 'bain & company',
    // Finance
    'goldman sachs',
    'morgan stanley',
    'jpmorgan', 'j.p. morgan', 'jp morgan',
    'blackrock',
    'citadel',
    'jane street',
    'two sigma',
    'de shaw', 'd.e. shaw',
    // Other Tech
    'deepmind',
    'openai',
    'salesforce',
    'oracle',
    'ibm',
    'intel',
    'adobe',
    'palantir',
    'stripe',
    'bloomberg',
    'spacex',
    // Italy - flagship global employers
    'ferrari',
    'lamborghini', 'automobili lamborghini',
    'essilorluxottica', 'luxottica',
    'gucci',
    'prada',
    'giorgio armani', 'armani',
    'moncler',
    'brunello cucinelli',
    'stmicroelectronics', 'stmicroelectronics italy', 'stm',
    'leonardo',
    // Italy - national champions and top-market employers
    'eni',
    'enel',
    'intesa sanpaolo', 'banca intesa sanpaolo',
    'unicredit',
    'generali', 'assicurazioni generali',
    'poste italiane',
    'ferrovie dello stato', 'fs italiane', 'trenitalia', 'rete ferroviaria italiana', 'rfi',
    'prysmian', 'prysmian group',
    'tenaris', 'dalmine',
    'stellantis',
    'fincantieri',
    'webuild', 'salini impregilo',
    'telecom italia', 'tim',
    'cdp', 'cassa depositi e prestiti',
    'gse', 'gestore dei servizi energetici',
];

export const TIER_2_COMPANIES: string[] = [
    // Tech
    'uber', 'lyft',
    'airbnb',
    'spotify',
    'snap', 'snapchat',
    'twitter', 'x corp',
    'linkedin',
    'tiktok', 'bytedance',
    'shopify',
    'coinbase',
    'databricks',
    'snowflake',
    'cloudflare',
    'atlassian',
    'twilio',
    'datadog',
    'doordash',
    'robinhood',
    'square', 'block',
    'cisco',
    'vmware',
    'sap',
    'qualcomm',
    'amd',
    'samsung',
    'sony',
    // Consulting & Professional Services
    'deloitte',
    'pwc', 'pricewaterhousecoopers',
    'kpmg',
    'ey', 'ernst & young', 'ernst and young',
    'accenture',
    'oliver wyman',
    'roland berger',
    'booz allen', 'booz allen hamilton',
    // Finance
    'barclays',
    'ubs',
    'credit suisse',
    'deutsche bank',
    'hsbc',
    'citigroup', 'citi',
    'bank of america', 'bofa',
    'wells fargo',
    'bridgewater',
    'point72',
    'millennium',
    'kkr',
    'blackstone',
    'carlyle',
    // Pharma / Biotech
    'pfizer',
    'johnson & johnson', 'j&j',
    'roche',
    'novartis',
    'merck',
    'abbvie',
    'amgen',
    'moderna',
    // Industrial / Manufacturing
    'siemens',
    'bosch',
    'general electric', 'ge',
    'honeywell',
    '3m',
    'caterpillar',
    'boeing',
    'airbus',
    'lockheed martin',
    'rolls royce',
    // Consumer
    'procter & gamble', 'p&g',
    'unilever',
    'nestle', 'nestlé',
    'coca-cola',
    'lvmh',
    'loreal', "l'oreal", "l'oréal",
    // Automotive
    'bmw',
    'mercedes', 'mercedes-benz', 'daimler',
    'porsche',
    'volkswagen', 'vw',
    'toyota',
    // Italy - finance, insurance, and asset management
    'unione di banche italiane', 'ubi banca',
    'mediobanca',
    'allianz italia',
    'axa italia',
    'finecobank', 'fineco',
    'banca mediolanum', 'mediolanum',
    'banca ifis',
    'illimity', 'illimity bank',
    'sella', 'banca sella', 'gruppo sella',
    'banco bpm',
    'bper banca',
    'banca monte dei paschi di siena', 'mps',
    'banca nazionale del lavoro', 'bnl',
    'iccrea', 'gruppo bancario cooperativo iccrea',
    'credit agricole italia', 'credito agricolo italia',
    'azimut', 'azimut holding',
    'unipol', 'unipolsai',
    'reale mutua',
    'poste vita',
    'poste assicurazioni',
    // Italy - pharma and healthcare
    'chiesi', 'chiesi farmaceutici',
    'recordati',
    'menarini', 'gruppo menarini',
    'zambon',
    'angelini pharma', 'angelini',
    'bracco', 'bracco imaging',
    'diasorin',
    'amplifon',
    'alfasigma', 'alpha sigma',
    'dompe', 'dompe farmaceutici',
    'bsp pharmaceuticals',
    'flamma',
    // Italy - industrial, manufacturing, and automotive
    'ansaldo energia',
    'ansaldo sts',
    'hitachi rail italy',
    'marelli',
    'iveco', 'iveco group',
    'cnh industrial',
    'pirelli',
    'brembo',
    'ducati',
    'piaggio',
    'datalogic',
    'intercos',
    'ima', 'ima group',
    'sacmi',
    'danieli',
    'nuovo pignone',
    'baker hughes nuovo pignone',
    'ali group',
    'technoprobe', 'techno probe',
    'avio',
    'buzzi', 'buzzi unicem',
    'mapei',
    'chimet',
    'finarvedi',
    'marcegaglia',
    'riva acciaio', 'gruppo riva',
    'fiat',
    'alfa romeo',
    'maserati',
    'lancia',
    // Italy - consumer, fashion, and design
    'barilla',
    'ferrero',
    'lavazza',
    'illy', 'illycaffe', 'illy caffe',
    'campari', 'davide campari',
    'de longhi', 'delonghi', "de'longhi",
    'technogym',
    'benetton',
    'max mara', 'maxmara',
    'ermenegildo zegna', 'zegna',
    'valentino',
    'salvatore ferragamo', 'ferragamo',
    'tod s', "tod's",
    'diesel',
    'bottega veneta',
    'bulgari', 'bvlgari',
    // Italy - energy, utilities, infrastructure
    'terna',
    'snam',
    'a2a',
    'acea',
    'hera',
    'iren',
    'italgas',
    'edison',
    'erg',
    'saipem',
    'maire tecnimont',
    'autostrade per l italia', 'autostrade per litalia',
    // Italy - telecom, media, digital, and platforms
    'vodafone italia',
    'wind tre', 'windtre',
    'fastweb',
    'sky italia',
    'rai', 'rai radiotelevisione italiana',
    'mediaset', 'mfe mediaforeurope',
    'nexi',
    'satispay',
    'scalapay',
    'bending spoons',
    'inwit',
    'lottomatica', 'lottomatica group',
    'yoox net-a-porter', 'yoox',
    'lastminute.com',
    'docebo',
    'subito',
    'immobiliare.it', 'immobiliare it',
    'facile.it', 'facile it',
    // Italy - logistics, transport, and public champions
    'sea milano',
    'adr', 'aeroporti di roma',
    'grimaldi group',
    'msc cruises', 'msc crociere',
    // Italy - consulting, IT services, and software leaders
    'reply',
    'engineering ingegneria informatica', 'engineering',
    'almaviva',
    'ntt data italia',
    'bip', 'business integration partners',
    'lutech',
    'teamsystem',
    'zucchetti',
    'sesa',
    'var group',
];

export const TIER_3_COMPANIES: string[] = [
    // Tech & SaaS
    'hubspot',
    'zendesk',
    'notion',
    'figma',
    'canva',
    'elastic',
    'mongodb',
    'confluent',
    'hashicorp',
    'gitlab',
    'github',
    'vercel',
    'netlify',
    'digital ocean', 'digitalocean',
    'twitch',
    'pinterest',
    'reddit',
    'discord',
    'zoom',
    'slack',
    'asana',
    'monday.com',
    'wix',
    'squarespace',
    'dell',
    'hp', 'hewlett packard', 'hewlett-packard',
    'lenovo',
    // Finance
    'ing',
    'bnp paribas',
    'societe generale', 'société générale',
    'allianz',
    'axa',
    'zurich insurance',
    'swiss re',
    // Consulting / Services
    'capgemini',
    'infosys',
    'tata consultancy', 'tcs',
    'wipro',
    'cognizant',
    'thoughtworks',
    // Energy
    'shell',
    'bp',
    'exxonmobil', 'exxon',
    'chevron',
    'totalenergies', 'total',
    'schneider electric',
    'abb',
    // Consumer/Retail
    'walmart',
    'ikea',
    'zara', 'inditex',
    'h&m',
    'nike',
    'adidas',
    // Telecom
    'vodafone',
    'deutsche telekom', 't-mobile',
    'at&t',
    'verizon',
    // Food
    'danone',
    'mondelez',
    'pepsico',
    'kraft heinz',
    // Italy - consulting, IT services, and software
    'exprivia',
    'be shaping the future', 'be group',
    'avanade italy',
    'dedagroup',
    'fincons group',
    'sopra steria italy',
    'techedge',
    'cerved',
    'crif',
    // Italy - energy, utilities, and local champions
    'falck renewables',
    'eolo',
    'open fiber',
    'tiscali',
    // Italy - retail, food, and hospitality
    'ovs',
    'esselunga',
    'coop italia',
    'conad',
    'pam panorama',
    'eataly',
    'autogrill',
    'calzedonia', 'oniverse',
    'geox',
    'kiko milano', 'kiko',
    'parmalat',
    'granarolo',
    'mutti',
    'rio mare',
    'perfetti van melle',
    'sanpellegrino', 'san pellegrino',
    'acqua panna',
    // Italy - regional finance and insurance
    'credem',
    'banca popolare di sondrio',
    'cattolica assicurazioni',
    // Italy - manufacturing, design, and specialty
    'ariston group',
    'nice group',
    'bft',
    'carel',
    'guala closures',
    'interpump group',
    'safilo',
    'marcolin',
    'poltrona frau',
    'kartell',
    'molteni',
    'italdesign',
    'pininfarina',
    'pagani automobili', 'pagani',
    'cimbali', 'la cimbali',
    'rancilio',
    'cremonini',
    'sabelli',
    'gessi', 'gessi holding',
    'ilva', 'acciaierie d italia',
    'ferretti group',
    'bonfiglioli',
    'comer industries',
    'biesse',
    'gefran',
    'elica',
    'zignago vetro',
    'cementir',
    'trevi group',
    'carel industries',
    'tinexta',
    'digital value',
    'seco',
    'expert.ai', 'expert ai',
    'datrix',
    'growens',
    'triboo',
    'mutuionline', 'gruppo mutuionline',
    'illimity sgr',
    'anima holding',
    'de agostini',
    'mondadori',
    'gedi',
    'il sole 24 ore',
    'banca generali',
    'dovalue', 'do value',
    'openjobmetis',
    'gi group',
    'manpower italia',
    'randstad italia',
    'adecco italia',
];

/** Normalize a company name for lookup. */
export const normalizeCompanyName = (name: string): string =>
    name.toLowerCase().trim()
        .replace(/[''`]/g, "'")
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/,?\s*(inc\.?|ltd\.?|llc\.?|corp\.?|plc\.?|s\.?p\.?a\.?|gmbh|ag|s\.?r\.?l\.?)$/i, '')
        .trim();

const defaultCompanyTier1Set = new Set(TIER_1_COMPANIES.map(normalizeCompanyName));
const defaultCompanyTier2Set = new Set(TIER_2_COMPANIES.map(normalizeCompanyName));
const defaultCompanyTier3Set = new Set(TIER_3_COMPANIES.map(normalizeCompanyName));

export interface CompanyTierLists {
    tier1?: string[];
    tier2?: string[];
    tier3?: string[];
}

const buildCompanyTierSets = (overrides?: CompanyTierLists | null) => {
    if (!overrides) {
        return { t1: defaultCompanyTier1Set, t2: defaultCompanyTier2Set, t3: defaultCompanyTier3Set };
    }
    const t1 = Array.isArray(overrides.tier1)
        ? new Set(overrides.tier1.map(normalizeCompanyName).filter(Boolean))
        : defaultCompanyTier1Set;
    const t2 = Array.isArray(overrides.tier2)
        ? new Set(overrides.tier2.map(normalizeCompanyName).filter(Boolean))
        : defaultCompanyTier2Set;
    const t3 = Array.isArray(overrides.tier3)
        ? new Set(overrides.tier3.map(normalizeCompanyName).filter(Boolean))
        : defaultCompanyTier3Set;
    return { t1, t2, t3 };
};

/**
 * Returns the prestige tier for a company.
 * 1 = global leader, 2 = major well-known, 3 = strong regional, 4 = unknown.
 * Optional `overrides` replace the default tier lists (per-job customization).
 */
export const getCompanyTier = (companyName: string, overrides?: CompanyTierLists | null): number => {
    if (!companyName) return 4;
    const name = normalizeCompanyName(companyName);
    const { t1, t2, t3 } = buildCompanyTierSets(overrides);

    // Exact match
    if (t1.has(name)) return 1;
    if (t2.has(name)) return 2;
    if (t3.has(name)) return 3;

    // Substring match (only for names ≥ 4 chars to avoid false positives)
    for (const known of t1) {
        if (known.length >= 4 && (name.includes(known) || known.includes(name))) return 1;
    }
    for (const known of t2) {
        if (known.length >= 4 && (name.includes(known) || known.includes(name))) return 2;
    }
    for (const known of t3) {
        if (known.length >= 4 && (name.includes(known) || known.includes(name))) return 3;
    }

    return 4;
};

/** Convert company tier number to a 0–1 score. */
export const companyTierToScore = (tier: number): number => {
    switch (tier) {
        case 1: return 1.0;
        case 2: return 0.75;
        case 3: return 0.55;
        default: return 0.35;
    }
};
