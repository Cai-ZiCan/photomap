import type {
  AdminConfig, AdminState, AiExtractResult, ImportResult, Overview, SpotDetail, Theme,
} from './types';

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `请求失败（HTTP ${res.status}）`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch { /* 非 JSON 响应 */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

const get = <T>(url: string) => fetch(url).then((r) => handle<T>(r));
const post = <T>(url: string, body?: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => handle<T>(r));
const put = <T>(url: string, body: unknown) =>
  fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<T>(r));
const del = <T>(url: string) => fetch(url, { method: 'DELETE' }).then((r) => handle<T>(r));
const postForm = <T>(url: string, form: FormData) =>
  fetch(url, { method: 'POST', body: form }).then((r) => handle<T>(r));

function qs(url: string, params?: Record<string, string | undefined>) {
  if (!params) return url;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `${url}?${s}` : url;
}

export const api = {
  site: () => get<{ name: string; description: string }>('/api/site'),
  themes: () => get<Theme[]>('/api/themes'),
  spots: () => get<{ features: { properties: SpotListItem }[] }>('/api/spots'),
  spot: (id: number) => get<SpotDetail>(`/api/spots/${id}`),
  submit: (form: FormData) => postForm<{ ok: boolean; message: string }>('/api/submissions', form),

  admin: {
    state: () => get<AdminState>('/api/admin/state'),
    setup: (password: string) => post<{ ok: boolean }>('/api/admin/setup', { password }),
    login: (password: string) => post<{ ok: boolean }>('/api/admin/login', { password }),
    logout: () => post<{ ok: boolean }>('/api/admin/logout'),
    config: () => get<AdminConfig>('/api/admin/config'),
    overview: () => get<Overview>('/api/admin/overview'),
    spots: (params?: { status?: string; kw?: string }) => get<SpotDetail[]>(qs('/api/admin/spots', params)),
    create: (b: Record<string, unknown>) => post<SpotDetail>('/api/admin/spots', b),
    update: (id: number, b: Record<string, unknown>) => put<SpotDetail>(`/api/admin/spots/${id}`, b),
    remove: (id: number) => del<{ ok: boolean }>(`/api/admin/spots/${id}`),
    addPhotos: (id: number, form: FormData) => postForm<SpotDetail>(`/api/admin/spots/${id}/photos`, form),
    updatePhoto: (id: number, b: { caption?: string; credit?: string; sort?: number }) =>
      put<SpotDetail>(`/api/admin/photos/${id}`, b),
    deletePhoto: (id: number) => del<SpotDetail>(`/api/admin/photos/${id}`),
    setFeatured: (id: number, photoId: number | null) =>
      post<SpotDetail>(`/api/admin/spots/${id}/featured`, { photoId }),
    setStatus: (id: number, status: string, review_note?: string) =>
      post<SpotDetail>(`/api/admin/spots/${id}/status`, { status, review_note }),
    createTheme: (b: Record<string, unknown>) => post<Theme[]>('/api/admin/themes', b),
    updateTheme: (id: number, b: Record<string, unknown>) => put<Theme[]>(`/api/admin/themes/${id}`, b),
    deleteTheme: (id: number) => del<Theme[]>(`/api/admin/themes/${id}`),
    aiExtract: (b: { url?: string; text?: string }) => post<AiExtractResult>('/api/admin/ai-extract', b),
    import: (b: Record<string, unknown>) => post<ImportResult>('/api/admin/import', b),
    clearSeed: () => post<{ ok: boolean; removed: number }>('/api/admin/clear-seed'),
    reseed: () => post<{ ok: boolean }>('/api/admin/reseed'),
    changePassword: (oldPassword: string, newPassword: string) =>
      post<{ ok: boolean }>('/api/admin/password', { oldPassword, newPassword }),
  },
};
