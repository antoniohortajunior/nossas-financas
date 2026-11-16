const APP_VERSION = "65";
/** Primeira linha de lançamentos nas abas Despesas / Alasca / Gastos Viagem (cabeçalho na linha 4). */
const DESP_DATA_START = 5;
const VIAGENS_SHEET = "Viagens";
const GASTOS_VIAGEM_SHEET = "Gastos Viagem";
const PAINEL_PERIOD_KEY = "financas-painel-period-v1";
const INSTALL_HINT_KEY = "financas-install-hint-v11";
const KEY = "minhas-financas-config";
const SCOPE =
  "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile";
/** Planilha padrão se planilha.json não existir ou estiver offline. */
const DEFAULTS = {
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1jSJaWTpsmrjskUPhQS1fvQxVbs7dpI05NMzT7-IkS-o/edit",
  clientId: "1012119713797-8tig992brdgokg5uovs3oendceb9e5oj.apps.googleusercontent.com",
};
/** Reserva quando planilha.json não traz revisão. */
const PLANILHA_REV_FALLBACK = 1;
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const state = {
  tab: "painel",
  clientId: "",
  spreadsheetId: "",
  token: null,
  loading: false,
  error: "",
  nome: "",
  mes: "",
  ano: new Date().getFullYear(),
  mesNum: new Date().getMonth() + 1,
  mesStart: "",
  mesEnd: "",
  despesas: [],
  alaskaDespesas: [],
  viagens: [],
  gastosViagem: [],
  painelViagem: "",
  receitas: [],
  categorias: [],
  painelDe: "",
  painelAte: "",
  painelFonte: "despesas",
  orcamento: [],
  listas: { categorias: [], tipos: [], prioridades: [], pagamentos: [], contas: [] },
  query: "",
  searchHitRow: null,
  filtro: "todas",
  catFilter: "",
  despSort: "vencimento",
  sheetOpen: false,
  sheetKind: "despesa",
  moreOpen: false,
  editingRow: null,
  toast: "",
  hint: "",
  booting: true,
  deleteConfirm: null,
  fluxoDias: [],
  ultimaConsolidacao: null,
  orcamentoOpen: false,
  categoriaSheetOpen: false,
  categoriaEditingRow: null,
  categoriaForm: { nome: "", limite: "", vinculo: "despesas" },
  viagemSheetOpen: false,
  viagemEditingRow: null,
  viagemCadastroForm: { nome: "", inicio: "", fim: "", previsto: "" },
  form: blankForm(),
};

