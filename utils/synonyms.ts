/**
 * Skill & Title Synonym Dictionary + Fuzzy Matching Helpers
 *
 * Groups of synonyms that should be treated as equivalent when matching
 * candidate skills/titles against job requirements.
 */

/** Each sub-array is a group of interchangeable terms (exact aliases). */
const SYNONYM_GROUPS: string[][] = [
    // Programming Languages
    ['javascript', 'js', 'ecmascript', 'es6', 'es2015'],
    ['typescript', 'ts'],
    ['python', 'py'],
    ['c#', 'csharp', 'c sharp'],
    ['c++', 'cpp'],
    ['objective-c', 'objc', 'objective c'],
    ['golang', 'go'],
    ['ruby', 'rb'],
    ['kotlin', 'kt'],
    ['swift'],
    ['rust', 'rs'],
    ['visual basic', 'vb', 'vb.net', 'vba'],

    // Frontend Frameworks
    ['react', 'react.js', 'reactjs'],
    ['angular', 'angular.js', 'angularjs'],
    ['vue', 'vue.js', 'vuejs'],
    ['next.js', 'nextjs', 'next'],
    ['nuxt', 'nuxt.js', 'nuxtjs'],
    ['svelte', 'svelte.js', 'sveltejs'],
    ['jquery', 'j query'],

    // Backend Frameworks
    ['node.js', 'nodejs', 'node'],
    ['express', 'express.js', 'expressjs'],
    ['django', 'django rest framework', 'drf'],
    ['flask'],
    ['fastapi', 'fast api'],
    ['spring', 'spring boot', 'spring framework'],
    ['.net', 'dotnet', '.net core', 'asp.net'],
    ['ruby on rails', 'rails', 'ror'],
    ['laravel'],
    ['nestjs', 'nest.js'],

    // Data / ML / AI
    ['machine learning', 'ml'],
    ['deep learning', 'dl'],
    ['artificial intelligence', 'ai'],
    ['natural language processing', 'nlp'],
    ['computer vision', 'cv'],
    ['data science', 'data analytics'],
    ['tensorflow', 'tf'],
    ['pytorch', 'torch'],
    ['scikit-learn', 'sklearn'],
    ['pandas', 'pd'],
    ['numpy', 'np'],
    ['large language model', 'llm', 'llms'],
    ['generative ai', 'gen ai', 'genai'],

    // Databases
    ['postgresql', 'postgres', 'pg'],
    ['mysql', 'my sql'],
    ['mongodb', 'mongo'],
    ['microsoft sql server', 'mssql', 'sql server'],
    ['dynamodb', 'dynamo db'],
    ['elasticsearch', 'elastic search', 'elastic'],
    ['redis'],
    ['cassandra'],
    ['neo4j'],
    ['sqlite'],

    // Cloud / DevOps
    ['amazon web services', 'aws'],
    ['google cloud', 'gcp', 'google cloud platform'],
    ['microsoft azure', 'azure'],
    ['docker', 'containerization'],
    ['kubernetes', 'k8s'],
    ['terraform', 'tf', 'iac'],
    ['ci/cd', 'cicd', 'continuous integration', 'continuous deployment'],
    ['jenkins'],
    ['github actions', 'gh actions'],
    ['gitlab ci', 'gitlab-ci'],
    ['ansible'],
    ['devops', 'dev ops'],

    // Design / UX
    ['ui/ux', 'ui ux', 'ux/ui', 'ux ui', 'user experience', 'user interface'],
    ['figma'],
    ['sketch'],
    ['adobe xd', 'xd'],
    ['photoshop', 'adobe photoshop', 'ps'],
    ['illustrator', 'adobe illustrator', 'ai'],
    ['invision'],

    // Project Management
    ['project management', 'pm'],
    ['product management', 'product mgmt'],
    ['scrum', 'agile scrum'],
    ['agile', 'agile methodology'],
    ['kanban'],
    ['jira'],
    ['confluence'],
    ['trello'],
    ['prince2', 'prince 2'],
    ['pmp', 'project management professional'],
    ['safe', 'scaled agile framework'],
    ['lean', 'lean methodology'],

    // Business / Analytics
    ['business intelligence', 'bi'],
    ['power bi', 'powerbi'],
    ['tableau'],
    ['looker'],
    ['google analytics', 'ga'],
    ['seo', 'search engine optimization'],
    ['sem', 'search engine marketing'],
    ['crm', 'customer relationship management'],
    ['erp', 'enterprise resource planning'],
    ['sap'],

    // Engineering
    ['solidworks', 'solid works'],
    ['autocad', 'auto cad'],
    ['catia'],
    ['matlab'],
    ['simulink'],
    ['ansys'],
    ['cad', 'computer-aided design', 'computer aided design'],
    ['cam', 'computer-aided manufacturing'],
    ['cae', 'computer-aided engineering'],
    ['fea', 'finite element analysis', 'fem'],
    ['cfd', 'computational fluid dynamics'],
    ['plc', 'programmable logic controller'],

    // Job Titles
    ['software engineer', 'software developer', 'swe', 'sde'],
    ['frontend developer', 'front-end developer', 'front end developer', 'fe developer'],
    ['backend developer', 'back-end developer', 'back end developer', 'be developer'],
    ['full stack developer', 'fullstack developer', 'full-stack developer'],
    ['data engineer', 'de'],
    ['data analyst'],
    ['data scientist'],
    ['devops engineer', 'site reliability engineer', 'sre'],
    ['qa engineer', 'quality assurance engineer', 'test engineer', 'qe'],
    ['mobile developer', 'mobile engineer'],
    ['ios developer', 'ios engineer'],
    ['android developer', 'android engineer'],
    ['tech lead', 'technical lead', 'engineering lead'],
    ['cto', 'chief technology officer'],
    ['ceo', 'chief executive officer'],
    ['cfo', 'chief financial officer'],
    ['vp engineering', 'vp of engineering', 'vice president engineering'],
    ['engineering manager', 'em'],

    // Soft Skills
    ['problem solving', 'problem-solving', 'analytical thinking'],
    ['teamwork', 'team work', 'collaboration', 'team player'],
    ['communication', 'communication skills'],
    ['leadership', 'people management', 'team leadership'],
    ['time management', 'prioritization'],
    ['critical thinking', 'analytical skills'],
    ['attention to detail', 'detail-oriented', 'detail oriented'],
    ['adaptability', 'flexibility'],
    ['creativity', 'creative thinking', 'innovation'],
];

