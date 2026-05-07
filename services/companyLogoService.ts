import { supabase } from './supabaseClient';

const COMPANY_IMAGES_BUCKET = 'company-images';

const sanitizeFileName = (name: string) =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9.\-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

export const uploadCompanyLogo = async ({
    file,
    recruiterId,
    previousPath,
}: {
    file: File;
    recruiterId: string;
    previousPath?: string | null;
}): Promise<{ publicUrl: string; path: string }> => {
    const safeName = sanitizeFileName(file.name || 'company-logo');
    const path = `${recruiterId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
        .from(COMPANY_IMAGES_BUCKET)
        .upload(path, file, {
            cacheControl: '3600',
        });

    if (uploadError) {
        const message = `${uploadError.message || ''} ${uploadError.name || ''}`.trim().toLowerCase();
        if (message.includes('bucket') || message.includes('not found') || message.includes('does not exist')) {
            throw new Error('Il bucket Supabase Storage `company-images` non esiste ancora o non e accessibile.');
        }
        throw uploadError;
    }

    if (previousPath && previousPath !== path) {
        const { error: removeError } = await supabase.storage
            .from(COMPANY_IMAGES_BUCKET)
            .remove([previousPath]);

        if (removeError) {
            console.warn('Could not remove previous company logo from storage:', removeError);
        }
    }

    const { data: publicUrlData } = supabase.storage
        .from(COMPANY_IMAGES_BUCKET)
        .getPublicUrl(path);

    return {
        publicUrl: publicUrlData.publicUrl,
        path,
    };
};

export { COMPANY_IMAGES_BUCKET };
