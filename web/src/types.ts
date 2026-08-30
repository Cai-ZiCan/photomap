export interface Theme {
  id: number;
  slug: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  sort: number;
}

export interface SpotTheme {
  slug: string;
  name: string;
  color: string;
  icon: string;
}

export interface SpotListItem {
  id: number;
  name: string;
  lng: number;
  lat: number;
  region: string;
  address: string;
  months: number[];
  themes: SpotTheme[];
  cover: string | null;
  coverThumb: string | null;
}

export interface SpotPhoto {
  id: number;
  path: string;
  thumb: string;
  caption: string;
  credit: string;
}

export interface SpotDetail extends SpotListItem {
  description: string;
  tips: string;
  status: string;
  source: string;
  source_url: string;
  source_note: string;
  submitter_name: string;
  submitter_contact: string;
  review_note: string;
  featured_photo_id: number | null;
  seed: number;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  photos: SpotPhoto[];
}

export interface AdminState {
  initialized: boolean;
  authenticated: boolean;
}

export interface AdminConfig {
  site: { name: string; description: string };
  ai: { enabled: boolean; baseUrl: string; textModel: string; visionModel: string };
  upload: { maxMb: number; maxFiles: number };
}

export interface Overview {
  published: number;
  pending: number;
  rejected: number;
  archived: number;
  themes: number;
  seedSpots: number;
}

export interface AiExtractResult {
  draft: AiDraft;
  title: string;
  images: string[];
}

export interface AiDraft {
  name: string;
  description: string;
  address: string;
  region: string;
  themes: string[];
  months: number[];
  tips: string;
  source_url?: string;
}

export interface ImportResult {
  ok: boolean;
  id: number;
  imageErrors: string[];
  spot: SpotDetail;
}