// Build a fast lookup: term → canonical group index
const synonymMap = new Map<string, number>();
SYNONYM_GROUPS.forEach((group, idx) => {
    group.forEach(term => {
        synonymMap.set(term.toLowerCase().trim(), idx);
    });
});

/**
 * Returns true if two terms are synonyms (belong to the same group).
 */
export const areSynonyms = (a: string, b: string): boolean => {
    const normA = a.toLowerCase().trim();
    const normB = b.toLowerCase().trim();
    if (normA === normB) return true;

    const groupA = synonymMap.get(normA);
    const groupB = synonymMap.get(normB);

    return groupA !== undefined && groupA === groupB;
};

/**
 * Levenshtein distance between two strings.
 * Used as fallback fuzzy matching for close variations.
 */
export const levenshteinDistance = (a: string, b: string): number => {
    const m = a.length;
    const n = b.length;

    if (m === 0) return n;
    if (n === 0) return m;

    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    let curr = new Array(n + 1);

    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + cost
            );
        }
        [prev, curr] = [curr, prev];
    }
    return prev[n];
};

/**
 * Fuzzy match: returns true if two terms are similar enough.
 * Checks: exact match → synonym match → Levenshtein (for strings ≥ 6 chars, distance ≤ 2).
 */
export const areFuzzyMatch = (a: string, b: string): boolean => {
    const normA = a.toLowerCase().trim();
    const normB = b.toLowerCase().trim();

    if (normA === normB) return true;
    if (areSynonyms(normA, normB)) return true;

    if (normA.length >= 6 && normB.length >= 6) {
        const maxAllowed = Math.min(2, Math.floor(Math.min(normA.length, normB.length) * 0.25));
        if (levenshteinDistance(normA, normB) <= maxAllowed) return true;
    }

    return false;
};

