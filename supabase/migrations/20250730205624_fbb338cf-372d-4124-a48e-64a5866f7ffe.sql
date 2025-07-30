-- Create new IBIS database schema for enhanced debate platform

-- Table for storing raw user submissions
CREATE TABLE public.submissions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    deliberation_id UUID REFERENCES public.deliberations(id),
    message_id UUID REFERENCES public.messages(id),
    user_id UUID NOT NULL,
    raw_content TEXT NOT NULL,
    submission_type TEXT DEFAULT 'manual', -- 'manual', 'ai_suggested'
    processing_status TEXT DEFAULT 'pending', -- 'pending', 'processed', 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table for storing processed/classified items
CREATE TABLE public.classified_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id),
    deliberation_id UUID REFERENCES public.deliberations(id),
    item_type TEXT NOT NULL CHECK (item_type IN ('issue', 'position', 'argument')),
    headline TEXT NOT NULL,
    full_content TEXT NOT NULL,
    stance_score DECIMAL(3,2) CHECK (stance_score >= -1.0 AND stance_score <= 1.0),
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    ai_generated BOOLEAN DEFAULT false,
    user_edited BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table for keywords/semantic tags
CREATE TABLE public.keywords (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    keyword TEXT UNIQUE NOT NULL,
    category TEXT DEFAULT 'general', -- 'topic', 'emotion', 'domain', 'general'
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Junction table for item-keyword relationships
CREATE TABLE public.item_keywords (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    classified_item_id UUID REFERENCES public.classified_items(id) ON DELETE CASCADE,
    keyword_id UUID REFERENCES public.keywords(id) ON DELETE CASCADE,
    relevance_score DECIMAL(3,2) DEFAULT 1.0 CHECK (relevance_score >= 0.0 AND relevance_score <= 1.0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(classified_item_id, keyword_id)
);

-- Table for relationships between classified items
CREATE TABLE public.item_relationships (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    source_item_id UUID REFERENCES public.classified_items(id) ON DELETE CASCADE,
    target_item_id UUID REFERENCES public.classified_items(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN ('supports', 'opposes', 'relates_to', 'elaborates', 'questions')),
    strength DECIMAL(3,2) DEFAULT 1.0 CHECK (strength >= 0.0 AND strength <= 1.0),
    ai_generated BOOLEAN DEFAULT false,
    user_confirmed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(source_item_id, target_item_id, relationship_type),
    CHECK (source_item_id != target_item_id)
);

-- Table for storing semantic similarities between items
CREATE TABLE public.item_similarities (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    item1_id UUID REFERENCES public.classified_items(id) ON DELETE CASCADE,
    item2_id UUID REFERENCES public.classified_items(id) ON DELETE CASCADE,
    similarity_score DECIMAL(5,4) CHECK (similarity_score >= 0.0 AND similarity_score <= 1.0),
    similarity_type TEXT DEFAULT 'semantic' CHECK (similarity_type IN ('semantic', 'structural', 'thematic')),
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(item1_id, item2_id),
    CHECK (item1_id < item2_id) -- Ensure ordered pairs to avoid duplicates
);

-- Create notion view that combines submissions and classified items
CREATE VIEW public.notions AS
SELECT 
    ci.id,
    ci.submission_id,
    ci.deliberation_id,
    ci.item_type,
    ci.headline,
    ci.full_content,
    ci.stance_score,
    ci.confidence_score,
    ci.ai_generated,
    ci.user_edited,
    ci.status,
    ci.created_by,
    ci.created_at,
    ci.updated_at,
    s.raw_content,
    s.message_id,
    s.user_id AS submitter_id,
    ARRAY_AGG(DISTINCT k.keyword) FILTER (WHERE k.keyword IS NOT NULL) AS keywords,
    COUNT(DISTINCT ir_out.id) AS outgoing_relationships,
    COUNT(DISTINCT ir_in.id) AS incoming_relationships
FROM public.classified_items ci
JOIN public.submissions s ON ci.submission_id = s.id
LEFT JOIN public.item_keywords ik ON ci.id = ik.classified_item_id
LEFT JOIN public.keywords k ON ik.keyword_id = k.id
LEFT JOIN public.item_relationships ir_out ON ci.id = ir_out.source_item_id
LEFT JOIN public.item_relationships ir_in ON ci.id = ir_in.target_item_id
GROUP BY ci.id, s.id;

-- Enable RLS on all new tables
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classified_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_similarities ENABLE ROW LEVEL SECURITY;

-- RLS Policies for submissions
CREATE POLICY "Users can view submissions in deliberations they participate in"
    ON public.submissions FOR SELECT
    USING (is_participant_in_deliberation(deliberation_id, auth.uid()));

CREATE POLICY "Users can create their own submissions"
    ON public.submissions FOR INSERT
    WITH CHECK (auth.uid() = user_id AND is_participant_in_deliberation(deliberation_id, auth.uid()));

CREATE POLICY "Users can update their own submissions"
    ON public.submissions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS Policies for classified_items
CREATE POLICY "Users can view classified items in deliberations they participate in"
    ON public.classified_items FOR SELECT
    USING (is_participant_in_deliberation(deliberation_id, auth.uid()));

CREATE POLICY "Users can create classified items from their submissions"
    ON public.classified_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.submissions 
            WHERE id = submission_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own classified items"
    ON public.classified_items FOR UPDATE
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- RLS Policies for keywords (public read, admin write)
CREATE POLICY "Anyone can view keywords"
    ON public.keywords FOR SELECT
    USING (true);

CREATE POLICY "System can create keywords"
    ON public.keywords FOR INSERT
    WITH CHECK (true);

-- RLS Policies for item_keywords
CREATE POLICY "Users can view item keywords for accessible items"
    ON public.item_keywords FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.classified_items ci
            WHERE ci.id = classified_item_id 
            AND is_participant_in_deliberation(ci.deliberation_id, auth.uid())
        )
    );

