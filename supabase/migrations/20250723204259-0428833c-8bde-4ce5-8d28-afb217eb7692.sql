-- Create access_codes table for 10-digit authentication codes
CREATE TABLE public.access_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  code_type VARCHAR(20) NOT NULL CHECK (code_type IN ('user', 'admin')),
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

-- Create policies for access codes
CREATE POLICY "Anyone can read unused access codes for validation" 
ON public.access_codes 
FOR SELECT 
USING (is_used = false);

CREATE POLICY "System can update access codes when used" 
ON public.access_codes 
FOR UPDATE 
USING (true);

-- Insert 30 user codes and 1 admin code
INSERT INTO public.access_codes (code, code_type) VALUES
-- User codes
('1234567890', 'user'),
('2345678901', 'user'),
('3456789012', 'user'),
('4567890123', 'user'),
('5678901234', 'user'),
('6789012345', 'user'),
('7890123456', 'user'),
('8901234567', 'user'),
('9012345678', 'user'),
('0123456789', 'user'),
('1357924680', 'user'),
('2468013579', 'user'),
('1472583690', 'user'),
('2583691470', 'user'),
('3694702581', 'user'),
('4705813692', 'user'),
('5816924703', 'user'),
('6927035814', 'user'),
('7038146925', 'user'),
('8149257036', 'user'),
('9260368147', 'user'),
('0371479258', 'user'),
('1482590369', 'user'),
('2593601470', 'user'),
('3604712581', 'user'),
('4715823692', 'user'),
('5826934703', 'user'),
('6937045814', 'user'),
('7048156925', 'user'),
('8159267036', 'user'),
-- Admin code
('0000000001', 'admin');

-- Create index for faster code lookups
CREATE INDEX idx_access_codes_code ON public.access_codes(code);
CREATE INDEX idx_access_codes_unused ON public.access_codes(code) WHERE is_used = false;