// ─── Skill Relationship Clusters ─────────────────────────────────────────────
//
// Unlike SYNONYM_GROUPS (exact aliases), clusters group *related but distinct*
// skills. When a job requires skill A and a candidate has skill B from the same
// cluster, they receive partial credit (partialScore) instead of 0.
//
// Rules:
//  - Use the canonical (first) term from SYNONYM_GROUPS for any skill that
//    appears there (e.g. 'postgresql' not 'postgres', 'amazon web services' not 'aws').
//  - Each skill should appear in at most one cluster (first match wins).
//  - partialScore reflects how interchangeable the skills in the cluster are:
//      0.82–0.85 = near-identical in practice (e.g. jest/vitest, git/github,
//                  cloud platforms, react/vue/angular)
//      0.75–0.80 = same paradigm, easy transfer (sql databases, jvm langs,
//                  python vs node backends, kafka vs rabbitmq)
//      0.65–0.70 = same broader domain, real but slower transfer (siem tools,
//                  cad tools, simulation/fea)
//      0.55–0.60 = broad family, limited direct transfer (api styles,
//                  systems languages, functional languages)
//
//  Calibration philosophy: a recruiter screening CVs would treat someone with
//  React experience as a strong candidate for a Vue role — the framework
//  swap is days, not weeks. The partialScore reflects "how much of this skill
//  is implied by knowing the related one", not "how identical they are".

type SkillCluster = {
    name: string;
    skills: string[];
    partialScore: number;
};

