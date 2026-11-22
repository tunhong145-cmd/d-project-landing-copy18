// Public L-only integration. No other landing page scripts or configuration are imported.
const rest = 'https://sfiflidnsrdotoidvcmh.supabase.co/rest/v1';
const browserKey = 'sb_publishable_F9QbR2X9iJp62lf3aJnh8w_NXlYl3aD';
const site = 'copy18';
const variant = 'L';
const businessHeaders = { apikey: browserKey, Authorization: `Bearer ${browserKey}` };

function request(resource, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(`${rest}/${resource}`, {
    cache: 'no-store',
    ...options,
    headers: { ...businessHeaders, ...options.headers },
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok) {
      const failure = new Error('Request rejected');
      failure.status = response.status;
      throw failure;
    }
    return options.method === 'POST' ? null : response.json();
  }).finally(() => clearTimeout(timer));
}

function post(resource, body, { keepalive = false, timeout = 15000 } = {}) {
  return request(`rpc/${resource}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
    keepalive,
  }, timeout);
}

function lineAddress(value) {
  try {
    const url = new URL(value);
    const valid = url.protocol === 'https:' && ['line.me', 'lin.ee'].includes(url.hostname)
      && !url.username && !url.password && !url.port && url.pathname !== '/';
    return valid ? url.href : '';
  } catch { return ''; }
}

async function configuredPixels() {
  const query = new URLSearchParams({ site_id: `eq.${site}`, variant: `eq.${variant}`, select: 'variant,pixel_ids' });
  const rows = await request(`repository_fb_pixels?${query}`);
  const entries = Array.isArray(rows) ? rows.find((row) => row?.variant === variant)?.pixel_ids : null;
  if (!Array.isArray(entries)) return [];
  const ids = entries.filter((record) => record && record.enabled !== false).map((record) => String(record.id ?? '').trim());
  return [...new Set(ids.filter((id) => /^\d{8,20}$/.test(id)))].slice(0, 5);
}

function facebookClient() {
  if (typeof globalThis.fbq === 'function') return globalThis.fbq;
  function pixel(...command) {
    if (pixel.callMethod) pixel.callMethod(...command);
    else pixel.queue.push(command);
  }
  Object.assign(pixel, { push: pixel, queue: [], loaded: true, version: '2.0' });
  globalThis.fbq = pixel;
  globalThis._fbq ||= pixel;
  const sdk = document.createElement('script');
  sdk.async = true;
  sdk.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.append(sdk);
  return pixel;
}

function analytics() {
  const ready = configuredPixels().then((ids) => {
    if (!ids.length) return [];
    const pixel = facebookClient();
    return ids.flatMap((id) => {
      try {
        pixel('init', id);
        pixel('trackSingle', id, 'PageView');
        return [[id, pixel]];
      } catch { return []; }
    });
  }).catch(() => []);
  let conversionScheduled = false;
  return () => {
    if (conversionScheduled) return;
    conversionScheduled = true;
    void ready.then((destinations) => {
      const name = 'D項目L版本';
      for (const [id, pixel] of destinations) {
        try { pixel('trackSingle', id, 'CompleteRegistration', { content_name: name, status: 'submitted' }); } catch { /* not a save failure */ }
        try { pixel('trackSingle', id, 'Lead', { content_name: name, content_category: '貸款申請', value: 0, currency: 'TWD' }); } catch { /* not a save failure */ }
      }
    });
  };
}

export function connect() {
  // Local copies are inert even when fully filled out. No real form, LINE or Meta requests.
  const preview = location.protocol !== 'https:' || /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(location.hostname);
  if (preview) {
    const scenario = new URLSearchParams(location.search).get('test');
    let attempts = 0;
    return {
      preview,
      line: async () => scenario === 'line-unavailable' ? '' : '#line-preview',
      submit: async () => {
        if (++attempts === 1 && scenario === 'retry') throw Object.assign(new Error('模擬送件失敗'), { status: 503 });
      },
      clicked: () => {},
      converted: () => {},
    };
  }
  return {
    preview,
    async line() {
      const config = await request('rpc/get_x_loan_k_config');
      return lineAddress(config?.line_url);
    },
    submit(payload) { return post('submit_x_loan_l_lead', { payload }); },
    clicked(id) { void post('mark_x_loan_line_clicked', { lead_id: id }, { keepalive: true, timeout: 8000 }).catch(() => {}); },
    converted: analytics(),
  };
}
