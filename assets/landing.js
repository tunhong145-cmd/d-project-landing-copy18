const el = (id) => document.getElementById(id);
const version = document.body.dataset.version;
const isShortBand = version === 'C' || version === 'F';
const integration = version === 'L'
  ? import('../l/services.js?v=1').then(({ connect }) => connect())
  : import('./legacy-intake.js?v=1').then(({ connectLegacy }) => connectLegacy(version));
const localPreview = location.protocol !== 'https:' || /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(location.hostname);
el('preview-note').hidden = !localPreview;

const range = el('amount');
const periods = document.querySelector('.term-grid');
const form = el('lead-form');
const send = el('submit-lead');
const status = el('form-message');
const lineLink = el('line-link');
const lineMessage = el('line-message');
const copyNameStatus = el('copy-name-status');
const bankRule = el('bank-note').textContent;
const rates = new Map([[24, 3.5], [36, 3], [60, 2.5], [84, 2], [120, 1.5], [144, 1.5], [180, 1.5], [240, 1.5], [300, 1.5], [360, 1.5]]);
const int = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
const money = (value) => `NT$ ${int.format(value)}`;
let line = '';
let loadingLine = false;
let saving = false;
let result = null;
let attemptId;
let lineRecorded = false;
let previousAmount;

function updateEstimate() {
  const selected = range.valueAsNumber;
  const term = Number(periods.querySelector('input:checked').value);
  const rate = rates.get(term);
  const perMonth = rate / 1200;
  const payment = selected * perMonth / -Math.expm1(-term * Math.log1p(perMonth));
  const current = money(selected);
  range.style.setProperty('--fill', `${(selected - Number(range.min)) * 100 / (Number(range.max) - Number(range.min))}%`);
  range.setAttribute('aria-valuetext', current);
  el('amount-label').textContent = current;
  el('payment').textContent = money(payment);
  el('rate').textContent = `${rate.toFixed(1)}%`;
  el('result-total').textContent = money(payment * term);
  el('result-interest').textContent = money(payment * term - selected);
}

function selectBand() {
  const amount = range.valueAsNumber;
  if (isShortBand && amount <= 200000) return '10萬-20萬';
  if (!isShortBand && amount <= 100000) return '5萬-10萬';
  if (amount <= 300000) return isShortBand ? '20萬-30萬' : '10萬-30萬';
  if (amount <= 500000) return '30萬-50萬';
  return isShortBand ? '50萬-100萬' : '50萬以上';
}