const SKILL_CLUSTERS: SkillCluster[] = [
    // ── Databases ──────────────────────────────────────────────────────────
    {
        name: 'sql-databases',
        skills: ['postgresql', 'mysql', 'sqlite', 'mariadb', 'oracle', 'microsoft sql server', 'cockroachdb', 'db2', 'sql'],
        partialScore: 0.75,
    },
    {
        name: 'nosql-document',
        skills: ['mongodb', 'couchdb', 'firebase', 'firestore', 'fauna', 'cosmosdb', 'couchbase'],
        partialScore: 0.78,
    },
    {
        name: 'key-value-cache',
        skills: ['redis', 'memcached', 'aerospike', 'hazelcast'],
        partialScore: 0.78,
    },
    {
        name: 'wide-column',
        skills: ['cassandra', 'hbase', 'bigtable', 'scylladb'],
        partialScore: 0.78,
    },
    {
        name: 'search-engines',
        skills: ['elasticsearch', 'solr', 'algolia', 'typesense', 'opensearch', 'meilisearch'],
        partialScore: 0.80,
    },
    {
        name: 'data-warehouse',
        skills: ['snowflake', 'bigquery', 'redshift', 'azure synapse', 'databricks', 'clickhouse', 'duckdb', 'teradata'],
        partialScore: 0.80,
    },
    {
        name: 'graph-databases',
        skills: ['neo4j', 'amazon neptune', 'arangodb', 'tigergraph', 'dgraph'],
        partialScore: 0.78,
    },

    // ── Frontend ───────────────────────────────────────────────────────────
    {
        name: 'frontend-frameworks',
        skills: ['react', 'vue', 'angular', 'svelte', 'ember', 'solid', 'alpine.js', 'lit'],
        partialScore: 0.82,
    },
    {
        name: 'js-ts',
        skills: ['javascript', 'typescript'],
        partialScore: 0.85,
    },
    {
        name: 'state-management',
        skills: ['redux', 'zustand', 'mobx', 'jotai', 'recoil', 'pinia', 'vuex', 'ngrx', 'xstate'],
        partialScore: 0.78,
    },
    {
        name: 'css-frameworks',
        skills: ['tailwind css', 'bootstrap', 'material ui', 'chakra ui', 'ant design', 'bulma', 'foundation', 'semantic ui'],
        partialScore: 0.78,
    },
    {
        name: 'build-tools',
        skills: ['webpack', 'vite', 'parcel', 'rollup', 'esbuild', 'turbopack', 'rspack'],
        partialScore: 0.80,
    },
    {
        name: 'meta-frameworks',
        skills: ['next.js', 'nuxt', 'sveltekit', 'remix', 'astro', 'gatsby'],
        partialScore: 0.80,
    },

    // ── Backend Frameworks ─────────────────────────────────────────────────
    {
        name: 'python-backends',
        skills: ['django', 'flask', 'fastapi', 'tornado', 'falcon', 'starlette', 'litestar'],
        partialScore: 0.82,
    },
    {
        name: 'node-backends',
        skills: ['node.js', 'express', 'nestjs', 'fastify', 'koa', 'hapi', 'adonis'],
        partialScore: 0.82,
    },
    {
        name: 'jvm-backends',
        skills: ['spring', 'quarkus', 'micronaut', 'ktor', 'dropwizard', 'play framework'],
        partialScore: 0.80,
    },
    {
        name: 'php-backends',
        skills: ['laravel', 'symfony', 'codeigniter', 'lumen', 'slim', 'cakephp', 'yii'],
        partialScore: 0.82,
    },
    {
        name: 'ruby-backends',
        skills: ['ruby on rails', 'sinatra', 'hanami', 'padrino'],
        partialScore: 0.80,
    },
    {
        name: 'dotnet-backends',
        skills: ['.net', 'asp.net core', 'minimal api', 'blazor'],
        partialScore: 0.80,
    },
    {
        name: 'go-backends',
        skills: ['golang', 'gin', 'echo', 'fiber', 'chi', 'buffalo'],
        partialScore: 0.80,
    },

    // ── Cloud Platforms ────────────────────────────────────────────────────
    {
        name: 'cloud-platforms',
        skills: ['amazon web services', 'google cloud', 'microsoft azure', 'oracle cloud', 'ibm cloud', 'digitalocean', 'linode', 'hetzner'],
        partialScore: 0.80,
    },

    // ── AI / ML ────────────────────────────────────────────────────────────
    // Broad AI/ML domain: concepts and frameworks in the same cluster so that
    // "Machine Learning" or "Data Science" partially matches "TensorFlow/PyTorch" etc.
    // Also handles composite skill names like "TensorFlow/PyTorch" after splitting.
    {
        name: 'ai-ml-domain',
        skills: [
            // Domain concepts
            'machine learning', 'deep learning', 'artificial intelligence',
            'data science', 'neural networks', 'computer vision',
            'natural language processing', 'reinforcement learning',
            'predictive modeling', 'statistical modeling',
            // Deep learning frameworks
            'tensorflow', 'pytorch', 'keras', 'jax', 'mxnet', 'paddle', 'mindspore',
        ],
        partialScore: 0.80,
    },
    {
        name: 'ml-libraries',
        skills: ['scikit-learn', 'xgboost', 'lightgbm', 'catboost', 'statsmodels', 'mlpack', 'river'],
        partialScore: 0.82,
    },
    {
        name: 'data-processing',
        skills: ['pandas', 'polars', 'numpy', 'dask', 'spark', 'pyspark', 'vaex'],
        partialScore: 0.78,
    },
    // Jupyter and similar notebook environments
    {
        name: 'python-ds-env',
        skills: ['jupyter notebooks', 'jupyter', 'google colab', 'kaggle notebooks', 'anaconda', 'databricks notebooks', 'deepnote', 'vs code notebooks'],
        partialScore: 0.80,
    },
    {
        name: 'llm-tools',
        skills: ['large language model', 'langchain', 'llamaindex', 'hugging face', 'openai api', 'vertex ai', 'azure openai', 'semantic kernel'],
        partialScore: 0.80,
    },
    {
        name: 'mlops',
        skills: ['mlflow', 'kubeflow', 'dvc', 'weights & biases', 'bentoml', 'seldon', 'ray', 'feast', 'zenml'],
        partialScore: 0.78,
    },
    {
        name: 'data-viz-python',
        skills: ['matplotlib', 'seaborn', 'plotly', 'bokeh', 'altair', 'dash'],
        partialScore: 0.80,
    },
    {
        name: 'data-science-langs',
        skills: ['python', 'r', 'julia', 'matlab', 'sas', 'stata'],
        partialScore: 0.65,
    },

    // ── DevOps / Infrastructure ────────────────────────────────────────────
    {
        name: 'containerization',
        skills: ['docker', 'podman', 'containerd', 'buildah', 'buildkit'],
        partialScore: 0.80,
    },
    {
        name: 'orchestration',
        skills: ['kubernetes', 'helm', 'openshift', 'nomad', 'amazon ecs', 'amazon eks', 'google kubernetes engine', 'azure aks', 'rancher'],
        partialScore: 0.80,
    },
    {
        name: 'ci-cd',
        skills: ['jenkins', 'github actions', 'gitlab ci', 'circleci', 'travis ci', 'azure devops', 'bitbucket pipelines', 'teamcity', 'bamboo', 'argocd', 'tekton'],
        partialScore: 0.82,
    },
    {
        name: 'iac',
        skills: ['terraform', 'pulumi', 'ansible', 'cloudformation', 'chef', 'puppet', 'saltstack', 'crossplane'],
        partialScore: 0.75,
    },
    {
        name: 'monitoring-observability',
        skills: ['prometheus', 'grafana', 'datadog', 'new relic', 'dynatrace', 'nagios', 'zabbix', 'splunk', 'elastic apm', 'honeycomb', 'open telemetry'],
        partialScore: 0.75,
    },
    {
        name: 'service-mesh-proxy',
        skills: ['istio', 'linkerd', 'consul', 'envoy', 'nginx', 'traefik', 'kong', 'haproxy'],
        partialScore: 0.70,
    },
    {
        name: 'log-management',
        skills: ['elk stack', 'loki', 'fluentd', 'logstash', 'graylog', 'papertrail'],
        partialScore: 0.78,
    },

    // ── Message Brokers / Streaming ────────────────────────────────────────
    {
        name: 'message-brokers',
        skills: ['kafka', 'rabbitmq', 'aws sqs', 'azure service bus', 'google pub/sub', 'nats', 'activemq', 'aws kinesis', 'pulsar', 'redpanda'],
        partialScore: 0.80,
    },

    // ── Version Control ────────────────────────────────────────────────────
    {
        name: 'git-platforms',
        skills: ['git', 'github', 'gitlab', 'bitbucket', 'azure repos'],
        partialScore: 0.85,
    },

    // ── Languages by Family ────────────────────────────────────────────────
    {
        name: 'jvm-languages',
        skills: ['java', 'kotlin', 'scala', 'groovy', 'clojure'],
        partialScore: 0.78,
    },
    {
        name: 'systems-languages',
        skills: ['c++', 'rust', 'c', 'zig', 'assembly'],
        partialScore: 0.65,
    },
    {
        name: 'functional-languages',
        skills: ['haskell', 'erlang', 'elixir', 'f#', 'ocaml', 'clojure', 'elm'],
        partialScore: 0.68,
    },

    // ── Mobile ─────────────────────────────────────────────────────────────
    {
        name: 'cross-platform-mobile',
        skills: ['react native', 'flutter', 'xamarin', 'ionic', 'capacitor', 'cordova', 'expo'],
        partialScore: 0.80,
    },
    {
        name: 'native-mobile',
        skills: ['swift', 'objective-c', 'xcode'],
        partialScore: 0.82,
    },
    {
        name: 'android-native',
        skills: ['kotlin', 'android sdk', 'android studio', 'java'],
        partialScore: 0.82,
    },

    // ── BI / Analytics ─────────────────────────────────────────────────────
    {
        name: 'bi-tools',
        skills: ['power bi', 'tableau', 'looker', 'metabase', 'qlik', 'google data studio', 'amazon quicksight', 'apache superset', 'grafana', 'sisense', 'domo'],
        partialScore: 0.82,
    },
    {
        name: 'spreadsheets',
        skills: ['microsoft excel', 'google sheets', 'libreoffice calc', 'numbers', 'airtable'],
        partialScore: 0.85,
    },

    // ── Design ─────────────────────────────────────────────────────────────
    {
        name: 'design-tools',
        skills: ['figma', 'sketch', 'adobe xd', 'invision', 'zeplin', 'framer', 'marvel', 'protopie', 'axure'],
        partialScore: 0.82,
    },
    {
        name: 'image-editing',
        skills: ['photoshop', 'gimp', 'affinity photo', 'canva', 'pixlr'],
        partialScore: 0.78,
    },
    {
        name: 'vector-illustration',
        skills: ['illustrator', 'inkscape', 'affinity designer', 'corel draw'],
        partialScore: 0.80,
    },

    // ── Testing ────────────────────────────────────────────────────────────
    {
        name: 'js-test-frameworks',
        skills: ['jest', 'vitest', 'mocha', 'jasmine', 'karma', 'ava'],
        partialScore: 0.80,
    },
    {
        name: 'python-test-frameworks',
        skills: ['pytest', 'unittest', 'nose', 'hypothesis'],
        partialScore: 0.80,
    },
    {
        name: 'e2e-testing',
        skills: ['selenium', 'cypress', 'playwright', 'puppeteer', 'webdriverio', 'nightwatch', 'testcafe', 'appium'],
        partialScore: 0.80,
    },
    {
        name: 'java-test-frameworks',
        skills: ['junit', 'testng', 'mockito', 'spock', 'cucumber'],
        partialScore: 0.80,
    },
    {
        name: 'api-testing',
        skills: ['postman', 'insomnia', 'rest assured', 'karate', 'httpie'],
        partialScore: 0.80,
    },
    {
        name: 'load-testing',
        skills: ['jmeter', 'k6', 'gatling', 'locust', 'artillery'],
        partialScore: 0.80,
    },

    // ── APIs ───────────────────────────────────────────────────────────────
    {
        name: 'api-styles',
        skills: ['rest', 'graphql', 'grpc', 'soap', 'websockets', 'trpc', 'odata'],
        partialScore: 0.68,
    },
    {
        name: 'api-gateways',
        skills: ['aws api gateway', 'kong', 'apigee', 'azure api management', 'mulesoft'],
        partialScore: 0.75,
    },

    // ── Data Pipelines / ETL / Orchestration ──────────────────────────────
    {
        name: 'data-orchestration',
        skills: ['apache airflow', 'prefect', 'dagster', 'luigi', 'mage', 'kestra', 'argo workflows'],
        partialScore: 0.80,
    },
    {
        name: 'etl-integration',
        skills: ['informatica', 'talend', 'pentaho', 'mulesoft', 'fivetran', 'stitch', 'airbyte', 'dbt', 'matillion'],
        partialScore: 0.75,
    },

    // ── Project / Work Management ──────────────────────────────────────────
    {
        name: 'pm-tools',
        skills: ['jira', 'linear', 'asana', 'trello', 'notion', 'monday', 'clickup', 'basecamp', 'azure boards', 'shortcut'],
        partialScore: 0.82,
    },
    {
        name: 'agile-methodologies',
        skills: ['scrum', 'kanban', 'lean', 'safe', 'xp', 'crystal', 'scrumban'],
        partialScore: 0.80,
    },
    {
        name: 'docs-wikis',
        skills: ['confluence', 'notion', 'gitbook', 'outline', 'slab', 'coda'],
        partialScore: 0.82,
    },

    // ── Office Productivity ────────────────────────────────────────────────
    {
        name: 'word-processors',
        skills: ['microsoft word', 'google docs', 'libreoffice writer', 'pages', 'notion'],
        partialScore: 0.85,
    },
    {
        name: 'presentation-tools',
        skills: ['microsoft powerpoint', 'google slides', 'keynote', 'prezi', 'canva', 'beautiful.ai', 'pitch'],
        partialScore: 0.85,
    },

    // ── Enterprise Software ────────────────────────────────────────────────
    {
        name: 'erp',
        skills: ['sap', 'oracle erp', 'microsoft dynamics', 'netsuite', 'workday', 'infor', 'epicor', 'sage'],
        partialScore: 0.70,
    },
    {
        name: 'crm',
        skills: ['salesforce', 'hubspot', 'microsoft dynamics crm', 'zoho crm', 'pipedrive', 'monday crm', 'sugar crm', 'freshsales'],
        partialScore: 0.75,
    },
    {
        name: 'marketing-automation',
        skills: ['marketo', 'pardot', 'eloqua', 'mailchimp', 'klaviyo', 'braze', 'iterable', 'customer.io', 'activecampaign'],
        partialScore: 0.75,
    },
    {
        name: 'hris',
        skills: ['workday', 'successfactors', 'bamboohr', 'adp', 'personio', 'hibob', 'rippling', 'factorial'],
        partialScore: 0.75,
    },

    // ── Security ───────────────────────────────────────────────────────────
    {
        name: 'siem-tools',
        skills: ['splunk', 'qradar', 'arcsight', 'elastic siem', 'microsoft sentinel', 'sumo logic', 'chronicle'],
        partialScore: 0.75,
    },
    {
        name: 'pentest-tools',
        skills: ['metasploit', 'burp suite', 'nmap', 'wireshark', 'nessus', 'openvas', 'kali linux', 'cobalt strike'],
        partialScore: 0.75,
    },
    {
        name: 'identity-access',
        skills: ['oauth', 'openid connect', 'saml', 'ldap', 'active directory', 'okta', 'auth0', 'keycloak', 'ping identity'],
        partialScore: 0.75,
    },

    // ── Engineering / CAD ─────────────────────────────────────────────────
    {
        name: 'cad-tools',
        skills: ['solidworks', 'autocad', 'catia', 'creo', 'inventor', 'fusion 360', 'onshape', 'siemens nx', 'solid edge'],
        partialScore: 0.78,
    },
    {
        name: 'simulation-fea',
        skills: ['ansys', 'abaqus', 'nastran', 'comsol', 'hypermesh', 'ls-dyna', 'altair optistruct'],
        partialScore: 0.72,
    },
    {
        name: 'matlab-family',
        skills: ['matlab', 'simulink', 'octave', 'scilab'],
        partialScore: 0.80,
    },
    {
        name: 'pcb-eda',
        skills: ['altium designer', 'eagle', 'kicad', 'cadence', 'mentor graphics', 'orcad'],
        partialScore: 0.78,
    },
    {
        name: 'embedded-rtos',
        skills: ['freertos', 'zephyr', 'vxworks', 'qnx', 'threadx', 'embos'],
        partialScore: 0.75,
    },

    // ── ORM / Query ────────────────────────────────────────────────────────
    {
        name: 'orm-query',
        skills: ['sqlalchemy', 'typeorm', 'prisma', 'sequelize', 'hibernate', 'entity framework', 'mongoose', 'drizzle', 'knex'],
        partialScore: 0.75,
    },

    // ── Blockchain / Web3 ──────────────────────────────────────────────────
    {
        name: 'blockchain',
        skills: ['solidity', 'ethereum', 'web3.js', 'ethers.js', 'hardhat', 'truffle', 'foundry', 'rust (solana)'],
        partialScore: 0.75,
    },
];