function blankForm(kind = "despesa") {
  if (kind === "receita") {
    return {
      pago: false,
      descricao: "",
      fonte: "Salário",
      vencimento: todayISO(),
      previsto: "",
      realizado: "",
      conta: "Nubank",
      observacoes: "",
      dataRecebimento: "",
    };
  }
  return {
    pago: false,
    descricao: "",
    categoria: "Moradia",
    tipo: "Variável",
    vencimento: todayISO(),
    prioridade: "Média",
    previsto: "",
    realizado: "",
    dataPagamento: "",
    tipoPgto: "Crédito",
    conta: "Nubank",
    recorrente: "Não",
    parcela: "",
    observacoes: "",
    viagem: "",
  };
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowDateTimeBR() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function saveConfig(partial) {
  const next = { ...loadConfig(), ...partial };
  localStorage.setItem(KEY, JSON.stringify(next));
}

function extractSpreadsheetId(input) {
  const text = String(input || "").trim();
  const m = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;
  return "";
}

function normalizeClientId(input) {
  return String(input || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function brl(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Valores curtos para a grade Mês (sem R$; k/M acima de 10 mil). */
function brlShort(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1_000_000) {
    const x = abs / 1_000_000;
    const s = x >= 10 ? String(Math.round(x)) : x.toFixed(1).replace(".", ",");
    return `${sign}${s}M`;
  }
  if (abs >= 10_000) {
    const x = abs / 1000;
    const s = x >= 100 ? String(Math.round(x)) : x.toFixed(1).replace(".", ",");
    return `${sign}${s}k`;
  }
  const cents = abs < 1000 && abs % 1 !== 0;
  return (
    sign +
    abs.toLocaleString("pt-BR", {
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    })
  );
}

function pct(n) {
  return `${Math.round((Number(n) || 0) * 10) / 10}%`.replace(".", ",");
}

const PT_MONTH = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function serialToISO(v) {
  if (v == null || v === "") return "";
  if (typeof v === "string") {
    const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const mmy = v.toLowerCase().match(/([a-z]{3,9})[\s./\\-]+(?:de\s*)?(\d{4})/);
    if (!mmy) {
      const mmy2 = v.toLowerCase().match(/([a-z]{3,9})\.?\s*(?:de\s*)?(\d{4})/);
      if (mmy2) {
        const key = mmy2[1].slice(0, 3);
        const mon = PT_MONTH[key] || MONTHS.findIndex((m) => m.toLowerCase().startsWith(key)) + 1;
        if (mon > 0) return `${mmy2[2]}-${String(mon).padStart(2, "0")}-01`;
      }
    } else {
      const key = mmy[1].slice(0, 3);
      const mon = PT_MONTH[key] || MONTHS.findIndex((m) => m.toLowerCase().startsWith(key)) + 1;
      if (mon > 0) return `${mmy[2]}-${String(mon).padStart(2, "0")}-01`;
    }
    return v;
  }
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return "";
}

function cellYM(v) {
  const iso = serialToISO(v);
  if (/^\d{4}-\d{2}/.test(iso)) return iso.slice(0, 7);
  return "";
}

function isoToBR(iso) {
  if (!iso || iso.length < 10) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function isoToBRShort(iso) {
  if (!iso || iso.length < 10) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(-2)}`;
}

function ym(iso) {
  if (/^\d{4}-\d{2}/.test(iso || "")) return iso.slice(0, 7);
  return cellYM(iso);
}

function num(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).replace("R$", "").replace(/\s/g, "").trim();
  if (!s) return 0;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoneyInput(v) {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : num(v);
  if (!Number.isFinite(n) || n === 0) return n === 0 ? "0,00" : "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truthy(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v == null || v === "") return false;
  const s = String(v).trim().toUpperCase();
  if (s === "FALSE" || s === "FALSO" || s === "NÃO" || s === "NAO" || s === "NO") return false;
  return s === "TRUE" || s === "VERDADEIRO" || s === "SIM" || s === "PAGO" || s === "RECEBIDO" || s === "✓" || s === "☑";
}

function receitaRecebida(r) {
  return truthy(r.pago);
}

function isSheetFormulaError(v) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  const low = s.toLowerCase();
  if (low.startsWith("#")) return true;
  return (
    low === "error" ||
    low.includes("#error") ||
    low.includes("#erro") ||
    low.includes("#n/a") ||
    low.includes("#valor") ||
    low.includes("#ref") ||
    low.includes("#name")
  );
}

function cleanSheetStatus(raw) {
  const s = String(raw ?? "").trim();
  return s && !isSheetFormulaError(s) ? s : "";
}

/** Status da receita no app (evita exibir #ERROR! quando a fórmula da planilha quebra). */
function receitaStatus(r) {
  const hasLinha = String(r.descricao || r.categoria || "").trim() || num(r.previsto) || num(r.realizado);
  if (!hasLinha) return "";
  if (receitaRecebida(r)) return "Recebido";
  const d = r.vencimento?.slice(0, 10) || "";
  if (!d) return "A receber";
  return d < todayISO() ? "Atrasado" : "A receber";
}

function receitaStatusLabel(r) {
  const fromSheet = cleanSheetStatus(r.status);
  if (fromSheet) return fromSheet;
  return receitaStatus(r) || (r.pago ? "Recebido" : "Pendente");
}

function despesaStatusLabel(d) {
  const fromSheet = cleanSheetStatus(d.status);
  if (fromSheet) return fromSheet;
  return d.pago ? "Pago" : "Pendente";
}

function valorReceitaRecebida(r) {
  if (!receitaRecebida(r)) return 0;
  return num(r.realizado) || 0;
}

function receitasRecebidasTotal() {
  return monthReceitas().reduce((a, x) => a + valorReceitaRecebida(x), 0);
}

function colLetter(i) {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Notação A1 para a API (nome da aba entre aspas simples). */
function sheetRange(sheetTitle, a1) {
  const name = String(sheetTitle || "").replace(/'/g, "''");
  return `'${name}'!${a1}`;
}

function sheetKeyFromRange(rangeStr) {
  const part = String(rangeStr || "").split("!")[0] || "";
  return part.replace(/^'+|'+$/g, "").trim();
}

const DESP_COL = {
  pago: 0,
  competencia: 1,
  categoria: 2,
  descricao: 3,
  tipo: 4,
  vencimento: 5,
  dataPagamento: 6,
  prioridade: 7,
  status: 8,
  dias: 9,
  previsto: 10,
  realizado: 11,
  pct: 12,
  diferenca: 13,
  situacao: 14,
  tipoPgto: 16,
  conta: 17,
  recorrente: 18,
  parcela: 19,
  observacoes: 20,
  dtLancamento: 21,
  viagem: 22,
};

const DATA_PAGAMENTO_HEADERS = new Set([
  "pagamento",
  "data pagamento",
  "data do pagamento",
  "data pago",
  "dt pagamento",
  "dt. pagamento",
]);

function isFormaPagamentoHeader(k) {
  return k.includes("forma") && k.includes("pag");
}

function isTipoPgtoHeader(k) {
  return (
    k === "tipo pgto" ||
    k === "tipo de pgto" ||
    k === "tipo pagamento" ||
    (k.includes("tipo") && k.includes("pgto"))
  );
}

function isDtLancamentoHeader(k) {
  return k.includes("dt") && (k.includes("lançamento") || k.includes("lancamento"));
}

function despColIdx(idx, field) {
  if (field === "dataPagamento") return DESP_COL.dataPagamento;
  if (field === "viagem") return idx?.viagem != null ? idx.viagem : DESP_COL.viagem;
  if (idx?.[field] != null) return idx[field];
  return DESP_COL[field] ?? null;
}

function defaultDespIdx() {
  const idx = { ...DESP_COL };
  idx.viagem = DESP_COL.viagem;
  return idx;
}

/** Leitura de Gastos Viagem com intervalo A5:W (sem depender do cabeçalho na linha 4). */
function parseGastosViagemFixed(values) {
  const idx = defaultDespIdx();
  const rows = [];
  for (let i = 0; i < (values || []).length; i++) {
    const r = values[i] || [];
    if (!despesaRowHasData(r)) continue;
    const descricao = String(r[idx.descricao] ?? r[3] ?? "").trim();
    const temValor = num(r[idx.previsto] ?? r[10]) || num(r[idx.realizado] ?? r[11]);
    if (!descricao && !temValor) continue;
    const compRaw = r[idx.competencia] ?? r[1] ?? "";
    rows.push({
      sheetRow: DESP_DATA_START + i,
      pago: truthy(r[idx.pago] ?? r[0]),
      competenciaRaw: compRaw,
      competencia: serialToISO(compRaw),
      categoria: String(r[idx.categoria] ?? r[2] ?? ""),
      descricao,
      tipo: String(r[idx.tipo] ?? r[4] ?? ""),
      vencimento: serialToISO(r[idx.vencimento] ?? r[5]),
      prioridade: String(r[idx.prioridade] ?? r[7] ?? ""),
      status: cleanSheetStatus(r[idx.status] ?? r[8]),
      previsto: num(r[idx.previsto] ?? r[10]),
      realizado: num(r[idx.realizado] ?? r[11]),
      pct: num(r[idx.pct]),
      situacao: String(r[idx.situacao] ?? ""),
      dataPagamento: serialToISO(r[idx.dataPagamento] ?? r[6]),
      dataRecebimento: "",
      tipoPgto: String(r[idx.tipoPgto] ?? r[16] ?? ""),
      dtLancamento: String(r[idx.dtLancamento] ?? r[21] ?? ""),
      viagem: String(r[idx.viagem] ?? r[22] ?? "").trim(),
      conta: String(r[idx.conta] ?? r[17] ?? ""),
      recorrente: String(r[idx.recorrente] ?? r[18] ?? "Não"),
      parcela: String(r[idx.parcela] ?? ""),
      observacoes: String(r[idx.observacoes] ?? r[20] ?? ""),
      classe: "",
      limite: 0,
      restante: 0,
      idx,
    });
  }
  return { headerRow: 3, idx, rows };
}

function parseViagensDataOnly(values) {
  const rows = [];
  for (let i = 0; i < (values || []).length; i++) {
    const r = values[i] || [];
    const nome = String(r[0] || "").trim();
    if (!nome) continue;
    rows.push({
      sheetRow: DESP_DATA_START + i,
      nome,
      inicio: serialToISO(r[1]),
      fim: serialToISO(r[2]),
      previsto: num(r[3]),
      realizado: num(r[4]),
    });
  }
  return { headerRow: 3, rows };
}

function mapHeaders(row) {
  const aliases = {
    pago: ["pago?", "pago", "recebido?", "recebido"],
    competencia: ["competência", "competencia"],
    categoria: ["categoria", "fonte"],
    fonte: ["fonte"],
    descricao: ["descrição", "descricao"],
    tipo: ["tipo"],
    vencimento: ["vencimento", "data prevista"],
    prioridade: ["prioridade"],
    status: ["status"],
    dias: ["dias"],
    previsto: ["previsto"],
    realizado: ["realizado"],
    pct: ["%"],
    diferenca: ["diferença", "diferenca"],
    situacao: ["situação", "situacao"],
    dataRecebimento: ["recebimento", "data recebimento", "data do recebimento", "dt recebimento"],
    tipoPgto: ["tipo pgto", "tipo de pgto", "forma pagamento", "forma de pagamento", "meio pagamento", "forma"],
    dtLancamento: ["dt.lançamento", "dt.lancamento", "dt lançamento", "dt lancamento", "data lançamento", "data lancamento"],
    conta: ["conta"],
    recorrente: ["recorrente"],
    parcela: ["parcela"],
    observacoes: ["observações", "observacoes"],
    viagem: ["viagem"],
    classe: ["classe", "classe (50-30-20)", "classe 50-30-20"],
    limite: ["limite", "orçamento mensal", "orcamento mensal"],
    restante: ["restante"],
  };
  const idx = {};
  (row || []).forEach((h, i) => {
    const k = String(h || "").trim().toLowerCase();
    if (!k || k === "pagamentos" || isFormaPagamentoHeader(k)) return;
    if (isTipoPgtoHeader(k)) {
      idx.tipoPgto = i;
      return;
    }
    if (isDtLancamentoHeader(k)) {
      idx.dtLancamento = i;
      return;
    }
    if (DATA_PAGAMENTO_HEADERS.has(k)) {
      if (i === DESP_COL.dataPagamento) idx.dataPagamento = i;
      return;
    }
    for (const [field, names] of Object.entries(aliases)) {
      if (field === "tipoPgto" && !isTipoPgtoHeader(k) && k !== "forma" && !isFormaPagamentoHeader(k)) continue;
      if (names.includes(k) || (field === "classe" && k.includes("classe"))) idx[field] = i;
      else if (
        field === "limite" &&
        !k.includes("%") &&
        (k === "limite" || k.includes("orçamento mensal") || k.includes("orcamento mensal"))
      )
        idx[field] = i;
    }
  });
  idx.dataPagamento = DESP_COL.dataPagamento;
  if (idx.tipoPgto == null) idx.tipoPgto = DESP_COL.tipoPgto;
  if (idx.dtLancamento == null) idx.dtLancamento = DESP_COL.dtLancamento;
  if (idx.viagem == null) idx.viagem = DESP_COL.viagem;
  return idx;
}

function waitGoogle() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const t = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - t0 > 12000) {
        clearInterval(t);
        reject(new Error("Não foi possível carregar o login do Google."));
      }
    }, 40);
  });
}

let tokenClient = null;

async function api(path, options = {}) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${state.spreadsheetId}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    await login(true);
    return api(path, options);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `Erro ${res.status} na planilha`);
  }
  return data;
}

function login(silent) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error("Login do Google ainda não está pronto."));
      return;
    }
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error_description || resp.error));
        return;
      }
      state.token = resp.access_token;
      resolve(resp);
    };
    tokenClient.requestAccessToken({ prompt: silent ? "" : "consent" });
  });
}

async function initTokenClient() {
  await waitGoogle();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: state.clientId,
    scope: SCOPE,
    callback: () => {},
  });
}

async function ensureSession() {
  await initTokenClient();
  try {
    await login(true);
  } catch {
    await login(false);
  }
  await fetchGoogleProfile();
}

async function fetchGoogleProfile() {
  if (!state.token) return;
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const name = data.given_name || String(data.name || "").split(" ")[0] || "";
    if (name) {
      state.nome = name;
      saveConfig({ googleName: name });
    }
  } catch (_) {}
}

/**
 * Lê app/planilha.json no servidor. Se planilhaRev for maior que a salva no aparelho,
 * todos os usuários passam a usar o novo spreadsheetUrl na próxima abertura do app.
 */
async function syncPlanilhaFromPublisher() {
  let rev = PLANILHA_REV_FALLBACK;
  let url = DEFAULTS.spreadsheetUrl;
  let label = "";
  try {
    const res = await fetch(`./planilha.json?v=${APP_VERSION}`, { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      if (j.spreadsheetUrl) url = String(j.spreadsheetUrl).trim();
      if (j.planilhaRev != null) rev = Number(j.planilhaRev) || rev;
      if (j.nome) label = String(j.nome).trim();
    }
  } catch (_) {}
  const cfg = loadConfig();
  if ((cfg.planilhaRev || 0) >= rev) {
    state.planilhaLabel = cfg.planilhaLabel || label;
    return;
  }
  const id = extractSpreadsheetId(url);
  if (!id) return;
  saveConfig({
    planilhaRev: rev,
    spreadsheetUrl: url,
    spreadsheetId: id,
    planilhaLabel: label,
  });
  state._planilhaMigrated = true;
  state.planilhaLabel = label;
}

function applyStoredConfig() {
  const cfg = loadConfig();
  state.clientId = normalizeClientId(cfg.clientId || DEFAULTS.clientId);
  state.spreadsheetId = cfg.spreadsheetId || extractSpreadsheetId(DEFAULTS.spreadsheetUrl);
  const spreadsheetUrl = cfg.spreadsheetUrl || DEFAULTS.spreadsheetUrl;
  state.planilhaLabel = cfg.planilhaLabel || state.planilhaLabel || "";
  saveConfig({
    clientId: state.clientId,
    spreadsheetId: state.spreadsheetId,
    spreadsheetUrl,
    planilhaRev: cfg.planilhaRev,
    planilhaLabel: state.planilhaLabel,
  });
  if (cfg.googleName) state.nome = cfg.googleName;
}

function planilhaRefHint() {
  const id = state.spreadsheetId || "";
  if (!id) return "";
  const tail = id.slice(-6);
  const name = state.planilhaLabel ? esc(state.planilhaLabel) : `···${esc(tail)}`;
  return `<p class="planilha-ref muted">Planilha: ${name}</p>`;
}

function pillClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("pago") || s.includes("recebido") || s.includes("orçamento") || s === "economia") return "p-ok";
  if (s.includes("breve") || s.includes("atenção")) return "p-warn";
  if (s.includes("atras") || s.includes("estour")) return "p-bad";
  return "p-wait";
}

function sameMonth(iso, vencimento) {
  const want = `${state.ano}-${String(state.mesNum).padStart(2, "0")}`;
  const got = cellYM(iso) || ym(iso);
  if (got === want) return true;
  if (!got && vencimento) return cellYM(vencimento) === want;
  return false;
}

function inWorkMonth(d) {
  const start = state.mesStart?.slice(0, 10);
  const end = state.mesEnd?.slice(0, 10);
  const comp = d.competencia?.slice(0, 10);
  const venc = d.vencimento?.slice(0, 10);
  if (start && end && start.length === 10 && end.length === 10) {
    if (comp && comp >= start && comp <= end) return true;
    if (venc && venc >= start && venc <= end) return true;
  }
  if (d.competenciaRaw) {
    const raw = String(d.competenciaRaw).toLowerCase();
    const mon = MONTHS[state.mesNum - 1]?.slice(0, 3).toLowerCase();
    if (mon && raw.includes(mon) && raw.includes(String(state.ano))) return true;
  }
  return sameMonth(d.competencia, d.vencimento);
}

function isSummaryRow(descricao, joined) {
  const d = descricao.toLowerCase();
  const j = joined.toLowerCase();
  return j.includes("total geral") || j.includes("subtotal") || d.startsWith("total") || j.includes("soma ");
}

function normCat(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeCatVinculo(v) {
  const s = normCat(v);
  return s === "alasca" ? "alasca" : "despesas";
}

function vinculoPlanilha(vinculo) {
  return normalizeCatVinculo(vinculo) === "alasca" ? "Alasca" : "Despesas";
}

function categoriasNomesForKind(kind) {
  const want = kind === "alasca" ? "alasca" : "despesas";
  const nomes = state.categorias
    .filter((c) => normalizeCatVinculo(c.vinculo) === want)
    .map((c) => c.categoria);
  if (nomes.length) return nomes;
  if (want === "despesas") return state.categorias.map((c) => c.categoria);
  return [];
}

function listasCatalogStart(listas) {
  for (let i = 0; i < listas.length; i++) {
    const row = listas[i] || [];
    const joined = row.map((x) => String(x || "").toLowerCase()).join("|");
    if (joined.includes("categoria") && (joined.includes("classe") || joined.includes("50-30") || joined.includes("503020"))) {
      return i + 1;
    }
  }
  return listas.length ? 1 : 0;
}

function parseListasCatalog(listas) {
  const classes = {};
  const limites = {};
  const start = listasCatalogStart(listas);
  for (let i = start; i < listas.length; i++) {
    const cat = String(listas[i][0] || "").trim();
    const cls = String(listas[i][1] || "").trim();
    if (!cat) continue;
    const nk = normCat(cat);
    if (nk === "categoria" || nk === "categorias") continue;
    const cl = cls.toLowerCase();
    if (cls && !cl.includes("classe") && !cl.includes("50-30")) {
      classes[cat] = cls;
      classes[nk] = cls;
    }
    if (listas[i][3] != null && String(listas[i][3]).trim() !== "") {
      const lim = num(listas[i][3]);
      limites[cat] = lim;
      limites[nk] = lim;
    }
  }
  return { classes, limites };
}

function lookupClasse(categoria) {
  const c = String(categoria || "").trim();
  if (!c) return "";
  const map = state.listas?.classesPorCategoria || {};
  return map[c] || map[normCat(c)] || "";
}

function classeMatches(classe, partial) {
  const c = normCat(classe);
  const p = normCat(partial);
  if (p.startsWith("poupan")) return c.includes("poupan") || c.includes("invest");
  if (p.startsWith("necess")) return c.includes("necess");
  if (p.startsWith("desej")) return c.includes("desej");
  return c.includes(p);
}

function orcamentoClasse(o) {
  return String(o?.classe || lookupClasse(o?.categoria) || "").trim();
}

function lookupLimite(categoria) {
  const c = String(categoria || "").trim();
  if (!c) return 0;
  const map = state.listas?.limitesPorCategoria || {};
  return num(map[c] ?? map[normCat(c)] ?? 0);
}

function hydrateOrcamentoMeta() {
  state.orcamento = state.orcamento.map((o) => ({
    ...o,
    classe: orcamentoClasse(o),
    limite: num(o.limite) || lookupLimite(o.categoria),
  }));
}

function parseViagensTable(values) {
  if (!values || !values.length) return { headerRow: 3, rows: [] };
  let headerRow = 0;
  for (let i = 0; i < Math.min(values.length, 12); i++) {
    const joined = (values[i] || []).map((x) => String(x || "")).join(" ").toLowerCase();
    if (joined.includes("viagem") && (joined.includes("início") || joined.includes("inicio"))) {
      headerRow = i;
      break;
    }
  }
  const rows = [];
  for (let i = headerRow + 1; i < values.length; i++) {
    const r = values[i] || [];
    const nome = String(r[0] || "").trim();
    if (!nome) continue;
    rows.push({
      sheetRow: i + 1,
      nome,
      inicio: serialToISO(r[1]),
      fim: serialToISO(r[2]),
      previsto: num(r[3]),
      realizado: num(r[4]),
    });
  }
  if (headerRow === 0) headerRow = 3;
  return { headerRow, rows };
}

function viagensNomes() {
  return state.viagens.map((v) => v.nome).filter(Boolean);
}

function parseTables(batch) {
  const byRange = {};
  (batch.valueRanges || []).forEach((vr) => {
    byRange[sheetKeyFromRange(vr.range)] = vr.values || [];
  });

  const cfg = byRange.Config || [];
  const cfgName = String(cfg[0]?.[0] || "").trim();
  const googleName = loadConfig().googleName || state.nome || "";
  state.nome =
    googleName ||
    (cfgName && cfgName.toLowerCase() !== "meu nome" ? cfgName : "Olá");
  state.ano = Number(cfg[1]?.[0] || new Date().getFullYear());
  state.mes = String(cfg[2]?.[0] || MONTHS[new Date().getMonth()]);
  const idxMes = MONTHS.findIndex((m) => m.toLowerCase() === state.mes.toLowerCase());
  state.mesNum = Number(String(cfg[3]?.[0] ?? "").replace(",", ".")) || (idxMes >= 0 ? idxMes + 1 : new Date().getMonth() + 1);
  state.mesStart = serialToISO(cfg[5]?.[0]);
  state.mesEnd = serialToISO(cfg[6]?.[0]);
  const listas = byRange.Listas || [];
  const pickCol = (c, from = 1) =>
    listas.slice(from).map((r) => r[c]).filter((v) => v != null && String(v).trim() !== "");

  function parseCategorias(values) {
    let headerRow = 0;
    for (let i = 0; i < Math.min(values.length, 8); i++) {
      const joined = (values[i] || []).map((x) => String(x || "")).join(" ").toLowerCase();
      if (joined.includes("categoria") && (joined.includes("orçamento") || joined.includes("orcamento"))) {
        headerRow = i;
        break;
      }
    }
    const rows = [];
    for (let i = headerRow + 1; i < values.length; i++) {
      const r = values[i] || [];
      const nome = String(r[0] || "").trim();
      if (!nome) continue;
      rows.push({
        sheetRow: i + 1,
        categoria: nome,
        limite: num(r[1]),
        previsto: num(r[2]),
        realizado: num(r[3]),
        pct: num(r[4]),
        situacao: String(r[5] || "").trim(),
        vinculo: normalizeCatVinculo(r[6]),
      });
    }
    return { headerRow, rows };
  }

  const catParsed = parseCategorias(byRange.Categorias || []);
  state._catMeta = { headerRow: catParsed.headerRow };
  state.categorias = catParsed.rows;
  const cats = catParsed.rows;
  const limitesPorCategoria = {};
  const nomesDesp = [];
  const nomesAla = [];
  for (const c of cats) {
    if (normalizeCatVinculo(c.vinculo) === "alasca") nomesAla.push(c.categoria);
    else nomesDesp.push(c.categoria);
    if (c.limite) limitesPorCategoria[c.categoria] = c.limite;
  }
  const nomes = nomesDesp.length ? nomesDesp : cats.map((c) => c.categoria);
  state.listas = {
    categorias: nomes.length ? nomes : pickCol(0),
    categoriasDespesas: nomesDesp,
    categoriasAlasca: nomesAla,
    classesPorCategoria: {},
    limitesPorCategoria,
    tipos: pickCol(0).length ? pickCol(0) : ["Fixo", "Variável", "Assinatura"],
    prioridades: pickCol(1).length ? pickCol(1) : ["Alta", "Média", "Baixa"],
    pagamentos: pickCol(2).length ? pickCol(2) : ["Pix", "Débito", "Crédito", "Dinheiro", "Carnê"],
    contas: pickCol(3).length ? pickCol(3) : ["Nubank", "Itaú", "Carteira"],
    fontes: [],
  };

  function parseSheet(values, kind) {
    let headerRow = 0;
    for (let i = 0; i < Math.min(values.length, 15); i++) {
      const a = String(values[i][0] || "");
      if (a.includes("PESQUISA")) continue;
      const joined = values[i].map((x) => String(x || "")).join(" ").toLowerCase();
      const hasPago = a.toLowerCase().includes("pago") || joined.includes("pago");
      const hasRecebido = a.toLowerCase().includes("recebido") || joined.includes("recebido");
      const hasDesc = joined.includes("descrição") || joined.includes("descricao");
      const hasComp = joined.includes("competência") || joined.includes("competencia");
      const hasPrev = joined.includes("previsto");
      const hasFonte = joined.includes("fonte");
      if (
        kind === "orcamento" &&
        joined.includes("categoria") &&
        (joined.includes("limite") || joined.includes("classe") || joined.includes("realizado"))
      ) {
        headerRow = i;
        break;
      }
      if (kind === "receita" && (hasRecebido || hasComp) && (hasDesc || hasPrev || hasFonte)) {
        headerRow = i;
        break;
      }
      if (kind === "despesa" && hasPago && (hasDesc || hasComp || hasPrev)) {
        headerRow = i;
        break;
      }
    }
    if (kind === "despesa" && headerRow === 0) headerRow = 3;
    const idx = mapHeaders(values[headerRow] || []);
    const rows = [];
    for (let i = 0; i < values.length; i++) {
      if (i === headerRow) continue;
      if (i < headerRow && !despesaRowHasData(values[i])) continue;
      const r = values[i] || [];
      const marker = String(r[0] || "");
      const joined = r.map((x) => String(x || "")).join(" ");
      if (marker.includes("PESQUISA")) continue;
      const descricao = String(r[idx.descricao] ?? "");
      const fonte = kind === "receita" ? String(r[idx.fonte] ?? r[idx.categoria] ?? r[2] ?? "") : "";
      const categoria = kind === "receita" ? fonte : String(r[idx.categoria] ?? (kind === "orcamento" ? r[1] : "") ?? "");
      if (kind !== "orcamento" && !descricao && !categoria && !fonte) continue;
      if (kind === "orcamento" && !isOrcamentoDataRow(categoria)) continue;
      if (kind === "despesa" && isSummaryRow(descricao, joined)) continue;
      const compRaw = idx.competencia != null ? r[idx.competencia] : "";
      rows.push({
        sheetRow: i + 1,
        pago: truthy(kind === "despesa" ? (r[idx.pago] ?? r[0]) : r[idx.pago]),
        competenciaRaw: compRaw,
        competencia: serialToISO(compRaw),
        categoria: categoria || fonte,
        descricao,
        tipo: String(r[idx.tipo] || ""),
        vencimento: serialToISO(kind === "despesa" ? (r[idx.vencimento] ?? r[5]) : r[idx.vencimento]),
        prioridade: String(r[idx.prioridade] || ""),
        status: cleanSheetStatus(r[idx.status]),
        previsto: num(kind === "despesa" ? (r[idx.previsto] ?? r[10]) : r[idx.previsto]),
        realizado: num(kind === "despesa" ? (r[idx.realizado] ?? r[11]) : r[idx.realizado]),
        pct: num(r[idx.pct]),
        situacao: String(r[idx.situacao] || ""),
        dataPagamento: serialToISO(kind === "despesa" ? (r[idx.dataPagamento] ?? r[6]) : r[idx.dataPagamento]),
        dataRecebimento: serialToISO(r[idx.dataRecebimento]),
        tipoPgto: String(r[idx.tipoPgto] ?? r[idx.formaPagamento] ?? r[16] ?? ""),
        dtLancamento: String(r[idx.dtLancamento] ?? r[21] ?? ""),
        viagem: String(r[idx.viagem] ?? r[22] ?? "").trim(),
        conta: String(r[idx.conta] || ""),
        recorrente: String(r[idx.recorrente] || "Não"),
        parcela: String(r[idx.parcela] || ""),
        observacoes: String(r[idx.observacoes] || ""),
        classe: kind === "orcamento" ? String(r[idx.classe] ?? r[2] ?? "").trim() : String(r[idx.classe] || ""),
        limite: kind === "orcamento" ? num(r[3] ?? r[idx.limite]) : num(r[idx.limite]),
        restante: num(r[idx.restante]),
        idx,
      });
    }
    return { headerRow, idx, rows };
  }

  const d = parseSheet(byRange.Despesas || [], "despesa");
  const ak = parseSheet(byRange.Alasca || [], "despesa");
  const gvVals = byRange[GASTOS_VIAGEM_SHEET];
  const gv = parseGastosViagemFixed(gvVals || []);
  const viVals = byRange[VIAGENS_SHEET];
  const vi = parseViagensDataOnly(viVals || []);
  state._despMeta = d;
  state._alaskaMeta = byRange.Alasca && byRange.Alasca.length ? ak : null;
  state._gastosViagemMeta =
    gvVals != null
      ? gv
      : {
          headerRow: d.headerRow,
          idx: { ...d.idx, viagem: d.idx?.viagem ?? DESP_COL.viagem },
          rows: [],
        };
  state._viagensMeta = viVals != null ? vi : vi;
  state._recMeta = null;
  state.despesas = d.rows;
  state.alaskaDespesas = ak.rows;
  state.gastosViagem = gv.rows;
  state.viagens = vi.rows;
  state._gastosViagemSheetValues = gvVals || [];
  state._despSheetValues = byRange.Despesas || [];
  state._alaskaSheetValues = byRange.Alasca || [];
  state.receitas = [];
  state.orcamento = state.categorias.map((c) => ({
    categoria: c.categoria,
    limite: c.limite,
    previsto: c.previsto,
    realizado: c.realizado,
    pct: c.pct,
    situacao: c.situacao,
    restante: Math.max((c.limite || 0) - (c.realizado || 0), 0),
  }));
  enrichOrcamentoFromDespesas();
  hydrateOrcamentoMeta();
}

function enrichOrcamentoFromDespesas() {
  const totals = {};
  state.despesas.forEach((d) => {
    if (!inWorkMonth(d)) return;
    const cat = d.categoria || "Outros";
    if (!totals[cat]) totals[cat] = { previsto: 0, realizado: 0 };
    totals[cat].previsto += d.previsto;
    totals[cat].realizado += d.pago ? (num(d.realizado) || 0) : 0;
  });
  if (!Object.keys(totals).length) return;
  const seen = new Set(state.orcamento.map((o) => o.categoria));
  state.orcamento = state.orcamento.map((o) => {
    const t = totals[o.categoria];
    if (!t) return o;
    const limite = o.limite || 0;
    const uso = limite ? t.realizado / limite : 0;
    return {
      ...o,
      previsto: t.previsto,
      realizado: t.realizado,
      situacao: o.situacao || (uso > 1 ? "estourou" : uso >= 0.9 ? "atenção" : "no limite"),
    };
  });
  for (const [categoria, t] of Object.entries(totals)) {
    if (seen.has(categoria)) continue;
    state.orcamento.push({
      sheetRow: 0,
      categoria,
      classe: lookupClasse(categoria),
      limite: lookupLimite(categoria),
      previsto: t.previsto,
      realizado: t.realizado,
      situacao: "sem limite",
      idx: {},
    });
  }
}

async function batchGetRanges(ranges, render = "FORMATTED_VALUE") {
  const q = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  return api(`/values:batchGet?${q}&valueRenderOption=${render}`);
}

/** Lê Fluxo coluna a coluna — evita deslocar C/D quando células vazias são omitidas pela API. */
async function loadFluxoSheet() {
  const ranges = [
    "Fluxo de caixa!A5:A35",
    "Fluxo de caixa!B5:B35",
    "Fluxo de caixa!C5:C35",
    "Fluxo de caixa!D5:D35",
    "Fluxo de caixa!E5:E35",
    "Fluxo de caixa!F5:F35",
  ];
  const data = await batchGetRanges(ranges);
  const cols = (data.valueRanges || []).map((vr) => vr.values || []);
  const maxLen = Math.max(0, ...cols.map((c) => c.length));
  const rows = [];
  for (let i = 0; i < maxLen; i++) {
    rows.push([
      cols[0][i]?.[0],
      cols[1][i]?.[0],
      cols[2][i]?.[0],
      cols[3][i]?.[0],
      cols[4][i]?.[0],
      cols[5][i]?.[0],
    ]);
  }
  parseFluxoSheet(rows);
}

async function refresh() {
  state.loading = true;
  state.error = "";
  state.hint = "";
  render();
  try {
    const data = await batchGetRanges([
      "Config!B4:B14",
      "Despesas!A1:U400",
      "Categorias!A1:G60",
      "Listas!G4:N20",
    ]);
    try {
      const alaska = await batchGetRanges([sheetRange("Alasca", "A1:U400")]);
      data.valueRanges = data.valueRanges.concat(alaska.valueRanges);
    } catch (_) {}
    try {
      const viagemBatch = await batchGetRanges([
        sheetRange(VIAGENS_SHEET, `A${DESP_DATA_START}:E120`),
        sheetRange(GASTOS_VIAGEM_SHEET, `A${DESP_DATA_START}:W500`),
      ]);
      data.valueRanges = data.valueRanges.concat(viagemBatch.valueRanges);
    } catch (e) {
      state.hint =
        "Não foi possível ler Viagens / Gastos Viagem. Confira se as abas existem (Finanças → Criar abas Viagens + Gastos Viagem).";
    }
    parseTables(data);
    syncPainelPeriodDefaults();
    state.fluxoDias = [];
    state.fluxoFromSheet = false;
    state.ultimaConsolidacao = null;
    const monthCount = monthDespesas().length;
    if (
      (state.tab === "alasca" || state.painelFonte === "alasca") &&
      !state._alaskaMeta
    ) {
      state.hint =
        "Crie a aba Alasca na planilha (Finanças → Configurar → Criar aba Alasca) ou importe o modelo novo.";
    } else if (!state.despesas.length) {
      state.hint = "Nenhuma linha na aba Despesas. A planilha precisa das abas Config, Despesas, Categorias e Listas.";
    } else if (!monthCount) {
      state.hint = `${state.despesas.length} linha(s) na planilha, ${monthCount} no mês ${state.mes}/${state.ano}. Confira Config (B5/B6) e Competência ou Vencimento.`;
    }
  } catch (err) {
    state.error = err.message;
  } finally {
    state.loading = false;
    render();
  }
}

function monthDespesas() {
  return state.despesas.filter((d) => inWorkMonth(d));
}

function monthAlaska() {
  return state.alaskaDespesas.filter((d) => inWorkMonth(d));
}

/** Gastos de viagem costumam cair fora do “mês de trabalho” da planilha — lista tudo e filtra só na busca/filtros. */
function monthGastosViagem() {
  return state.gastosViagem;
}

function viagemTripOverlapsPainel(viagemNome) {
  const { start, end } = painelPeriodBounds();
  if (!start || !end || !viagemNome) return false;
  const trip = state.viagens.find((v) => String(v.nome || "").trim() === String(viagemNome).trim());
  if (!trip) return false;
  const ti = trip.inicio?.slice(0, 10);
  const tf = trip.fim?.slice(0, 10);
  if (ti && tf) return tf >= start && ti <= end;
  return false;
}

function gastoViagemInPainelPeriod(d) {
  if (expenseInPainelPeriod(d)) return true;
  return viagemTripOverlapsPainel(d.viagem);
}

function expenseRows(kind) {
  if (kind === "alasca") return state.alaskaDespesas;
  if (kind === "viagem") return state.gastosViagem;
  return state.despesas;
}

function sheetTitleForKind(kind) {
  if (kind === "alasca") return "Alasca";
  if (kind === "gastoviagem") return GASTOS_VIAGEM_SHEET;
  if (kind === "receita") return "Receitas";
  return "Despesas";
}

function loadPainelPeriodFromStore() {
  try {
    const raw = localStorage.getItem(PAINEL_PERIOD_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (o.painelDe) state.painelDe = o.painelDe;
    if (o.painelAte) state.painelAte = o.painelAte;
    if (["alasca", "despesas", "viagem"].includes(o.painelFonte)) state.painelFonte = o.painelFonte;
    if (o.painelViagem) state.painelViagem = o.painelViagem;
  } catch (_) {}
}

function savePainelPeriodToStore() {
  localStorage.setItem(
    PAINEL_PERIOD_KEY,
    JSON.stringify({
      painelDe: state.painelDe,
      painelAte: state.painelAte,
      painelFonte: state.painelFonte,
      painelViagem: state.painelViagem,
    })
  );
}

function syncPainelPeriodDefaults() {
  loadPainelPeriodFromStore();
  if (!state.painelDe && state.mesStart) state.painelDe = state.mesStart.slice(0, 10);
  if (!state.painelAte && state.mesEnd) state.painelAte = state.mesEnd.slice(0, 10);
}

function painelPeriodBounds() {
  const start = state.painelDe || state.mesStart?.slice(0, 10) || "";
  const end = state.painelAte || state.mesEnd?.slice(0, 10) || "";
  return { start, end };
}

function expenseInPainelPeriod(d) {
  const { start, end } = painelPeriodBounds();
  if (!start || !end) return inWorkMonth(d);
  const comp = d.competencia?.slice(0, 10);
  const venc = d.vencimento?.slice(0, 10);
  const pgto = d.dataPagamento?.slice(0, 10);
  if (comp && comp >= start && comp <= end) return true;
  if (pgto && pgto >= start && pgto <= end) return true;
  if (venc && venc >= start && venc <= end) return true;
  return false;
}

function despesasInPainelPeriod(kind = state.painelFonte) {
  const inPeriod = kind === "viagem" ? gastoViagemInPainelPeriod : expenseInPainelPeriod;
  let list = expenseRows(kind).filter(inPeriod);
  if (kind === "viagem" && state.painelViagem) {
    const v = state.painelViagem;
    list = list.filter((d) => String(d.viagem || "").trim() === v);
  }
  return list;
}

function monthReceitas() {
  return state.receitas.filter((d) => inWorkMonth(d));
}

function transactionMonthKey(d) {
  const comp = d.competencia?.slice(0, 10);
  const venc = d.vencimento?.slice(0, 10);
  if (comp && /^\d{4}-\d{2}-\d{2}$/.test(comp)) return comp.slice(0, 7);
  if (venc && /^\d{4}-\d{2}-\d{2}$/.test(venc)) return venc.slice(0, 7);
  const fromComp = ym(d.competencia) || cellYM(d.competenciaRaw);
  if (fromComp) return fromComp;
  return ym(d.vencimento) || "";
}

function workMonthKey() {
  return `${state.ano}-${String(state.mesNum).padStart(2, "0")}`;
}

function monthLabelShort(key) {
  const m = Number(String(key).slice(5, 7));
  const yy = String(key).slice(2, 4);
  if (!m || m < 1 || m > 12) return key;
  return `${String(m).padStart(2, "0")}/${yy}`;
}

function isOrcamentoDataRow(categoria) {
  const c = String(categoria || "").trim();
  if (!c) return false;
  const low = c.toLowerCase();
  if (low === "categoria" || low === "categorias") return false;
  if (c.toUpperCase() === "TOTAL") return false;
  return true;
}

function categoriaClasse(cat) {
  const fromListas = lookupClasse(cat);
  if (fromListas) return fromListas;
  const nk = normCat(cat);
  const o = state.orcamento.find((x) => normCat(x.categoria) === nk);
  return orcamentoClasse(o);
}

/** Igual ao Painel da planilha: soma Realizado do Orçamento por classe; fallback nas despesas pagas. */
function gastoPorClasse503020(partial) {
  let fromOrc = 0;
  for (const o of state.orcamento) {
    if (!isOrcamentoDataRow(o.categoria)) continue;
    const cls = orcamentoClasse(o);
    if (!classeMatches(cls, partial)) continue;
    fromOrc += num(o.realizado) || 0;
  }
  if (fromOrc > 0) return fromOrc;
  return monthDespesas()
    .filter((d) => d.pago && classeMatches(categoriaClasse(d.categoria), partial))
    .reduce((a, x) => a + (num(x.realizado) || 0), 0);
}

function despesasPagasTotal(list) {
  return list
    .filter((d) => d.pago)
    .reduce((a, x) => a + (num(x.realizado) || 0), 0);
}

function metrics() {
  const ds = despesasInPainelPeriod(state.painelFonte);
  let previsto = ds.reduce((a, x) => a + x.previsto, 0);
  if (state.painelFonte === "viagem" && state.painelViagem) {
    const v = state.viagens.find((x) => x.nome === state.painelViagem);
    if (v?.previsto) previsto = v.previsto;
  } else if (state.painelFonte === "viagem") {
    previsto = state.viagens.reduce((a, x) => a + (x.previsto || 0), 0);
  }
  const realizado = despesasPagasTotal(ds);
  const pagar = ds.filter((x) => !x.pago).reduce((a, x) => a + x.previsto, 0);
  const atrasadas = ds.filter((x) => String(x.status).toLowerCase().includes("atras")).length;
  const breve = ds.filter((x) => String(x.status).toLowerCase().includes("breve")).length;
  const limite = state.categorias
    .filter((x) => {
      if (state.painelFonte === "viagem") return false;
      return (
        normalizeCatVinculo(x.vinculo) === (state.painelFonte === "alasca" ? "alasca" : "despesas")
      );
    })
    .reduce((a, x) => a + (x.limite || 0), 0);
  return {
    previsto,
    realizado,
    pagar,
    economia: previsto - realizado,
    atrasadas,
    breve,
    uso: previsto ? realizado / previsto : 0,
    limite,
    usoLimite: limite ? realizado / limite : 0,
    painelFonte: state.painelFonte,
  };
}

function despValor(d) {
  return num(d.pago ? d.realizado || d.previsto : d.previsto);
}

function filteredDespesasBase(kind = "despesa") {
  let list =
    kind === "alasca"
      ? monthAlaska()
      : kind === "gastoviagem"
        ? monthGastosViagem()
        : monthDespesas();
  if (state.catFilter) {
    const nk = normCat(state.catFilter);
    list = list.filter((d) => normCat(d.categoria) === nk);
  }
  if (state.filtro === "pagar") list = list.filter((d) => !d.pago);
  if (state.filtro === "atrasadas") list = list.filter((d) => String(d.status).toLowerCase().includes("atras"));
  return list;
}

function findSearchHitRow(list, q) {
  const t = String(q || "").trim();
  if (!t) return null;

  if (isValueQuery(t)) {
    const target = num(t);
    if (!target) return null;
    let best = null;
    let bestVal = Infinity;
    for (const d of list) {
      const v = despValor(d);
      if (v >= target && v < bestVal) {
        best = d;
        bestVal = v;
      }
    }
    return best?.sheetRow ?? null;
  }

  const qDate = parseQueryDate(t);
  if (qDate) {
    let best = null;
    let bestDate = null;
    for (const d of list) {
      const v = d.vencimento?.slice(0, 10) || "";
      if (v && v >= qDate && (!bestDate || v < bestDate)) {
        best = d;
        bestDate = v;
      }
    }
    return best?.sheetRow ?? null;
  }

  return null;
}

function updateSearchHit() {
  const q = state.query.trim();
  if (state.tab !== "despesas" || !q || (!isValueQuery(q) && !parseQueryDate(q))) {
    state.searchHitRow = null;
    return;
  }
  state.searchHitRow = findSearchHitRow(filteredDespesasBase(), q);
}

function despPgtoDate(d) {
  if (!d.pago) return "";
  return d.dataPagamento?.slice(0, 10) || d.vencimento?.slice(0, 10) || "";
}

function recRecebDate(r) {
  if (!r.pago) return "";
  return r.dataRecebimento?.slice(0, 10) || r.vencimento?.slice(0, 10) || "";
}

function fluxoCellNum(v) {
  if (v == null || String(v).trim() === "") return null;
  return num(v);
}

function parseFluxoSheet(values) {
  state.fluxoDias = [];
  state.fluxoFromSheet = false;
  for (let i = 0; i < (values || []).length; i++) {
    const r = values[i] || [];
    const dia = serialToISO(r[0]);
    if (!dia) continue;
    const saldoFinal = fluxoCellNum(r[4]);
    state.fluxoDias.push({
      sheetRow: 5 + i,
      dia,
      saldoInicial: fluxoCellNum(r[1]),
      despesas: fluxoCellNum(r[2]),
      receitas: fluxoCellNum(r[3]),
      saldoFinal,
      consolidado: truthy(r[5]),
    });
  }
  state.fluxoDias.sort((a, b) => a.dia.localeCompare(b.dia));
  state.fluxoFromSheet = state.fluxoDias.some((x) => x.saldoFinal != null);
  state.ultimaConsolidacao = null;
  for (const row of state.fluxoDias) {
    if (!row.consolidado) break;
    state.ultimaConsolidacao = row.dia;
  }
}

function isDiaConsolidado(isoDate) {
  const u = state.ultimaConsolidacao;
  if (!u || !isoDate) return false;
  return isoDate.slice(0, 10) <= u.slice(0, 10);
}

function validateDataMovimento(isoDate, label = "pagamento/recebimento") {
  if (!isoDate) return `Informe a data de ${label}.`;
  if (isDiaConsolidado(isoDate)) {
    const ate = isoToBRShort(state.ultimaConsolidacao);
    return `Este dia já foi consolidado (até ${ate}). Não é possível alterar.`;
  }
  return null;
}

function despesaDataPagamento(fOrRow) {
  const pgto = fOrRow.dataPagamento?.slice(0, 10) || "";
  const venc = fOrRow.vencimento?.slice(0, 10) || "";
  return pgto || venc || "";
}

/** Ao marcar pago: mesma data em vencimento (F) e pagamento (G). */
function syncDespesaDatasPago(form) {
  if (!form?.pago) return;
  const pgto = form.dataPagamento?.slice(0, 10) || "";
  const venc = form.vencimento?.slice(0, 10) || "";
  const data = pgto || venc;
  if (!data) return;
  form.dataPagamento = data;
  form.vencimento = data;
}

function validatePagoRecebido(f, kind) {
  if (!f.pago) return null;
  if (kind === "receita") {
    const dt = f.dataRecebimento || f.vencimento;
    return validateDataMovimento(dt, "recebimento");
  }
  const dt = despesaDataPagamento(f);
  if (!dt) return "Informe o vencimento ou a data de pagamento.";
  return validateDataMovimento(dt, "pagamento");
}

/** Data da receita no fluxo — igual à planilha: Data prevista (col E). */
function fluxoRecDate(r) {
  if (!receitaRecebida(r)) return "";
  return r.vencimento?.slice(0, 10) || r.dataRecebimento?.slice(0, 10) || "";
}

function fluxoCaixaComputed() {
  const start = state.mesStart?.slice(0, 10);
  const end = state.mesEnd?.slice(0, 10);
  if (!start || !end) return [];
  const saldo0 = Number(state.saldoInicial) || 0;
  const days = [];
  let d = new Date(`${start}T12:00:00`);
  const endD = new Date(`${end}T12:00:00`);
  while (d <= endD) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${dd}`);
    d.setDate(d.getDate() + 1);
  }
  let prevFinal = saldo0;
  return days.map((day, i) => {
    const despesas = state.despesas
      .filter((x) => x.pago && despPgtoDate(x) === day)
      .reduce((a, x) => a + (num(x.realizado) || 0), 0);
    const receitas = state.receitas
      .filter((x) => receitaRecebida(x) && fluxoRecDate(x) === day)
      .reduce((a, x) => a + valorReceitaRecebida(x), 0);
    const saldoInicial = i === 0 ? saldo0 : prevFinal;
    const saldoFinal = saldoInicial - despesas + receitas;
    prevFinal = saldoFinal;
    return { dia: day, saldoInicial, despesas, receitas, saldoFinal };
  });
}

function fluxoRowByDia(isoDate) {
  const t = String(isoDate || "").slice(0, 10);
  return state.fluxoDias.find((x) => x.dia.slice(0, 10) === t);
}

/** Clica no dia: consolida até ele ou desfaz consolidação dele e dos anteriores (col F na planilha). */
async function toggleFluxoConsolidacao(isoDate) {
  if (!state.token || !state.spreadsheetId) {
    showToast("Conecte-se à planilha para consolidar.");
    return;
  }
  const target = String(isoDate || "").slice(0, 10);
  const hit = fluxoRowByDia(target);
  if (!hit) {
    showToast("Dia não encontrado na aba Fluxo de caixa.");
    return;
  }
  const desmarcar = !!hit.consolidado;
  const novoValor = desmarcar ? false : true;
  const data = [];
  for (const row of state.fluxoDias) {
    if (row.dia.slice(0, 10) > target) continue;
    if (row.consolidado === novoValor) continue;
    data.push({
      range: `Fluxo de caixa!F${row.sheetRow}`,
      values: [[novoValor]],
    });
  }
  if (!data.length) {
    showToast(desmarcar ? "Nada a desmarcar." : "Já consolidado até este dia.");
    return;
  }
  state.loading = true;
  render();
  try {
    await api("/values:batchUpdate?valueInputOption=USER_ENTERED", {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    });
    await loadFluxoSheet();
    showToast(
      desmarcar
        ? `Consolidação desfeita em ${isoToBRShort(target)} e dias anteriores.`
        : `Consolidado até ${isoToBRShort(target)} (inclui dias anteriores).`
    );
  } catch (err) {
    state.error = err.message;
    showToast(err.message);
  } finally {
    state.loading = false;
    render();
  }
}

function fluxoRows() {
  const today = todayISO();
  const computed = fluxoCaixaComputed();
  const compMap = Object.fromEntries(computed.map((r) => [r.dia, r]));

  if (state.fluxoFromSheet && state.fluxoDias.length) {
    return state.fluxoDias
      .filter((r) => r.dia <= today && r.saldoFinal != null)
      .map((r) => {
        const comp = compMap[r.dia];
        const despesas = num(r.despesas) || num(comp?.despesas) || 0;
        const receitas = num(r.receitas) || num(comp?.receitas) || 0;
        const saldoInicial = num(r.saldoInicial ?? comp?.saldoInicial ?? state.saldoInicial);
        const saldoFinal = num(r.saldoFinal ?? comp?.saldoFinal ?? saldoInicial - despesas + receitas);
        return { dia: r.dia, saldoInicial, despesas, receitas, saldoFinal };
      });
  }
  return computed.filter((r) => r.dia <= today);
}

function addDaysISO(iso, delta) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function iterDaysISO(from, to) {
  const out = [];
  if (!from || !to || from > to) return out;
  let cur = from.slice(0, 10);
  const end = to.slice(0, 10);
  while (cur <= end) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}

function lastDayOfMonthKey(key) {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  if (!y || !m) return "";
  const d = new Date(y, m, 0, 12, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstDayOfMonthKey(key) {
  return `${key}-01`;
}

function calendarMonthKeyNow() {
  return todayISO().slice(0, 7);
}

/** Saldos diários pelo fluxo (data de pgto/recebimento); âncora = 1º dia do mês em Config (B12). */
function buildCashSaldoByDay() {
  const anchor = state.mesStart?.slice(0, 10);
  const anchorSaldo = Number(state.saldoInicial) || 0;
  const deltas = {};
  const touch = (day) => {
    if (!day || day.length < 10) return;
    if (!deltas[day]) deltas[day] = { receitas: 0, despesas: 0 };
  };

  state.despesas.forEach((d) => {
    if (!d.pago) return;
    const day = despPgtoDate(d);
    if (!day) return;
    touch(day);
    deltas[day].despesas += num(d.realizado) || 0;
  });
  state.receitas.forEach((r) => {
    if (!receitaRecebida(r)) return;
    const day = fluxoRecDate(r) || recRecebDate(r);
    if (!day) return;
    touch(day);
    deltas[day].receitas += valorReceitaRecebida(r);
  });

  const fluxoMap = Object.fromEntries(fluxoRows().map((r) => [r.dia.slice(0, 10), r]));
  const movDays = Object.keys(deltas).sort();
  const today = todayISO();

  if (!anchor) {
    return { saldoStart: {}, saldoEnd: {}, deltas, anchor: "", today };
  }

  let minD = anchor;
  let maxD = today;
  for (const day of movDays) {
    if (day < minD) minD = day;
    if (day > maxD) maxD = day;
  }
  minD = firstDayOfMonthKey(minD.slice(0, 7));
  const maxMonth = maxD.slice(0, 7);
  const monthEnd = lastDayOfMonthKey(maxMonth);
  if (monthEnd && monthEnd > maxD) maxD = monthEnd;

  const days = iterDaysISO(minD, maxD);
  const anchorIdx = days.indexOf(anchor);
  const saldoStart = {};
  const saldoEnd = {};

  if (anchorIdx < 0) {
    return { saldoStart, saldoEnd, deltas, anchor, today };
  }

  const applyDay = (day, startVal) => {
    const flux = fluxoMap[day];
    const mov = deltas[day] || { receitas: 0, despesas: 0 };
    if (flux && state.fluxoFromSheet && flux.saldoInicial != null && flux.saldoFinal != null) {
      saldoStart[day] = num(flux.saldoInicial);
      saldoEnd[day] = num(flux.saldoFinal);
      return;
    }
    saldoStart[day] = startVal;
    saldoEnd[day] = startVal + mov.receitas - mov.despesas;
  };

  applyDay(anchor, anchorSaldo);

  for (let i = anchorIdx + 1; i < days.length; i++) {
    const day = days[i];
    const prev = days[i - 1];
    const start = saldoEnd[prev] ?? saldoStart[prev] ?? 0;
    applyDay(day, start);
  }
  for (let i = anchorIdx - 1; i >= 0; i--) {
    const day = days[i];
    const next = days[i + 1];
    const startNext = saldoStart[next];
    if (startNext == null) continue;
    const mov = deltas[day] || { receitas: 0, despesas: 0 };
    saldoEnd[day] = startNext;
    saldoStart[day] = saldoEnd[day] - mov.receitas + mov.despesas;
  }

  return { saldoStart, saldoEnd, deltas, anchor, today };
}

/** Resumo mensal: movimentação por data de pgto/recebimento; saldos do 1º dia e fim do mês (ou até hoje no mês corrente). */
function mesSummaries() {
  const { saldoStart, saldoEnd, deltas, today } = buildCashSaldoByDay();
  const monthKeys = new Set();
  Object.keys(deltas).forEach((day) => monthKeys.add(day.slice(0, 7)));
  const anchorKey = state.mesStart?.slice(0, 7);
  if (anchorKey) monthKeys.add(anchorKey);

  const keys = [...monthKeys].filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
  const curMonth = calendarMonthKeyNow();

  const rows = keys.map((key) => {
    let receitas = 0;
    let despesas = 0;
    for (const [day, mov] of Object.entries(deltas)) {
      if (day.slice(0, 7) !== key) continue;
      receitas += mov.receitas;
      despesas += mov.despesas;
    }
    const day1 = firstDayOfMonthKey(key);
    const isCurrent = key === curMonth;
    const monthLast = lastDayOfMonthKey(key);
    const endDay = isCurrent ? (today < monthLast ? today : monthLast) : monthLast;

    let saldoInicial = saldoStart[day1];
    if (saldoInicial == null && saldoEnd[day1] != null) {
      const mov0 = deltas[day1] || { receitas: 0, despesas: 0 };
      saldoInicial = saldoEnd[day1] - mov0.receitas + mov0.despesas;
    }
    let saldoFinal = saldoEnd[endDay];
    if (saldoFinal == null && saldoInicial != null) {
      saldoFinal = saldoInicial + receitas - despesas;
    }

    return {
      key,
      label: monthLabelShort(key),
      receitas,
      despesas,
      saldoInicial: saldoInicial ?? null,
      saldoFinal: saldoFinal ?? null,
      isCurrent,
    };
  });

  return rows.slice().reverse();
}

function despSubline(d) {
  const parts = [];
  if (d.vencimento) parts.push(`vence ${isoToBRShort(d.vencimento)}`);
  if (d.pago) {
    const pg = despPgtoDate(d);
    if (pg) parts.push(`pgto ${isoToBRShort(pg)}`);
  }
  if (!parts.length && d.tipo) parts.push(esc(d.tipo));
  const head = d.viagem ? `${esc(d.viagem)} · ${esc(d.categoria)}` : esc(d.categoria);
  return `${head}${parts.length ? " · " + parts.join(" · ") : ""}`;
}

function isValueQuery(q) {
  const t = String(q || "").trim();
  if (!t || !/\d/.test(t)) return false;
  return /^[\d.,\s]+$/.test(t);
}

function parseQueryDate(q) {
  const m = String(q || "")
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let y = Number(m[3]);
  if (m[3].length === 2) y = 2000 + y;
  return `${y}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}

function compareDataValorDesc(va, vb, a, b) {
  if (!va && !vb) return despValor(b) - despValor(a);
  if (!va) return 1;
  if (!vb) return -1;
  const byDate = vb.localeCompare(va);
  if (byDate !== 0) return byDate;
  return despValor(b) - despValor(a);
}

function despDtLancamentoSortKey(d) {
  const raw = String(d.dtLancamento || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 16).replace(" ", "T");
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return raw;
  const y = m[3];
  const mo = String(Number(m[2])).padStart(2, "0");
  const day = String(Number(m[1])).padStart(2, "0");
  const h = m[4] != null ? String(Number(m[4])).padStart(2, "0") : "00";
  const min = m[5] != null ? String(Number(m[5])).padStart(2, "0") : "00";
  return `${y}-${mo}-${day}T${h}:${min}`;
}

function sortedDespesas() {
  return sortedExpenseList("despesa");
}

function sortedAlaska() {
  return sortedExpenseList("alasca");
}

function sortedGastosViagem() {
  return sortedExpenseList("gastoviagem");
}

function sortedExpenseList(kind) {
  let list = filteredDespesasBase(kind);
  const q = state.query.trim();

  if (q && !isValueQuery(q) && !parseQueryDate(q)) {
    const ql = q.toLowerCase();
    list = list.filter(
      (d) =>
        String(d.descricao).toLowerCase().includes(ql) ||
        String(d.categoria).toLowerCase().includes(ql) ||
        String(d.viagem || "").toLowerCase().includes(ql)
    );
  }

  const sortMode = state.despSort || "vencimento";
  if (sortMode === "valor") {
    list.sort((a, b) => {
      const d = despValor(a) - despValor(b);
      return d !== 0 ? d : a.sheetRow - b.sheetRow;
    });
  } else if (sortMode === "pgto") {
    list.sort((a, b) => {
      const d = compareDataValorDesc(despPgtoDate(a), despPgtoDate(b), a, b);
      return d !== 0 ? d : a.sheetRow - b.sheetRow;
    });
  } else if (sortMode === "lancto") {
    list.sort((a, b) => {
      const d = compareDataValorDesc(despDtLancamentoSortKey(a), despDtLancamentoSortKey(b), a, b);
      return d !== 0 ? d : a.sheetRow - b.sheetRow;
    });
  } else {
    list.sort((a, b) => {
      const d = compareDataValorDesc(
        a.vencimento?.slice(0, 10) || "",
        b.vencimento?.slice(0, 10) || "",
        a,
        b
      );
      return d !== 0 ? d : a.sheetRow - b.sheetRow;
    });
  }
  return list;
}

function receitasMetrics() {
  const rs = monthReceitas();
  return {
    previsto: rs.reduce((a, x) => a + x.previsto, 0),
    realizado: receitasRecebidasTotal(),
    atrasadas: rs.filter((x) => receitaStatusLabel(x).toLowerCase().includes("atras")).length,
  };
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

function isFullscreenActive() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
}

function shouldShowFullscreenControl() {
  if (!isMobile() || isFullscreenActive()) return false;
  if (isIOS()) return !window.navigator.standalone;
  return !isStandalone();
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
  if (!isMobile() || isStandalone()) return "";

  let msg =
    "Menu ⋮ → <strong>Instalar app</strong> (ou Adicionar à tela inicial) e abra pelo ícone <strong>Finanças</strong>. Se a barra do Chrome aparecer, use <strong>Tela cheia</strong> ou <strong>⛶</strong> no topo.";
  if (isIOS()) {
    msg =
      "No iPhone, abra no <strong>Safari</strong> → Compartilhar → <strong>Adicionar à Tela de Início</strong> (não use o Chrome).";
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

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function options(list, selected) {
  const items = list.length ? list : [selected].filter(Boolean);
  return items.map((v) => `<option ${v === selected ? "selected" : ""}>${esc(v)}</option>`).join("");
}

function loadingView() {
  return `
    <div class="app">
      <div class="setup">
        <div class="hello">Minhas Finanças</div>
        <h1>Carregando…</h1>
        <p class="muted">Conectando à planilha e atualizando os dados.</p>
      </div>
    </div>`;
}

function loginView() {
  return `
    <div class="app">
      <div class="setup">
        <div class="hello">Minhas Finanças</div>
        <h1>Entrar</h1>
        <p>Toque abaixo para abrir com sua conta Google. Na primeira vez, o Google pede permissão; depois entra direto.</p>
        <p class="error" id="setupErr">${esc(state.error)}</p>
        <button class="save" id="btnConnect" style="margin:18px 0 0;width:100%">Entrar com Google</button>
      </div>
    </div>`;
}

function setupView() {
  return loginView();
}

function bottomDock() {
  return `
    <footer class="bottom-dock" role="navigation" aria-label="Menu principal">
      <nav class="dock-main tabs-4">
        <button type="button" class="tab ${state.tab === "painel" ? "on" : ""}" data-tab="painel">
          <span class="dock-ico" aria-hidden="true">◈</span><span class="dock-lbl">Painel</span>
        </button>
        <button type="button" class="tab ${state.tab === "despesas" ? "on" : ""}" data-tab="despesas">
          <span class="dock-ico" aria-hidden="true">≡</span><span class="dock-lbl">Despesas</span>
        </button>
        <button type="button" class="tab ${state.tab === "categorias" ? "on" : ""}" data-tab="categorias">
          <span class="dock-ico" aria-hidden="true">▦</span><span class="dock-lbl">Categ.</span>
        </button>
        <button type="button" class="tab ${state.tab === "alasca" ? "on" : ""}" data-tab="alasca">
          <span class="dock-ico" aria-hidden="true">⌂</span><span class="dock-lbl">Alasca</span>
        </button>
      </nav>
      <div class="dock-travel">
        <button type="button" class="travel-btn ${state.tab === "viagens" ? "on" : ""}" data-tab="viagens">Nossas viagens</button>
        <button type="button" class="travel-btn ${state.tab === "gastosviagem" ? "on" : ""}" data-tab="gastosviagem">Gastos na viagem</button>
      </div>
    </footer>`;
}

function firstEmptyCategoriaRow() {
  const start = (state._catMeta?.headerRow ?? 3) + 2;
  const used = new Set(state.categorias.map((c) => c.sheetRow));
  for (let r = start; r < start + 50; r++) {
    if (!used.has(r)) return r;
  }
  return start + state.categorias.length;
}

function openCategoriaEdit(sheetRow) {
  const c = state.categorias.find((x) => x.sheetRow === sheetRow);
  if (!c) return;
  state.categoriaEditingRow = sheetRow;
  state.categoriaForm = {
    nome: c.categoria,
    limite: fmtMoneyInput(c.limite),
    vinculo: normalizeCatVinculo(c.vinculo),
  };
  state.categoriaSheetOpen = true;
  render();
}

function openNewCategoria() {
  state.categoriaEditingRow = null;
  state.categoriaForm = { nome: "", limite: "", vinculo: "despesas" };
  state.categoriaSheetOpen = true;
  render();
}

function firstEmptyViagemRow() {
  const start = DESP_DATA_START;
  const used = new Set(state.viagens.map((v) => v.sheetRow));
  for (let r = start; r < start + 80; r++) {
    if (!used.has(r)) return r;
  }
  return start + state.viagens.length;
}

async function resolveNewViagemRow() {
  const start = DESP_DATA_START;
  const used = new Set(state.viagens.map((v) => v.sheetRow));
  try {
    const snap = await batchGetRanges([sheetRange(VIAGENS_SHEET, `A${start}:A${start + 79}`)]);
    const col = snap.valueRanges?.[0]?.values || [];
    for (let i = 0; i < col.length; i++) {
      const nome = String(col[i]?.[0] ?? "").trim();
      if (nome) used.add(start + i);
    }
  } catch (_) {}
  for (let r = start; r < start + 80; r++) {
    if (!used.has(r)) return r;
  }
  return start + used.size;
}

function openViagemEdit(sheetRow) {
  const v = state.viagens.find((x) => x.sheetRow === sheetRow);
  if (!v) return;
  state.viagemEditingRow = sheetRow;
  state.viagemCadastroForm = {
    nome: v.nome,
    inicio: v.inicio || "",
    fim: v.fim || "",
    previsto: fmtMoneyInput(v.previsto),
  };
  state.viagemSheetOpen = true;
  render();
}

function openNewViagem() {
  state.viagemEditingRow = null;
  state.viagemCadastroForm = { nome: "", inicio: todayISO(), fim: todayISO(), previsto: "" };
  state.viagemSheetOpen = true;
  render();
}

async function saveViagemCadastro() {
  const nome = String(state.viagemCadastroForm.nome || "").trim();
  if (!nome) {
    showToast("Informe o nome da viagem.");
    return;
  }
  const row = state.viagemEditingRow || (await resolveNewViagemRow());
  state.loading = true;
  state.viagemSheetOpen = false;
  render();
  try {
    try {
      await getViagensSheetId();
    } catch {
      showToast('Crie a aba Viagens (Finanças → Criar abas Viagens + Gastos Viagem).');
      return;
    }
    const prev = num(state.viagemCadastroForm.previsto);
    await api("/values:batchUpdate?valueInputOption=USER_ENTERED", {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: [
          { range: sheetRange(VIAGENS_SHEET, `A${row}`), values: [[nome]] },
          { range: sheetRange(VIAGENS_SHEET, `B${row}`), values: [[isoToBR(state.viagemCadastroForm.inicio)]] },
          { range: sheetRange(VIAGENS_SHEET, `C${row}`), values: [[isoToBR(state.viagemCadastroForm.fim)]] },
          { range: sheetRange(VIAGENS_SHEET, `D${row}`), values: [[prev]] },
        ],
      }),
    });
    showToast(state.viagemEditingRow ? "Viagem atualizada." : "Viagem cadastrada.");
    state.viagemEditingRow = null;
    await refresh();
  } catch (err) {
    state.error = err.message;
    showToast(err.message);
    render();
  } finally {
    state.loading = false;
    render();
  }
}

async function saveCategoriaSheet() {
  const nome = String(state.categoriaForm.nome || "").trim();
  if (!nome) {
    showToast("Informe o nome da categoria.");
    return;
  }
  const limite = num(state.categoriaForm.limite);
  const vinculo = vinculoPlanilha(state.categoriaForm.vinculo);
  const row = state.categoriaEditingRow || firstEmptyCategoriaRow();
  state.loading = true;
  state.categoriaSheetOpen = false;
  render();
  try {
    await api("/values:batchUpdate?valueInputOption=USER_ENTERED", {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: [
          { range: sheetRange("Categorias", `A${row}`), values: [[nome]] },
          { range: sheetRange("Categorias", `B${row}`), values: [[limite]] },
          { range: sheetRange("Categorias", `G${row}`), values: [[vinculo]] },
        ],
      }),
    });
    showToast(state.categoriaEditingRow ? "Categoria atualizada." : "Categoria criada.");
    state.categoriaEditingRow = null;
    await refresh();
  } catch (err) {
    state.error = err.message;
    showToast(err.message);
    render();
  } finally {
    state.loading = false;
    render();
  }
}

function categoriasView() {
  const rows = state.categorias
    .slice()
    .sort((a, b) => (b.realizado || 0) - (a.realizado || 0))
    .map(
      (c) => `
      <button type="button" class="cat-item" data-cat-row="${c.sheetRow}">
        <span>
          <b>${esc(c.categoria)}</b>
          <small>${normalizeCatVinculo(c.vinculo) === "alasca" ? "Alasca" : "Despesas"} · orçamento ${brl(c.limite)} · pago ${brl(c.realizado)}</small>
        </span>
        <span class="cat-amt">${esc(c.situacao || "—")}</span>
      </button>`
    )
    .join("");
  return `
    <div class="scroll">
      <div class="topbar">
        <div class="title" style="margin-top:0">Categorias</div>
        <div class="topbar-actions">
          <button class="linkish" id="btnReloadCat">${state.loading ? "…" : "Atualizar"}</button>
        </div>
      </div>
      <p class="muted" style="font-size:12px;margin-top:6px">Toque para editar nome, orçamento e se a categoria é de Despesas ou Alasca.</p>
      <button type="button" class="save" id="btnNovaCategoria" style="margin-top:14px">Nova categoria</button>
      ${rows || `<div class="empty" style="margin-top:16px">Nenhuma categoria na aba Categorias.</div>`}
    </div>`;
}

function categoriaSheetView() {
  if (!state.categoriaSheetOpen) return "";
  const f = state.categoriaForm;
  return `
    <div class="sheet open" id="catSheet">
      <div class="sheet-head">
        <h2>${state.categoriaEditingRow ? "Editar categoria" : "Nova categoria"}</h2>
        <div class="sheet-head-actions">
          <button type="button" class="ghost" id="closeCatSheet" aria-label="Fechar">×</button>
        </div>
      </div>
      <div class="sheet-body">
        <div class="field"><label>Nome</label><input id="fCatNome" value="${esc(f.nome)}" autocomplete="off" /></div>
        <div class="field"><label>Orçamento mensal (R$)</label><input id="fCatLimite" inputmode="decimal" value="${esc(f.limite)}" /></div>
        <div class="field"><label>Vinculado a</label><select id="fCatVinculo">
          <option value="despesas" ${normalizeCatVinculo(f.vinculo) === "despesas" ? "selected" : ""}>Despesas</option>
          <option value="alasca" ${normalizeCatVinculo(f.vinculo) === "alasca" ? "selected" : ""}>Alasca</option>
        </select></div>
      </div>
      <button class="save" id="saveCatBtn">${state.loading ? "Salvando…" : "Salvar na planilha"}</button>
    </div>`;
}

function alascaView() {
  return expenseTabView({
    kind: "alasca",
    subtitle: "Motorhome — manutenção e acessórios",
    title: "Alasca",
    fabId: "fabAlaska",
    scrollId: "alaskaScroll",
    emptyMsg: "Nenhum lançamento do Alasca neste mês. Toque no + para lançar.",
  });
}

function gastosViagemView() {
  return expenseTabView({
    kind: "gastoviagem",
    subtitle: "Lançamentos ligados a uma viagem",
    title: "Gastos na viagem",
    fabId: "fabGastoViagem",
    scrollId: "gastosViagemScroll",
    emptyMsg: "Nenhum gasto de viagem. Cadastre uma viagem em Minhas Viagens e toque no +.",
  });
}

function minhasViagensView() {
  const rows = state.viagens
    .slice()
    .sort((a, b) => String(b.inicio || "").localeCompare(String(a.inicio || "")))
    .map(
      (v) => `
      <button type="button" class="cat-item" data-viagem-row="${v.sheetRow}">
        <span>
          <b>${esc(v.nome)}</b>
          <small>${isoToBRShort(v.inicio) || "—"} a ${isoToBRShort(v.fim) || "—"} · previsto ${brl(v.previsto)}</small>
        </span>
        <span class="cat-amt">${brl(v.realizado)}</span>
      </button>`
    )
    .join("");
  return `
    <div class="scroll">
      <div class="hello">Cadastro de viagens</div>
      <div class="title">Minhas Viagens</div>
      <p class="muted" style="font-size:12px;margin-top:6px">Defina nome, período e gasto previsto. Os lançamentos ficam em Gastos na Viagem.</p>
      <button type="button" class="save" id="btnNovaViagem" style="margin-top:14px">Nova viagem</button>
      ${rows || `<div class="empty" style="margin-top:16px">Nenhuma viagem cadastrada.</div>`}
    </div>`;
}

function viagemCadastroSheetView() {
  if (!state.viagemSheetOpen) return "";
  const f = state.viagemCadastroForm;
  return `
    <div class="sheet open" id="viagemSheet">
      <div class="sheet-head">
        <h2>${state.viagemEditingRow ? "Editar viagem" : "Nova viagem"}</h2>
        <div class="sheet-head-actions">
          <button type="button" class="ghost" id="closeViagemSheet" aria-label="Fechar">×</button>
        </div>
      </div>
      <div class="sheet-body">
        <div class="field"><label>Nome da viagem</label><input id="fViagemNome" value="${esc(f.nome)}" autocomplete="off" /></div>
        <div class="row2">
          <div class="field"><label>Data inicial</label><input id="fViagemIni" type="date" value="${esc(f.inicio)}" /></div>
          <div class="field"><label>Data final</label><input id="fViagemFim" type="date" value="${esc(f.fim)}" /></div>
        </div>
        <div class="field"><label>Gasto total previsto (R$)</label><input id="fViagemPrev" inputmode="decimal" value="${esc(f.previsto)}" placeholder="0,00" /></div>
      </div>
      <button class="save" id="saveViagemBtn">${state.loading ? "Salvando…" : "Salvar na planilha"}</button>
    </div>`;
}

function expenseTabView({ kind, subtitle, title, fabId, scrollId, emptyMsg }) {
  const hit = state.searchHitRow;
  const sorted =
    kind === "alasca" ? sortedAlaska() : kind === "gastoviagem" ? sortedGastosViagem() : sortedDespesas();
  const list = sorted
    .map(
      (d) => `
      <div class="item${d.sheetRow === hit ? " search-hit" : ""}" data-row="${d.sheetRow}" data-kind="${kind}" role="button" tabindex="0">
        <span class="check ${d.pago ? "yes" : ""}" data-toggle-kind="${kind}" data-toggle-row="${d.sheetRow}">${d.pago ? "✓" : ""}</span>
        <span class="mid"><b>${esc(d.descricao || "(sem descrição)")}</b><small>${despSubline(d)}</small></span>
        <span class="right"><b>${brl(despValor(d))}</b><span class="pill ${pillClass(despesaStatusLabel(d))}">${esc(despesaStatusLabel(d))}</span></span>
      </div>`
    )
    .join("");
  return `
    <div class="scroll" id="${scrollId}">
      <div class="hello">${esc(subtitle)}</div>
      <div class="title-row">
        <div class="title">${esc(title)}</div>
        <div class="sort-btns">
          <button type="button" class="sort-btn ${state.despSort === "vencimento" ? "on" : ""}" data-sort="vencimento">vencto</button>
          <button type="button" class="sort-btn ${state.despSort === "pgto" ? "on" : ""}" data-sort="pgto">Pgto</button>
          <button type="button" class="sort-btn ${state.despSort === "valor" ? "on" : ""}" data-sort="valor">valor</button>
          <button type="button" class="sort-btn ${state.despSort === "lancto" ? "on" : ""}" data-sort="lancto">Lancto</button>
        </div>
      </div>
      <input class="search" id="q" placeholder="Descrição, valor (ex.: 150,00) ou data (dd/mm/aa)" value="${esc(state.query)}" />
      <div class="chips">
        <button class="chip ${state.filtro === "todas" ? "on" : ""}" data-filtro="todas">Todas</button>
        <button class="chip ${state.filtro === "pagar" ? "on" : ""}" data-filtro="pagar">A pagar</button>
        <button class="chip ${state.filtro === "atrasadas" ? "on" : ""}" data-filtro="atrasadas">Atrasadas</button>
        ${state.catFilter ? `<button type="button" class="chip chip-cat on" data-clear-cat>✕ ${esc(state.catFilter)}</button>` : ""}
      </div>
      ${list || `<div class="empty">${esc(emptyMsg)}</div>`}
    </div>
    <button class="fab" id="${fabId}">+</button>`;
}

function fluxoDailyChartHtml(rows) {
  const data = (rows || []).slice().sort((a, b) => a.dia.localeCompare(b.dia));
  if (!data.length) return "";

  const gW = 28;
  const pad = { l: 6, r: 10, t: 10, b: 30 };
  const movH = 92;
  const salH = 76;
  const gap = 12;
  const W = pad.l + data.length * gW + pad.r;
  const H = pad.t + movH + gap + salH + pad.b;
  const movBase = pad.t + movH;
  const salTop = pad.t + movH + gap;
  const salBase = salTop + salH;

  const maxMov = Math.max(1, ...data.map((r) => Math.max(num(r.despesas), num(r.receitas))));
  const saldos = data.map((r) => num(r.saldoFinal));
  let salMin = Math.min(...saldos);
  let salMax = Math.max(...saldos);
  const padSal = Math.max((salMax - salMin) * 0.08, 50);
  salMin -= padSal;
  salMax += padSal;
  const salRange = salMax - salMin || 1;

  const svg = [];
  const barW = 10;
  data.forEach((r, i) => {
    const cx = pad.l + i * gW + gW / 2;
    const rec = num(r.receitas);
    const desp = num(r.despesas);
    const rh = rec ? Math.max((rec / maxMov) * (movH - 6), 2) : 0;
    const dh = desp ? Math.max((desp / maxMov) * (movH - 6), 2) : 0;
    if (rh) {
      svg.push(
        `<rect x="${cx - barW - 1}" y="${movBase - rh}" width="${barW - 2}" height="${rh}" fill="#059669" rx="2" opacity="0.92"/>`
      );
    }
    if (dh) {
      svg.push(
        `<rect x="${cx + 2}" y="${movBase - dh}" width="${barW - 2}" height="${dh}" fill="#e11d48" rx="2" opacity="0.92"/>`
      );
    }
    const day = r.dia.slice(8, 10);
    svg.push(`<text x="${cx}" y="${H - 10}" text-anchor="middle" class="flux-chart-tick">${day}</text>`);
  });

  const pts = data
    .map((r, i) => {
      const cx = pad.l + i * gW + gW / 2;
      const sy = salBase - ((num(r.saldoFinal) - salMin) / salRange) * (salH - 8);
      return `${cx},${sy}`;
    })
    .join(" ");
  svg.push(`<line x1="${pad.l}" y1="${salBase}" x2="${W - pad.r}" y2="${salBase}" stroke="#e2e8f0" stroke-width="1"/>`);
  svg.push(`<polyline points="${pts}" fill="none" stroke="#0f766e" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>`);
  data.forEach((r, i) => {
    const cx = pad.l + i * gW + gW / 2;
    const sy = salBase - ((num(r.saldoFinal) - salMin) / salRange) * (salH - 8);
    svg.push(`<circle cx="${cx}" cy="${sy}" r="3" fill="#0f766e" stroke="#fff" stroke-width="1.5"/>`);
  });

  return `
    <div class="flux-chart-card">
      <div class="flux-chart-legend">
        <span><i class="sw in"></i> Entradas</span>
        <span><i class="sw out"></i> Saídas</span>
        <span><i class="sw bal"></i> Saldo final</span>
      </div>
      <div class="flux-chart-scroll" tabindex="0" aria-label="Gráfico dia a dia: arraste para ver todos os dias">
        <svg class="flux-chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-hidden="true">
          ${svg.join("")}
        </svg>
      </div>
      <p class="flux-chart-hint">Barras: movimento do dia · linha: saldo ao fim do dia (esquerda → hoje)</p>
    </div>`;
}

function fluxoView() {
  const today = todayISO();
  const rows = fluxoRows();
  const last = rows.length ? rows[rows.length - 1] : null;
  const consMap = Object.fromEntries((state.fluxoDias || []).map((x) => [x.dia, x.consolidado]));
  const list = rows
    .slice()
    .reverse()
    .map((r) => {
      const mov = r.despesas || r.receitas;
      const isToday = r.dia === today;
      const cons = consMap[r.dia];
      const consHint = cons ? "Desfazer consolidação deste dia e dos anteriores" : "Consolidar este dia e os anteriores ainda abertos";
      return `<button type="button" class="flux-row ${isToday ? "today" : ""} ${mov ? "mov" : ""} ${cons ? "consolidado" : ""}" data-flux-dia="${esc(r.dia)}" title="${esc(consHint)}">
        <div class="flux-head">
          <b>${isoToBRShort(r.dia)}</b>
          ${isToday ? '<span class="flux-tag">hoje</span>' : ""}
          ${cons ? '<span class="flux-tag locked">consolidado</span>' : ""}
        </div>
        <div class="flux-grid">
          <div><span>Inicial</span><b>${brl(r.saldoInicial)}</b></div>
          <div><span>Saídas</span><b class="out">${r.despesas ? brl(r.despesas) : "—"}</b></div>
          <div><span>Entradas</span><b class="in">${r.receitas ? brl(r.receitas) : "—"}</b></div>
          <div><span>Final</span><b>${brl(r.saldoFinal)}</b></div>
        </div>
      </button>`;
    })
    .join("");
  return `
    <div class="scroll">
      <div class="hello">Movimentação diária</div>
      <div class="title">Fluxo de caixa</div>
      <div class="hero flux-hero">
        <div class="lbl">Saldo final ${last ? `(${isoToBRShort(last.dia)})` : ""}</div>
        <div class="val">${brl(last?.saldoFinal ?? state.saldoInicial ?? 0)}</div>
        <div class="sub">Saldo inicial do mês: ${brl(state.saldoInicial || 0)} (Config B12) · exibindo até hoje</div>
        ${state.ultimaConsolidacao ? `<div class="sub">Consolidado até ${isoToBRShort(state.ultimaConsolidacao)} — lançamentos nessa data ou anteriores estão travados</div>` : ""}
      </div>
      <div class="section">Por dia (mais recente primeiro)</div>
      <p class="flux-tap-hint">Toque em um dia para consolidar até ele ou desfazer consolidação dele e dos anteriores.</p>
      ${list || `<p class="muted">Defina o mês em Config para ver o fluxo.</p>`}
      ${rows.length ? `<div class="section">Gráfico do mês</div>${fluxoDailyChartHtml(rows)}` : ""}
    </div>`;
}

const PIE_CAT_COLORS = [
  "#0f766e",
  "#e11d48",
  "#d97706",
  "#7c3aed",
  "#0284c7",
  "#059669",
  "#db2777",
  "#4f46e5",
  "#ca8a04",
  "#64748b",
];

function categoriasGastoPainel() {
  const totals = {};
  despesasInPainelPeriod(state.painelFonte).forEach((d) => {
    const cat = String(d.categoria || "Outros").trim() || "Outros";
    const v = d.pago ? num(d.realizado) || num(d.previsto) : num(d.previsto);
    totals[cat] = (totals[cat] || 0) + v;
  });
  const entries = Object.entries(totals)
    .map(([categoria, valor]) => ({ categoria, valor }))
    .filter((x) => x.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const total = entries.reduce((a, x) => a + x.valor, 0);
  return { entries, total };
}

function painelCategoriasPieHtml() {
  const { entries, total } = categoriasGastoPainel();
  if (!entries.length) {
    return `<div class="empty pie-empty">Sem lançamentos no período para o gráfico.</div>`;
  }
  let acc = 0;
  const slices = entries.map((e, i) => {
    const share = (e.valor / total) * 100;
    const start = acc;
    acc += share;
    return {
      ...e,
      color: PIE_CAT_COLORS[i % PIE_CAT_COLORS.length],
      pct: share,
      start,
      end: acc,
    };
  });
  const gradient = slices.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ");
  const legend = slices
    .map(
      (s) => `
      <button type="button" class="pie-leg-row" data-pie-cat="${esc(s.categoria)}" title="Ver despesas de ${esc(s.categoria)}">
        <span class="pie-swatch" style="background:${s.color}"></span>
        <span class="pie-leg-mid"><b>${esc(s.categoria)}</b><small>${pct(s.pct)}</small></span>
        <span class="pie-leg-val">${brl(s.valor)}</span>
      </button>`
    )
    .join("");
  return `
    <div class="pie-card">
      <p class="pie-hint">Pagas: realizado · em aberto: previsto · toque na categoria para ver os lançamentos</p>
      <div class="pie-layout">
        <div class="pie-wrap">
          <div class="pie-chart" style="background:conic-gradient(${gradient})" role="img" aria-label="Gastos por categoria"></div>
          <div class="pie-hole"><span>${brl(total)}</span><small>total</small></div>
        </div>
        <div class="pie-legend">${legend}</div>
      </div>
    </div>`;
}

function painelView(m) {
  const { start, end } = painelPeriodBounds();
  const fonteLbl =
    m.painelFonte === "alasca" ? "Alasca" : m.painelFonte === "viagem" ? "Viagem" : "Despesas";
  const viagemOpts = viagensNomes()
    .map(
      (n) =>
        `<option value="${esc(n)}" ${state.painelViagem === n ? "selected" : ""}>${esc(n)}</option>`
    )
    .join("");
  return `
    <div class="scroll">
      ${renderInstallHint()}
      <div class="topbar">
        <div class="hello">Olá, ${esc(state.nome)} <span class="app-ver">v${APP_VERSION}</span></div>
        <div class="topbar-actions">
          <button type="button" class="btn-orc-mini" id="btnOrcamento">Categorias</button>
          ${renderFullscreenBarBtn()}
          <button class="linkish" id="btnReload">${state.loading ? "Atualizando…" : "Atualizar"}</button>
        </div>
      </div>
      <div class="period-row">
        <label class="period-field"><span>Início</span><input type="date" id="painelDe" value="${esc(start)}" /></label>
        <label class="period-field"><span>Fim</span><input type="date" id="painelAte" value="${esc(end)}" /></label>
        <button type="button" class="period-go" id="btnPainelPeriod">Atualizar</button>
      </div>
      <div class="chips painel-fonte">
        <button type="button" class="chip ${state.painelFonte === "despesas" ? "on" : ""}" data-painel-fonte="despesas">Despesas</button>
        <button type="button" class="chip ${state.painelFonte === "alasca" ? "on" : ""}" data-painel-fonte="alasca">Alasca</button>
        <button type="button" class="chip ${state.painelFonte === "viagem" ? "on" : ""}" data-painel-fonte="viagem">Viagem</button>
      </div>
      <div class="painel-viagem-pick ${state.painelFonte === "viagem" ? "" : "hidden"}">
        <label class="period-field" style="flex:1"><span>Viagem</span>
          <select id="painelViagemSel">
            <option value="">Todas as viagens</option>
            ${viagemOpts}
          </select>
        </label>
      </div>
      <p class="muted painel-period-hint">Painel: <b>${esc(fonteLbl)}</b>${state.painelFonte === "viagem" && state.painelViagem ? ` · ${esc(state.painelViagem)}` : ""} · período selecionado</p>
      ${planilhaRefHint()}
      <div class="grid2">
        <div class="kpi"><span>PREVISTO</span><b>${brl(m.previsto)}</b><small class="kpi-hint">no período</small></div>
        <div class="kpi"><span>REALIZADO</span><b style="color:var(--rose)">${brl(m.realizado)}</b><small class="kpi-hint">só pagas</small></div>
        <div class="kpi"><span>USO DO PLANO</span><b>${m.previsto ? pct(m.uso * 100) : "—"}</b><small class="kpi-hint">realizado ÷ previsto</small></div>
        <div class="kpi"><span>A PAGAR</span><b style="color:var(--violet)">${brl(m.pagar)}</b><small class="kpi-hint">previsto em aberto</small></div>
      </div>
      <div class="section">Resumo</div>
      <div class="alert"><span class="dot" style="background:${m.realizado <= m.previsto ? "var(--emerald)" : "var(--rose)"}"></span> ${m.realizado <= m.previsto ? "Despesas pagas ainda dentro do previsto" : "Você já gastou mais do que o previsto neste mês"}</div>
      <div class="alert"><span class="dot" style="background:${m.atrasadas ? "var(--rose)" : m.breve ? "var(--amber)" : "var(--emerald)"}"></span> ${m.atrasadas ? `${m.atrasadas} conta(s) atrasada(s)` : m.breve ? `${m.breve} conta(s) vencem em breve` : "Nenhuma conta atrasada no mês"}</div>
      <div class="alert"><span class="dot" style="background:${m.economia >= 0 ? "var(--emerald)" : "var(--rose)"}"></span> Economia vs. previsto: ${brl(m.economia)}</div>
      <div class="section">Gastos por categoria</div>
      ${painelCategoriasPieHtml()}
      ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}
      ${state.hint ? `<div class="alert"><span class="dot" style="background:var(--amber)"></span> ${esc(state.hint)}</div>` : ""}
    </div>`;
}

function orcamentoBody(m) {
  const rows = state.orcamento
    .filter((o) => isOrcamentoDataRow(o.categoria))
    .map((o) => {
      const uso = o.limite ? o.realizado / o.limite : 0;
      const color = uso > 1 ? "var(--rose)" : uso >= 0.9 ? "var(--amber)" : "var(--teal)";
      const sit = o.situacao || (uso > 1 ? "estourou" : uso >= 0.9 ? "atenção" : "no limite");
      return `<div class="cat">
        <div style="display:flex;justify-content:space-between;font-size:13px"><b>${esc(o.categoria)}</b><span>${brl(o.realizado)}</span></div>
        <div class="track" style="margin-top:8px"><div class="fill" style="width:${Math.min(uso * 100, 120)}%;background:${color}"></div></div>
        <small>Limite ${brl(o.limite)} · ${esc(sit)}</small>
      </div>`;
    })
    .join("");
  const deg = Math.min(m.usoLimite, 1) * 360;
  return `
      <div class="ring-wrap">
        <div class="ring" style="background:conic-gradient(var(--teal) 0 ${deg}deg,#e2e8f0 ${deg}deg 360deg)"><i>${Math.round(m.usoLimite * 100)}%</i></div>
        <div>
          <div style="font-size:12px;color:var(--muted)">${esc(state.mes)} ${esc(state.ano)}</div>
          <div style="font-weight:700;margin-top:4px">${brl(m.realizado)} / ${brl(m.limite)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">Restam ${brl(Math.max(m.limite - m.realizado, 0))} no mês</div>
        </div>
      </div>
      <div class="section">Por categoria</div>
      ${rows || `<div class="empty">Sem categorias neste mês.</div>`}`;
}

function orcamentoOverlay(m) {
  return `
    <div class="sheet orc-sheet ${state.orcamentoOpen ? "open" : ""}" id="orcSheet">
      <div class="sheet-head">
        <h2>Categorias</h2>
        <div class="sheet-head-actions">
          <button type="button" class="ghost" id="closeOrcamento" aria-label="Fechar">×</button>
        </div>
      </div>
      <div class="sheet-body">${orcamentoBody(m)}</div>
    </div>`;
}

function mesMoneyCell(n, full) {
  if (n == null) return "—";
  const short = brlShort(n);
  if (!full) return short;
  return `<span title="${esc(full)}">${esc(short)}</span>`;
}

function mesView() {
  const rows = mesSummaries();
  const workKey = workMonthKey();
  const body = rows
    .map((r) => {
      const on = r.key === workKey || r.isCurrent ? " mes-row-on" : "";
      const fullIni = r.saldoInicial != null ? brl(r.saldoInicial) : "";
      const fullFin = r.saldoFinal != null ? brl(r.saldoFinal) : "";
      const fullRec = brl(r.receitas);
      const fullDesp = brl(r.despesas);
      return `<tr class="${on}">
        <td>${esc(r.label)}</td>
        <td>${r.saldoInicial != null ? mesMoneyCell(r.saldoInicial, fullIni) : "—"}</td>
        <td class="in"><span title="${esc(fullRec)}">${esc(brlShort(r.receitas))}</span></td>
        <td class="out"><span title="${esc(fullDesp)}">${esc(brlShort(r.despesas))}</span></td>
        <td><b>${r.saldoFinal != null ? mesMoneyCell(r.saldoFinal, fullFin) : "—"}</b></td>
      </tr>`;
    })
    .join("");
  return `
    <div class="scroll">
      <div class="hello">Totais realizados</div>
      <div class="title">Mês</div>
      <p class="mes-hint">Receitas e despesas pela data de recebimento/pagamento. SaldoIni no 1º dia do mês (Config no mês selecionado). SaldoFin no último dia do mês ou até hoje no mês corrente.</p>
      <div class="mes-table-wrap">
        <table class="mes-table">
          <thead>
            <tr>
              <th>Mês</th>
              <th>SaldoIni</th>
              <th>Receitas</th>
              <th>Despesas</th>
              <th>SaldoFin</th>
            </tr>
          </thead>
          <tbody>
            ${body || `<tr><td colspan="5" class="mes-empty">Nenhum lançamento realizado encontrado.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

function despesasView() {
  return expenseTabView({
    kind: "despesa",
    subtitle: "Lançamentos do mês",
    title: "Despesas",
    fabId: "fab",
    scrollId: "despScroll",
    emptyMsg: "Nenhuma despesa neste mês. Toque no + para lançar.",
  });
}

function receitasView() {
  const rm = receitasMetrics();
  const list = monthReceitas()
    .slice()
    .sort((a, b) => {
      const va = a.vencimento?.slice(0, 10) || "";
      const vb = b.vencimento?.slice(0, 10) || "";
      return vb.localeCompare(va);
    })
    .map(
      (r) => `
      <button type="button" class="item" data-row="${r.sheetRow}" data-kind="receita">
        <span class="check ${r.pago ? "yes" : ""}" data-toggle-rec="${r.sheetRow}">${r.pago ? "✓" : ""}</span>
        <span class="mid"><b>${esc(r.descricao || r.categoria || "(sem descrição)")}</b><small>${esc(r.categoria)} · ${r.vencimento ? isoToBR(r.vencimento) : ""}</small></span>
        <span class="right"><b>${brl(r.pago ? r.realizado || r.previsto : r.previsto)}</b><span class="pill ${pillClass(receitaStatusLabel(r))}">${esc(receitaStatusLabel(r))}</span></span>
      </button>`
    )
    .join("");
  return `
    <div class="scroll">
      <div class="hello">Entradas do mês</div>
      <div class="title">Receitas</div>
      <div class="grid2" style="margin-top:10px">
        <div class="kpi"><span>PREVISTO</span><b>${brl(rm.previsto)}</b></div>
        <div class="kpi"><span>REALIZADO</span><b style="color:var(--emerald)">${brl(rm.realizado)}</b></div>
      </div>
      ${rm.atrasadas ? `<div class="alert" style="margin-top:10px"><span class="dot" style="background:var(--rose)"></span> ${rm.atrasadas} receita(s) atrasada(s)</div>` : ""}
      <div class="section">Lançamentos</div>
      ${list || `<div class="empty">Nenhuma receita neste mês. Toque no + para lançar.</div>`}
    </div>
    <button class="fab" id="fabRec">+</button>`;
}

function sheetView() {
  const f = state.form;
  const L = state.listas;
  const isRec = state.sheetKind === "receita";
  const isAlaska = state.sheetKind === "alasca";
  const isGastoViagem = state.sheetKind === "gastoviagem";
  const viagemOpts = viagensNomes();
  const catOpts = isAlaska
    ? L.categoriasAlasca?.length
      ? L.categoriasAlasca
      : categoriasNomesForKind("alasca")
    : L.categoriasDespesas?.length
      ? L.categoriasDespesas
      : L.categorias;
  const body = isRec
    ? `
        <div class="field"><label>Descrição</label><input id="fDesc" value="${esc(f.descricao)}" placeholder="Ex.: Salário março" /></div>
        <div class="field"><label>Fonte</label><select id="fFonte">${options(L.fontes, f.fonte || f.categoria)}</select></div>
        <div class="row2">
          <div class="field"><label>Previsto</label><input id="fPrev" inputmode="decimal" value="${esc(f.previsto)}" placeholder="0,00" /></div>
          <div class="field"><label>Data prevista</label><input id="fVenc" type="date" value="${esc(f.vencimento)}" /></div>
        </div>
        <div class="toggle">Já recebi <div class="switch ${f.pago ? "on" : ""}" id="pagoSwitch"><i></i></div></div>
        <div class="field ${f.pago ? "" : "hidden"}" id="realizadoField">
          <label>Realizado</label><input id="fReal" inputmode="decimal" value="${esc(f.realizado)}" placeholder="0,00" />
        </div>
        <div class="field ${f.pago ? "" : "hidden"}" id="recbField">
          <label>Recebimento</label><input id="fRecb" type="date" value="${esc(f.dataRecebimento || f.vencimento || "")}" />
        </div>
        <div class="row2">
          <div class="field"><label>Conta</label><select id="fConta">${options(L.contas, f.conta)}</select></div>
          <div class="field"><label>Observações</label><input id="fObs" value="${esc(f.observacoes)}" placeholder="Opcional" /></div>
        </div>`
    : `
        <div class="field"><label>Descrição</label><input id="fDesc" value="${esc(f.descricao)}" placeholder="Ex.: IPTU casa da praia" /></div>
        <div class="field"><label>Categoria</label><select id="fCat">${options(catOpts, f.categoria)}</select></div>
        ${
          isGastoViagem
            ? `<div class="field"><label>Viagem</label><select id="fViagem">${options(
                viagemOpts.length ? viagemOpts : [f.viagem || ""].filter(Boolean),
                f.viagem || state.painelViagem || viagemOpts[0] || ""
              )}</select></div>`
            : ""
        }
        <div class="row2">
          <div class="field"><label>Previsto</label><input id="fPrev" inputmode="decimal" value="${esc(f.previsto)}" placeholder="0,00" /></div>
          <div class="field"><label>Vencimento</label><input id="fVenc" type="date" value="${esc(f.vencimento)}" /></div>
        </div>
        <div class="field">
          <label>Data de pagamento</label>
          <input id="fPgto" type="date" value="${esc(f.dataPagamento || "")}" />
          <small class="kpi-hint">Ao marcar como pago, vencimento e pagamento usam a mesma data</small>
        </div>
        <div class="toggle">Já paguei <div class="switch ${f.pago ? "on" : ""}" id="pagoSwitch"><i></i></div></div>
        <div class="field ${f.pago ? "" : "hidden"}" id="realizadoField">
          <label>Realizado</label><input id="fReal" inputmode="decimal" value="${esc(f.realizado)}" placeholder="0,00" />
        </div>
        <div class="field">
          <label>Tipo de pgto</label>
          <select id="fTipoPgto">${options(L.pagamentos, f.tipoPgto)}</select>
        </div>
        <button class="more" id="moreBtn">${state.moreOpen ? "Menos detalhes" : "Mais detalhes"}</button>
        <div class="${state.moreOpen ? "" : "hidden"}" id="extra">
          <div class="row2">
            <div class="field"><label>Tipo</label><select id="fTipo">${options(L.tipos, f.tipo)}</select></div>
            <div class="field"><label>Prioridade</label><select id="fPrio">${options(L.prioridades, f.prioridade)}</select></div>
          </div>
          <div class="row2">
            <div class="field"><label>Conta</label><select id="fConta">${options(L.contas, f.conta)}</select></div>
            <div class="field"><label>Recorrente</label><select id="fRec">${options(["Não", "Sim"], f.recorrente)}</select></div>
          </div>
          <div class="field"><label>Parcela</label><input id="fParc" value="${esc(f.parcela)}" placeholder="Ex.: 3/12" /></div>
          <div class="field"><label>Observações</label><input id="fObs" value="${esc(f.observacoes)}" placeholder="Opcional" /></div>
        </div>`;
  const editingDesp =
    !isRec &&
    state.editingRow &&
    (state.sheetKind === "despesa" || state.sheetKind === "alasca" || state.sheetKind === "gastoviagem");
  const deleteOverlay =
    state.deleteConfirm && editingDesp
      ? `
      <div class="sheet-confirm" id="confirmDelete">
        <div class="confirm-box">
          <h3>Excluir lançamento?</h3>
          <p>Deseja excluir <strong>${esc(state.deleteConfirm.descricao)}</strong>?</p>
          <div class="confirm-actions">
            <button type="button" class="confirm-no" id="deleteNo">Não</button>
            <button type="button" class="confirm-yes" id="deleteYes">Sim</button>
          </div>
        </div>
      </div>`
      : "";
  return `
    <div class="sheet ${state.sheetOpen ? "open" : ""}" id="sheet">
      <div class="sheet-head">
        <h2>${
          state.editingRow
            ? isRec
              ? "Editar receita"
              : isGastoViagem
                ? "Editar gasto na viagem"
                : isAlaska
                  ? "Editar Alasca"
                  : "Editar despesa"
            : isRec
              ? "Nova receita"
              : isGastoViagem
                ? "Novo gasto na viagem"
                : isAlaska
                  ? "Novo lançamento Alasca"
                  : "Nova despesa"
        }</h2>
        <div class="sheet-head-actions">
          ${editingDesp ? `<button type="button" class="sheet-del" id="btnDeleteDesp" aria-label="Excluir despesa"><span>🗑</span></button>` : ""}
          <button type="button" class="ghost" id="closeSheet" aria-label="Fechar">×</button>
        </div>
      </div>
      <div class="sheet-body">${body}</div>
      <button class="save" id="saveBtn">${state.loading ? "Salvando…" : "Salvar na planilha"}</button>
      ${deleteOverlay}
    </div>`;
}

function appView() {
  const m = metrics();
  let body = "";
  if (state.tab === "painel") body = painelView(m);
  else if (state.tab === "despesas") body = despesasView();
  else if (state.tab === "categorias") body = categoriasView();
  else if (state.tab === "alasca") body = alascaView();
  else if (state.tab === "viagens") body = minhasViagensView();
  else if (state.tab === "gastosviagem") body = gastosViagemView();
  else body = painelView(m);
  const orc = state.orcamentoOpen ? orcamentoOverlay(m) : "";
  return `<div class="app ${state.loading ? "busy" : ""}">${body}${bottomDock()}${orc}${categoriaSheetView()}${viagemCadastroSheetView()}${sheetView()}
    <div class="toast ${state.toast ? "show" : ""}">${esc(state.toast)}</div></div>`;
}

function scrollToSearchHit() {
  if (!state.searchHitRow) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document
        .querySelector(`.item[data-row="${state.searchHitRow}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  });
}

function render() {
  updateSearchHit();
  const root = document.getElementById("root");
  const ready = state.clientId && state.spreadsheetId && state.token;
  const active = document.activeElement;
  const activeId = active?.id;
  const sel = active && active.selectionStart;
  if (state.booting) root.innerHTML = loadingView();
  else if (ready) root.innerHTML = appView();
  else root.innerHTML = loginView();
  bind();
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) {
      const focusOpts = activeId === "q" ? { preventScroll: true } : undefined;
      el.focus(focusOpts);
      if (typeof sel === "number" && el.setSelectionRange) {
        try { el.setSelectionRange(sel, sel); } catch (_) {}
      }
    }
  }
  scrollToSearchHit();
}

function readFormFromDom() {
  const $ = (id) => document.getElementById(id);
  if (!$("fDesc")) return;
  state.form.descricao = $("fDesc").value;
  state.form.previsto = $("fPrev").value;
  state.form.vencimento = $("fVenc").value;
  state.form.realizado = $("fReal") ? $("fReal").value : state.form.realizado;
  if ($("fFonte")) {
    state.form.fonte = $("fFonte").value;
    state.form.conta = $("fConta").value;
    state.form.observacoes = $("fObs").value;
  }
  if ($("fPgto")) state.form.dataPagamento = $("fPgto").value;
  if ($("fTipoPgto")) state.form.tipoPgto = $("fTipoPgto").value;
  if ($("fRecb")) state.form.dataRecebimento = $("fRecb").value;
  if ($("fViagem")) state.form.viagem = $("fViagem").value;
  if ($("fCat")) {
    state.form.categoria = $("fCat").value;
    state.form.tipo = $("fTipo").value;
    state.form.prioridade = $("fPrio").value;
    state.form.conta = $("fConta").value;
    state.form.recorrente = $("fRec").value;
    state.form.parcela = $("fParc").value;
    state.form.observacoes = $("fObs").value;
  }
}

function openNew(kind = "despesa") {
  state.editingRow = null;
  state.moreOpen = false;
  state.sheetKind = kind;
  state.form = blankForm(kind);
  if (kind === "despesa" || kind === "alasca" || kind === "gastoviagem") {
    const opts =
      kind === "alasca"
        ? state.listas.categoriasAlasca
        : kind === "gastoviagem"
          ? state.listas.categoriasDespesas
          : state.listas.categoriasDespesas;
    const fallback = state.listas.categorias;
    const pick = (opts && opts[0]) || (fallback && fallback[0]);
    if (pick) state.form.categoria = pick;
    if (kind === "gastoviagem") {
      state.form.viagem = state.painelViagem || viagensNomes()[0] || "";
    }
  }
  if (kind === "receita" && state.listas.fontes[0]) state.form.fonte = state.listas.fontes[0];
  state.sheetOpen = true;
  render();
}

function openEdit(row, kind = "despesa") {
  const list =
    kind === "receita"
      ? state.receitas
      : kind === "alasca"
        ? state.alaskaDespesas
        : kind === "gastoviagem"
          ? state.gastosViagem
          : state.despesas;
  const d = list.find((x) => x.sheetRow === row);
  if (!d) return;
  state.editingRow = row;
  state.sheetKind = kind;
  state.moreOpen = false;
  if (kind === "receita") {
    state.form = {
      pago: d.pago,
      descricao: d.descricao,
      fonte: d.categoria,
      vencimento: d.vencimento || todayISO(),
      previsto: fmtMoneyInput(d.previsto),
      realizado: fmtMoneyInput(d.realizado),
      dataRecebimento: d.dataRecebimento || d.vencimento || "",
      conta: d.conta || "Nubank",
      observacoes: d.observacoes,
    };
  } else {
    state.form = {
      pago: d.pago,
      descricao: d.descricao,
      categoria: d.categoria,
      tipo: d.tipo || "Variável",
      vencimento: d.vencimento || todayISO(),
      prioridade: d.prioridade || "Média",
      previsto: fmtMoneyInput(d.previsto),
      realizado: fmtMoneyInput(d.realizado),
      dataPagamento: d.dataPagamento || "",
      tipoPgto: d.tipoPgto || "Crédito",
      conta: d.conta || "Nubank",
      recorrente: d.recorrente || "Não",
      parcela: d.parcela,
      observacoes: d.observacoes,
      viagem: d.viagem || "",
    };
  }
  state.sheetOpen = true;
  render();
}

function despesaDataStartRow(meta) {
  const hr = meta?.headerRow > 0 ? meta.headerRow : 3;
  return Math.max(hr + 2, DESP_DATA_START);
}

function despesaRowHasData(r) {
  if (!r || !r.length) return false;
  const desc = String(r[DESP_COL.descricao] ?? "").trim();
  const cat = String(r[DESP_COL.categoria] ?? "").trim();
  const viagem = String(r[DESP_COL.viagem] ?? r[22] ?? "").trim();
  if (desc || cat || viagem) return true;
  return truthy(r[DESP_COL.pago] ?? r[0]);
}

function firstEmptyRow(meta, rows, sheetValues) {
  const start = despesaDataStartRow(meta);
  const used = new Set(rows.map((d) => d.sheetRow));
  if (sheetValues?.length) {
    for (let r = start; r <= sheetValues.length; r++) {
      if (despesaRowHasData(sheetValues[r - 1])) used.add(r);
    }
  }
  for (let r = start; r < start + 400; r++) {
    if (!used.has(r)) return r;
  }
  return start + rows.length;
}

/** Lê a coluna A–D na planilha e devolve a próxima linha livre (evita sobrescrever se o parse falhou). */
async function resolveNewDespRow(sheetTitle, meta, rows) {
  const start = despesaDataStartRow(meta);
  const used = new Set(rows.map((d) => d.sheetRow));
  try {
    const snap = await batchGetRanges([sheetRange(sheetTitle, `A${start}:W${start + 399}`)]);
    const block = snap.valueRanges?.[0]?.values || [];
    for (let i = 0; i < block.length; i++) {
      if (despesaRowHasData(block[i])) used.add(start + i);
    }
  } catch (_) {}
  for (let r = start; r < start + 400; r++) {
    if (!used.has(r)) return r;
  }
  return start + used.size;
}

async function saveSheet() {
  readFormFromDom();
  const f = state.form;
  const isRec = state.sheetKind === "receita";
  const isAlaska = state.sheetKind === "alasca";
  const isGastoViagem = state.sheetKind === "gastoviagem";
  if (isAlaska) {
    try {
      await getAlaskaSheetId();
    } catch {
      showToast("Aba Alasca não existe. Na planilha: Finanças → Configurar → Criar aba Alasca.");
      return;
    }
  }
  if (isGastoViagem) {
    if (!String(f.viagem || "").trim()) {
      showToast("Selecione a viagem.");
      return;
    }
    try {
      await getGastosViagemSheetId();
    } catch {
      showToast("Aba Gastos Viagem não encontrada. Finanças → Criar abas Viagens.");
      return;
    }
  }
  const label = isRec ? "fonte ou descrição" : "descrição";
  if (!f.descricao.trim() && !(isRec && f.fonte)) {
    showToast(`Preencha a ${label}.`);
    return;
  }
  if (!isRec && f.pago) syncDespesaDatasPago(f);
  const pagoErr = validatePagoRecebido(f, isRec ? "receita" : "despesa");
  if (pagoErr) {
    showToast(pagoErr);
    return;
  }
  if (!isRec && f.dataPagamento && !f.pago) {
    const err = validateDataMovimento(f.dataPagamento, "pagamento");
    if (err) {
      showToast(err);
      return;
    }
  }
  if (isRec) {
    const dt = f.dataRecebimento || (f.pago ? f.vencimento : "");
    if (dt) {
      const err = validateDataMovimento(dt, "recebimento");
      if (err) {
        showToast(err);
        return;
      }
    }
  }
  const baseIdx = { ...defaultDespIdx(), ...(state._despMeta?.idx || {}) };
  const idx = isRec
    ? (state._recMeta?.idx || {})
    : isGastoViagem
      ? defaultDespIdx()
      : isAlaska
        ? { ...baseIdx, ...(state._alaskaMeta?.idx || {}) }
        : { ...baseIdx, ...(state._despMeta?.idx || {}) };
  const sheet = sheetTitleForKind(
    isGastoViagem ? "gastoviagem" : isAlaska ? "alasca" : isRec ? "receita" : "despesa"
  );
  const meta = isRec
    ? state._recMeta
    : isGastoViagem
      ? state._gastosViagemMeta || {
          headerRow: state._despMeta?.headerRow ?? 3,
          idx: state._despMeta?.idx || {},
        }
      : isAlaska
        ? state._alaskaMeta || {
            headerRow: state._despMeta?.headerRow ?? 3,
            idx: state._despMeta?.idx || {},
          }
        : state._despMeta;
  const rows = isRec
    ? state.receitas
    : isGastoViagem
      ? state.gastosViagem
      : isAlaska
        ? state.alaskaDespesas
        : state.despesas;
  const sheetValues = isGastoViagem
    ? state._gastosViagemSheetValues
    : isAlaska
      ? state._alaskaSheetValues
      : state._despSheetValues;
  const row =
    state.editingRow ||
    (isRec
      ? firstEmptyRow(meta, rows, sheetValues)
      : await resolveNewDespRow(sheet, meta, rows));
  if (!isRec && !state.editingRow && row < DESP_DATA_START) {
    showToast(`Gravação na linha ${row} inválida. Toque Atualizar e tente de novo.`);
    return;
  }
  const competencia =
    isGastoViagem && f.vencimento?.length >= 7
      ? `${f.vencimento.slice(0, 7)}-01`
      : `${state.ano}-${String(state.mesNum).padStart(2, "0")}-01`;
  const previsto = num(f.previsto);
  const realizado = f.pago ? num(f.realizado || f.previsto) : num(f.realizado);
  const writes = isRec
    ? {
        pago: f.pago,
        competencia: isoToBR(competencia),
        categoria: f.fonte || f.categoria,
        descricao: f.descricao.trim() || f.fonte,
        vencimento: isoToBR(f.vencimento),
        previsto,
        realizado: f.pago ? realizado : realizado || "",
        conta: f.conta,
        observacoes: f.observacoes,
      }
    : {
        pago: f.pago,
        competencia: isoToBR(competencia),
        categoria: f.categoria,
        descricao: f.descricao.trim(),
        tipo: f.tipo,
        vencimento: isoToBR(f.vencimento),
        prioridade: f.prioridade,
        previsto,
        realizado: f.pago ? realizado : realizado || "",
        conta: f.conta,
        recorrente: f.recorrente,
        parcela: f.parcela,
        observacoes: f.observacoes,
        tipoPgto: f.tipoPgto || "",
        viagem: isGastoViagem ? String(f.viagem || "").trim() : "",
      };
  if (!isRec && (state.sheetKind === "despesa" || state.sheetKind === "alasca" || state.sheetKind === "gastoviagem")) {
    writes.dataPagamento = f.pago ? isoToBR(despesaDataPagamento(f)) : "";
    if (!state.editingRow) writes.dtLancamento = nowDateTimeBR();
  }
  if (isRec && idx.dataRecebimento != null) {
    writes.dataRecebimento = f.pago ? isoToBR(f.dataRecebimento || f.vencimento) : "";
  }
  const data = [];
  for (const [field, value] of Object.entries(writes)) {
    if (field === "viagem" && !isGastoViagem) continue;
    const col = isRec ? idx[field] : despColIdx(idx, field);
    if (col == null) continue;
    data.push({
      range: sheetRange(sheet, `${colLetter(col)}${row}`),
      values: [[value]],
    });
  }
  if (!isRec && data.length === 0) {
    showToast("Não foi possível montar a gravação na planilha. Toque Atualizar e tente de novo.");
    return;
  }
  state.loading = true;
  render();
  try {
    await api("/values:batchUpdate?valueInputOption=USER_ENTERED", {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    });
    state.sheetOpen = false;
    state.editingRow = null;
    showToast("Salvo. Status e % calculam na planilha.");
    await refresh();
  } catch (err) {
    state.loading = false;
    let msg = err.message || String(err);
    if (/unable to parse range/i.test(msg) && isAlaska) {
      msg =
        "Não foi possível gravar na aba Alasca. Confira se ela existe na planilha (Finanças → Criar aba Alasca) e toque Atualizar no app.";
    }
    if (/unable to parse range/i.test(msg) && isGastoViagem) {
      msg =
        "Não foi possível gravar em Gastos Viagem. Na planilha: Finanças → Criar abas Viagens + Gastos Viagem, depois Atualizar no app.";
    }
    state.error = msg;
    showToast(msg);
    render();
  }
}

async function togglePago(row, ev, kind = "despesa") {
  ev.stopPropagation();
  const list =
    kind === "receita"
      ? state.receitas
      : kind === "alasca"
        ? state.alaskaDespesas
        : kind === "gastoviagem"
          ? state.gastosViagem
          : state.despesas;
  const sheet = sheetTitleForKind(kind);
  const d = list.find((x) => x.sheetRow === row);
  if (!d || d.idx?.pago == null) return;
  const next = !d.pago;
  if (next) {
    if (kind === "despesa" || kind === "alasca" || kind === "gastoviagem") {
      const dt = despesaDataPagamento(d);
      if (!dt) {
        showToast("Informe o vencimento antes de marcar como pago.");
        return;
      }
      const err = validateDataMovimento(dt, "pagamento");
      if (err) {
        showToast(err);
        return;
      }
    } else {
      const dt = d.dataRecebimento || d.vencimento;
      if (!dt) {
        showToast("Informe a data de recebimento em Editar antes de marcar como recebido.");
        return;
      }
      const err = validateDataMovimento(dt, "recebimento");
      if (err) {
        showToast(err);
        return;
      }
    }
  }
  const pagoCol =
    kind === "receita" ? d.idx.pago : despColIdx(d.idx, "pago");
  const data = [{ range: sheetRange(sheet, `${colLetter(pagoCol)}${row}`), values: [[next]] }];
  if (next && !d.realizado && d.previsto) {
    const realCol =
      kind === "receita" ? d.idx.realizado : despColIdx(d.idx, "realizado");
    data.push({ range: sheetRange(sheet, `${colLetter(realCol)}${row}`), values: [[d.previsto]] });
  }
  if (kind === "despesa" || kind === "alasca" || kind === "gastoviagem") {
    const pgtoCol = despColIdx(d.idx, "dataPagamento");
    if (next) {
      const pgto = despesaDataPagamento(d);
      if (pgto) {
        data.push({
          range: sheetRange(sheet, `${colLetter(pgtoCol)}${row}`),
          values: [[isoToBR(pgto)]],
        });
      }
    } else {
      data.push({ range: sheetRange(sheet, `${colLetter(pgtoCol)}${row}`), values: [[""]] });
    }
  }
  if (kind === "receita" && !next && d.idx.dataRecebimento != null) {
    data.push({
      range: sheetRange(sheet, `${colLetter(d.idx.dataRecebimento)}${row}`),
      values: [[""]],
    });
  }
  try {
    await api("/values:batchUpdate?valueInputOption=USER_ENTERED", {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    });
    await refresh();
  } catch (err) {
    showToast(err.message);
  }
}

async function getSheetIdByTitle(title, cacheKey) {
  if (state[cacheKey] != null) return state[cacheKey];
  const data = await api("?fields=sheets(properties(sheetId,title))");
  const sheet = (data.sheets || []).find((s) => s.properties?.title === title);
  if (!sheet) throw new Error(`Aba ${title} não encontrada na planilha.`);
  state[cacheKey] = sheet.properties.sheetId;
  return state[cacheKey];
}

async function getDespesasSheetId() {
  return getSheetIdByTitle("Despesas", "_despSheetId");
}

async function getAlaskaSheetId() {
  return getSheetIdByTitle("Alasca", "_alaskaSheetId");
}

async function getViagensSheetId() {
  return getSheetIdByTitle(VIAGENS_SHEET, "_viagensSheetId");
}

async function getGastosViagemSheetId() {
  return getSheetIdByTitle(GASTOS_VIAGEM_SHEET, "_gastosViagemSheetId");
}

function openDeleteConfirm(row) {
  const kind =
    state.sheetKind === "alasca"
      ? "alasca"
      : state.sheetKind === "gastoviagem"
        ? "gastoviagem"
        : "despesa";
  const list =
    kind === "alasca"
      ? state.alaskaDespesas
      : kind === "gastoviagem"
        ? state.gastosViagem
        : state.despesas;
  const d = list.find((x) => x.sheetRow === row);
  if (!d) return;
  state.deleteConfirm = { row, kind, descricao: d.descricao || "(sem descrição)" };
  render();
}

function closeDeleteConfirm() {
  state.deleteConfirm = null;
  render();
}

async function deleteExpense(row, kind = "despesa") {
  const sheetId =
    kind === "alasca"
      ? await getAlaskaSheetId()
      : kind === "gastoviagem"
        ? await getGastosViagemSheetId()
        : await getDespesasSheetId();
  state.loading = true;
  state.deleteConfirm = null;
  state.sheetOpen = false;
  render();
  try {
    await api(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: row - 1,
                endIndex: row,
              },
            },
          },
        ],
      }),
    });
    showToast("Lançamento excluído.");
    await refresh();
  } catch (err) {
    state.loading = false;
    showToast(err.message);
    render();
  }
}

