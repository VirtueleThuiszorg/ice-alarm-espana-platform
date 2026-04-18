-- Media Strategy Configuration Tables

-- Goals table
CREATE TABLE public.media_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.media_goals ENABLE ROW LEVEL SECURITY;

-- Staff can read/write
CREATE POLICY "Staff can view media goals"
  ON public.media_goals FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can manage media goals"
  ON public.media_goals FOR ALL
  USING (public.is_staff(auth.uid()));

-- Target Audiences table
CREATE TABLE public.media_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.media_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view media audiences"
  ON public.media_audiences FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can manage media audiences"
  ON public.media_audiences FOR ALL
  USING (public.is_staff(auth.uid()));

-- Topics table (with optional goal links)
CREATE TABLE public.media_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.media_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view media topics"
  ON public.media_topics FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can manage media topics"
  ON public.media_topics FOR ALL
  USING (public.is_staff(auth.uid()));

-- Topic-Goal junction table
CREATE TABLE public.media_topic_goals (
  topic_id uuid NOT NULL REFERENCES public.media_topics(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.media_goals(id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, goal_id)
);

ALTER TABLE public.media_topic_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view topic goals"
  ON public.media_topic_goals FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can manage topic goals"
  ON public.media_topic_goals FOR ALL
  USING (public.is_staff(auth.uid()));

-- Image Styles table
CREATE TABLE public.media_image_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  ai_prompt_hint text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.media_image_styles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view image styles"
  ON public.media_image_styles FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can manage image styles"
  ON public.media_image_styles FOR ALL
  USING (public.is_staff(auth.uid()));

-- Schedule Settings table
CREATE TABLE public.media_schedule_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posts_per_day integer NOT NULL DEFAULT 1 CHECK (posts_per_day BETWEEN 1 AND 3),
  active_days jsonb NOT NULL DEFAULT '{"mon": true, "tue": true, "wed": true, "thu": true, "fri": true, "sat": false, "sun": false}',
  anti_repetition_rules jsonb NOT NULL DEFAULT '{"goal_hours": 48, "audience_hours": 24, "topic_days": 7, "no_consecutive_style": true}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.media_schedule_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view schedule settings"
  ON public.media_schedule_settings FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can manage schedule settings"
  ON public.media_schedule_settings FOR ALL
  USING (public.is_staff(auth.uid()));

-- Content Calendar table
CREATE TABLE public.media_content_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_date date NOT NULL,
  scheduled_time time NOT NULL DEFAULT '10:00:00',
  goal_id uuid REFERENCES public.media_goals(id) ON DELETE SET NULL,
  audience_id uuid REFERENCES public.media_audiences(id) ON DELETE SET NULL,
  topic_id uuid REFERENCES public.media_topics(id) ON DELETE SET NULL,
  image_style_id uuid REFERENCES public.media_image_styles(id) ON DELETE SET NULL,
  social_post_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'generating', 'ready', 'published', 'skipped')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.media_content_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view content calendar"
  ON public.media_content_calendar FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can manage content calendar"
  ON public.media_content_calendar FOR ALL
  USING (public.is_staff(auth.uid()));

-- Add indexes
CREATE INDEX idx_media_content_calendar_date ON public.media_content_calendar(scheduled_date);
CREATE INDEX idx_media_content_calendar_status ON public.media_content_calendar(status);

-- Insert default data
INSERT INTO public.media_goals (name, description) VALUES
  ('Brand Awareness', 'Increase visibility and recognition of ICE Alarm España'),
  ('Family Education', 'Educate families about elderly care and safety'),
  ('Trust Building', 'Build trust through testimonials and reliability'),
  ('Safety Awareness', 'Promote safety tips and awareness'),
  ('Emergency Preparedness', 'Help people prepare for emergencies');

INSERT INTO public.media_audiences (name, description) VALUES
  ('Elderly Members', 'Seniors who may use or are using ICE Alarm services'),
  ('Adult Children', 'Adult children caring for elderly parents'),
  ('Care Contacts', 'Family members and caregivers as emergency contacts'),
  ('Expats', 'British and European expats living in Spain'),
  ('General Public', 'General audience interested in safety services');

INSERT INTO public.media_image_styles (name, description, ai_prompt_hint) VALUES
  ('Active Senior', 'Vibrant seniors enjoying active lifestyles', 'Active senior outdoors, Mediterranean setting, sunlight'),
  ('Family Moment', 'Warm family interactions across generations', 'Multi-generational family, warm embrace, home setting'),
  ('Pendant Focus', 'Clean product shots highlighting the SOS pendant', 'Close-up SOS pendant, professional lighting, clean background'),
  ('Spanish Lifestyle', 'Beautiful Spanish/Mediterranean scenery', 'Spanish terrace, olive trees, Mediterranean coast'),
  ('Independence', 'Seniors living independently with confidence', 'Confident senior at home, modern interior, natural light'),
  ('Peace of Mind', 'Calm, reassuring imagery', 'Peaceful garden, sunset, relaxed senior couple');

INSERT INTO public.media_schedule_settings (posts_per_day, active_days, anti_repetition_rules) VALUES
  (1, '{"mon": true, "tue": true, "wed": true, "thu": true, "fri": true, "sat": false, "sun": false}', '{"goal_hours": 48, "audience_hours": 24, "topic_days": 7, "no_consecutive_style": true}');

-- Update triggers
CREATE TRIGGER update_media_goals_updated_at
  BEFORE UPDATE ON public.media_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_media_audiences_updated_at
  BEFORE UPDATE ON public.media_audiences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_media_topics_updated_at
  BEFORE UPDATE ON public.media_topics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_media_image_styles_updated_at
  BEFORE UPDATE ON public.media_image_styles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_media_schedule_settings_updated_at
  BEFORE UPDATE ON public.media_schedule_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_media_content_calendar_updated_at
  BEFORE UPDATE ON public.media_content_calendar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();