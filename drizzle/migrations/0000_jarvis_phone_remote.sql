CREATE TABLE public.jarvis_remote_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 desktop_hash text NOT NULL UNIQUE,
 phone_hash text NOT NULL UNIQUE,
 name text NOT NULL DEFAULT 'Main PC',
 channels jsonb NOT NULL DEFAULT '[]'::jsonb,
 last_seen timestamptz,
 revoked boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.jarvis_remote_devices TO service_role;
ALTER TABLE public.jarvis_remote_devices ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.jarvis_remote_commands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 device_id uuid NOT NULL REFERENCES public.jarvis_remote_devices(id) ON DELETE CASCADE,
 text text NOT NULL,
 channel text,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','choose')),
 result text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.jarvis_remote_commands TO service_role;
ALTER TABLE public.jarvis_remote_commands ENABLE ROW LEVEL SECURITY;
CREATE INDEX jarvis_remote_pending ON public.jarvis_remote_commands(device_id,status,created_at);
COMMENT ON TABLE public.jarvis_remote_devices IS 'Capability-authenticated phone pairing; no direct browser access. Only server handlers verify hashed per-device tokens before privileged access.';
COMMENT ON TABLE public.jarvis_remote_commands IS 'Discord-only remote jobs; access restricted to verified per-device capabilities in server handlers.';