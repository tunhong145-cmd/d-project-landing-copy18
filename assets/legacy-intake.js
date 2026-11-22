// Version-specific service contracts; no UI, copied configuration, or M dependency.
const REST = 'https://sfiflidnsrdotoidvcmh.supabase.co/rest/v1';
const PUBLIC_KEY = 'sb_publishable_F9QbR2X9iJp62lf3aJnh8w_NXlYl3aD';
const SITE = 'copy18';
const SHORT_BANDS = ['10萬-20萬', '20萬-30萬', '30萬-50萬', '50萬-100萬'];
const STANDARD_BANDS = ['5萬-10萬', '10萬-30萬', '30萬-50萬', '50萬以上'];
const contracts = {
  C: { line: 'line_url', oldForm: true },
  F: { line: 'fg_line_url', oldForm: true },
  G: { line: 'fg_line_url' },
  I: { line: 'e_line_url' },
  J: { line: 'line_url', submit: 'submit_x_loan_j_lead' },
  K: { submit: 'submit_x_loan_k_lead', requireLine: true },
};
const standardMark = 'mark_line_clicked';
const secondaryMark = 'mark_x_loan_line_clicked';
const legacyLine = 'https://lin.ee/591VM3X';
const kCampaign = '2026安心周轉專案';
const kCategory = '貸款引流';

function failure(status, code) {
  return Object.assign(new Error(code), { status, code });
}

function request(path, { json, keepalive = false, timeout = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const writing = json !== undefined;
  return fetch(`${REST}/${path}`, {
    method: writing ? 'POST' : 'GET',
    cache: 'no-store',
    credentials: 'omit',
    headers: {
      apikey: PUBLIC_KEY,
      Authorization: `Bearer ${PUBLIC_KEY}`,
      ...(writing && { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    },
    ...(writing && { body: JSON.stringify(json), keepalive }),
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok) {
      const error = failure(response.status, 'REQUEST_FAILED');
      // Only schema-mismatch responses can trigger the legacy optional-column retry.
      if (response.status === 400) {
        try {
          const detail = await response.json();
          if (detail?.code === 'PGRST204' || detail?.code === '42703') {
            error.missingColumn = String(detail.message || '');
          }
        } catch { /* Non-JSON errors retain status and do not retry. */ }
      }
      throw error;
    }
    return writing ? undefined : response.json();
  }).finally(() => clearTimeout(timer));
}

function safeLine(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return url.protocol === 'https:' && ['line.me', 'lin.ee'].includes(url.hostname) && url.pathname !== '/'
      && !url.username && !url.password && !url.port ? url.href : '';
  } catch { return ''; }
}

function readLine(contract) {
  if (contract.requireLine) {
    // The K resource is shared for LINE only; never interpret the returned Pixel fields.
    return request('rpc/get_x_loan_k_config').then((config) => safeLine(config?.line_url)).catch(() => '');
  }
  const columns = [...new Set([contract.line, 'line_url', 'line_id'])].join(',');
  const query = new URLSearchParams({ id: 'eq.1', select: columns });
  const fallback = contract.oldForm ? legacyLine : '';
  return request(`site_settings?${query}`).then((rows) => {
    const row = Array.isArray(rows) ? rows[0] : null;
    return safeLine(row?.[contract.line]) || safeLine(row?.line_url) || fallback;
  }).catch(() => fallback);
}

function trafficForK(sourceUrl) {
  let params;
  try { params = new URL(sourceUrl).searchParams; }
  catch { params = new URLSearchParams(location.search); }
  const hint = (params.get('utm_source') || params.get('source') || '').toLowerCase();
  const facebook = params.get('fbclid') || /facebook|meta|(^|[^a-z])fb([^a-z]|$)/.test(hint);
  const tiktok = params.get('ttclid') || /tiktok|tik_tok|(^|[^a-z])tk([^a-z]|$)/.test(hint);
  const source = facebook ? 'FB' : tiktok ? 'TikTok' : '';
  try {
    if (source) localStorage.setItem('traffic_source_x_k', JSON.stringify({ source, saved_at: Date.now() }));
    else {
      const saved = JSON.parse(localStorage.getItem('traffic_source_x_k') || 'null');
      const age = Date.now() - saved?.saved_at;
      if (age >= 0 && age < 86400000 && ['FB', 'TikTok'].includes(saved.source)) return saved.source;
    }
  } catch { /* Storage does not gate intake. */ }
  return source || null;
}

function commonPayload(input, contract, version, sourceForK) {
  const name = String(input.name ?? '').trim();
  const phone = String(input.phone ?? '').trim();
  const age = String(input.age ?? '').trim();
  const id = String(input.id ?? '');
  const amount = input.q3_amount_needed;
  const lowerAge = contract.oldForm ? 1 : 18;
  const upperAge = contract.oldForm ? 120 : 100;
  if (!name || !phone || !/^\d{1,3}$/.test(age) || Number(age) < lowerAge || Number(age) > upperAge ||
      !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id) ||
      !['非警示戶', '否'].includes(input.q2_bank_status) ||
      !(contract.oldForm ? SHORT_BANDS : STANDARD_BANDS).includes(amount)) {
    throw failure(400, 'INVALID_LEAD');
  }
  const source = String(input.source_url || location.href);
  if (contract.requireLine) {
    return {
      id, name, phone, age: Number(age), q2_bank_status: '否', q3_amount_needed: amount,
      project_code: 'X貸款', landing_version: 'K版本', source_url: source,
      traffic_source: sourceForK, user_agent: input.user_agent || navigator.userAgent,
    };
  }
  return {
    id, name, phone, age, city: '', id_number: '', line_id: '', q1_existing_loan: '',
    q2_bank_status: '非警示戶', q3_amount_needed: amount, q4_foreign_currency_account: '',
    source_url: source, traffic_source: input.traffic_source || null, user_agent: input.user_agent || navigator.userAgent,
    ...(input.ip_address !== undefined && { ip_address: input.ip_address }),
    device_type: input.device_type || '', browser_name: input.browser_name || '',
    business_type: 'loan', landing_variant: version,
    ...(contract.oldForm ? {} : { line_clicked: false }),
  };
}

