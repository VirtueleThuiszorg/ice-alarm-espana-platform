-- Testimonials table for admin-managed customer testimonials
-- Displayed on Landing Page and Pendant Page

CREATE TABLE public.testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_en TEXT NOT NULL,
  quote_es TEXT NOT NULL,
  author_name TEXT NOT NULL,
  location_en TEXT NOT NULL,
  location_es TEXT NOT NULL,
  rating SMALLINT NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  page TEXT NOT NULL DEFAULT 'both' CHECK (page IN ('landing', 'pendant', 'both')),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

-- Public can read active testimonials (needed for unauthenticated landing page)
CREATE POLICY "Anyone can view active testimonials"
  ON public.testimonials FOR SELECT
  USING (is_active = true);

-- Staff can read all testimonials (including inactive, for admin)
CREATE POLICY "Staff can view all testimonials"
  ON public.testimonials FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Admins can insert
CREATE POLICY "Admins can insert testimonials"
  ON public.testimonials FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- Admins can update
CREATE POLICY "Admins can update testimonials"
  ON public.testimonials FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Admins can delete
CREATE POLICY "Admins can delete testimonials"
  ON public.testimonials FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Auto-update updated_at
CREATE TRIGGER update_testimonials_updated_at
  BEFORE UPDATE ON public.testimonials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed existing testimonials
INSERT INTO public.testimonials (quote_en, quote_es, author_name, location_en, location_es, rating, page, display_order) VALUES
  -- Landing page
  ('The peace of mind this service gives our family is priceless. When Mum had a fall last month, help arrived within minutes. I can''t recommend ICE Alarm enough.',
   'La tranquilidad que este servicio da a nuestra familia no tiene precio. Cuando mamá tuvo una caída el mes pasado, la ayuda llegó en minutos. Recomiendo ICE Alarm sin reservas.',
   'Margaret Thompson', 'British Expat, Alicante', 'Expatriada Británica, Alicante', 5, 'landing', 1),
  ('Living alone at 78, I was worried about emergencies. The GPS pendant gives me independence while keeping my children reassured. The bilingual support is excellent.',
   'Viviendo solo a los 78 años, me preocupaban las emergencias. El colgante GPS me da independencia mientras mantiene tranquilos a mis hijos. El soporte bilingüe es excelente.',
   'Robert Harrison', 'Retired Teacher, Málaga', 'Profesor Jubilado, Málaga', 5, 'landing', 2),
  ('After my husband''s stroke, we needed reliable emergency support. ICE Alarm responded in under 30 seconds during a real emergency. They truly saved his life.',
   'Después del derrame de mi marido, necesitábamos apoyo de emergencia fiable. ICE Alarm respondió en menos de 30 segundos durante una emergencia real. Realmente le salvaron la vida.',
   'Susan & Peter Williams', 'Couple, Costa Blanca', 'Pareja, Costa Blanca', 5, 'landing', 3),
  -- Pendant page
  ('ICE Alarm gave me back my independence. I feel safe knowing help is just one button press away.',
   'ICE Alarm me devolvió mi independencia. Me siento seguro/a sabiendo que la ayuda está a solo un botón de distancia.',
   'Margaret', 'Alicante', 'Alicante', 5, 'pendant', 1),
  ('When my father fell, the pendant automatically called for help. The team was amazing and spoke to him in English. They saved his life.',
   'Cuando mi padre se cayó, el colgante llamó automáticamente por ayuda. El equipo fue increíble y le habló en inglés. Le salvaron la vida.',
   'David', 'Son of ICE Alarm member', 'Hijo de miembro de ICE Alarm', 5, 'pendant', 2),
  ('The peace of mind this gives our family is priceless. Mum can live independently knowing we''ll be called if anything happens.',
   'La tranquilidad que esto da a nuestra familia no tiene precio. Mamá puede vivir independientemente sabiendo que nos llamarán si pasa algo.',
   'Sarah', 'Málaga', 'Málaga', 5, 'pendant', 3);
