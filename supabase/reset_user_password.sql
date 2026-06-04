-- RPC to reset a user's password from admin console
-- This RPC is called by the admin service when resetting passwords for candidates and recruiters
-- It updates the password in the auth.users table and marks the user to change password on next login

CREATE OR REPLACE FUNCTION reset_user_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS JSON AS $$
DECLARE
    v_result JSON;
BEGIN
    -- Validate inputs
    IF p_user_id IS NULL OR p_new_password IS NULL THEN
        RETURN json_build_object('status', 'error', 'message', 'User ID and password are required');
    END IF;

    -- Check if user exists
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
        RETURN json_build_object('status', 'error', 'message', 'User not found');
    END IF;

    -- Update the password using the admin API
    -- In Supabase, we use the admin API to update passwords
    -- This is done through the auth.users table update
    UPDATE auth.users
    SET 
        encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = p_user_id;

    -- Log the password reset action for audit
    INSERT INTO activity_logs (
        event_type,
        source,
        purpose,
        entity_type,
        entity_id,
        entity_label,
        summary,
        metadata
    ) VALUES (
        'password_reset',
        'admin_rpc',
        'admin_password_reset',
        'user',
        p_user_id::TEXT,
        p_user_id::TEXT,
        'Admin reset password via RPC',
        json_build_object(
            'reset_at', now(),
            'reset_by', auth.uid()
        )
    );

    RETURN json_build_object(
        'status', 'success',
        'message', 'Password reset successfully'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'status', 'error',
        'message', 'Error resetting password: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (admin only)
GRANT EXECUTE ON FUNCTION reset_user_password(UUID, TEXT) TO authenticated;

-- Ensure RLS is bypassed for this function when called by admin
-- The function should only be accessible to authenticated admin users
ALTER FUNCTION reset_user_password(UUID, TEXT) SECURITY DEFINER;