async function saveLead(contract, data) {
  const path = contract.submit ? `rpc/${contract.submit}` : 'leads';
  const optionalColumns = ['traffic_source', 'ip_address', 'device_type', 'browser_name'];
  let payload = data;
  for (;;) {
    try {
      await request(path, { json: contract.submit ? { payload } : payload, timeout: 15000 });
      return;
    } catch (error) {
      const missing = !contract.submit && error.missingColumn && optionalColumns.filter(
        (column) => Object.prototype.hasOwnProperty.call(payload, column) && error.missingColumn.includes(column),
      );
      if (!missing?.length) throw error;
      payload = { ...payload };
      for (const column of missing) delete payload[column];
    }
  }
}

async function repositoryPixels(version) {
  const query = new URLSearchParams({ site_id: `eq.${SITE}`, variant: `eq.${version}`, select: 'variant,pixel_ids' });
  const rows = await request(`repository_fb_pixels?${query}`);
  const record = Array.isArray(rows) ? rows.find((row) => row?.variant === version) : null;
  const values = Array.isArray(record?.pixel_ids) ? record.pixel_ids : [];
  const ids = values.filter((value) => value && value.enabled !== false).map((value) => String(value.id ?? '').trim());
  return [...new Set(ids.filter((id) => /^\d{8,20}$/.test(id)))].slice(0, 5);
}

function facebookClient() {
  if (typeof globalThis.fbq === 'function') return globalThis.fbq;
  function pixel(...args) { if (pixel.callMethod) pixel.callMethod(...args); else pixel.queue.push(args); }
  Object.assign(pixel, { push: pixel, loaded: true, version: '2.0', queue: [] });
  globalThis.fbq = pixel;
  globalThis._fbq ||= pixel;
  const sdk = document.createElement('script');
  sdk.async = true;
  sdk.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.append(sdk);
  return pixel;
}

