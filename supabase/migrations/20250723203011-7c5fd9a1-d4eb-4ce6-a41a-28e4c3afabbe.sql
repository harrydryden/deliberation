-- Democratic Deliberation Platform Database Schema

-- Create enum for deliberation status
CREATE TYPE public.deliberation_status AS ENUM ('draft', 'active', 'concluded', 'archived');

-- Create enum for participant roles
CREATE TYPE public.participant_role AS ENUM ('facilitator', 'participant', 'observer');

-- Create enum for message types
CREATE TYPE public.message_type AS ENUM ('user', 'bill_agent', 'peer_agent', 'flow_agent');

-- Create enum for IBIS node types
CREATE TYPE public.ibis_node_type AS ENUM ('issue', 'position', 'argument', 'question');

-- Create deliberations table
CREATE TABLE public.deliberations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    facilitator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status deliberation_status DEFAULT 'draft',
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    max_participants INTEGER DEFAULT 50,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create participants table
CREATE TABLE public.participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deliberation_id UUID REFERENCES public.deliberations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role participant_role DEFAULT 'participant',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(deliberation_id, user_id)
);

-- Create messages table
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deliberation_id UUID REFERENCES public.deliberations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    message_type message_type DEFAULT 'user',
    agent_context JSONB, -- Store agent-specific metadata
    parent_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create IBIS nodes table for structured argumentation
CREATE TABLE public.ibis_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deliberation_id UUID REFERENCES public.deliberations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
    node_type ibis_node_type NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    parent_node_id UUID REFERENCES public.ibis_nodes(id) ON DELETE SET NULL,
    position_x FLOAT DEFAULT 0, -- For visual positioning
    position_y FLOAT DEFAULT 0,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    expertise_areas TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create agent interactions table
CREATE TABLE public.agent_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deliberation_id UUID REFERENCES public.deliberations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
    agent_type message_type NOT NULL,
    input_context JSONB,
    output_response TEXT,
    processing_time INTEGER, -- milliseconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.deliberations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ibis_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for deliberations
CREATE POLICY "Public deliberations are viewable by everyone" 
ON public.deliberations FOR SELECT 
USING (is_public = true OR auth.uid() = facilitator_id);

CREATE POLICY "Participants can view their deliberations" 
ON public.deliberations FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.participants 
    WHERE deliberation_id = id AND user_id = auth.uid()
));

CREATE POLICY "Facilitators can manage their deliberations" 
ON public.deliberations FOR ALL 
USING (auth.uid() = facilitator_id);

-- RLS Policies for participants
CREATE POLICY "Participants can view deliberation members" 
ON public.participants FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.participants p2 
    WHERE p2.deliberation_id = deliberation_id AND p2.user_id = auth.uid()
));

CREATE POLICY "Facilitators can manage participants" 
ON public.participants FOR ALL 
USING (EXISTS (
    SELECT 1 FROM public.deliberations 
    WHERE id = deliberation_id AND facilitator_id = auth.uid()
));

CREATE POLICY "Users can join deliberations" 
ON public.participants FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for messages
CREATE POLICY "Participants can view deliberation messages" 
ON public.messages FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.participants 
    WHERE deliberation_id = messages.deliberation_id AND user_id = auth.uid()
));

CREATE POLICY "Participants can create messages" 
ON public.messages FOR INSERT 
WITH CHECK (
    auth.uid() = user_id AND 
    EXISTS (
        SELECT 1 FROM public.participants 
        WHERE deliberation_id = messages.deliberation_id AND user_id = auth.uid()
    )
);

-- RLS Policies for IBIS nodes
CREATE POLICY "Participants can view IBIS nodes" 
ON public.ibis_nodes FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.participants 
    WHERE deliberation_id = ibis_nodes.deliberation_id AND user_id = auth.uid()
));

CREATE POLICY "Participants can create IBIS nodes" 
ON public.ibis_nodes FOR INSERT 
WITH CHECK (
    auth.uid() = created_by AND 
    EXISTS (
        SELECT 1 FROM public.participants 
        WHERE deliberation_id = ibis_nodes.deliberation_id AND user_id = auth.uid()
    )
);

-- RLS Policies for profiles
CREATE POLICY "Profiles are viewable by everyone" 
ON public.profiles FOR SELECT 
USING (true);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- RLS Policies for agent interactions (read-only for participants)
CREATE POLICY "Participants can view agent interactions" 
ON public.agent_interactions FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.participants 
    WHERE deliberation_id = agent_interactions.deliberation_id AND user_id = auth.uid()
));

-- Create indexes for better performance
CREATE INDEX idx_deliberations_status ON public.deliberations(status);
CREATE INDEX idx_deliberations_facilitator ON public.deliberations(facilitator_id);
CREATE INDEX idx_participants_deliberation ON public.participants(deliberation_id);
CREATE INDEX idx_participants_user ON public.participants(user_id);
CREATE INDEX idx_messages_deliberation ON public.messages(deliberation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE INDEX idx_ibis_nodes_deliberation ON public.ibis_nodes(deliberation_id);
CREATE INDEX idx_ibis_nodes_parent ON public.ibis_nodes(parent_node_id);
CREATE INDEX idx_agent_interactions_deliberation ON public.agent_interactions(deliberation_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_deliberations_updated_at
    BEFORE UPDATE ON public.deliberations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_messages_updated_at
    BEFORE UPDATE ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ibis_nodes_updated_at
    BEFORE UPDATE ON public.ibis_nodes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime for key tables
ALTER TABLE public.deliberations REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.deliberations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;