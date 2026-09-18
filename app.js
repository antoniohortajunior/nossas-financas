const KEY = "esatto-config";
const APP_VERSION = "27";
const INSTALL_HINT_KEY = "esatto-install-hint-v25";
const SPLASH_IN_MS = 550;
const SPLASH_HOLD_MS = 300;
const SPLASH_OUT_MS = 400;
const TOTP_STEP = 20;
const TOTP_DIGITS = 6;
const TOTP_SECRET_KEY = "esatto-totp-secret";
const TOKEN_RING_R = 90;
const TOKEN_RING_C = 2 * Math.PI * TOKEN_RING_R;

let tokenTimer = null;
let tokenRaf = null;
let lastTotpBucket = -1;
let cachedTokenCode = "000000";
let autoFullscreenReady = false;

const PREVIEW_SVG = {
  fornecedores: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240" fill="none" class="coming-soon-svg" aria-hidden="true">
  <rect width="360" height="240" rx="16" fill="#f8fafc" stroke="#e2e8f0"/>
  <rect x="16" y="16" width="328" height="28" rx="8" fill="#0f766e"/>
  <text x="32" y="35" fill="#fff" font-family="Arial,sans-serif" font-size="12" font-weight="700">Desempenho por Fornecedor</text>
  <text x="280" y="35" fill="#ccfbf1" font-family="Arial,sans-serif" font-size="10">08/2026</text>
  <rect x="16" y="54" width="328" height="170" rx="10" fill="#fff" stroke="#e2e8f0"/>
  <text x="28" y="72" fill="#64748b" font-family="Arial,sans-serif" font-size="9" font-weight="700">FORNECEDOR</text>
  <text x="200" y="72" fill="#64748b" font-family="Arial,sans-serif" font-size="9" font-weight="700">VENDA</text>
  <text x="290" y="72" fill="#64748b" font-family="Arial,sans-serif" font-size="9" font-weight="700">% TOTAL</text>
  <line x1="24" y1="78" x2="336" y2="78" stroke="#e2e8f0"/>
  <text x="28" y="96" fill="#0f172a" font-family="Arial,sans-serif" font-size="9" font-weight="700">50 Fabricação</text>
  <rect x="120" y="86" width="140" height="12" rx="4" fill="#e2e8f0"/><rect x="120" y="86" width="112" height="12" rx="4" fill="#d97706"/>
  <text x="200" y="96" fill="#0f172a" font-family="Arial,sans-serif" font-size="9">R$ 842k</text>
  <text x="292" y="96" fill="#d97706" font-family="Arial,sans-serif" font-size="9" font-weight="700">18,2%</text>
  <text x="28" y="118" fill="#0f172a" font-family="Arial,sans-serif" font-size="9" font-weight="700">4241 Minuano</text>
  <rect x="120" y="108" width="140" height="12" rx="4" fill="#e2e8f0"/><rect x="120" y="108" width="98" height="12" rx="4" fill="#0f766e"/>
  <text x="200" y="118" fill="#0f172a" font-family="Arial,sans-serif" font-size="9">R$ 615k</text>
  <text x="292" y="118" fill="#0f766e" font-family="Arial,sans-serif" font-size="9" font-weight="700">13,3%</text>
  <text x="28" y="140" fill="#0f172a" font-family="Arial,sans-serif" font-size="9" font-weight="700">6476 Picolin</text>
  <rect x="120" y="130" width="140" height="12" rx="4" fill="#e2e8f0"/><rect x="120" y="130" width="76" height="12" rx="4" fill="#0284c7"/>
  <text x="200" y="140" fill="#0f172a" font-family="Arial,sans-serif" font-size="9">R$ 478k</text>
  <text x="292" y="140" fill="#0284c7" font-family="Arial,sans-serif" font-size="9" font-weight="700">10,4%</text>
  <line x1="24" y1="176" x2="336" y2="176" stroke="#e2e8f0"/>
  <text x="28" y="194" fill="#64748b" font-family="Arial,sans-serif" font-size="9">Top 4 fornecedores do periodo</text>
  <rect x="220" y="184" width="108" height="18" rx="6" fill="#f0fdfa" stroke="#99f6e4"/>
  <text x="274" y="197" text-anchor="middle" fill="#115e59" font-family="Arial,sans-serif" font-size="9" font-weight="700">Relatorio PDF</text>
</svg>`,
  caixa: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240" fill="none" class="coming-soon-svg" aria-hidden="true">
  <rect width="360" height="240" rx="16" fill="#f8fafc" stroke="#e2e8f0"/>
  <rect x="16" y="16" width="328" height="28" rx="8" fill="#1e40af"/>
  <text x="32" y="35" fill="#fff" font-family="Arial,sans-serif" font-size="12" font-weight="700">Fluxo de Caixa</text>
  <text x="268" y="35" fill="#bfdbfe" font-family="Arial,sans-serif" font-size="10">Semana MG + DF</text>
  <rect x="16" y="54" width="100" height="52" rx="10" fill="#ecfdf5" stroke="#6ee7b7"/>
  <text x="28" y="72" fill="#059669" font-family="Arial,sans-serif" font-size="9" font-weight="700">ENTRADAS</text>
  <text x="28" y="92" fill="#047857" font-family="Arial,sans-serif" font-size="13" font-weight="700">R$ 1,24M</text>
  <rect x="130" y="54" width="100" height="52" rx="10" fill="#fef2f2" stroke="#fca5a5"/>
  <text x="142" y="72" fill="#e11d48" font-family="Arial,sans-serif" font-size="9" font-weight="700">SAIDAS</text>
  <text x="142" y="92" fill="#be123c" font-family="Arial,sans-serif" font-size="13" font-weight="700">R$ 980k</text>
  <rect x="244" y="54" width="100" height="52" rx="10" fill="#eff6ff" stroke="#93c5fd"/>
  <text x="256" y="72" fill="#0284c7" font-family="Arial,sans-serif" font-size="9" font-weight="700">SALDO</text>
  <text x="256" y="92" fill="#0369a1" font-family="Arial,sans-serif" font-size="13" font-weight="700">R$ 260k</text>
  <rect x="16" y="118" width="328" height="106" rx="10" fill="#fff" stroke="#e2e8f0"/>
  <polyline points="32,198 72,176 112,184 152,150 192,158 232,132 272,140 312,118" stroke="#0284c7" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="32,198 72,188 112,194 152,186 192,190 232,182 272,188 312,194" stroke="#059669" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 3"/>
  <circle cx="152" cy="150" r="4" fill="#0284c7"/><circle cx="232" cy="132" r="4" fill="#0284c7"/><circle cx="312" cy="118" r="4" fill="#0284c7"/>
  <text x="28" y="136" fill="#64748b" font-family="Arial,sans-serif" font-size="9">Saldo acumulado</text>
  <line x1="24" y1="206" x2="336" y2="206" stroke="#e2e8f0"/>
  <text x="28" y="218" fill="#64748b" font-family="Arial,sans-serif" font-size="9">Seg</text>
  <text x="72" y="218" fill="#64748b" font-family="Arial,sans-serif" font-size="9">Ter</text>
  <text x="116" y="218" fill="#64748b" font-family="Arial,sans-serif" font-size="9">Qua</text>
  <text x="160" y="218" fill="#64748b" font-family="Arial,sans-serif" font-size="9">Qui</text>
  <text x="204" y="218" fill="#64748b" font-family="Arial,sans-serif" font-size="9">Sex</text>
  <text x="248" y="218" fill="#64748b" font-family="Arial,sans-serif" font-size="9">Sab</text>
  <text x="292" y="218" fill="#64748b" font-family="Arial,sans-serif" font-size="9">Dom</text>
</svg>`,
};
const PCT_CAP = 999.99;