// Build canonical term map: any synonym alias → canonical (first in group)
const canonicalMap = new Map<string, string>();
SYNONYM_GROUPS.forEach(group => {
    const canonical = group[0].toLowerCase().trim();
    group.forEach(term => canonicalMap.set(term.toLowerCase().trim(), canonical));
});

const toCanonical = (term: string): string =>
    canonicalMap.get(term.toLowerCase().trim()) ?? term.toLowerCase().trim();

// Build cluster lookup: canonical skill term → cluster index
const skillClusterMap = new Map<string, number>();
SKILL_CLUSTERS.forEach((cluster, idx) => {
    cluster.skills.forEach(skill => {
        const canon = toCanonical(skill.toLowerCase().trim());
        if (!skillClusterMap.has(canon)) {
            skillClusterMap.set(canon, idx);
        }
    });
});

/**
 * Returns the cluster index for a skill (or undefined if unmapped).
 * Used by hard-skills scoring to compute domain-proximity floors:
 * a candidate whose explicit skills already cover most of a job's
 * required clusters gets partial credit on the must-skills they
 * don't explicitly list (they're plausibly in the same family).
 *
 * For composite names ("React/Redux"), returns the cluster of the
 * first part that maps to a known cluster.
 */
export const getSkillClusterIndex = (term: string): number | undefined => {
    const norm = term.toLowerCase().trim();
    const direct = skillClusterMap.get(toCanonical(norm));
    if (direct !== undefined) return direct;
    // Composite skill: check each part
    const parts = norm.split(/\s*[\/,]\s*|\s+(?:and|or|&)\s+/i)
        .map(p => p.trim())
        .filter(p => p.length > 1);
    if (parts.length > 1) {
        for (const p of parts) {
            const idx = skillClusterMap.get(toCanonical(p));
            if (idx !== undefined) return idx;
        }
    }
    return undefined;
};