function showToast(msg) {
  state.toast = msg;
  render();
  setTimeout(() => {
    state.toast = "";
    render();
  }, 2400);
}

function bindRootActions() {
  const root = document.getElementById("root");
  if (!root || root.dataset.actionsBound) return;
  root.dataset.actionsBound = "1";
  root.addEventListener("click", (e) => {
    const sortBtn = e.target.closest("[data-sort]");
    if (sortBtn) {
      e.preventDefault();
      state.despSort = sortBtn.dataset.sort;
      render();
      return;
    }
    const pieCatBtn = e.target.closest("[data-pie-cat]");
    if (pieCatBtn) {
      e.preventDefault();
      state.catFilter = pieCatBtn.dataset.pieCat || "";
      state.filtro = "todas";
      state.query = "";
      state.searchHitRow = null;
      state.tab =
        state.painelFonte === "alasca"
          ? "alasca"
          : state.painelFonte === "viagem"
            ? "gastosviagem"
            : "despesas";
      state.sheetOpen = false;
      render();
      return;
    }
    const painelFonteBtn = e.target.closest("[data-painel-fonte]");
    if (painelFonteBtn) {
      state.painelFonte = painelFonteBtn.dataset.painelFonte;
      if (state.painelFonte !== "viagem") state.painelViagem = "";
      savePainelPeriodToStore();
      render();
      return;
    }
    const viagemRowBtn = e.target.closest("[data-viagem-row]");
    if (viagemRowBtn) {
      openViagemEdit(Number(viagemRowBtn.dataset.viagemRow));
      return;
    }
    const clearCatBtn = e.target.closest("[data-clear-cat]");
    if (clearCatBtn) {
      e.preventDefault();
      state.catFilter = "";
      render();
      return;
    }
    const filtroBtn = e.target.closest("[data-filtro]");
    if (filtroBtn) {
      e.preventDefault();
      state.filtro = filtroBtn.dataset.filtro;
      if (filtroBtn.dataset.filtro !== "todas") state.catFilter = "";
      render();
      return;
    }
    const fluxDayBtn = e.target.closest("[data-flux-dia]");
    if (fluxDayBtn) {
      e.preventDefault();
      if (!state.loading) toggleFluxoConsolidacao(fluxDayBtn.dataset.fluxDia);
      return;
    }
    const tabBtn = e.target.closest("[data-tab]");
    if (tabBtn) {
      state.tab = tabBtn.dataset.tab;
      state.sheetOpen = false;
      state.orcamentoOpen = false;
      state.categoriaSheetOpen = false;
      state.viagemSheetOpen = false;
      state.deleteConfirm = null;
      render();
      return;
    }
    const catRowBtn = e.target.closest("[data-cat-row]");
    if (catRowBtn) {
      openCategoriaEdit(Number(catRowBtn.dataset.catRow));
      return;
    }
    const itemBtn = e.target.closest(".item[data-row]");
    if (
      itemBtn &&
      !e.target.closest("[data-toggle]") &&
      !e.target.closest("[data-toggle-kind]") &&
      !e.target.closest("[data-toggle-rec]")
    ) {
      openEdit(Number(itemBtn.dataset.row), itemBtn.dataset.kind || "despesa");
      return;
    }
    const toggleKindBtn = e.target.closest("[data-toggle-kind]");
    if (toggleKindBtn) {
      togglePago(Number(toggleKindBtn.dataset.toggleRow), e, toggleKindBtn.dataset.toggleKind || "despesa");
      return;
    }
    const toggleRec = e.target.closest("[data-toggle-rec]");
    if (toggleRec) {
      togglePago(Number(toggleRec.dataset.toggleRec), e, "receita");
      return;
    }
    if (e.target.closest("#btnDeleteDesp")) {
      e.preventDefault();
      e.stopPropagation();
      if (state.editingRow) openDeleteConfirm(state.editingRow);
      return;
    }
    if (e.target.closest("#deleteNo")) {
      e.preventDefault();
      closeDeleteConfirm();
      return;
    }
    if (e.target.closest("#deleteYes")) {
      e.preventDefault();
      if (state.deleteConfirm?.row) {
        deleteExpense(state.deleteConfirm.row, state.deleteConfirm.kind || "despesa");
      }
    }
  });
}