const state = {
  tab: "desempenho",
  apiUrl: "",
  token: "",
  usuario: "",
  inicio: "",
  fim: "",
  loading: false,
  error: "",
  data: null,
  sheetOpen: false,
  tokenScreenOpen: false,
  loginUser: "",
  loginPass: "",
  toast: "",
  charts: { vendas: null, variacao: null },
  sortMode: "loja",
};

function inferredApiUrl() {
  const { origin, port, protocol, hostname } = window.location;
  if (protocol !== "http:" && protocol !== "https:") return "";
  if (port === "4190" || port === "5173") return "";
  if (hostname === "app.sistemaesatto.com.br") return origin;
  if (port === "8080" || port === "80" || port === "443" || port === "8443" || port === "") return origin;
  return "";
}

function effectiveApiUrl(stored) {
  const inferred = inferredApiUrl();
  if (inferred) return inferred;
  return String(stored || "").trim();
}

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function saveConfig(partial) {
  localStorage.setItem(KEY, JSON.stringify({ ...loadConfig(), ...partial }));
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstDayMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function brl(n) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPctNum(n) {
  return Number(n).toFixed(1).replace(".", ",");
}

function pctPlain(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  if (v > PCT_CAP) return ">999%";
  if (v < -PCT_CAP) return "-999%";
  return `${formatPctNum(v)}%`;
}

function pctCapTitle(n) {
  if (n == null || Number.isNaN(n)) return "";
  const v = Number(n);
  if (Math.abs(v) <= PCT_CAP) return "";
  const sign = v > 0 ? "+" : "";
  return `${sign}${formatPctNum(v)}%`;
}

function pct(n, opts = {}) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  if (!opts.full) {
    if (v > PCT_CAP) return "+999%";
    if (v < -PCT_CAP) return "-999%";
  }
  const sign = v > 0 ? "+" : "";
  return `${sign}${formatPctNum(v)}%`;
}