/**
 * Splits a composite skill name into its parts.
 * "TensorFlow/PyTorch" → ["tensorflow", "pytorch"]
 * "React & Redux"      → ["react", "redux"]
 * "Node.js"            → ["node.js"]  (no split — dot is not a separator)
 */
const splitComposite = (term: string): string[] => {
    const parts = term
        .split(/\s*[\/,]\s*|\s+(?:and|or|&)\s+/i)
        .map(p => p.trim().toLowerCase())
        .filter(p => p.length > 1);
    return parts.length > 1 ? parts : [term.toLowerCase().trim()];
};

/**
 * Core single-token score: compares two already-normalised, non-composite skill strings.
 * Returns 1.0 for exact/synonym/fuzzy match, partialScore for same cluster, 0 otherwise.
 */
const singleTokenScore = (a: string, b: string): number => {
    if (a === b) return 1.0;
    if (areSynonyms(a, b)) return 1.0;

    // Word-boundary substring (e.g. "machine learning" inside "ai / machine learning")
    const shorter = a.length <= b.length ? a : b;
    const longer  = a.length <= b.length ? b : a;
    if (shorter.length >= 4) {
        const escaped = shorter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`(?:^|[\\s\\-/+])(${escaped})(?:[\\s\\-/+]|$)`).test(longer)) return 1.0;
    }

    if (areFuzzyMatch(a, b)) return 1.0;

    // Cluster partial credit
    const clusterA = skillClusterMap.get(toCanonical(a));
    const clusterB = skillClusterMap.get(toCanonical(b));
    if (clusterA !== undefined && clusterB !== undefined && clusterA === clusterB) {
        return SKILL_CLUSTERS[clusterA].partialScore;
    }

    return 0.0;
};

/**
 * Returns a similarity score [0, 1] between two skills.
 *
 *   1.0       — exact match, synonym, word-boundary substring, or Levenshtein typo
 *   0.50–0.85 — related skills in the same cluster (partial credit)
 *   0.0       — unrelated
 *
 * Handles composite skill names like "TensorFlow/PyTorch" by splitting on "/"
 * and "/" before matching, so each component is evaluated independently.
 */
export const getSkillRelationScore = (a: string, b: string): number => {
    const normA = a.toLowerCase().trim();
    const normB = b.toLowerCase().trim();

    // Fast path: try the full strings first (most common case)
    const direct = singleTokenScore(normA, normB);
    if (direct > 0) return direct;

    // Composite splitting: "TensorFlow/PyTorch" → ["tensorflow", "pytorch"]
    // Try all cross-combinations of parts and return the best score found.
    const partsA = splitComposite(normA);
    const partsB = splitComposite(normB);

    if (partsA.length > 1 || partsB.length > 1) {
        let best = 0;
        for (const pA of partsA) {
            for (const pB of partsB) {
                const s = singleTokenScore(pA, pB);
                if (s > best) best = s;
            }
        }
        return best;
    }

    return 0.0;
};