function show(view, focus = true) {
  el('estimate-home').hidden = view !== 'estimate-home';
  el('application').hidden = view !== 'application';
  el('success').hidden = view !== 'success';
  if (focus) {
    (view === 'estimate-home' ? el('apply') : el(`${view}-title`)).focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function attribution() {
  const params = new URLSearchParams(location.search);
  const explicit = (params.get('utm_source') || params.get('source') || '').trim().slice(0, 80);
  const ua = navigator.userAgent;
  const os = [[/iPad|Tablet/i, '平板'], [/iPhone|iPod/i, '手機（iPhone）'], [/Android.*Mobile/i, '手機（Android）'], [/Android/i, '平板（Android）'], [/Windows/i, '桌機（Windows）'], [/Macintosh/i, '桌機（macOS）'], [/Linux/i, '桌機（Linux）']];
  const clients = [[/FBAN|FBAV|FB_IAB/i, 'Facebook 內建瀏覽器'], [/Instagram/i, 'Instagram 內建瀏覽器'], [/Line\//i, 'LINE 內建瀏覽器'], [/Edg\//i, 'Microsoft Edge'], [/CriOS\//i, 'Google Chrome（iOS）'], [/Chrome\//i, 'Google Chrome'], [/FxiOS\//i, 'Firefox（iOS）'], [/Firefox\//i, 'Firefox'], [/Safari\//i, 'Safari']];
  return { source_url: location.href, traffic_source: explicit || (params.get('fbclid') ? 'FB' : params.get('ttclid') ? 'TikTok' : null), user_agent: ua, device_type: os.find(([pattern]) => pattern.test(ua))?.[1] || '其他設備', browser_name: clients.find(([pattern]) => pattern.test(ua))?.[1] || '其他瀏覽器' };
}

function createId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function check() {
  const values = new FormData(form);
  const get = (key) => String(values.get(key) ?? '').trim();
  const name = get('name'), age = get('age'), phone = get('phone'), bank = get('warning_account'), band = get('amount_band');
  const [min, max] = isShortBand ? [1, 120] : [18, 100];
  const errors = { name: name ? '' : '請填寫本人真實姓名。', age: /^\d{1,3}$/.test(age) && Number(age) >= min && Number(age) <= max ? '' : `請輸入 ${min} 至 ${max} 的整數年齡。`, phone: phone ? '' : '請填寫手機號碼。' };
  for (const [field, error] of Object.entries(errors)) {
    el(`${field}-error`).textContent = error;
    el(field).setAttribute('aria-invalid', String(Boolean(error)));
  }
  const invalid = Object.keys(errors).find((key) => errors[key]);
  if (invalid) { status.textContent = '請確認上方標示的欄位。'; el(invalid).focus(); return null; }
  if (bank !== '非警示戶') { status.textContent = bank ? bankRule : '請選擇是否為警示戶/告誡戶。'; return null; }
  if (!band) { status.textContent = '請選擇需求金額。'; return null; }
  return { name, age, phone, q2_bank_status: bank, q3_amount_needed: band };
}

function updateLine() {
  lineLink.hidden = !line;
  if (line) lineLink.href = line;
  else lineLink.removeAttribute('href');
  el('refresh-success-line').hidden = Boolean(line) || loadingLine;
  lineMessage.textContent = loadingLine ? '正在載入 LINE 連結，資料已送出。'
    : !line ? '暫時無法開啟 LINE。請重新載入連結，不必再次送件。'
    : '';
}

async function refreshLine() {
  if (loadingLine) return;
  loadingLine = true;
  updateLine();
  try { line = await (await integration).line(); } catch { line = ''; }
  finally {
    loadingLine = false;
    updateLine();
    const formRetry = el('refresh-form-line');
    if (line && !formRetry.hidden) { formRetry.hidden = true; status.textContent = '連結已載入，可以送件。'; }
  }
}

async function sendApplication(event) {
  event.preventDefault();
  if (saving || result) return;
  status.textContent = '';
  const input = check();
  if (!input) return;
  saving = true;
  send.disabled = true;
  el('return-estimate').disabled = true;
  send.querySelector('b').textContent = '正在送出資料…';
  try {
    const service = await integration;
    if (service.requiresLine && !line) {
      status.textContent = loadingLine ? '正在載入 LINE 連結，請稍後再送件。' : '暫時無法取得 LINE 連結，請重新載入。';
      el('refresh-form-line').hidden = false;
      return;
    }
    attemptId ??= createId();
    await service.submit({ ...input, ...attribution(), id: attemptId, landing_variant: version });
    result = { id: attemptId, name: input.name };
    el('handover-name').textContent = result.name;
    show('success');
    updateLine();
    service.converted();
  } catch (error) {
    if (result) return; // Analytics trouble cannot turn a confirmed order into a save failure.
    status.textContent = error.status === 409 ? '暫時無法確認送件狀態，請勿重複填寫。' : '未能確認送件，資料已保留。請稍後重試。';
  } finally {
    saving = false;
    send.disabled = false;
    el('return-estimate').disabled = false;
    send.querySelector('b').textContent = '立即送件・確認可辦額度';
  }
}

el('apply').addEventListener('click', () => {
  const selected = range.valueAsNumber;
  if (selected !== previousAmount) form.elements.amount_band.value = selectBand();
  previousAmount = selected;
  show('application');
  void integration.then((service) => service.opened?.()).catch(() => {});
});
el('return-estimate').addEventListener('click', () => show('estimate-home'));
form.addEventListener('submit', sendApplication);
form.querySelector('.bank').addEventListener('change', () => {
  const eligible = form.elements.warning_account.value === '非警示戶';
  status.textContent = eligible ? '' : bankRule;
  if (eligible) void integration.then((service) => service.eligible?.()).catch(() => {});
});
lineLink.addEventListener('click', (event) => {
  if (!result || !line || localPreview) {
    event.preventDefault();
    if (localPreview && result && line) lineMessage.textContent = '本地預覽：不會開啟真實 LINE。';
    return;
  }
  if (!lineRecorded) { lineRecorded = true; void integration.then((service) => service.clicked(result.id)).catch(() => {}); }
});
el('copy-name').addEventListener('click', async () => {
  if (!result) return;
  if (localPreview) { copyNameStatus.textContent = '本地預覽：已示範複製姓名。'; return; }
  try {
    if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(result.name);
    copyNameStatus.textContent = '姓名已複製，可貼到 LINE 對話。';
  } catch {
    copyNameStatus.textContent = '無法自動複製，請長按姓名，或到 LINE 手動輸入。';
  }
});
for (const button of ['refresh-form-line', 'refresh-success-line']) el(button).addEventListener('click', refreshLine);
range.addEventListener('input', updateEstimate);
periods.addEventListener('change', updateEstimate);
updateEstimate();
if (document.body.dataset.applyAlias === 'true' || new URLSearchParams(location.search).get('view') === 'apply') {
  const band = new URLSearchParams(location.search).get('amount');
  const options = Array.from(form.querySelectorAll('input[name=amount_band]'), (option) => option.value);
  if (options.includes(band)) form.elements.amount_band.value = band;
  previousAmount = range.valueAsNumber;
  show('application', false);
}
const illustrativeActivity = [['臺北市　陳＊華', '50萬'], ['高雄市　林＊豪', isShortBand ? '60萬' : '200萬'], ['臺中市　黃＊婷', '80萬']];
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let sample = 0;
  setInterval(() => {
    if (document.hidden || el('estimate-home').hidden) return;
    sample = (sample + 1) % illustrativeActivity.length;
    const [label, amount] = illustrativeActivity[sample];
    document.querySelector('.activity-copy strong').textContent = label;
    document.querySelector('.activity-amount').textContent = amount;
  }, 7000);
}
if (localPreview && new URLSearchParams(location.search).get('preview') === 'success') {
  result = { name: '陳展生' };
  el('handover-name').textContent = result.name;
  show('success', false);
}
void refreshLine();
