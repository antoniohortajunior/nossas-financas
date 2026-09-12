const APP_VERSION = "35";
const INSTALL_HINT_KEY = "financas-install-hint-v11";
const KEY = "minhas-financas-config";
const SCOPE =
  "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile";
const DEFAULTS = {
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1jSJaWTpsmrjskUPhQS1fvQxVbs7dpI05NMzT7-IkS-o/edit",
  clientId: "1012119713797-8tig992brdgokg5uovs3oendceb9e5oj.apps.googleusercontent.com",
};
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
  receitas: [],
  orcamento: [],
  listas: { categorias: [], tipos: [], prioridades: [], pagamentos: [], contas: [] },
  query: "",
  searchHitRow: null,
  filtro: "todas",
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
    conta: "Nubank",
    recorrente: "Não",
    parcela: "",
    observacoes: "",
  };
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    dataPagamento: ["pagamento", "data pagamento", "data do pagamento", "data pago", "dt pagamento", "dt. pagamento"],
    dataRecebimento: ["recebimento", "data recebimento", "data do recebimento", "dt recebimento"],
    formaPagamento: ["forma pagamento", "forma de pagamento", "meio pagamento", "forma"],
    conta: ["conta"],
    recorrente: ["recorrente"],
    parcela: ["parcela"],
    observacoes: ["observações", "observacoes"],
    classe: ["classe", "classe (50-30-20)", "classe 50-30-20"],
    limite: ["limite", "orçamento mensal", "orcamento mensal"],
    restante: ["restante"],
  };
  const idx = {};
  (row || []).forEach((h, i) => {
    const k = String(h || "").trim().toLowerCase();
    if (k.includes("forma") && k.includes("pag")) return;
    for (const [field, names] of Object.entries(aliases)) {
      if (names.includes(k) || (field === "classe" && k.includes("classe"))) idx[field] = i;
      else if (
        field === "limite" &&
        !k.includes("%") &&
        (k === "limite" || k.includes("orçamento mensal") || k.includes("orcamento mensal"))
      )
        idx[field] = i;
    }
  });
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

