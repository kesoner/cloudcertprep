/**
 * Typed view of the build-time community stats snapshot.
 *
 * scripts/generate-stats-snapshot.mjs rewrites the JSON at prebuild. When the
 * live RPC returns no cert rows (a fresh Supabase project with zero attempts)
 * it writes `"certs": []`, and TypeScript infers that as `never[]`, which breaks
 * every `.certCode` / `.attemptsCompleted` access in `astro check`. Importing
 * through this module pins the shape regardless of the JSON contents.
 */
import raw from './generated/stats-snapshot.json'

export interface StatsSnapshotFigures {
  passRatePercent: number
  averageScaledScore: number
  attemptsCompleted: number
}

export interface StatsSnapshotCert extends StatsSnapshotFigures {
  certCode: string
}

export interface StatsSnapshot {
  _comment?: string
  generatedAt: string
  source?: string
  overall: StatsSnapshotFigures
  certs: StatsSnapshotCert[]
}

export const statsSnapshot: StatsSnapshot = raw
