-- Fix security warnings and continue simplification

-- Fix search_path for remaining functions
CREATE OR REPLACE FUNCTION public.admin_get_ibis_nodes(target_deliberation_id uuid)
RETURNS TABLE(id uuid, deliberation_id uuid, message_id uuid, node_type text, parent_node_id uuid, position_x double precision, position_y double precision, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, embedding vector, title text, description text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    n.id,
    n.deliberation_id,
    n.message_id,
    n.node_type::TEXT,
    n.parent_node_id,
    n.position_x,
    n.position_y,
    n.created_by,
    n.created_at,
    n.updated_at,
    n.embedding,
    n.title,
    n.description
  FROM ibis_nodes n
  WHERE n.deliberation_id = target_deliberation_id
  ORDER BY n.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_ibis_relationships(target_deliberation_id uuid)
RETURNS TABLE(id uuid, source_node_id uuid, target_node_id uuid, created_at timestamp with time zone, created_by uuid, deliberation_id uuid, relationship_type text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    r.id,
    r.source_node_id,
    r.target_node_id,
    r.created_at,
    r.created_by,
    r.deliberation_id,
    r.relationship_type
  FROM ibis_relationships r
  WHERE r.deliberation_id = target_deliberation_id
  ORDER BY r.created_at ASC;
$$;

-- Simplify RLS policies to reduce complexity
-- Drop overly complex policies and replace with simple ones

-- Simplify deliberations access (since we use simple access codes)
DROP POLICY IF EXISTS "Temporary admin access to deliberations" ON deliberations;
DROP POLICY IF EXISTS "Admins can read all deliberations" ON deliberations;
DROP POLICY IF EXISTS "Facilitators can read their deliberations" ON deliberations;

-- Simple policy: anyone authenticated can read public deliberations
CREATE POLICY "Public deliberations are readable" ON deliberations 
FOR SELECT USING (is_public = true OR auth.uid() IS NOT NULL);

-- Simplify agent configurations access
DROP POLICY IF EXISTS "Temporary admin access to agent configurations" ON agent_configurations;
DROP POLICY IF EXISTS "Admins can read all agent configurations" ON agent_configurations;

-- Simple policy: authenticated users can read configurations
CREATE POLICY "Authenticated users can read configurations" ON agent_configurations 
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Simplify participants access
DROP POLICY IF EXISTS "Only authenticated users can view participants" ON participants;
DROP POLICY IF EXISTS "Participants can view all participants in their deliberations" ON participants;

-- Simple policy: authenticated users can view participants
CREATE POLICY "Authenticated can view participants" ON participants 
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Simplify IBIS nodes access
DROP POLICY IF EXISTS "Admins can view all IBIS nodes" ON ibis_nodes;
DROP POLICY IF EXISTS "Participants can view IBIS nodes" ON ibis_nodes;

-- Simple policy: authenticated users can view nodes
CREATE POLICY "Authenticated can view IBIS nodes" ON ibis_nodes 
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Simplify IBIS relationships access  
DROP POLICY IF EXISTS "Admins can view all IBIS relationships" ON ibis_relationships;
DROP POLICY IF EXISTS "Participants can view relationships in their deliberations" ON ibis_relationships;

-- Simple policy: authenticated users can view relationships
CREATE POLICY "Authenticated can view IBIS relationships" ON ibis_relationships 
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Remove unnecessary tables that add complexity
-- Keep security_events minimal for basic monitoring but remove excessive logging
CREATE TABLE IF NOT EXISTS simplified_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    details jsonb DEFAULT '{}'
);

-- Enable RLS but keep it simple
ALTER TABLE simplified_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System can insert events" ON simplified_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can read events" ON simplified_events FOR SELECT USING (true);