CREATE POLICY "Users can manage keywords for their items"
    ON public.item_keywords FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.classified_items ci
            WHERE ci.id = classified_item_id AND ci.created_by = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.classified_items ci
            WHERE ci.id = classified_item_id AND ci.created_by = auth.uid()
        )
    );

-- RLS Policies for item_relationships
CREATE POLICY "Users can view relationships for accessible items"
    ON public.item_relationships FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.classified_items ci1, public.classified_items ci2
            WHERE ci1.id = source_item_id AND ci2.id = target_item_id
            AND is_participant_in_deliberation(ci1.deliberation_id, auth.uid())
            AND is_participant_in_deliberation(ci2.deliberation_id, auth.uid())
        )
    );

CREATE POLICY "Users can create relationships between accessible items"
    ON public.item_relationships FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.classified_items ci1, public.classified_items ci2
            WHERE ci1.id = source_item_id AND ci2.id = target_item_id
            AND is_participant_in_deliberation(ci1.deliberation_id, auth.uid())
            AND is_participant_in_deliberation(ci2.deliberation_id, auth.uid())
        )
    );

-- RLS Policies for item_similarities
CREATE POLICY "Users can view similarities for accessible items"
    ON public.item_similarities FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.classified_items ci1, public.classified_items ci2
            WHERE ci1.id = item1_id AND ci2.id = item2_id
            AND is_participant_in_deliberation(ci1.deliberation_id, auth.uid())
            AND is_participant_in_deliberation(ci2.deliberation_id, auth.uid())
        )
    );

-- Create indexes for performance
CREATE INDEX idx_submissions_deliberation_user ON public.submissions(deliberation_id, user_id);
CREATE INDEX idx_submissions_status ON public.submissions(processing_status);
CREATE INDEX idx_classified_items_deliberation ON public.classified_items(deliberation_id);
CREATE INDEX idx_classified_items_type ON public.classified_items(item_type);
CREATE INDEX idx_classified_items_stance ON public.classified_items(stance_score);
CREATE INDEX idx_keywords_keyword ON public.keywords(keyword);
CREATE INDEX idx_item_keywords_item ON public.item_keywords(classified_item_id);
CREATE INDEX idx_item_relationships_source ON public.item_relationships(source_item_id);
CREATE INDEX idx_item_relationships_target ON public.item_relationships(target_item_id);
CREATE INDEX idx_item_relationships_type ON public.item_relationships(relationship_type);
CREATE INDEX idx_item_similarities_score ON public.item_similarities(similarity_score DESC);

-- Create triggers for updating timestamps
CREATE TRIGGER update_submissions_updated_at
    BEFORE UPDATE ON public.submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_classified_items_updated_at
    BEFORE UPDATE ON public.classified_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Function to increment keyword usage count
CREATE OR REPLACE FUNCTION public.increment_keyword_usage()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.keywords 
    SET usage_count = usage_count + 1 
    WHERE id = NEW.keyword_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER increment_keyword_usage_trigger
    AFTER INSERT ON public.item_keywords
    FOR EACH ROW
    EXECUTE FUNCTION public.increment_keyword_usage();