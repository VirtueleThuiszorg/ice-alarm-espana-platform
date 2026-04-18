-- Add new columns for Healthcare-Trust brand lock
ALTER TABLE public.video_brand_settings
ADD COLUMN IF NOT EXISTS phone_en text DEFAULT '+34 900 123 456',
ADD COLUMN IF NOT EXISTS phone_es text DEFAULT '+34 900 123 456',
ADD COLUMN IF NOT EXISTS whatsapp_en text DEFAULT '+34 600 000 000',
ADD COLUMN IF NOT EXISTS whatsapp_es text DEFAULT '+34 600 000 000',
ADD COLUMN IF NOT EXISTS web_url_en text DEFAULT 'www.icealarm.es',
ADD COLUMN IF NOT EXISTS web_url_es text DEFAULT 'www.icealarm.es',
ADD COLUMN IF NOT EXISTS youtube_footer_en text DEFAULT 'ICE Alarm España - 24/7 Emergency Response for Seniors',
ADD COLUMN IF NOT EXISTS youtube_footer_es text DEFAULT 'ICE Alarm España - Respuesta de Emergencia 24/7 para Mayores',
ADD COLUMN IF NOT EXISTS captions_enabled_default boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS safe_margins_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS transition_style text DEFAULT 'fade';

-- Update existing record with ICE Alarm defaults
UPDATE public.video_brand_settings SET
  primary_color = COALESCE(primary_color, '#B91C1C'),
  secondary_color = COALESCE(secondary_color, '#1E3A8A'),
  font_family = COALESCE(font_family, 'Inter'),
  watermark_enabled = COALESCE(watermark_enabled, true),
  captions_enabled_default = true,
  safe_margins_enabled = true,
  transition_style = 'fade',
  default_cta_en = COALESCE(NULLIF(default_cta_en, ''), 'Get Protected Now'),
  default_cta_es = COALESCE(NULLIF(default_cta_es, ''), 'Protégete Ahora')
WHERE id IS NOT NULL;

-- Add schema_json defaults to templates for accessibility
UPDATE public.video_templates SET
  schema_json = jsonb_set(
    COALESCE(schema_json, '{}'::jsonb),
    '{accessibility}',
    '{"largeText": true, "safeMargins": true, "captionsDefault": true, "transitionStyle": "fade"}'::jsonb
  )
WHERE is_locked = true;