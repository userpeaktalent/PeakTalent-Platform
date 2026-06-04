export interface UniversitySuggestion {
    id: string;
    name: string;
    hint: string;
    externalId?: string;
    worksCount?: number;
    citedByCount?: number;
}

type OpenAlexAutocompleteResult = {
    id?: string;
    display_name?: string;
    hint?: string;
    external_id?: string;
    works_count?: number;
    cited_by_count?: number;
    entity_type?: string;
};

const OPENALEX_INSTITUTION_AUTOCOMPLETE_URL = 'https://api.openalex.org/autocomplete/institutions';

export const searchUniversities = async (
    query: string,
    signal?: AbortSignal
): Promise<UniversitySuggestion[]> => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
        return [];
    }

    const url = new URL(OPENALEX_INSTITUTION_AUTOCOMPLETE_URL);
    url.searchParams.set('q', trimmedQuery);
    url.searchParams.set('mailto', 'info@peaktalent.it');

    const response = await fetch(url.toString(), { signal });
    if (!response.ok) {
        throw new Error(`OpenAlex institution search failed with status ${response.status}`);
    }

    const payload = await response.json();
    const results = Array.isArray(payload?.results) ? payload.results as OpenAlexAutocompleteResult[] : [];

    return results
        .filter(result => (result.entity_type || 'institution') === 'institution' && result.display_name)
        .slice(0, 8)
        .map(result => ({
            id: result.id || result.external_id || result.display_name || '',
            name: result.display_name || '',
            hint: result.hint || '',
            externalId: result.external_id,
            worksCount: result.works_count,
            citedByCount: result.cited_by_count,
        }));
};