function pctTitle(n) {
  return pctCapTitle(n);
}

function chartVariacao(n) {
  if (n == null || Number.isNaN(n)) return 0;
  const v = Number(n);
  if (v > PCT_CAP) return PCT_CAP;
  if (v < -PCT_CAP) return -PCT_CAP;
  return v;
}

function pracaData(d, uf) {
  const p = d.pracas?.[uf] || {};
  if (p.variacaoPct !== undefined) return p;
  const rows = (d.lojas || []).filter((r) => r.uf === uf);
  const venda = p.venda ?? rows.reduce((s, r) => s + (r.venda || 0), 0);
  const ant = rows.reduce((s, r) => s + (r.anoAnterior?.venda || 0), 0);
  const tot = d.totais?.venda || 0;
  let variacaoPct = null;
  if (ant >= 100) variacaoPct = Math.round(((venda - ant) / ant) * 1000) / 10;
  return {
    venda,
    pctTotal: tot ? Math.round((venda / tot) * 1000) / 10 : 0,
    variacaoPct,
  };
}

function renderPracaHero(uf, data) {
  const cls = uf === "MG" ? "kpi-mg" : "kpi-df";
  return `
    <div class="kpi ${cls} kpi-praca-tall">
      <span class="praca-lbl">${uf}:</span>
      <b>${brl(data.venda)}</b>
      <small>${pctPlain(data.pctTotal)} do total</small>
      <small class="praca-var ${varClass(data.variacaoPct)}">Variação ${pct(data.variacaoPct)}</small>
      <small class="rel-ant">em rel. ano anterior</small>
    </div>`;
}

function topLojasPorVenda(list, limit = 10) {
  return [...(list || [])].sort((a, b) => (b.venda || 0) - (a.venda || 0)).slice(0, limit);
}

function lojaNum(loja) {
  return parseInt(String(loja).trim(), 10) || 0;
}

function ufRank(uf) {
  if (uf === "MG") return 0;
  if (uf === "DF") return 1;
  return 2;
}

function sortLojas(list, mode) {
  const rows = [...(list || [])];
  if (mode === "venda") {
    rows.sort((a, b) => b.venda - a.venda);
  } else if (mode === "uf-loja") {
    rows.sort((a, b) => ufRank(a.uf) - ufRank(b.uf) || lojaNum(a.loja) - lojaNum(b.loja));
  } else if (mode === "uf-venda") {
    rows.sort((a, b) => ufRank(a.uf) - ufRank(b.uf) || b.venda - a.venda);
  } else {
    rows.sort((a, b) => lojaNum(a.loja) - lojaNum(b.loja));
  }
  return rows;
}

function lojaSortHint(mode) {
  if (mode === "uf-loja") return "UF · loja";
  if (mode === "loja") return "loja";
  return "";
}

function vendaSortHint(mode) {
  if (mode === "venda") return "venda ↓";
  if (mode === "uf-venda") return "UF · venda ↓";
  return "";
}

function cycleSortMode(mode) {
  if (mode === "loja") return "uf-loja";
  if (mode === "uf-loja") return "uf-venda";
  return "loja";
}

function clickVendaSort(mode) {
  if (mode === "venda") return "uf-venda";
  return "venda";
}

function ufClass(uf) {
  if (uf === "MG") return "uf-mg";
  if (uf === "DF") return "uf-df";
  return "";
}

function displayLojas() {
  return sortLojas(state.data?.lojas, state.sortMode);
}

function varClass(n) {
  if (n == null) return "";
  return Number(n) >= 0 ? "pos" : "neg";
}

function showToast(msg) {
  state.toast = msg;
  render();
  setTimeout(() => {
    state.toast = "";
    render();
  }, 2600);
}

function apiBase() {
  return String(state.apiUrl || "").trim().replace(/\/+$/, "");
}

async function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(`${apiBase()}${path}`, { ...opts, headers });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text || res.statusText };
  }
  if (!res.ok) throw new Error(data.detail || `Erro ${res.status}`);
  return data;
}

