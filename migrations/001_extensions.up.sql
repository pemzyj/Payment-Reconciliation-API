-- Extensions live in their own migration since they sometimes need superuser
-- privileges depending on hosting (RDS, Supabase, etc.) and should fail
-- independently of table creation.

CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- trigram similarity for fuzzy name matching
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch; -- levenshtein()
