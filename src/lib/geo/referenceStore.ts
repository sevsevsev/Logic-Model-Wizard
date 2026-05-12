import { Pool } from "pg";

export interface SchoolReferenceInput {
  schoolKey: string;
  ulcsCode?: string;
  srcSchoolId?: string;
  schoolName: string;
  publicationName?: string;
  publicationNameAlpha?: string;
  abbreviatedName?: string;
  schoolLevel?: string;
  admissionType?: string;
  gradeSpan?: string;
  governance?: string;
  managementOrganization?: string;
  reportingCategory?: string;
  cityCouncilDistrict?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  learningNetwork?: string;
  gpsLocation?: string;
  aliases: Array<{ alias: string; aliasType: string }>;
}

export interface SchoolReferenceMatch {
  schoolKey: string;
  schoolName: string;
  city?: string;
  state?: string;
  zipCode?: string;
  cityCouncilDistrict?: string;
  learningNetwork?: string;
  matchedAliases: string[];
  confidence: number;
}

type AliasRow = {
  school_key: string;
  school_name: string;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  city_council_district: string | null;
  learning_network: string | null;
  alias: string;
  alias_normalized: string;
};

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;
let aliasCache: AliasRow[] | null = null;
let aliasCacheTimestamp = 0;
const ALIAS_CACHE_TTL_MS = 5 * 60 * 1000;

function getDatabaseUrl(): string | null {
  const value = process.env.DATABASE_URL?.trim();
  return value ? value : null;
}

function isPostgresEnabled(): boolean {
  return Boolean(getDatabaseUrl());
}

function getPool(): Pool {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 2,
    });
  }

  return pool;
}

export function normalizeLookupText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function ensureGeoReferenceSchema(): Promise<void> {
  if (!isPostgresEnabled()) return;

  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getPool();

      await db.query(`
        CREATE TABLE IF NOT EXISTS geo_school_references (
          school_key TEXT PRIMARY KEY,
          ulcs_code TEXT,
          src_school_id TEXT,
          school_name TEXT NOT NULL,
          publication_name TEXT,
          publication_name_alpha TEXT,
          abbreviated_name TEXT,
          school_level TEXT,
          admission_type TEXT,
          grade_span TEXT,
          governance TEXT,
          management_organization TEXT,
          reporting_category TEXT,
          city_council_district TEXT,
          street_address TEXT,
          city TEXT,
          state TEXT,
          zip_code TEXT,
          learning_network TEXT,
          gps_location TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS geo_school_aliases (
          school_key TEXT NOT NULL REFERENCES geo_school_references(school_key) ON DELETE CASCADE,
          alias TEXT NOT NULL,
          alias_type TEXT NOT NULL,
          alias_normalized TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (school_key, alias_normalized)
        );
      `);

      await db.query(
        "CREATE INDEX IF NOT EXISTS geo_school_aliases_lookup_idx ON geo_school_aliases (alias_normalized);"
      );
      await db.query(
        "CREATE INDEX IF NOT EXISTS geo_school_zip_idx ON geo_school_references (zip_code);"
      );
      await db.query(
        "CREATE INDEX IF NOT EXISTS geo_school_council_idx ON geo_school_references (city_council_district);"
      );
    })();
  }

  await schemaReady;
}

export async function upsertSchoolReference(ref: SchoolReferenceInput): Promise<void> {
  if (!isPostgresEnabled()) return;
  await ensureGeoReferenceSchema();

  const db = getPool();

  await db.query(
    `
      INSERT INTO geo_school_references (
        school_key,
        ulcs_code,
        src_school_id,
        school_name,
        publication_name,
        publication_name_alpha,
        abbreviated_name,
        school_level,
        admission_type,
        grade_span,
        governance,
        management_organization,
        reporting_category,
        city_council_district,
        street_address,
        city,
        state,
        zip_code,
        learning_network,
        gps_location,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW()
      )
      ON CONFLICT (school_key)
      DO UPDATE SET
        ulcs_code = EXCLUDED.ulcs_code,
        src_school_id = EXCLUDED.src_school_id,
        school_name = EXCLUDED.school_name,
        publication_name = EXCLUDED.publication_name,
        publication_name_alpha = EXCLUDED.publication_name_alpha,
        abbreviated_name = EXCLUDED.abbreviated_name,
        school_level = EXCLUDED.school_level,
        admission_type = EXCLUDED.admission_type,
        grade_span = EXCLUDED.grade_span,
        governance = EXCLUDED.governance,
        management_organization = EXCLUDED.management_organization,
        reporting_category = EXCLUDED.reporting_category,
        city_council_district = EXCLUDED.city_council_district,
        street_address = EXCLUDED.street_address,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        zip_code = EXCLUDED.zip_code,
        learning_network = EXCLUDED.learning_network,
        gps_location = EXCLUDED.gps_location,
        updated_at = NOW()
    `,
    [
      ref.schoolKey,
      ref.ulcsCode ?? null,
      ref.srcSchoolId ?? null,
      ref.schoolName,
      ref.publicationName ?? null,
      ref.publicationNameAlpha ?? null,
      ref.abbreviatedName ?? null,
      ref.schoolLevel ?? null,
      ref.admissionType ?? null,
      ref.gradeSpan ?? null,
      ref.governance ?? null,
      ref.managementOrganization ?? null,
      ref.reportingCategory ?? null,
      ref.cityCouncilDistrict ?? null,
      ref.streetAddress ?? null,
      ref.city ?? null,
      ref.state ?? null,
      ref.zipCode ?? null,
      ref.learningNetwork ?? null,
      ref.gpsLocation ?? null,
    ]
  );

  await db.query("DELETE FROM geo_school_aliases WHERE school_key = $1", [ref.schoolKey]);

  for (const aliasEntry of ref.aliases) {
    const alias = aliasEntry.alias.trim();
    if (!alias) continue;
    const aliasNormalized = normalizeLookupText(alias);
    if (!aliasNormalized) continue;

    await db.query(
      `
        INSERT INTO geo_school_aliases (school_key, alias, alias_type, alias_normalized, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (school_key, alias_normalized)
        DO UPDATE SET
          alias = EXCLUDED.alias,
          alias_type = EXCLUDED.alias_type,
          updated_at = NOW()
      `,
      [ref.schoolKey, alias, aliasEntry.aliasType, aliasNormalized]
    );
  }

  aliasCache = null;
}