function bind() {
  bindRootActions();
  const on = (id, ev, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  };

  const goFullscreen = () => {
    enterFullscreen()
      .then(() => showToast("Tela cheia ativada."))
      .catch(() => showToast("Tela cheia indisponível neste navegador."));
  };
  on("btn-fullscreen", "click", goFullscreen);
  on("btn-fullscreen-bar", "click", goFullscreen);
  on("btn-dismiss-install", "click", () => {
    localStorage.setItem(INSTALL_HINT_KEY, "1");
    document.getElementById("install-hint")?.remove();
  });

  on("btnConnect", "click", async () => {
    const err = document.getElementById("setupErr");
    applyStoredConfig();
    if (err) err.textContent = "";
    state.error = "";
    state.loading = true;
    render();
    try {
      await ensureSession();
      await refresh();
    } catch (e) {
      state.error = e.message;
      state.token = null;
      render();
    } finally {
      state.loading = false;
      render();
    }
  });

  on("btnReload", "click", () => refresh());
  on("btnOrcamento", "click", () => {
    state.tab = "categorias";
    state.orcamentoOpen = false;
    state.sheetOpen = false;
    state.categoriaSheetOpen = false;
    render();
  });
  on("btnNovaCategoria", "click", openNewCategoria);
  on("btnReloadCat", "click", () => refresh());
  on("closeCatSheet", "click", () => {
    state.categoriaSheetOpen = false;
    render();
  });
  on("saveCatBtn", "click", () => {
    const $ = (id) => document.getElementById(id);
    if ($("fCatNome")) state.categoriaForm.nome = $("fCatNome").value;
    if ($("fCatLimite")) state.categoriaForm.limite = $("fCatLimite").value;
    if ($("fCatVinculo")) state.categoriaForm.vinculo = $("fCatVinculo").value;
    saveCategoriaSheet();
  });
  on("closeOrcamento", "click", () => {
    state.orcamentoOpen = false;
    render();
  });
  on("fab", "click", () => openNew("despesa"));
  on("fabAlaska", "click", () => openNew("alasca"));
  on("fabGastoViagem", "click", () => openNew("gastoviagem"));
  on("fabRec", "click", () => openNew("receita"));
  on("btnNovaViagem", "click", () => openNewViagem());
  on("closeViagemSheet", "click", () => {
    state.viagemSheetOpen = false;
    render();
  });
  on("saveViagemBtn", "click", () => {
    const $ = (id) => document.getElementById(id);
    if ($("fViagemNome")) state.viagemCadastroForm.nome = $("fViagemNome").value;
    if ($("fViagemIni")) state.viagemCadastroForm.inicio = $("fViagemIni").value;
    if ($("fViagemFim")) state.viagemCadastroForm.fim = $("fViagemFim").value;
    if ($("fViagemPrev")) state.viagemCadastroForm.previsto = $("fViagemPrev").value;
    saveViagemCadastro();
  });
  on("painelViagemSel", "change", (e) => {
    state.painelViagem = e.target.value || "";
    savePainelPeriodToStore();
    render();
  });
  on("btnPainelPeriod", "click", () => {
    const de = document.getElementById("painelDe");
    const ate = document.getElementById("painelAte");
    const vs = document.getElementById("painelViagemSel");
    if (de) state.painelDe = de.value;
    if (ate) state.painelAte = ate.value;
    if (vs) state.painelViagem = vs.value || "";
    savePainelPeriodToStore();
    render();
  });
  on("closeSheet", "click", () => {
    state.sheetOpen = false;
    render();
  });
  on("moreBtn", "click", () => {
    readFormFromDom();
    state.moreOpen = !state.moreOpen;
    render();
  });
  on("pagoSwitch", "click", () => {
    readFormFromDom();
    const next = !state.form.pago;
    if (next) {
      const kind = state.sheetKind === "receita" ? "receita" : "despesa";
      const trial = { ...state.form, pago: true };
      const err = validatePagoRecebido(trial, kind);
      if (err) {
        showToast(err);
        return;
      }
    }
    state.form.pago = next;
    if (state.form.pago && !state.form.realizado) state.form.realizado = state.form.previsto;
    if (
      state.form.pago &&
      (state.sheetKind === "despesa" || state.sheetKind === "alasca" || state.sheetKind === "gastoviagem")
    ) {
      syncDespesaDatasPago(state.form);
    }
    render();
  });
  on("saveBtn", "click", saveSheet);
  on("q", "input", (e) => {
    state.query = e.target.value;
    render();
  });
  on("q", "keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    updateSearchHit();
    if (state.searchHitRow) scrollToSearchHit();
    else {
      const q = state.query.trim();
      if (isValueQuery(q)) showToast(`Nenhuma despesa com valor ≥ ${brl(num(q))}`);
      else if (parseQueryDate(q)) showToast(`Nenhuma despesa com vencimento ≥ ${q}`);
    }
  });
}

async function boot() {
  await syncPlanilhaFromPublisher();
  applyStoredConfig();
  if (state._planilhaMigrated) {
    showToast("App atualizado para a planilha definida em planilha.json.");
    state._planilhaMigrated = false;
  }
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        regs.forEach((reg) => reg.unregister().catch(() => {}));
      })
      .finally(() => {
        navigator.serviceWorker
          .register(`./sw.js?v=${APP_VERSION}`)
          .then((reg) => reg.update())
          .catch(() => {});
      });
  }
  try {
    await ensureSession();
    await refresh();
  } catch (e) {
    state.error = e.message;
    state.token = null;
  } finally {
    state.booting = false;
    render();
  }
}

boot();
