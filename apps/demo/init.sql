CREATE TABLE species (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  severity numeric NOT NULL DEFAULT 1
);

CREATE TABLE pest_sightings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  species_id uuid NOT NULL REFERENCES species (id),
  location text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO species (id, name, severity) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Ant', 2),
  ('22222222-2222-2222-2222-222222222222', 'Wasp', 4);

INSERT INTO pest_sightings (company_id, species_id, location, created_at) VALUES
  ('acme', '11111111-1111-1111-1111-111111111111', 'Warehouse A', '2026-01-15T10:00:00Z'),
  ('acme', '11111111-1111-1111-1111-111111111111', 'Warehouse A', '2026-02-01T12:00:00Z'),
  ('acme', '22222222-2222-2222-2222-222222222222', 'Dock B', '2026-02-10T08:00:00Z');
