-- Add courtesy_calls_enabled and next_courtesy_call_date to members table
ALTER TABLE public.members 
ADD COLUMN courtesy_calls_enabled boolean DEFAULT true,
ADD COLUMN next_courtesy_call_date date;

-- Add task_type column to tasks table to distinguish courtesy calls from regular tasks
ALTER TABLE public.tasks
ADD COLUMN task_type text DEFAULT 'general';

-- Create index for efficient courtesy call task queries
CREATE INDEX idx_tasks_task_type ON public.tasks(task_type);

-- Create index for efficient member courtesy call queries
CREATE INDEX idx_members_courtesy_calls ON public.members(courtesy_calls_enabled, next_courtesy_call_date) 
WHERE status = 'active';