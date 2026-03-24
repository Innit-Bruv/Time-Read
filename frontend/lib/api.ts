/**
 * Backend API client — proxies all requests through Next.js API routes.
 * The Next.js routes add the INTERNAL_API_SECRET server-side.
 * This file must never contain secrets or hardcoded mock data.
 */

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = path;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...fetchOptions.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

// --- Ingest ---

export interface IngestRequest {
  url: string;
  title?: string;
  source_hint?: string;
}

export interface IngestResponse {
  content_id: string;
  status: string;
  message: string;
}

export async function ingestContent(req: IngestRequest): Promise<IngestResponse> {
  return apiFetch("/api/ingest", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getContentStatus(contentId: string) {
  return apiFetch<{
    content_id: string;
    status: string;
    title: string | null;
    estimated_time: number | null;
    error_message: string | null;
  }>(`/api/content/${contentId}/status`);
}

// --- Recommend ---

export interface RecommendRequest {
  query?: string;
  time_budget?: number;
  topic?: string;
  content_type?: string;
}

export interface RecommendItem {
  content_id: string;
  segment_id: string;
  title: string;
  source: string | null;
  author: string | null;
  content_type: string;
  estimated_time: number;
  segment_index: number;
  total_segments: number;
  is_continuation: boolean;
  paragraph_start?: number;    // paragraph index to start reading from (undefined = 0)
  paragraph_end?: number | null; // paragraph index to stop at (exclusive); null/undefined = full segment
}

export interface RecommendResponse {
  session_id: string;
  total_estimated_time: number;
  items: RecommendItem[];
}

export async function getRecommendations(req: RecommendRequest): Promise<RecommendResponse> {
  return apiFetch("/api/recommend", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// --- Segment Reading ---

export interface SegmentResponse {
  segment_id: string;
  content_id: string;
  title: string;
  author: string | null;
  source: string | null;
  url: string;
  content_type: string;
  segment_index: number;
  total_segments: number;
  estimated_time: number;
  text: string;
  word_count: number;
  cover_image: string | null;
  publish_date: string | null;
}

export async function getSegment(contentId: string, segmentId: string): Promise<SegmentResponse> {
  return apiFetch(`/api/content/${contentId}/segment/${segmentId}`);
}

export async function getContentSegments(contentId: string): Promise<RecommendResponse> {
  return apiFetch(`/api/content/${contentId}/segments`);
}

// --- Session Tracking ---

export interface TrackRequest {
  segment_id: string;
  time_spent: number;
  words_read: number;
  completed: boolean;
  paragraph_end?: number | null; // paragraph index user stopped at (for partial reads)
}

export async function trackReading(req: TrackRequest): Promise<{ ok: boolean }> {
  return apiFetch("/api/session/track", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// --- Manual Session ---

export interface ManualSessionRequest {
  content_ids: string[];
  time_budget: number; // minutes
}

export async function createManualSession(req: ManualSessionRequest): Promise<RecommendResponse> {
  return apiFetch("/api/session/manual", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// --- Archive ---

export interface ArchiveItem {
  content_id: string;
  title: string;
  source: string | null;
  content_type: string;
  estimated_time: number;
  status: string;
  created_at: string;
  completion_percent: number;
}

export interface ArchiveResponse {
  items: ArchiveItem[];
  total: number;
  page: number;
  limit: number;
}

export async function getArchive(params?: {
  search?: string;
  content_type?: string;
  sort?: string;
  page?: number;
  limit?: number;
}): Promise<ArchiveResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.search) queryParams.search = params.search;
  if (params?.content_type) queryParams.content_type = params.content_type;
  if (params?.sort) queryParams.sort = params.sort;
  if (params?.page) queryParams.page = String(params.page);
  if (params?.limit) queryParams.limit = String(params.limit);

  return apiFetch("/api/archive", { params: queryParams });
}