async function doLogin() {
  state.error = "";
  state.loading = true;
  render();
  try {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: state.loginUser, password: state.loginPass }),
    });
    state.token = data.token;
    state.usuario = data.usuario;
    saveConfig({ apiUrl: state.apiUrl, token: data.token, usuario: data.usuario });
    state.sheetOpen = false;
    state.loginPass = "";
    showToast(`Conectado como ${data.usuario}`);
    await loadDesempenho();
  } catch (e) {
    state.error = e.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function loadDesempenho() {
  if (!state.token) {
    state.sheetOpen = true;
    render();
    return;
  }
  state.loading = true;
  state.error = "";
  render();
  try {
    const q = new URLSearchParams({
      inicio: state.inicio,
      fim: state.fim,
    });
    state.data = await apiFetch(`/api/desempenho?${q}`);
    state.sortMode = "loja";
    renderCharts();
  } catch (e) {
    state.error = e.message;
    state.data = null;
  } finally {
    state.loading = false;
    render();
  }
}

function destroyCharts() {
  Object.keys(state.charts).forEach((k) => {
    if (state.charts[k]) {
      state.charts[k].destroy();
      state.charts[k] = null;
    }
  });
}

function renderCharts() {
  destroyCharts();
  if (!state.data || !window.Chart) return;
  const top10 = topLojasPorVenda(state.data.lojas, 10);
  const lojas = displayLojas();
  const labelsTop = top10.map((r) => r.loja);
  const vendasTop = top10.map((r) => r.venda);
  const labelsVar = lojas.map((r) => r.loja);
  const variacoes = lojas.map((r) => chartVariacao(r.variacaoPct));

  const cv1 = document.getElementById("chart-vendas");
  const cv2 = document.getElementById("chart-variacao");
  if (!cv1 || !cv2) return;

  const varBox = cv2.parentElement;
  if (varBox) {
    varBox.style.height = `${Math.max(480, lojas.length * 38 + 28)}px`;
  }

  state.charts.vendas = new Chart(cv1, {
    type: "bar",
    data: {
      labels: labelsTop,
      datasets: [{
        label: "Venda",
        data: vendasTop,
        backgroundColor: top10.map((r) => (r.uf === "MG" ? "#d97706" : r.uf === "DF" ? "#0284c7" : "#0f766e")),
        borderRadius: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          ticks: {
            callback: (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v),
          },
        },
      },
    },
  });

  state.charts.variacao = new Chart(cv2, {
    type: "bar",
    data: {
      labels: labelsVar,
      datasets: [{
        label: "Variação %",
        data: variacoes,
        backgroundColor: variacoes.map((v) => (v >= 0 ? "#059669" : "#e11d48")),
        borderRadius: 6,
        barPercentage: 0.92,
        categoryPercentage: 0.92,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const raw = lojas[ctx.dataIndex]?.variacaoPct;
              return raw == null ? "—" : pct(raw, { full: true });
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { font: { size: 10 } },
        },
        y: {
          ticks: {
            autoSkip: false,
            font: { size: 11, weight: "600" },
          },
        },
      },
    },
  });
}

function renderSetup() {
  const auto = inferredApiUrl();
  const apiBlock = auto
    ? `<p class="setup-hint">Servidor: <strong>${esc(auto)}</strong></p>`
    : `
      <div class="field" style="margin-top:18px">
        <label>URL da API</label>
        <input id="api-url" type="url" placeholder="http://HDFATBOY:8080" value="${esc(state.apiUrl)}" />
      </div>`;
  return `
    <div class="setup">
      <h1>Esatto!</h1>
      <p>Faça login com seu usuário Windows do servidor HDFATBOY.</p>
      ${apiBlock}
      <div class="field" style="margin-top:18px">
        <label>Usuário Windows</label>
        <input id="login-user" type="text" autocomplete="username" value="${esc(state.loginUser)}" />
      </div>
      <div class="field">
        <label>Senha</label>
        <input id="login-pass" type="password" autocomplete="current-password" />
      </div>
      ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}
      <button class="save" id="btn-login" ${state.loading ? "disabled" : ""}>Entrar</button>
    </div>`;
}

function renderDesempenho() {
  const d = state.data;
  if (!d) {
    return `<p class="empty">Defina o período e toque em <strong>Atualizar</strong>.</p>`;
  }
  const lojas = displayLojas();
  const rows = lojas
    .map(
      (r) => `
      <tr>
        <td class="${ufClass(r.uf)}">${esc(r.loja)}</td>
        <td class="col-money">${brl(r.venda)}</td>
        <td class="col-pct"${pctCapTitle(r.pctBruto) ? ` title="${esc(pctCapTitle(r.pctBruto))}"` : ""}>${pctPlain(r.pctBruto)}</td>
        <td class="col-money">${brl(r.anoAnterior?.venda)}</td>
        <td class="col-pct"${pctCapTitle(r.anoAnterior?.pctBruto) ? ` title="${esc(pctCapTitle(r.anoAnterior?.pctBruto))}"` : ""}>${pctPlain(r.anoAnterior?.pctBruto)}</td>
        <td class="col-var ${varClass(r.variacaoPct)}"${pctTitle(r.variacaoPct) ? ` title="${esc(pctTitle(r.variacaoPct))}"` : ""}>${pct(r.variacaoPct)}</td>
      </tr>`
    )
    .join("");
  const t = d.totais || {};
  const mg = pracaData(d, "MG");
  const df = pracaData(d, "DF");
  return `
    <div class="hero hero-tall">
      <div class="lbl">Venda total · ${esc(d.periodo?.inicio)} a ${esc(d.periodo?.fim)}</div>
      <div class="val">${brl(t.venda)}</div>
      <div class="sub">% bruto ${pctPlain(t.pctBruto)} · Variação ${pct(t.variacaoPct)} vs ano anterior</div>
      <div class="grid2 pracas">
        ${renderPracaHero("MG", mg)}
        ${renderPracaHero("DF", df)}
      </div>
      <div class="grid2">
        <div class="kpi"><span>Ano anterior</span><b>${brl(t.anoAnterior?.venda)}</b></div>
        <div class="kpi"><span>% bruto ant.</span><b>${pctPlain(t.anoAnterior?.pctBruto)}</b></div>
      </div>
    </div>
    <div class="table-wrap table-wrap-tight">
      <table class="lojas-table">
        <colgroup>
          <col class="c-loja" />
          <col class="c-venda" />
          <col class="c-pct" />
          <col class="c-venda" />
          <col class="c-pct" />
          <col class="c-var" />
        </colgroup>
        <thead>
          <tr>
            <th class="th-sort ${["loja", "uf-loja"].includes(state.sortMode) ? "th-sort-on" : ""}" id="th-loja" title="Toque para alterar a ordenação">
              Loja
              <span class="hint">${esc(lojaSortHint(state.sortMode))}</span>
            </th>
            <th class="th-sort ${["venda", "uf-venda"].includes(state.sortMode) ? "th-sort-on" : ""}" id="th-venda" title="Toque para ordenar por venda">
              Venda
              <span class="hint">${esc(vendaSortHint(state.sortMode))}</span>
            </th>
            <th class="col-pct">% Bruto</th>
            <th>Venda ant.</th>
            <th class="col-pct">% ant.</th>
            <th class="col-var">Variação</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
    <div class="section">Gráficos</div>
    <div class="chart-card">
      <h3>10 melhores lojas</h3>
      <div class="chart-box"><canvas id="chart-vendas"></canvas></div>
    </div>
    <div class="chart-card">
      <h3>Variação vs ano anterior</h3>
      <div class="chart-box chart-box-variacao"><canvas id="chart-variacao"></canvas></div>
    </div>`;
}

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true
  );
}

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function getOrCreateTotpSecretHex() {
  let hex = localStorage.getItem(TOTP_SECRET_KEY);
  if (!hex || hex.length < 32) {
    const arr = new Uint8Array(20);
    crypto.getRandomValues(arr);
    hex = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(TOTP_SECRET_KEY, hex);
  }
  return hex;
}