function applyStoredConfig() {
  const cfg = loadConfig();
  state.clientId = normalizeClientId(cfg.clientId || DEFAULTS.clientId);
  state.spreadsheetId = cfg.spreadsheetId || extractSpreadsheetId(DEFAULTS.spreadsheetUrl);
  const spreadsheetUrl = cfg.spreadsheetUrl || DEFAULTS.spreadsheetUrl;
  saveConfig({
    clientId: state.clientId,
    spreadsheetId: state.spreadsheetId,
    spreadsheetUrl,
  });
  if (cfg.googleName) state.nome = cfg.googleName;
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

function parseTables(batch) {
  const byRange = {};
  (batch.valueRanges || []).forEach((vr) => {
    byRange[vr.range.split("!")[0].replace(/'/g, "")] = vr.values || [];
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
  state.saldoInicial = num(cfg[8]?.[0]);
  state.metaPoupanca = num(cfg[9]?.[0]) || 0.2;

  const listas = byRange.Listas || [];
  const pickCol = (c, from = 1) =>
    listas.slice(from).map((r) => r[c]).filter((v) => v != null && String(v).trim() !== "");
  const catalog = parseListasCatalog(listas);
  state.listas = {
    categorias: pickCol(0),
    classesPorCategoria: catalog.classes,
    limitesPorCategoria: catalog.limites,
    tipos: pickCol(6).length ? pickCol(6) : ["Fixo", "Variável", "Parcelado", "Assinatura"],
    prioridades: pickCol(7).length ? pickCol(7) : ["Alta", "Média", "Baixa"],
    pagamentos: pickCol(8).length ? pickCol(8) : ["Pix", "Boleto", "Crédito", "Débito"],
    contas: pickCol(9).length ? pickCol(9) : ["Nubank", "Itaú", "Carteira"],
    fontes: pickCol(11).length ? pickCol(11) : ["Salário", "Extra", "Rendimentos"],
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
    const idx = mapHeaders(values[headerRow] || []);
    const rows = [];
    for (let i = headerRow + 1; i < values.length; i++) {
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
        status: String(r[idx.status] || ""),
        previsto: num(kind === "despesa" ? (r[idx.previsto] ?? r[10]) : r[idx.previsto]),
        realizado: num(kind === "despesa" ? (r[idx.realizado] ?? r[11]) : r[idx.realizado]),
        pct: num(r[idx.pct]),
        situacao: String(r[idx.situacao] || ""),
        dataPagamento: serialToISO(kind === "despesa" ? (r[idx.dataPagamento] ?? r[6]) : r[idx.dataPagamento]),
        dataRecebimento: serialToISO(r[idx.dataRecebimento]),
        formaPagamento: String(r[idx.formaPagamento] || ""),
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
  const rec = parseSheet(byRange.Receitas || [], "receita");
  const orc = parseSheet(byRange.Orçamento || byRange.Orcamento || [], "orcamento");
  state._despMeta = d;
  state._recMeta = rec;
  state.despesas = d.rows;
  state.receitas = rec.rows;
  state.orcamento = orc.rows;
  hydrateOrcamentoMeta();
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
      "Config!B4:B13",
      "Despesas!A1:T400",
      "Receitas!A1:L200",
      "Listas!A4:L50",
    ]);
    try {
      const orc = await batchGetRanges(["Orçamento!A1:J30"]);
      data.valueRanges = data.valueRanges.concat(orc.valueRanges);
    } catch {
      try {
        const orc = await batchGetRanges(["Orcamento!A1:J30"]);
        data.valueRanges = data.valueRanges.concat(orc.valueRanges);
      } catch (_) {}
    }
    parseTables(data);
    try {
      await loadFluxoSheet();
    } catch {
      state.fluxoDias = [];
      state.fluxoFromSheet = false;
      state.ultimaConsolidacao = null;
    }
    const monthCount = monthDespesas().length;
    if (!state.despesas.length) {
      state.hint = "Nenhuma linha na aba Despesas. A planilha precisa das abas Config, Despesas, Receitas e Listas (modelo Minhas Finanças).";
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

function monthReceitas() {
  return state.receitas.filter((d) => inWorkMonth(d));
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

function despesasPagasTotal() {
  return monthDespesas()
    .filter((d) => d.pago)
    .reduce((a, x) => a + (num(x.realizado) || 0), 0);
}

function metrics() {
  const ds = monthDespesas();
  const receitas = receitasRecebidasTotal();
  const previsto = ds.reduce((a, x) => a + x.previsto, 0);
  const realizado = despesasPagasTotal();
  const pagar = ds.filter((x) => !x.pago).reduce((a, x) => a + x.previsto, 0);
  const atrasadas = ds.filter((x) => String(x.status).toLowerCase().includes("atras")).length;
  const breve = ds.filter((x) => String(x.status).toLowerCase().includes("breve")).length;
  const nec = gastoPorClasse503020("necessidade");
  const des = gastoPorClasse503020("desejo");
  const pou = gastoPorClasse503020("poupan");
  const limite = state.orcamento
    .filter((o) => isOrcamentoDataRow(o.categoria))
    .reduce((a, x) => a + (x.limite || 0), 0);
  const saldo = receitas - realizado;
  const taxaPoupancaP = receitas ? (saldo / receitas) * 100 : 0;
  const metaPoupancaP = (Number(state.metaPoupanca) || 0.2) * 100;
  return {
    receitas,
    previsto,
    realizado,
    saldo,
    pagar,
    sobrando: saldo - pagar,
    economia: previsto - realizado,
    atrasadas,
    breve,
    uso: previsto ? realizado / previsto : 0,
    taxaPoupancaP,
    metaPoupancaP,
    nec,
    des,
    pou,
    necP: receitas ? (nec / receitas) * 100 : 0,
    desP: receitas ? (des / receitas) * 100 : 0,
    pouP: receitas ? (pou / receitas) * 100 : 0,
    limite,
    usoLimite: limite ? realizado / limite : 0,
  };
}

function despValor(d) {
  return num(d.pago ? d.realizado || d.previsto : d.previsto);
}

function filteredDespesasBase() {
  let list = monthDespesas();
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

function despSubline(d) {
  const parts = [];
  if (d.vencimento) parts.push(`vence ${isoToBRShort(d.vencimento)}`);
  if (d.pago) {
    const pg = despPgtoDate(d);
    if (pg) parts.push(`pgto ${isoToBRShort(pg)}`);
  }
  if (!parts.length && d.tipo) parts.push(esc(d.tipo));
  return `${esc(d.categoria)}${parts.length ? " · " + parts.join(" · ") : ""}`;
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

function sortedDespesas() {
  let list = filteredDespesasBase();
  const q = state.query.trim();
  let sortMode = state.despSort || "vencimento";

  if (q) {
    if (isValueQuery(q)) {
      sortMode = "valor";
    } else if (parseQueryDate(q)) {
      sortMode = "vencimento";
    } else {
      const ql = q.toLowerCase();
      list = list.filter(
        (d) =>
          String(d.descricao).toLowerCase().includes(ql) ||
          String(d.categoria).toLowerCase().includes(ql)
      );
    }
  }

  if (sortMode === "valor") {
    list.sort((a, b) => despValor(a) - despValor(b));
  } else if (sortMode === "pgto") {
    list.sort((a, b) =>
      compareDataValorDesc(despPgtoDate(a), despPgtoDate(b), a, b)
    );
  } else {
    list.sort((a, b) =>
      compareDataValorDesc(
        a.vencimento?.slice(0, 10) || "",
        b.vencimento?.slice(0, 10) || "",
        a,
        b
      )
    );
  }
  return list;
}

function receitasMetrics() {
  const rs = monthReceitas();
  return {
    previsto: rs.reduce((a, x) => a + x.previsto, 0),
    realizado: receitasRecebidasTotal(),
    atrasadas: rs.filter((x) => String(x.status).toLowerCase().includes("atras")).length,
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
    "Menu ⋮ → <strong>Instalar app</strong> (ou Adicionar à tela inicial) e abra pelo ícone <strong>Finanças</strong>.";
  if (isIOS()) {
    msg =
      "No iPhone, abra no <strong>Safari</strong> → Compartilhar → <strong>Adicionar à Tela de Início</strong> (não use o Chrome).";
  } else if (isNonStandardPort()) {
    msg =
      "Pela porta não padrão, o Chrome pode manter a barra. Toque em <strong>Tela cheia</strong> abaixo ou no botão <strong>⛶</strong> no topo.";
  } else if (window.location.protocol === "https:") {
    msg =
      "Instale pelo menu ⋮ → <strong>Instalar app</strong>. Se a barra do Chrome aparecer, use <strong>Tela cheia</strong> ou <strong>⛶</strong> no topo.";
  } else if (window.location.protocol === "http:") {
    msg = isStandalone()
      ? "Abra pelo ícone <strong>Finanças</strong> na tela inicial. Para sumir a barra de vez, use <strong>HTTPS</strong>."
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

function tabs() {
  return `
    <nav class="tabs tabs-5">
      <button class="tab ${state.tab === "painel" ? "on" : ""}" data-tab="painel">Painel</button>
      <button class="tab ${state.tab === "fluxo" ? "on" : ""}" data-tab="fluxo">Fluxo</button>
      <button class="tab ${state.tab === "despesas" ? "on" : ""}" data-tab="despesas">Despesas</button>
      <button class="tab ${state.tab === "receitas" ? "on" : ""}" data-tab="receitas">Receitas</button>
      <button class="tab ${state.tab === "orcamento" ? "on" : ""}" data-tab="orcamento">Orç.</button>
    </nav>`;
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
      return `<div class="flux-row ${isToday ? "today" : ""} ${mov ? "mov" : ""} ${cons ? "consolidado" : ""}">
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
      </div>`;
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
      ${list || `<p class="muted">Defina o mês em Config para ver o fluxo.</p>`}
    </div>`;
}

function painelView(m) {
  return `
    <div class="scroll">
      ${renderInstallHint()}
      <div class="topbar">
        <div class="hello">Olá, ${esc(state.nome)} <span class="app-ver">v${APP_VERSION}</span></div>
        <div class="topbar-actions">
          ${renderFullscreenBarBtn()}
          <button class="linkish" id="btnReload">${state.loading ? "Atualizando…" : "Atualizar"}</button>
        </div>
      </div>
      <div class="title">${esc(state.mes)} ${esc(state.ano)}</div>
      <div class="hero">
        <div class="lbl">Saldo do mês</div>
        <div class="val">${brl(m.saldo)}</div>
        <div class="sub">receitas realizadas − despesas realizadas</div>
      </div>
      <div class="grid2">
        <div class="kpi"><span>RECEITAS</span><b style="color:var(--emerald)">${brl(m.receitas)}</b><small class="kpi-hint">só recebidas</small></div>
        <div class="kpi"><span>PREVISTO</span><b>${brl(m.previsto)}</b><small class="kpi-hint">despesas no plano</small></div>
        <div class="kpi"><span>REALIZADO</span><b style="color:var(--rose)">${brl(m.realizado)}</b><small class="kpi-hint">só pagas</small></div>
        <div class="kpi"><span>A PAGAR AINDA</span><b style="color:var(--violet)">${brl(m.pagar)}</b><small class="kpi-hint">previsto em aberto</small></div>
        <div class="kpi"><span>USO DO ORÇAMENTO</span><b>${m.previsto ? pct(m.uso * 100) : "—"}</b><small class="kpi-hint">realizado ÷ previsto</small></div>
        <div class="kpi kpi-sobrando"><span>SOBRANDO</span><b>${brl(m.sobrando)}</b><small class="kpi-hint">saldo do mês − a pagar ainda</small></div>
      </div>
      <div class="section">Termômetro</div>
      <div class="grid2">
        <div class="kpi"><span>TAXA DE POUPANÇA</span><b>${pct(m.taxaPoupancaP)}</b></div>
        <div class="kpi"><span>ECONOMIA VS. PREVISTO</span><b style="color:${m.economia >= 0 ? "var(--emerald)" : "var(--rose)"}">${brl(m.economia)}</b></div>
      </div>
      <div class="section">Regra 50-30-20</div>
      <div class="bar-row"><div class="top"><span>Necessidades (meta 50%)</span><span>${brl(m.nec)} · ${pct(m.necP)}</span></div><div class="track"><div class="fill" style="width:${Math.min(m.necP, 100)}%;background:var(--teal)"></div></div></div>
      <div class="bar-row"><div class="top"><span>Desejos (meta 30%)</span><span>${brl(m.des)} · ${pct(m.desP)}</span></div><div class="track"><div class="fill" style="width:${Math.min(m.desP, 100)}%;background:var(--amber)"></div></div></div>
      <div class="bar-row"><div class="top"><span>Poupança (meta 20%)</span><span>${brl(m.pou)} · ${pct(m.pouP)}</span></div><div class="track"><div class="fill" style="width:${Math.min(m.pouP, 100)}%;background:var(--emerald)"></div></div></div>
      ${m.receitas === 0 ? `<p class="muted" style="margin-top:8px;font-size:12px">Os % usam receitas recebidas no mês. Marque Recebido? nas receitas para calcular.</p>` : ""}
      <div class="section">Leituras</div>
      <div class="alert"><span class="dot" style="background:${m.realizado <= m.previsto ? "var(--emerald)" : "var(--rose)"}"></span> ${m.realizado <= m.previsto ? "Despesas realizadas ainda dentro do previsto" : "Você já gastou mais do que o previsto neste mês"}</div>
      <div class="alert"><span class="dot" style="background:${m.saldo >= 0 ? "var(--emerald)" : "var(--rose)"}"></span> ${m.saldo >= 0 ? "Há saldo positivo neste mês" : "O saldo do mês está negativo: a renda realizada não cobre os gastos"}</div>
      <div class="alert"><span class="dot" style="background:${m.atrasadas ? "var(--rose)" : m.breve ? "var(--amber)" : "var(--emerald)"}"></span> ${m.atrasadas ? `${m.atrasadas} conta(s) atrasada(s)` : m.breve ? `${m.breve} conta(s) vencem em breve` : "Nenhuma conta atrasada no mês"}</div>
      <div class="alert"><span class="dot" style="background:${m.uso > 1 ? "var(--rose)" : "var(--emerald)"}"></span> ${m.previsto ? (m.uso > 1 ? `O orçamento estourou (${pct(m.uso * 100)} do previsto)` : `Uso do orçamento em ${pct(m.uso * 100)}`) : "Sem despesas previstas no mês"}</div>
      ${m.receitas > 0 ? `<div class="alert"><span class="dot" style="background:${m.taxaPoupancaP >= m.metaPoupancaP ? "var(--emerald)" : "var(--amber)"}"></span> ${m.taxaPoupancaP >= m.metaPoupancaP ? "Meta de poupança no caminho" : `A poupança está abaixo da meta de ${pct(m.metaPoupancaP)} da renda`}</div>` : ""}
      ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}
      ${state.hint ? `<div class="alert"><span class="dot" style="background:var(--amber)"></span> ${esc(state.hint)}</div>` : ""}
    </div>`;
}

function orcamentoView(m) {
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
    <div class="scroll">
      <div class="hello">Uso do limite</div>
      <div class="title">Orçamento</div>
      <div class="ring-wrap">
        <div class="ring" style="background:conic-gradient(var(--teal) 0 ${deg}deg,#e2e8f0 ${deg}deg 360deg)"><i>${Math.round(m.usoLimite * 100)}%</i></div>
        <div>
          <div style="font-size:12px;color:var(--muted)">${esc(state.mes)} ${esc(state.ano)}</div>
          <div style="font-weight:700;margin-top:4px">${brl(m.realizado)} / ${brl(m.limite)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">Restam ${brl(Math.max(m.limite - m.realizado, 0))} no mês</div>
        </div>
      </div>
      <div class="section">Por categoria</div>
      ${rows || `<div class="empty">Sem categorias neste mês.</div>`}
    </div>`;
}

function despesasView() {
  const hit = state.searchHitRow;
  const list = sortedDespesas()
    .map(
      (d) => `
      <div class="item${d.sheetRow === hit ? " search-hit" : ""}" data-row="${d.sheetRow}" data-kind="despesa" role="button" tabindex="0">
        <span class="check ${d.pago ? "yes" : ""}" data-toggle="${d.sheetRow}">${d.pago ? "✓" : ""}</span>
        <span class="mid"><b>${esc(d.descricao || "(sem descrição)")}</b><small>${despSubline(d)}</small></span>
        <span class="right"><b>${brl(despValor(d))}</b><span class="pill ${pillClass(d.status)}">${esc(d.status || (d.pago ? "Pago" : "Pendente"))}</span></span>
      </div>`
    )
    .join("");
  return `
    <div class="scroll" id="despScroll">
      <div class="hello">Lançamentos do mês</div>
      <div class="title-row">
        <div class="title">Despesas</div>
        <div class="sort-btns">
          <button type="button" class="sort-btn ${state.despSort === "vencimento" ? "on" : ""}" data-sort="vencimento">vencimento</button>
          <button type="button" class="sort-btn ${state.despSort === "pgto" ? "on" : ""}" data-sort="pgto">Pgto</button>
          <button type="button" class="sort-btn ${state.despSort === "valor" ? "on" : ""}" data-sort="valor">valor</button>
        </div>
      </div>
      <input class="search" id="q" placeholder="Descrição, valor (ex.: 150,00) ou data (dd/mm/aa)" value="${esc(state.query)}" />
      <div class="chips">
        <button class="chip ${state.filtro === "todas" ? "on" : ""}" data-filtro="todas">Todas</button>
        <button class="chip ${state.filtro === "pagar" ? "on" : ""}" data-filtro="pagar">A pagar</button>
        <button class="chip ${state.filtro === "atrasadas" ? "on" : ""}" data-filtro="atrasadas">Atrasadas</button>
      </div>
      ${list || `<div class="empty">Nenhuma despesa neste mês. Toque no + para lançar.</div>`}
    </div>
    <button class="fab" id="fab">+</button>`;
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
        <span class="right"><b>${brl(r.pago ? r.realizado || r.previsto : r.previsto)}</b><span class="pill ${pillClass(r.status)}">${esc(r.status || (r.pago ? "Recebido" : "Pendente"))}</span></span>
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
        <div class="field"><label>Categoria</label><select id="fCat">${options(L.categorias, f.categoria)}</select></div>
        <div class="row2">
          <div class="field"><label>Previsto</label><input id="fPrev" inputmode="decimal" value="${esc(f.previsto)}" placeholder="0,00" /></div>
          <div class="field"><label>Vencimento</label><input id="fVenc" type="date" value="${esc(f.vencimento)}" /></div>
        </div>
        <div class="field">
          <label>Data de pagamento</label>
          <input id="fPgto" type="date" value="${esc(f.dataPagamento || "")}" />
          <small class="kpi-hint">Se marcar como pago sem data, usa o vencimento (pode alterar depois)</small>
        </div>
        <div class="toggle">Já paguei <div class="switch ${f.pago ? "on" : ""}" id="pagoSwitch"><i></i></div></div>
        <div class="field ${f.pago ? "" : "hidden"}" id="realizadoField">
          <label>Realizado</label><input id="fReal" inputmode="decimal" value="${esc(f.realizado)}" placeholder="0,00" />
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
  const editingDesp = !isRec && state.editingRow;
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
        <h2>${state.editingRow ? (isRec ? "Editar receita" : "Editar despesa") : isRec ? "Nova receita" : "Nova despesa"}</h2>
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
  if (state.tab === "fluxo") body = fluxoView();
  if (state.tab === "orcamento") body = orcamentoView(m);
  if (state.tab === "despesas") body = despesasView();
  if (state.tab === "receitas") body = receitasView();
  return `<div class="app ${state.loading ? "busy" : ""}">${body}${tabs()}${sheetView()}
    <div class="toast ${state.toast ? "show" : ""}">${esc(state.toast)}</div></div>`;
}

function scrollToSearchHit() {
  if (!state.searchHitRow) return;
  requestAnimationFrame(() => {
    document
      .querySelector(`.item[data-row="${state.searchHitRow}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
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
      el.focus();
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
  if ($("fRecb")) state.form.dataRecebimento = $("fRecb").value;
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
  if (kind === "despesa" && state.listas.categorias[0]) state.form.categoria = state.listas.categorias[0];
  if (kind === "receita" && state.listas.fontes[0]) state.form.fonte = state.listas.fontes[0];
  state.sheetOpen = true;
  render();
}

function openEdit(row, kind = "despesa") {
  const list = kind === "receita" ? state.receitas : state.despesas;
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
      conta: d.conta || "Nubank",
      recorrente: d.recorrente || "Não",
      parcela: d.parcela,
      observacoes: d.observacoes,
    };
  }
  state.sheetOpen = true;
  render();
}

function firstEmptyRow(meta, rows) {
  const used = new Set(rows.map((d) => d.sheetRow));
  const start = (meta?.headerRow ?? 4) + 2;
  for (let r = start; r < start + 400; r++) {
    if (!used.has(r)) return r;
  }
  return start + rows.length;
}

async function saveSheet() {
  readFormFromDom();
  const f = state.form;
  const isRec = state.sheetKind === "receita";
  const label = isRec ? "fonte ou descrição" : "descrição";
  if (!f.descricao.trim() && !(isRec && f.fonte)) {
    showToast(`Preencha a ${label}.`);
    return;
  }
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
  const idx = (isRec ? state._recMeta : state._despMeta)?.idx || {};
  const sheet = isRec ? "Receitas" : "Despesas";
  const row = state.editingRow || firstEmptyRow(isRec ? state._recMeta : state._despMeta, isRec ? state.receitas : state.despesas);
  const competencia = `${state.ano}-${String(state.mesNum).padStart(2, "0")}-01`;
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
      };
  if (!isRec && idx.dataPagamento != null) {
    writes.dataPagamento = f.pago ? isoToBR(despesaDataPagamento(f)) : "";
  }
  if (isRec && idx.dataRecebimento != null) {
    writes.dataRecebimento = f.pago ? isoToBR(f.dataRecebimento || f.vencimento) : "";
  }
  const data = [];
  for (const [field, value] of Object.entries(writes)) {
    if (idx[field] == null) continue;
    data.push({
      range: `${sheet}!${colLetter(idx[field])}${row}`,
      values: [[value]],
    });
  }
  state.loading = true;
  render();
  try {
    await api("/values:batchUpdate?valueInputOption=USER_ENTERED", {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    });
    state.sheetOpen = false;
    showToast("Salvo. Status e % calculam na planilha.");
    await refresh();
  } catch (err) {
    state.loading = false;
    state.error = err.message;
    showToast(err.message);
    render();
  }
}

async function togglePago(row, ev, kind = "despesa") {
  ev.stopPropagation();
  const list = kind === "receita" ? state.receitas : state.despesas;
  const sheet = kind === "receita" ? "Receitas" : "Despesas";
  const d = list.find((x) => x.sheetRow === row);
  if (!d || d.idx?.pago == null) return;
  const next = !d.pago;
  if (next) {
    if (kind === "despesa") {
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
  const data = [{ range: `${sheet}!${colLetter(d.idx.pago)}${row}`, values: [[next]] }];
  if (next && !d.realizado && d.previsto) {
    data.push({ range: `${sheet}!${colLetter(d.idx.realizado)}${row}`, values: [[d.previsto]] });
  }
  if (next && kind === "despesa" && d.idx.dataPagamento != null) {
    const pgto = despesaDataPagamento(d);
    if (pgto) {
      data.push({ range: `${sheet}!${colLetter(d.idx.dataPagamento)}${row}`, values: [[isoToBR(pgto)]] });
    }
  }
  if (kind === "despesa" && !next && d.idx.dataPagamento != null) {
    data.push({ range: `${sheet}!${colLetter(d.idx.dataPagamento)}${row}`, values: [[""]] });
  }
  if (kind === "receita" && !next && d.idx.dataRecebimento != null) {
    data.push({ range: `${sheet}!${colLetter(d.idx.dataRecebimento)}${row}`, values: [[""]] });
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

async function getDespesasSheetId() {
  if (state._despSheetId != null) return state._despSheetId;
  const data = await api("?fields=sheets(properties(sheetId,title))");
  const sheet = (data.sheets || []).find((s) => s.properties?.title === "Despesas");
  if (!sheet) throw new Error("Aba Despesas não encontrada na planilha.");
  state._despSheetId = sheet.properties.sheetId;
  return state._despSheetId;
}

function openDeleteConfirm(row) {
  const d = state.despesas.find((x) => x.sheetRow === row);
  if (!d) return;
  state.deleteConfirm = { row, descricao: d.descricao || "(sem descrição)" };
  render();
}

function closeDeleteConfirm() {
  state.deleteConfirm = null;
  render();
}

async function deleteExpense(row) {
  const sheetId = await getDespesasSheetId();
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
      if (state.deleteConfirm?.row) deleteExpense(state.deleteConfirm.row);
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

  document.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      state.sheetOpen = false;
      state.deleteConfirm = null;
      render();
    })
  );
  on("btnReload", "click", () => refresh());
  on("fab", "click", () => openNew("despesa"));
  on("fabRec", "click", () => openNew("receita"));
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
    if (state.form.pago && state.sheetKind === "despesa" && !state.form.dataPagamento && state.form.vencimento) {
      state.form.dataPagamento = state.form.vencimento;
    }
    render();
  });
  on("saveBtn", "click", saveSheet);
  on("q", "input", (e) => {
    state.query = e.target.value;
    if (isValueQuery(state.query)) state.despSort = "valor";
    else if (parseQueryDate(state.query)) state.despSort = "vencimento";
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
  document.querySelectorAll("[data-sort]").forEach((b) =>
    b.addEventListener("click", () => {
      state.despSort = b.dataset.sort;
      render();
    })
  );
  document.querySelectorAll("[data-filtro]").forEach((b) =>
    b.addEventListener("click", () => {
      state.filtro = b.dataset.filtro;
      render();
    })
  );
  document.querySelectorAll(".item[data-row]").forEach((b) =>
    b.addEventListener("click", (e) => {
      if (e.target.closest("[data-toggle]") || e.target.closest("[data-toggle-rec]")) return;
      openEdit(Number(b.dataset.row), b.dataset.kind || "despesa");
    })
  );
  document.querySelectorAll("[data-toggle]").forEach((b) =>
    b.addEventListener("click", (e) => togglePago(Number(b.dataset.toggle), e, "despesa"))
  );
  document.querySelectorAll("[data-toggle-rec]").forEach((b) =>
    b.addEventListener("click", (e) => togglePago(Number(b.dataset.toggleRec), e, "receita"))
  );
}

async function boot() {
  applyStoredConfig();
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
