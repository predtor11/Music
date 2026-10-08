/** Supabase Auth errors, in plain words. Unknown errors keep their own message. */
export function friendlyAuthError(error: { message?: string; code?: string; status?: number } | null | undefined): string {
  const message = error?.message ?? '';
  const code = error?.code ?? '';
  const text = `${code} ${message}`.toLowerCase();
  if (text.includes('invalid_credentials') || text.includes('invalid login credentials')) return "That email and password don't match an account.";
  if (text.includes('email_not_confirmed') || text.includes('email not confirmed')) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (text.includes('user_already_exists') || text.includes('already registered')) return 'There is already an account with this email. Sign in instead.';
  if (text.includes('weak_password') || text.includes('password should be')) return 'Choose a longer password (at least 6 characters).';
  if (text.includes('email_address_invalid') || text.includes('invalid format') || text.includes('is invalid')) return "That email address doesn't look right.";
  if (text.includes('over_email_send_rate_limit') || text.includes('rate limit')) return 'Too many tries in a short time. Wait a minute and try again.';
  if (error?.status === 0 || text.includes('failed to fetch') || text.includes('network')) return "Can't reach the sign-in server. Check your internet connection.";
  return message || 'Something went wrong. Try again.';
}