async function computeTotp(secretBytes, step = TOTP_STEP) {
  const counter = Math.floor(Date.now() / 1000 / step);
  const counterBytes = new Uint8Array(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i -= 1) {
    counterBytes[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }
  if (!crypto.subtle) return fallbackTotp(secretBytes, counter);
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  return hotpFromDigest(sig);
}

function hotpFromDigest(sig) {
  const offset = sig[sig.length - 1] & 0x0f;
  const binary =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function fallbackTotp(secretBytes, counter) {
  let acc = counter;
  for (let i = 0; i < secretBytes.length; i += 1) {
    acc = (acc * 131 + secretBytes[i]) >>> 0;
  }
  return String(acc % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function formatTokenCode(code) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function totpProgressSmooth() {
  const stepMs = TOTP_STEP * 1000;
  const elapsedMs = Date.now() % stepMs;
  const remainingMs = stepMs - elapsedMs;
  return {
    remaining: Math.ceil(remainingMs / 1000),
    progress: remainingMs / stepMs,
  };
}

function refreshTokenRing() {
  const ringEl = document.getElementById("token-ring-progress");
  const secsEl = document.getElementById("token-secs");
  const { remaining, progress } = totpProgressSmooth();
  if (ringEl) {
    const visible = TOKEN_RING_C * progress;
    ringEl.style.strokeDasharray = `${visible} ${TOKEN_RING_C - visible}`;
    ringEl.style.strokeDashoffset = "0";
  }
  if (secsEl) secsEl.textContent = String(remaining);
}

async function refreshTokenCode() {
  const codeEl = document.getElementById("token-code");
  if (!codeEl) return;
  const bucket = Math.floor(Date.now() / 1000 / TOTP_STEP);
  if (bucket === lastTotpBucket) {
    codeEl.textContent = formatTokenCode(cachedTokenCode);
    return;
  }
  lastTotpBucket = bucket;
  try {
    const secret = hexToBytes(getOrCreateTotpSecretHex());
    cachedTokenCode = await computeTotp(secret);
    codeEl.textContent = formatTokenCode(cachedTokenCode);
  } catch {
    codeEl.textContent = "— — —";
  }
}

function tokenAnimLoop() {
  refreshTokenRing();
  tokenRaf = requestAnimationFrame(tokenAnimLoop);
}

function startTokenTimer() {
  stopTokenTimer();
  lastTotpBucket = -1;
  refreshTokenCode();
  refreshTokenRing();
  tokenAnimLoop();
  tokenTimer = setInterval(() => refreshTokenCode(), 500);
}

function stopTokenTimer() {
  if (tokenRaf) {
    cancelAnimationFrame(tokenRaf);
    tokenRaf = null;
  }
  if (tokenTimer) {
    clearInterval(tokenTimer);
    tokenTimer = null;
  }
  lastTotpBucket = -1;
}

const TOKEN_TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.6"/>
  <path d="M8 11V8a4 4 0 0 1 7.5-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M14 4l3-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="18" cy="3" r="1.4" fill="currentColor"/>
</svg>`;

function renderTokenScreen() {
  const hex = getOrCreateTotpSecretHex();
  const suffix = hex.slice(-3);
  const name = state.usuario || state.loginUser || "Usuário";
  return `
    <div class="token-screen ${state.tokenScreenOpen ? "open" : ""}" id="token-screen">
      <header class="token-head">
        <button type="button" class="token-back" id="btn-token-back" aria-label="Voltar">←</button>
        <span class="token-brand">Esatto</span>
      </header>
      <div class="token-body">
        <div class="token-info">
          <p class="token-user">${esc(name)}</p>
          <p class="token-meta">Token final: ${esc(suffix)}</p>
        </div>
        <div class="token-ring-stage">
          <div class="token-ring-wrap">
            <svg class="token-ring" viewBox="0 0 200 200" aria-hidden="true">
              <circle class="token-ring-bg" cx="100" cy="100" r="${TOKEN_RING_R}" />
              <g transform="rotate(90 100 100)">
                <circle
                  class="token-ring-progress"
                  id="token-ring-progress"
                  cx="100"
                  cy="100"
                  r="${TOKEN_RING_R}"
                  style="stroke-dasharray:${TOKEN_RING_C} 0;stroke-dashoffset:0"
                />
              </g>
            </svg>
            <div class="token-center">
              <span class="token-label">Token Esatto</span>
              <div class="token-code" id="token-code">000 000</div>
              <span class="token-countdown"><span id="token-secs">20</span>s</span>
            </div>
          </div>
        </div>
        <p class="token-foot">Código renovado a cada 20 segundos</p>
      </div>
    </div>`;
}

function isFullscreenActive() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
}

function isNonStandardPort() {
  const port = window.location.port;
  return port !== "" && port !== "443" && port !== "80";
}

function shouldShowFullscreenControl() {
  if (!isMobile() || isFullscreenActive()) return false;
  if (isIOS()) return !window.navigator.standalone;
  if (isAndroid()) {
    if (isNonStandardPort()) return true;
    if (!isStandalone()) return true;
    return window.location.protocol === "http:";
  }
  return !isStandalone();
}

function shouldAutoFullscreen() {
  return isMobile() && isAndroid() && window.location.protocol === "http:" && !isStandalone();
}

function tryAutoFullscreen() {
  if (!shouldAutoFullscreen() || isFullscreenActive()) return Promise.resolve(true);
  return enterFullscreen().then(() => true).catch(() => false);
}

function initAutoFullscreen() {
  if (autoFullscreenReady || !isMobile() || !isAndroid() || window.location.protocol !== "http:") return;
  autoFullscreenReady = true;

  const kick = () => tryAutoFullscreen();

  kick();
  requestAnimationFrame(kick);
  setTimeout(kick, 120);

  window.addEventListener("pageshow", kick);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) kick();
  });

  document.addEventListener("touchstart", kick, { capture: true, passive: true });
  document.addEventListener("click", kick, { capture: true });
}

function enterFullscreen() {
  const el = document.documentElement;
  const fn =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.webkitRequestFullScreen ||
    el.msRequestFullscreen;
  if (!fn) return Promise.reject(new Error("unsupported"));
  try {
    return Promise.resolve(fn.call(el, { navigationUI: "hide" }));
  } catch {
    return Promise.resolve(fn.call(el));
  }
}

function renderInstallHint() {
  if (localStorage.getItem(INSTALL_HINT_KEY) === "1") return "";
  if (!isMobile()) return "";
  if (isStandalone() && !isNonStandardPort() && window.location.protocol === "https:") return "";

  let msg =
    "Menu ⋮ → <strong>Instalar app</strong> (ou Adicionar à tela inicial) e abra pelo ícone <strong>Esatto</strong>.";
  if (isIOS()) {
    msg =
      "No iPhone, abra no <strong>Safari</strong> → Compartilhar → <strong>Adicionar à Tela de Início</strong> (não use o Chrome).";
  } else if (isNonStandardPort()) {
    msg =
      "Pela porta <strong>:8443</strong>, o Chrome pode manter a barra. Toque em <strong>Tela cheia</strong> abaixo ou no botão <strong>⛶</strong> no topo para ocultá-la enquanto usa o app.";
  } else if (window.location.protocol === "https:") {
    msg =
      "Instale pelo menu ⋮ → <strong>Instalar app</strong>. Se a barra do Chrome aparecer, use <strong>Tela cheia</strong> ou <strong>⛶</strong> no topo.";
  } else if (window.location.protocol === "http:") {
    msg = isStandalone()
      ? "Abra pelo ícone <strong>Esatto</strong> na tela inicial. Para sumir a barra de vez, use <strong>HTTPS</strong> na porta 443."
      : "Adicione à tela inicial (Menu ⋮ → Instalar app). Se a barra aparecer, use <strong>Tela cheia</strong> ou <strong>⛶</strong> no topo.";
  }

  return `
    <div class="install-hint" id="install-hint">
      <p>${msg}</p>
      <div class="install-hint-actions">
        <button type="button" class="install-hint-full" id="btn-fullscreen">Tela cheia</button>
        <button type="button" class="install-hint-close" id="btn-dismiss-install">Entendi</button>
      </div>
    </div>`;
}

function renderFullscreenBarBtn() {
  if (!shouldShowFullscreenControl()) return "";
  return `<button type="button" class="conn-link" id="btn-fullscreen-bar" title="Tela cheia">⛶</button>`;
}

function renderComingSoon(title, svgMarkup) {
  return `
    <div class="coming-soon">
      <div class="coming-soon-card">
        <div class="coming-soon-art">${svgMarkup}</div>
        <h2>${esc(title)}</h2>
        <p class="coming-soon-msg">Em construção (05/11/26)...</p>
      </div>
    </div>`;
}

function renderMain() {
  const tabContent =
    state.tab === "desempenho"
      ? renderDesempenho()
      : state.tab === "fornecedores"
        ? renderComingSoon("Fornecedores", PREVIEW_SVG.fornecedores)
        : renderComingSoon("Fluxo de Caixa", PREVIEW_SVG.caixa);

  return `
    <div class="app ${state.loading ? "busy" : ""}">
      <div class="scroll">
        ${renderInstallHint()}
        <div class="topbar">
          <div class="topbar-brand">
            <div class="title">Esatto!</div>
            <div class="hello-row">
              <span class="hello">${state.usuario ? esc(state.usuario) : "Não conectado"} · v${APP_VERSION}</span>
              <button type="button" class="conn-link" id="btn-conn" title="Conexão / login">🔑</button>
            </div>
          </div>
          <div class="topbar-actions">
            ${renderFullscreenBarBtn()}
            <button type="button" class="token-link" id="btn-app-token" title="Token de segurança">
              ${TOKEN_TILE_SVG}
            </button>
          </div>
        </div>
        ${
          state.tab === "desempenho"
            ? `
        <div class="period">
          <div class="field"><label>Início</label><input id="dt-ini" type="date" value="${esc(state.inicio)}" /></div>
          <div class="field"><label>Fim</label><input id="dt-fim" type="date" value="${esc(state.fim)}" /></div>
          <button class="btn-go" id="btn-load">Atualizar</button>
        </div>`
            : ""
        }
        ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}
        ${tabContent}
      </div>
      <nav class="tabs">
        <button class="tab ${state.tab === "desempenho" ? "on" : ""}" data-tab="desempenho">Desempenho</button>
        <button class="tab ${state.tab === "fornecedores" ? "on" : ""}" data-tab="fornecedores">Fornecedores</button>
        <button class="tab ${state.tab === "caixa" ? "on" : ""}" data-tab="caixa">Caixa</button>
      </nav>
      ${renderSheet()}
      ${renderTokenScreen()}
      <div class="toast ${state.toast ? "show" : ""}">${esc(state.toast)}</div>
    </div>`;
}

function renderSheet() {
  return `
    <div class="sheet ${state.sheetOpen ? "open" : ""}">
      <div class="sheet-head">
        <h2>Conexão</h2>
        <button class="ghost" id="btn-close-sheet">×</button>
      </div>
      <div class="sheet-body">
        <div class="field"><label>URL da API</label><input id="sheet-api" type="url" value="${esc(state.apiUrl)}" /></div>
        <div class="field"><label>Usuário Windows</label><input id="sheet-user" type="text" value="${esc(state.loginUser)}" /></div>
        <div class="field"><label>Senha</label><input id="sheet-pass" type="password" /></div>
        ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}
      </div>
      <button class="save" id="btn-sheet-login">Gerar token / Entrar</button>
    </div>`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function bindEvents() {
  const goFullscreen = () => {
    enterFullscreen()
      .then(() => showToast("Tela cheia ativada."))
      .catch(() => showToast("Tela cheia indisponível neste navegador."));
  };
  document.getElementById("btn-fullscreen")?.addEventListener("click", goFullscreen);
  document.getElementById("btn-fullscreen-bar")?.addEventListener("click", goFullscreen);
  document.getElementById("btn-dismiss-install")?.addEventListener("click", () => {
    localStorage.setItem(INSTALL_HINT_KEY, "1");
    document.getElementById("install-hint")?.remove();
  });
  document.getElementById("btn-conn")?.addEventListener("click", () => {
    state.sheetOpen = true;
    render();
  });
  document.getElementById("btn-app-token")?.addEventListener("click", () => {
    state.tokenScreenOpen = true;
    render();
  });
  document.getElementById("btn-token-back")?.addEventListener("click", () => {
    state.tokenScreenOpen = false;
    render();
  });
  document.getElementById("btn-close-sheet")?.addEventListener("click", () => {
    state.sheetOpen = false;
    render();
  });
  document.getElementById("btn-load")?.addEventListener("click", () => {
    state.inicio = document.getElementById("dt-ini")?.value || state.inicio;
    state.fim = document.getElementById("dt-fim")?.value || state.fim;
    saveConfig({ inicio: state.inicio, fim: state.fim });
    loadDesempenho();
  });
  document.getElementById("th-loja")?.addEventListener("click", () => {
    state.sortMode = cycleSortMode(state.sortMode);
    render();
  });
  document.getElementById("th-venda")?.addEventListener("click", () => {
    state.sortMode = clickVendaSort(state.sortMode);
    render();
  });
  document.querySelectorAll(".tab").forEach((el) => {
    el.addEventListener("click", () => {
      if (state.tab === "desempenho" && el.dataset.tab !== "desempenho") destroyCharts();
      state.tab = el.dataset.tab;
      render();
    });
  });
  const sheetLogin = () => {
    state.apiUrl = effectiveApiUrl(document.getElementById("sheet-api")?.value?.trim());
    state.loginUser = document.getElementById("sheet-user")?.value?.trim() || "";
    state.loginPass = document.getElementById("sheet-pass")?.value || "";
    saveConfig({ apiUrl: state.apiUrl });
    doLogin();
  };
  document.getElementById("btn-sheet-login")?.addEventListener("click", sheetLogin);
  if (state.data) requestAnimationFrame(() => renderCharts());
}

function render() {
  const root = document.getElementById("root");
  if (!state.apiUrl || !state.token) {
    stopTokenTimer();
    root.innerHTML = renderSetup();
    document.getElementById("btn-login")?.addEventListener("click", () => {
      state.apiUrl = effectiveApiUrl(document.getElementById("api-url")?.value?.trim());
      state.loginUser = document.getElementById("login-user")?.value?.trim() || "";
      state.loginPass = document.getElementById("login-pass")?.value || "";
      saveConfig({ apiUrl: state.apiUrl });
      doLogin();
    });
    kickAutoFullscreen();
    return;
  }
  root.innerHTML = renderMain();
  bindEvents();
  if (state.tokenScreenOpen) startTokenTimer();
  else stopTokenTimer();
  kickAutoFullscreen();
}

function kickAutoFullscreen() {
  tryAutoFullscreen();
}

function initPlatformClasses() {
  if (!isIOS()) return;
  const root = document.documentElement;
  root.classList.add("ios");
  if (window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches) {
    root.classList.add("ios-standalone");
  } else {
    root.classList.add("ios-browser");
  }
}

function initSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hold = reduced ? 120 : SPLASH_HOLD_MS;
  const out = reduced ? 0 : SPLASH_OUT_MS;
  window.setTimeout(() => {
    if (out) splash.classList.add("splash-out");
    window.setTimeout(() => splash.remove(), out || 0);
  }, (reduced ? 0 : SPLASH_IN_MS) + hold);
}

function boot() {
  initPlatformClasses();
  initSplash();
  const cfg = loadConfig();
  state.apiUrl = effectiveApiUrl(cfg.apiUrl);
  state.token = cfg.token || "";
  state.usuario = cfg.usuario || "";
  state.inicio = cfg.inicio || firstDayMonthISO();
  state.fim = cfg.fim || todayISO();
  state.loginUser = cfg.usuario || "";
  initAutoFullscreen();
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister().catch(() => {}));
    }).finally(() => {
      navigator.serviceWorker
        .register(`./sw.js?v=${APP_VERSION}`)
        .then((reg) => reg.update())
        .catch(() => {});
    });
  }
  if (state.token && state.apiUrl) loadDesempenho();
}

boot();
