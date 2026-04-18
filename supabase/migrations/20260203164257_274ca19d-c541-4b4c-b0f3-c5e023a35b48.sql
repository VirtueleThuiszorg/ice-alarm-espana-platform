-- Stage 3: email_log table for tracking all outgoing emails
CREATE TABLE public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  from_email text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text,
  module text NOT NULL CHECK (module IN ('member', 'outreach', 'support', 'system')),
  related_entity_id uuid,
  related_entity_type text,
  template_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  provider_message_id text,
  error_message text,
  headers_json jsonb,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

-- Staff can read all email logs
CREATE POLICY "Staff can view email logs"
  ON public.email_log
  FOR SELECT
  USING (public.is_staff(auth.uid()));

-- Only system can insert (via service role)
CREATE POLICY "Service role can insert email logs"
  ON public.email_log
  FOR INSERT
  WITH CHECK (true);

-- Index for common queries
CREATE INDEX idx_email_log_module ON public.email_log(module);
CREATE INDEX idx_email_log_status ON public.email_log(status);
CREATE INDEX idx_email_log_created_at ON public.email_log(created_at DESC);
CREATE INDEX idx_email_log_related_entity ON public.email_log(related_entity_type, related_entity_id);

-- Stage 4: inbound_email_log table for received emails
CREATE TABLE public.inbound_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_email text NOT NULL,
  to_email text NOT NULL,
  subject text,
  body_snippet text,
  body_html text,
  provider_message_id text,
  provider_thread_id text,
  received_at timestamptz NOT NULL,
  module_matched text,
  linked_entity_id uuid,
  linked_entity_type text,
  is_reply boolean DEFAULT false,
  original_email_log_id uuid REFERENCES public.email_log(id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inbound_email_log ENABLE ROW LEVEL SECURITY;

-- Staff can read all inbound logs
CREATE POLICY "Staff can view inbound email logs"
  ON public.inbound_email_log
  FOR SELECT
  USING (public.is_staff(auth.uid()));

-- Only system can insert (via service role)
CREATE POLICY "Service role can insert inbound email logs"
  ON public.inbound_email_log
  FOR INSERT
  WITH CHECK (true);

-- Index for queries
CREATE INDEX idx_inbound_email_module ON public.inbound_email_log(module_matched);
CREATE INDEX idx_inbound_email_received_at ON public.inbound_email_log(received_at DESC);
CREATE INDEX idx_inbound_email_linked_entity ON public.inbound_email_log(linked_entity_type, linked_entity_id);

-- Stage 6: email_templates table
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  module text NOT NULL CHECK (module IN ('member', 'outreach', 'support', 'system')),
  subject_en text NOT NULL,
  subject_es text NOT NULL,
  body_html_en text NOT NULL,
  body_html_es text NOT NULL,
  body_text_en text,
  body_text_es text,
  variables jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Staff can read templates
CREATE POLICY "Staff can view email templates"
  ON public.email_templates
  FOR SELECT
  USING (public.is_staff(auth.uid()));

-- Admins can manage templates
CREATE POLICY "Admins can manage email templates"
  ON public.email_templates
  FOR ALL
  USING (public.is_admin(auth.uid()));

-- Add foreign key to email_log for template_id
ALTER TABLE public.email_log 
ADD CONSTRAINT email_log_template_id_fkey 
FOREIGN KEY (template_id) REFERENCES public.email_templates(id) ON DELETE SET NULL;

-- Trigger for updated_at on templates
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default templates
INSERT INTO public.email_templates (slug, name, description, module, subject_en, subject_es, body_html_en, body_html_es, variables) VALUES
('member-welcome', 'Welcome Email', 'Sent after successful registration and payment', 'member', 
  'Welcome to ICE Alarm! Your membership is active',
  '¡Bienvenido a ICE Alarm! Tu membresía está activa',
  '<h1>Welcome to ICE Alarm!</h1><p>Hello {{first_name}},</p><p>Thank you for joining ICE Alarm. Your membership is now active.</p><p>Order: {{order_number}}<br>Amount: €{{amount}}</p><p><a href="{{dashboard_url}}">Access Your Dashboard</a></p><p>Best regards,<br>ICE Alarm Team</p>',
  '<h1>¡Bienvenido a ICE Alarm!</h1><p>Hola {{first_name}},</p><p>Gracias por unirse a ICE Alarm. Su membresía está activa.</p><p>Pedido: {{order_number}}<br>Importe: €{{amount}}</p><p><a href="{{dashboard_url}}">Acceder a Mi Panel</a></p><p>Saludos cordiales,<br>Equipo ICE Alarm</p>',
  '["first_name", "order_number", "amount", "dashboard_url"]'::jsonb
),
('member-verification', 'Email Verification', 'Email verification link', 'member',
  'Verify your email address - ICE Alarm',
  'Verifique su correo electrónico - ICE Alarm',
  '<h1>Verify Your Email</h1><p>Hello {{first_name}},</p><p>Please click the link below to verify your email address:</p><p><a href="{{verification_url}}">Verify Email</a></p><p>This link expires in 24 hours.</p>',
  '<h1>Verifique su Correo</h1><p>Hola {{first_name}},</p><p>Por favor haga clic en el enlace para verificar su correo electrónico:</p><p><a href="{{verification_url}}">Verificar Correo</a></p><p>Este enlace expira en 24 horas.</p>',
  '["first_name", "verification_url"]'::jsonb
),
('member-password-reset', 'Password Reset', 'Password reset request email', 'member',
  'Reset your password - ICE Alarm',
  'Restablecer su contraseña - ICE Alarm',
  '<h1>Password Reset</h1><p>Hello {{first_name}},</p><p>Click the link below to reset your password:</p><p><a href="{{reset_url}}">Reset Password</a></p><p>This link expires in 1 hour.</p><p>If you did not request this, please ignore this email.</p>',
  '<h1>Restablecer Contraseña</h1><p>Hola {{first_name}},</p><p>Haga clic en el enlace para restablecer su contraseña:</p><p><a href="{{reset_url}}">Restablecer Contraseña</a></p><p>Este enlace expira en 1 hora.</p><p>Si no solicitó esto, ignore este correo.</p>',
  '["first_name", "reset_url"]'::jsonb
),
('member-update-request', 'Member Update Request', 'Request member to update their information', 'member',
  'Please Update Your Information - ICE Alarm',
  'Por favor actualice su información - ICE Alarm',
  '<h1>Update Your Information</h1><p>Hello {{first_name}},</p><p>We need some additional information to best assist you in an emergency.</p><p><a href="{{update_url}}">Update My Information</a></p><p>This link expires in 7 days.</p>',
  '<h1>Actualice Su Información</h1><p>Hola {{first_name}},</p><p>Necesitamos información adicional para asistirle mejor en caso de emergencia.</p><p><a href="{{update_url}}">Actualizar Mi Información</a></p><p>Este enlace expira en 7 días.</p>',
  '["first_name", "update_url"]'::jsonb
),
('support-ticket-created', 'Support Ticket Created', 'Confirmation when support ticket is created', 'support',
  'Support Ticket #{{ticket_number}} Created - ICE Alarm',
  'Ticket de Soporte #{{ticket_number}} Creado - ICE Alarm',
  '<h1>Support Ticket Created</h1><p>Hello {{first_name}},</p><p>We have received your support request.</p><p><strong>Ticket:</strong> #{{ticket_number}}<br><strong>Subject:</strong> {{subject}}</p><p>Our team will respond within 24 hours.</p>',
  '<h1>Ticket de Soporte Creado</h1><p>Hola {{first_name}},</p><p>Hemos recibido su solicitud de soporte.</p><p><strong>Ticket:</strong> #{{ticket_number}}<br><strong>Asunto:</strong> {{subject}}</p><p>Nuestro equipo responderá en 24 horas.</p>',
  '["first_name", "ticket_number", "subject"]'::jsonb
),
('outreach-intro', 'Outreach Introduction', 'Initial outreach email to prospects', 'outreach',
  'Protect Your Loved Ones with ICE Alarm',
  'Proteja a sus Seres Queridos con ICE Alarm',
  '<h1>Peace of Mind for You and Your Family</h1><p>Hello {{first_name}},</p><p>Are you or a loved one living independently in Spain? ICE Alarm provides 24/7 emergency response with just the press of a button.</p><p><a href="{{landing_url}}">Learn More</a></p>',
  '<h1>Tranquilidad para Usted y su Familia</h1><p>Hola {{first_name}},</p><p>¿Usted o un ser querido vive de forma independiente en España? ICE Alarm ofrece respuesta de emergencia 24/7 con solo presionar un botón.</p><p><a href="{{landing_url}}">Más Información</a></p>',
  '["first_name", "landing_url"]'::jsonb
),
('outreach-followup-1', 'Outreach Follow-up 1', 'First follow-up email', 'outreach',
  'Still thinking about personal safety?',
  '¿Aún está pensando en su seguridad personal?',
  '<h1>We are Here to Help</h1><p>Hello {{first_name}},</p><p>We wanted to follow up on our previous message about ICE Alarm. Do you have any questions about how our service works?</p><p><a href="{{landing_url}}">Get Protected Today</a></p>',
  '<h1>Estamos Aquí para Ayudar</h1><p>Hola {{first_name}},</p><p>Queríamos hacer seguimiento a nuestro mensaje anterior sobre ICE Alarm. ¿Tiene alguna pregunta sobre cómo funciona nuestro servicio?</p><p><a href="{{landing_url}}">Protéjase Hoy</a></p>',
  '["first_name", "landing_url"]'::jsonb
),
('partner-welcome', 'Partner Welcome', 'Welcome email for new partners', 'system',
  'Welcome to ICE Alarm Partner Program - Your Login Credentials',
  'Bienvenido al Programa de Socios ICE Alarm - Sus Credenciales',
  '<h1>Welcome to the Partner Program!</h1><p>Hello {{contact_name}},</p><p>Your partner account has been created!</p><p><strong>Email:</strong> {{email}}<br><strong>Temporary Password:</strong> {{temp_password}}<br><strong>Referral Code:</strong> {{referral_code}}</p><p><a href="{{login_url}}">Login to Partner Portal</a></p><p>Please change your password immediately.</p>',
  '<h1>¡Bienvenido al Programa de Socios!</h1><p>Hola {{contact_name}},</p><p>¡Su cuenta de socio ha sido creada!</p><p><strong>Email:</strong> {{email}}<br><strong>Contraseña Temporal:</strong> {{temp_password}}<br><strong>Código de Referido:</strong> {{referral_code}}</p><p><a href="{{login_url}}">Iniciar Sesión en Portal de Socios</a></p><p>Por favor cambie su contraseña inmediatamente.</p>',
  '["contact_name", "email", "temp_password", "referral_code", "login_url"]'::jsonb
),
('staff-welcome', 'Staff Welcome', 'Welcome email for new staff members', 'system',
  'Your ICE Alarm Staff Account Has Been Created',
  'Tu cuenta de personal de ICE Alarm ha sido creada',
  '<h1>Welcome to ICE Alarm Staff Portal</h1><p>Hello {{first_name}},</p><p>Your staff account has been created with the role: <strong>{{role}}</strong></p><p><strong>Email:</strong> {{email}}<br><strong>Temporary Password:</strong> {{temp_password}}</p><p><a href="{{login_url}}">Login to Staff Portal</a></p><p>Please log in and change your password immediately.</p>',
  '<h1>Bienvenido al Portal de Personal ICE Alarm</h1><p>Hola {{first_name}},</p><p>Tu cuenta de personal ha sido creada con el rol: <strong>{{role}}</strong></p><p><strong>Email:</strong> {{email}}<br><strong>Contraseña temporal:</strong> {{temp_password}}</p><p><a href="{{login_url}}">Iniciar Sesión</a></p><p>Por favor, inicia sesión y cambia tu contraseña inmediatamente.</p>',
  '["first_name", "role", "email", "temp_password", "login_url"]'::jsonb
);