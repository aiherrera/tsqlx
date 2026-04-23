export const FIXTURE_FULL = `
@driver  supabase
@table   pest_sightings
@version 1

@input
  companyId  string
  speciesId? string
  from       Date
  to         Date
  limit?     number = 100

@query getPestReport
  SELECT
    s.species_name,
    COUNT(*) AS total,
    AVG(s.severity) AS avg_severity,
    ps.location
  FROM pest_sightings ps
  JOIN species s ON s.id = ps.species_id
  WHERE ps.company_id = {companyId}
    AND ps.created_at BETWEEN {from} AND {to}
    [IF speciesId]
    AND ps.species_id = {speciesId}
    [/IF]
  GROUP BY s.species_name, ps.location
  ORDER BY total DESC
  LIMIT {limit}

@output
  speciesName  string
  total        number
  avgSeverity  number
  location     string

@query getRecentSightings
  SELECT id, location, severity, created_at
  FROM pest_sightings
  WHERE company_id = {companyId}
  ORDER BY created_at DESC
  LIMIT 10

@output
  id         string
  location   string
  severity   number
  createdAt  Date
`;

export const FIXTURE_MINIMAL = `
@driver postgres

@input
  userId string

@query getUser
  SELECT id, email FROM users WHERE id = {userId}

@output
  id    string
  email string
`;

export const FIXTURE_TRANSACTION = `
@driver postgres

@input
  userId  string
  amount  number

@transaction
  @query debitAccount
    UPDATE accounts SET balance = balance - {amount}
    WHERE user_id = {userId}

  @output
    affected number

  @query logTransaction
    INSERT INTO tx_log (user_id, amount, created_at)
    VALUES ({userId}, {amount}, NOW())

  @output
    id string
`;

export const FIXTURE_UNDECLARED_SLOT = `
@driver postgres

@input
  userId string

@query badQuery
  SELECT * FROM users WHERE id = {undeclaredParam}

@output
  id string
`;

export const FIXTURE_IF_ON_REQUIRED = `
@driver postgres

@input
  userId string

@query badIf
  SELECT * FROM users WHERE id = {userId}
  [IF userId]
  AND active = true
  [/IF]

@output
  id string
`;

export const FIXTURE_NO_DRIVER = `
@input
  userId string

@query getUser
  SELECT id FROM users WHERE id = {userId}

@output
  id string
`;

export const FIXTURE_WITH_COMMENT = `
-- This is a file comment
@driver postgres

@input
  -- inline comment between params
  userId string

@query getUser
  -- SQL comment inside body
  SELECT id FROM users WHERE id = {userId}

@output
  id string
`;
