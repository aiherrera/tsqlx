export const FX_PEST_REPORT = `
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
`;

export const FX_MULTI_QUERY = `
@driver postgres

@input
  companyId string

@query getUsers
  SELECT id, email FROM users WHERE company_id = {companyId}

@output
  id    string
  email string

@query getAdmins
  SELECT id, email FROM users WHERE company_id = {companyId} AND role = 'admin'

@output
  id    string
  email string
`;

export const FX_NO_PARAMS = `
@driver postgres

@query getAllSpecies
  SELECT id, name FROM species ORDER BY name ASC

@output
  id   string
  name string
`;

export const FX_TRANSACTION = `
@driver postgres

@input
  userId string
  amount number

@transaction
  @query debitAccount
    UPDATE accounts SET balance = balance - {amount}
    WHERE user_id = {userId} RETURNING balance

  @output
    balance number

  @query logTransaction
    INSERT INTO tx_log (user_id, amount, created_at)
    VALUES ({userId}, {amount}, NOW()) RETURNING id

  @output
    id string
`;

export const FX_ALL_TARGETS = `
@driver postgres

@input
  userId string

@query findUser
  SELECT id, email, created_at FROM users WHERE id = {userId}

@output
  id        string
  email     string
  createdAt Date
`;

export const FX_INVALID = `
@driver postgres

@input
  userId string

@query badQuery
  SELECT * FROM users WHERE id = {undeclared}

@output
  id string
`;