function startMeta(version) {
  const ready = repositoryPixels(version).then((ids) => {
    if (!ids.length) return [];
    const pixel = facebookClient();
    return ids.flatMap((id) => {
      try { pixel('init', id); pixel('trackSingle', id, 'PageView'); return [[id, pixel]]; }
      catch { return []; }
    });
  }).catch(() => []);
  return (event, parameters = {}, custom = false) => {
    void ready.then((targets) => {
      for (const [id, pixel] of targets) {
        try { pixel(custom ? 'trackSingleCustom' : 'trackSingle', id, event, parameters); }
        catch { /* Meta failure never interrupts a successful order or LINE. */ }
      }
    });
  };
}

export function connectLegacy(version) {
  if (!Object.prototype.hasOwnProperty.call(contracts, version)) throw new Error('Unsupported landing version');
  const contract = contracts[version];
  const requiresLine = Boolean(contract.requireLine);
  const preview = location.protocol !== 'https:' || /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(location.hostname);
  if (preview) {
    const scenario = new URLSearchParams(location.search).get('test');
    const line = async () => scenario === 'line-unavailable' ? '' : '#line-preview';
    let attempts = 0;
    return {
      preview, requiresLine, line,
      async submit(payload) {
        commonPayload(payload, contract, version, null);
        if (requiresLine && !await line()) throw failure(503, 'K_LINE_NOT_CONFIGURED');
        if (++attempts === 1 && scenario === 'retry') throw failure(503, 'SUBMIT_MOCK_FAILURE');
      },
      opened() {}, eligible() {}, clicked() {}, converted() {},
    };
  }

  const track = startMeta(version);
  const sourceForK = requiresLine ? trafficForK(location.href) : null;
  const name = requiresLine ? kCampaign : `D項目${version}版本`;
  const category = requiresLine ? kCategory : '貸款申請';
  let linePromise = null;
  let pending = null;
  let acceptedId = null;
  let converted = false;
  let sawApply = false;

  // Share in-flight and valid config reads, retry only failed/blank results on demand.
  function line() {
    if (!linePromise) {
      linePromise = readLine(contract).then((url) => { if (!url) linePromise = null; return url; });
    }
    return linePromise;
  }
  if (requiresLine) {
    function checkReadDepth() {
      const height = document.documentElement.scrollHeight;
      if (!height || (window.scrollY + window.innerHeight) / height <= 0.5) return;
      window.removeEventListener('scroll', checkReadDepth);
      track('ViewContent', { content_name: name, content_category: category });
    }
    window.addEventListener('scroll', checkReadDepth, { passive: true });
  }

  return {
    preview, requiresLine, line,
    async submit(payload) {
      if (acceptedId) return;
      if (pending) return pending;
      const data = commonPayload(payload, contract, version, sourceForK);
      pending = (async () => {
        if (requiresLine && !await line()) throw failure(503, 'K_LINE_NOT_CONFIGURED');
        await saveLead(contract, data);
        acceptedId = data.id;
      })();
      try { await pending; }
      finally { pending = null; }
    },
    opened() {
      if (requiresLine) {
        track('ClickFloatCTA', {}, true);
        track('InitiateCheckout');
      } else if (contract.oldForm && !sawApply) {
        sawApply = true;
        // C/F used a second physical document; preserve the first form-step page view.
        track('PageView');
      }
    },
    eligible() { if (requiresLine) track('AddToCart'); },
    clicked(id) {
      if (!acceptedId || id !== acceptedId) return;
      if (requiresLine) track('LineAddFriend', { content_name: '企業LINE加好友', content_category: category }, true);
      const resource = contract.submit ? secondaryMark : standardMark;
      void request(`rpc/${resource}`, { json: { lead_id: acceptedId }, keepalive: true }).catch(() => {});
    },
    converted() {
      if (!acceptedId || converted) return;
      converted = true;
      const registration = () => track('CompleteRegistration', { content_name: name, status: 'submitted' });
      const lead = () => track('Lead', { content_name: name, content_category: category, value: 0, currency: 'TWD' });
      if (requiresLine) { lead(); registration(); }
      else { registration(); lead(); }
    },
  };
}