async function loadAliasRows(): Promise<AliasRow[]> {
  if (!isPostgresEnabled()) return [];
  await ensureGeoReferenceSchema();

  const now = Date.now();
  if (aliasCache && now - aliasCacheTimestamp < ALIAS_CACHE_TTL_MS) {
    return aliasCache;
  }

  const db = getPool();
  const result = await db.query<AliasRow>(
    `
      SELECT
        a.school_key,
        s.school_name,
        s.city,
        s.state,
        s.zip_code,
        s.city_council_district,
        s.learning_network,
        a.alias,
        a.alias_normalized
      FROM geo_school_aliases a
      JOIN geo_school_references s ON s.school_key = a.school_key
    `
  );

  aliasCache = result.rows;
  aliasCacheTimestamp = now;
  return aliasCache;
}

export async function findSchoolReferenceMentions(
  text: string,
  maxMatches = 5
): Promise<SchoolReferenceMatch[]> {
  if (!isPostgresEnabled()) return [];
  const messageNormalized = ` ${normalizeLookupText(text)} `;
  if (!messageNormalized.trim()) return [];

  const aliases = await loadAliasRows();
  if (aliases.length === 0) return [];

  const bySchool = new Map<
    string,
    {
      schoolName: string;
      city?: string;
      state?: string;
      zipCode?: string;
      cityCouncilDistrict?: string;
      learningNetwork?: string;
      matchedAliases: Set<string>;
      score: number;
    }
  >();

  for (const aliasRow of aliases) {
    const alias = aliasRow.alias_normalized;
    if (!alias || alias.length < 3) continue;
    const regex = new RegExp(`(^|\\s)${escapeRegExp(alias)}(?=\\s|$)`, "i");
    if (!regex.test(messageNormalized)) continue;

    const existing = bySchool.get(aliasRow.school_key) ?? {
      schoolName: aliasRow.school_name,
      city: aliasRow.city ?? undefined,
      state: aliasRow.state ?? undefined,
      zipCode: aliasRow.zip_code ?? undefined,
      cityCouncilDistrict: aliasRow.city_council_district ?? undefined,
      learningNetwork: aliasRow.learning_network ?? undefined,
      matchedAliases: new Set<string>(),
      score: 0,
    };

    existing.matchedAliases.add(aliasRow.alias);
    existing.score += 10 + alias.length;
    bySchool.set(aliasRow.school_key, existing);
  }

  const matches = [...bySchool.entries()]
    .map(([schoolKey, value]) => {
      const aliasCount = value.matchedAliases.size;
      // Exact alias boundary matches are high-trust; confidence should be high enough
      // to auto-apply when there is a clear single winner.
      const confidence = Math.min(1, 0.65 + aliasCount * 0.2 + Math.min(value.score, 30) / 150);
      return {
        schoolKey,
        schoolName: value.schoolName,
        city: value.city,
        state: value.state,
        zipCode: value.zipCode,
        cityCouncilDistrict: value.cityCouncilDistrict,
        learningNetwork: value.learningNetwork,
        matchedAliases: [...value.matchedAliases],
        confidence,
        score: value.score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxMatches)
    .map(({ score, ...rest }) => rest);

  return matches;
}

export function formatSchoolReferenceHints(matches: SchoolReferenceMatch[]): string {
  if (matches.length === 0) return "";

  return matches
    .map((match) => {
      const parts = [
        `${match.schoolName}`,
        match.zipCode ? `zip ${match.zipCode}` : "",
        match.cityCouncilDistrict ? `district ${match.cityCouncilDistrict}` : "",
        match.learningNetwork ? `${match.learningNetwork}` : "",
        `aliases matched: ${match.matchedAliases.join(", ")}`,
        `confidence ${match.confidence.toFixed(2)}`,
      ].filter(Boolean);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}
