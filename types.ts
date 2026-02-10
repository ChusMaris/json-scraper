export enum ScrapeStatus {
  IDLE = 'IDLE',
  QUEUED = 'QUEUED',
  FETCHING_HTML = 'FETCHING_HTML',
  DOWNLOADING_JSON = 'DOWNLOADING_JSON',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface MatchJob {
  id: string; // The mongo-like ID (e.g., 696b6acdd2a7ac0001714803)
  url: string; // The full stat page URL
  status: ScrapeStatus;
  statsFileDownloaded: boolean;
  movesFileDownloaded: boolean;
  error?: string;
  matchTitle?: string;
}

export interface StatsResponse {
  // Loose typing as we just want to save the JSON
  [key: string]: any;
}

export const BASE_URL = "https://www.basquetcatala.cat";

// Helper to extract ID from URL
export const extractMatchId = (url: string): string | null => {
  // Looks for the last segment of the URL which is usually the ID
  const parts = url.split('/').filter(p => p.length > 0);
  const potentialId = parts[parts.length - 1];
  // Basic validation: Hex string of length 24 is typical for Mongo ObjectIDs, which this site seems to use
  if (potentialId && /^[0-9a-fA-F]{24}$/.test(potentialId)) {
    return potentialId;
  }
  return null;
};
