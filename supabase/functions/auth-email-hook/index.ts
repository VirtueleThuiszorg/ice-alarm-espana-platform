/**
 * Supabase Auth "Send Email Hook" — Lovable-free (migrated 2026-07-24).
 *
 * Previously this rode on Lovable's platform bridge (@lovable.dev/email-js
 * sendLovableEmail + @lovable.dev/webhooks-js verification + LOVABLE_API_KEY),
 * which meant every auth email (signup / invite / magic link / recovery /
 * email change / reauth) depended on Lovable infrastructure.
 *
 * Now it implements the STANDARD Supabase send-email hook contract:
 *  - verification: standardwebhooks signature with SEND_EMAIL_HOOK_SECRET
 *    (the secret Supabase shows when enabling the hook, "v1,whsec_..." format);
 *  - payload: { user, email_data } with email_data.email_action_type;
 *  - sending: the existing Gmail SMTP module (_shared/email.ts) used by the
 *    rest of the platform — no new provider.
 *
 * The same React Email templates render the messages, so the emails
 * themselves are unchanged.
 *
 * Ops note: after deploy, point Auth → Hooks → "Send Email" at this function
 * and set SEND_EMAIL_HOOK_SECRET (plus GMAIL_APP_PASSWORD, already used by
 * other mail-sending functions).
 */
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { Webhook } from 'npm:standardwebhooks@1.0.0'
import { sendEmail } from '../_shared/email.ts'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Welcome to Care Conneqt — Confirm your email',
  invite: "You've been invited to Care Conneqt",
  magiclink: 'Your login link for Care Conneqt',
  recovery: 'Reset your Care Conneqt password',
  email_change: 'Confirm your email change — Care Conneqt',
  email_change_current: 'Confirm your email change — Care Conneqt',
  email_change_new: 'Confirm your email change — Care Conneqt',
  reauthentication: 'Your Care Conneqt verification code',
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<Record<string, unknown>>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  email_change_current: EmailChangeEmail,
  email_change_new: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

const SITE_NAME = 'Care Conneqt'
const ROOT_DOMAIN = 'careconneqt.es'

// Standard Supabase send-email hook payload (relevant fields).
interface SendEmailHookPayload {
  user: {
    email: string
    new_email?: string | null
  }
  email_data: {
    token: string
    token_hash: string
    redirect_to: string
    email_action_type: string
    site_url: string
    token_new?: string
    token_hash_new?: string
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  if (!hookSecret) {
    console.error('SEND_EMAIL_HOOK_SECRET is not configured')
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify the standardwebhooks signature (Supabase signs every hook call).
  const rawBody = await req.text()
  let payload: SendEmailHookPayload
  try {
    const wh = new Webhook(hookSecret.replace('v1,whsec_', ''))
    payload = wh.verify(rawBody, {
      'webhook-id': req.headers.get('webhook-id') ?? '',
      'webhook-timestamp': req.headers.get('webhook-timestamp') ?? '',
      'webhook-signature': req.headers.get('webhook-signature') ?? '',
    }) as SendEmailHookPayload
  } catch (error) {
    console.error('Webhook verification failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { user, email_data } = payload
  const emailType = email_data?.email_action_type
  if (!user?.email || !emailType) {
    console.error('Malformed hook payload', { hasUser: !!user?.email, emailType })
    return new Response(JSON.stringify({ error: 'Invalid payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  console.log('Received auth email event', { emailType })

  const EmailTemplate = EMAIL_TEMPLATES[emailType]
  if (!EmailTemplate) {
    console.error('Unknown email type', { emailType })
    return new Response(JSON.stringify({ error: `Unknown email type: ${emailType}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Build the verification link the standard way: the auth verify endpoint
  // with the token hash, bouncing to the requested redirect.
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const confirmationUrl =
    `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(email_data.token_hash)}` +
    `&type=${encodeURIComponent(emailType)}` +
    `&redirect_to=${encodeURIComponent(email_data.redirect_to || `https://${ROOT_DOMAIN}`)}`

  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: `https://${ROOT_DOMAIN}`,
    recipient: user.email,
    confirmationUrl,
    token: email_data.token,
    email: user.email,
    newEmail: user.new_email ?? undefined,
  }

  const html = await renderAsync(React.createElement(EmailTemplate, templateProps))

  // Recipient: email-change confirmations for the NEW address go to it.
  const to = emailType === 'email_change_new' && user.new_email ? user.new_email : user.email

  const result = await sendEmail(to, EMAIL_SUBJECTS[emailType] || 'Care Conneqt notification', html)
  if (!result.success) {
    console.error('Auth email send failed', { emailType, error: result.error })
    return new Response(JSON.stringify({ error: 'Failed to send email' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log('Auth email sent', { emailType })
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
