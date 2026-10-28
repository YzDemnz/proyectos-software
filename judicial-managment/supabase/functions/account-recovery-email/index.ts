import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://yzdemnz.github.io',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase()
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const createToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)))
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('')

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const isWithinWindow = (value: string | null | undefined, seconds: number) => {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && Date.now() - timestamp < seconds * 1000
}

const sendEmail = async ({ to, subject, html }: { to: string; subject: string; html: string }) => {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RECOVERY_EMAIL_FROM')
  if (!apiKey || !from) throw new Error('El servicio de correo de respaldo no está configurado.')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })
  if (!response.ok) throw new Error('No se pudo enviar el correo de seguridad.')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const portalUrl = (Deno.env.get('PORTAL_URL') ?? 'https://yzdemnz.github.io/judicial-managment-portal').replace(/\/$/, '')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'El servicio de recuperación no está configurado.' }, 503)

  const body = await request.json().catch(() => ({})) as { action?: string; email?: string }
  const action = body.action
  const email = normalizeEmail(body.email)
  if (!isValidEmail(email)) return json({ error: 'Escribe un correo válido.' }, 400)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  try {
    if (action !== 'begin' && action !== 'request') return json({ error: 'Invalid action.' }, 400)

    const rateLimitKey = await sha256(`${action}:${email}`)
    const cooldownSeconds = action === 'request' ? 15 * 60 : 2 * 60
    const { data: previousRequest } = await admin
      .from('account_recovery_email_request_limits')
      .select('last_requested_at')
      .eq('identifier_hash', rateLimitKey)
      .maybeSingle()

    if (isWithinWindow(previousRequest?.last_requested_at, cooldownSeconds)) {
      return json({ ok: true })
    }

    await admin
      .from('account_recovery_email_request_limits')
      .upsert({ identifier_hash: rateLimitKey, last_requested_at: new Date().toISOString() })

    if (action === 'begin') {
      const authorization = request.headers.get('Authorization')
      if (!authorization) return json({ error: 'Inicia sesión para configurar un correo de respaldo.' }, 401)
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      })
      const { data: userData, error: userError } = await userClient.auth.getUser()
      if (userError || !userData.user) return json({ error: 'La sesión ya no es válida.' }, 401)

      if (normalizeEmail(userData.user.email) === email) {
        return json({ error: 'The backup email must differ from the primary email.' }, 400)
      }

      const token = createToken()
      const { error: challengeError } = await userClient.rpc('create_recovery_email_challenge', {
        backup_email_value: email,
        token_hash_value: await sha256(token),
      })
      if (challengeError) return json({ error: challengeError.message }, 403)

      const confirmationUrl = `${portalUrl}/respaldo?token=${encodeURIComponent(token)}`
      await sendEmail({
        to: email,
        subject: 'Confirma tu correo de respaldo de Judicial Managment',
        html: `<p>Solicitaste usar este correo como respaldo de tu cuenta de Judicial Managment.</p><p><a href="${confirmationUrl}">Confirmar correo de respaldo</a></p><p>El enlace vence en 30 minutos. Si no hiciste esta solicitud, ignora este mensaje.</p>`,
      })
      return json({ ok: true })
    }

    if (action === 'request') {
      const { data: profile } = await admin
        .from('app_profiles')
        .select('id,email,correo_alternativo,recovery_email_enabled,correo_alternativo_verificado_en')
        .eq('correo_alternativo', email)
        .eq('recovery_email_enabled', true)
        .not('correo_alternativo_verificado_en', 'is', null)
        .maybeSingle()

      if (profile?.id) {
        const { data: authUser } = await admin.auth.admin.getUserById(profile.id)
        const primaryEmail = authUser.user?.email ?? profile.email
        if (primaryEmail) {
          const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
            type: 'recovery',
            email: primaryEmail,
            options: { redirectTo: `${portalUrl}/recuperar` },
          })
          if (!linkError && linkData.properties.action_link) {
            await sendEmail({
              to: email,
              subject: 'Recupera tu acceso a Judicial Managment',
              html: `<p>Recibimos una solicitud de recuperación de acceso.</p><p><a href="${linkData.properties.action_link}">Continuar con recuperación</a></p><p>Si no la solicitaste, ignora este mensaje.</p>`,
            })
          }
        }
      }
      return json({ ok: true })
    }

    return json({ error: 'Acción no válida.' }, 400)
  } catch (error) {
    console.error('account-recovery-email', error)
    return json({ error: 'No se pudo procesar la solicitud de recuperación.' }, 500)
  }
})
