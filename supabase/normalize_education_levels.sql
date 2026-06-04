-- Normalizes existing candidate education records to the 7 PeakTalent education levels:
-- PRIMARY, LOWER_SECONDARY, UPPER_SECONDARY, BACHELOR, ITS, MASTER, PHD.
-- Run this once in Supabase SQL Editor after deploying the frontend changes.

create or replace function public.peaktalent_normalize_education_level(level_text text)
returns text
language sql
immutable
as $$
    select case
        when level_text is null or btrim(level_text) = '' then ''

        when lower(btrim(level_text)) in ('primary', 'elementary', 'primary school', 'elementare', 'scuola elementare')
            then 'PRIMARY'

        when lower(btrim(level_text)) in ('lower_secondary', 'lower secondary', 'lower secondary school', 'middle', 'middle school', 'media', 'scuola media')
            then 'LOWER_SECONDARY'

        when lower(btrim(level_text)) in ('upper_secondary', 'upper secondary', 'upper secondary school', 'hsd', 'high school', 'high school diploma', 'high school diploma (hsd)', 'diploma', 'maturita', 'maturità', 'scuola superiore', 'superiore', 'other')
            then 'UPPER_SECONDARY'

        when lower(btrim(level_text)) in ('its', 'ad', 'associate', 'associate degree', 'associate degree (ad)', 'istituto tecnico superiore', 'diploma tecnico superiore', 'higher technical institute', 'short cycle', 'short-cycle tertiary diploma')
            then 'ITS'

        when lower(btrim(level_text)) in ('bachelor', 'bachelor degree', 'bachelors', 'ba', 'bachelor of arts', 'bachelor of arts (ba)', 'bsc', 'bachelor of science', 'bachelor of science (bsc)', 'beng', 'bachelor of engineering', 'bachelor of engineering (beng)', 'btech', 'bachelor of technology', 'bachelor of technology (btech)', 'bba', 'bachelor of business administration', 'bachelor of business administration (bba)', 'bcom', 'bachelor of commerce', 'bachelor of commerce (bcom)', 'llb', 'bachelor of laws', 'bachelor of laws (llb)', 'barch', 'bachelor of architecture', 'bachelor of architecture (barch)', 'laurea', 'laurea triennale', 'triennale', 'undergraduate', 'exchange', 'student exchange program', 'student exchange program (exchange)')
            then 'BACHELOR'

        when lower(btrim(level_text)) in ('master', 'master degree', 'masters', 'ma', 'master of arts', 'master of arts (ma)', 'msc', 'master of science', 'master of science (msc)', 'meng', 'master of engineering', 'master of engineering (meng)', 'mba', 'master of business administration', 'master of business administration (mba)', 'llm', 'master of laws', 'master of laws (llm)', 'mfin', 'master of finance', 'master of finance (mfin)', 'mpa', 'master of public administration', 'master of public administration (mpa)', 'magistrale', 'laurea magistrale', 'specialistica', 'laurea specialistica', 'postgraduate')
            then 'MASTER'

        when lower(btrim(level_text)) in ('phd', 'doctor of philosophy', 'doctor of philosophy (phd)', 'dba', 'doctor of business administration', 'doctor of business administration (dba)', 'md', 'doctor of medicine', 'doctor of medicine (md)', 'jd', 'juris doctor', 'juris doctor (jd)', 'doctorate', 'doctoral', 'doctor', 'postdoc', 'postdoctoral', 'postdoctoral research', 'postdoctoral research (postdoc)', 'dottorato', 'dottorato di ricerca')
            then 'PHD'

        when lower(level_text) like '%postdoc%' or lower(level_text) like '%phd%' or lower(level_text) like '%doctor%' or lower(level_text) like '%dottorato%'
            then 'PHD'
        when lower(level_text) like '%master%' or lower(level_text) like '%msc%' or lower(level_text) like '%mba%' or lower(level_text) like '%magistrale%' or lower(level_text) like '%specialistica%'
            then 'MASTER'
        when lower(level_text) like '%associate%' or lower(level_text) like '%short cycle%' or lower(level_text) like '%its%' or lower(level_text) like '%tecnico superiore%'
            then 'ITS'
        when lower(level_text) like '%bachelor%' or lower(level_text) like '%bsc%' or lower(level_text) like '%beng%' or lower(level_text) like '%laurea%' or lower(level_text) like '%triennale%'
            then 'BACHELOR'
        when lower(level_text) like '%high school%' or lower(level_text) like '%maturit%' or lower(level_text) like '%scuola superiore%' or lower(level_text) like '%diploma%'
            then 'UPPER_SECONDARY'
        when lower(level_text) like '%middle school%' or lower(level_text) like '%scuola media%' or lower(level_text) like '%lower secondary%'
            then 'LOWER_SECONDARY'
        when lower(level_text) like '%primary%' or lower(level_text) like '%elementary%' or lower(level_text) like '%elementare%'
            then 'PRIMARY'

        else 'UPPER_SECONDARY'
    end;
$$;

update public.candidates
set content = jsonb_set(
    content,
    '{education}',
    coalesce(
        (
            select jsonb_agg(
                jsonb_set(
                    education_entry,
                    '{degree_level}',
                    to_jsonb(public.peaktalent_normalize_education_level(education_entry->>'degree_level')),
                    true
                )
            )
            from jsonb_array_elements(content->'education') as education_entry
        ),
        '[]'::jsonb
    ),
    true
)
where jsonb_typeof(content->'education') = 'array';

drop function public.peaktalent_normalize_education_level(text);
