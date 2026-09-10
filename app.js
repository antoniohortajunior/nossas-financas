const APP_VERSION = "16";
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
  filtro: "todas",
  despSort: "vencimento",
  sheetOpen: false,
  sheetKind: "despesa",
  moreOpen: false,
  editingRow: null,
  toast: "",
  hint: "",
  booting: true,
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
    pagamento: "Pix",
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
  return v === true || v === "TRUE" || v === "VERDADEIRO" || v === "Sim" || v === "PAGO" || v === "RECEBIDO";
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
    pagamento: ["pagamento", "pagamentos"],
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
    for (const [field, names] of Object.entries(aliases)) {
      if (names.includes(k)) idx[field] = i;
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

  const listas = byRange.Listas || [];
  const pickCol = (c, from = 1) =>
    listas.slice(from).map((r) => r[c]).filter((v) => v != null && String(v).trim() !== "");
  state.listas = {
    categorias: pickCol(0),
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
      if (kind === "receita" && (hasRecebido || hasComp) && (hasDesc || hasPrev || hasFonte)) {
        headerRow = i;
        break;
      }
      if (kind !== "receita" && hasPago && (hasDesc || hasComp || hasPrev)) {
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
      if (kind === "orcamento" && !categoria) continue;
      if (kind === "despesa" && isSummaryRow(descricao, joined)) continue;
      const compRaw = idx.competencia != null ? r[idx.competencia] : "";
      rows.push({
        sheetRow: i + 1,
        pago: truthy(r[idx.pago]),
        competenciaRaw: compRaw,
        competencia: serialToISO(compRaw),
        categoria: categoria || fonte,
        descricao,
        tipo: String(r[idx.tipo] || ""),
        vencimento: serialToISO(r[idx.vencimento]),
        prioridade: String(r[idx.prioridade] || ""),
        status: String(r[idx.status] || ""),
        previsto: num(r[idx.previsto]),
        realizado: num(r[idx.realizado]),
        pct: num(r[idx.pct]),
        situacao: String(r[idx.situacao] || ""),
        pagamento: String(r[idx.pagamento] || ""),
        conta: String(r[idx.conta] || ""),
        recorrente: String(r[idx.recorrente] || "Não"),
        parcela: String(r[idx.parcela] || ""),
        observacoes: String(r[idx.observacoes] || ""),
        classe: String(r[idx.classe] || ""),
        limite: num(r[idx.limite] ?? r[3]),
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
  enrichOrcamentoFromDespesas();
}

function enrichOrcamentoFromDespesas() {
  const totals = {};
  state.despesas.forEach((d) => {
    if (!inWorkMonth(d)) return;
    const cat = d.categoria || "Outros";
    if (!totals[cat]) totals[cat] = { previsto: 0, realizado: 0 };
    totals[cat].previsto += d.previsto;
    totals[cat].realizado += d.pago ? (d.realizado || d.previsto) : d.realizado;
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
      limite: 0,
      previsto: t.previsto,
      realizado: t.realizado,
      situacao: "sem limite",
      idx: {},
    });
  }
}

async function batchGetRanges(ranges) {
  const q = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  return api(`/values:batchGet?${q}&valueRenderOption=FORMATTED_VALUE`);
}

async function refresh() {
  state.loading = true;
  state.error = "";
  state.hint = "";
  render();
  try {
    const data = await batchGetRanges([
      "Config!B4:B11",
      "Despesas!A1:T400",
      "Receitas!A1:L200",
      "Listas!A4:L20",
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

function categoriaClasse(cat) {
  const o = state.orcamento.find((x) => x.categoria === cat);
  return String(o?.classe || "");
}

function classeGasto(partial) {
  const key = partial.toLowerCase();
  return monthDespesas()
    .filter((d) => categoriaClasse(d.categoria).toLowerCase().includes(key))
    .reduce((a, x) => a + (x.pago ? (x.realizado || x.previsto) : x.realizado), 0);
}

function metrics() {
  const ds = monthDespesas();
  const rs = monthReceitas();
  const receitas = rs.reduce((a, x) => a + x.realizado, 0);
  const previsto = ds.reduce((a, x) => a + x.previsto, 0);
  const realizado = ds.reduce((a, x) => a + x.realizado, 0);
  const pagar = ds.filter((x) => !x.pago).reduce((a, x) => a + x.previsto, 0);
  const atrasadas = ds.filter((x) => String(x.status).toLowerCase().includes("atras")).length;
  const breve = ds.filter((x) => String(x.status).toLowerCase().includes("breve")).length;
  const nec = classeGasto("necessidade");
  const des = classeGasto("desejo");
  const pou = classeGasto("poupan");
  const limite = state.orcamento.reduce((a, x) => a + (x.limite || 0), 0);
  return {
    receitas,
    previsto,
    realizado,
    saldo: receitas - realizado,
    pagar,
    atrasadas,
    breve,
    uso: previsto ? realizado / previsto : 0,
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
  return Number(d.pago ? d.realizado || d.previsto : d.previsto) || 0;
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

function sortedDespesas() {
  let list = monthDespesas();
  if (state.filtro === "pagar") list = list.filter((d) => !d.pago);
  if (state.filtro === "atrasadas") list = list.filter((d) => String(d.status).toLowerCase().includes("atras"));

  const q = state.query.trim();
  let sortMode = state.despSort || "vencimento";

  if (q) {
    if (isValueQuery(q)) {
      sortMode = "valor";
      const minVal = num(q);
      list = list.filter((d) => despValor(d) >= minVal);
    } else {
      const qDate = parseQueryDate(q);
      if (qDate) {
        sortMode = "vencimento";
        list = list.filter((d) => {
          const v = d.vencimento?.slice(0, 10) || "";
          return v && v >= qDate;
        });
      } else {
        const ql = q.toLowerCase();
        list = list.filter(
          (d) =>
            String(d.descricao).toLowerCase().includes(ql) ||
            String(d.categoria).toLowerCase().includes(ql)
        );
      }
    }
  }

  if (sortMode === "valor") {
    list.sort((a, b) => despValor(a) - despValor(b));
  } else {
    list.sort((a, b) => {
      const va = a.vencimento?.slice(0, 10) || "";
      const vb = b.vencimento?.slice(0, 10) || "";
      return vb.localeCompare(va);
    });
  }
  return list;
}

function receitasMetrics() {
  const rs = monthReceitas();
  return {
    previsto: rs.reduce((a, x) => a + x.previsto, 0),
    realizado: rs.reduce((a, x) => a + x.realizado, 0),
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
    <nav class="tabs tabs-4">
      <button class="tab ${state.tab === "painel" ? "on" : ""}" data-tab="painel">Painel</button>
      <button class="tab ${state.tab === "orcamento" ? "on" : ""}" data-tab="orcamento">Orçamento</button>
      <button class="tab ${state.tab === "despesas" ? "on" : ""}" data-tab="despesas">Despesas</button>
      <button class="tab ${state.tab === "receitas" ? "on" : ""}" data-tab="receitas">Receitas</button>
    </nav>`;
}

function painelView(m) {
  return `
    <div class="scroll">
      ${renderInstallHint()}
      <div class="topbar">
        <div class="hello">Olá, ${esc(state.nome)}</div>
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
        <div class="kpi"><span>RECEITAS</span><b style="color:var(--emerald)">${brl(m.receitas)}</b></div>
        <div class="kpi"><span>PREVISTO</span><b>${brl(m.previsto)}</b></div>
        <div class="kpi"><span>REALIZADO</span><b style="color:var(--rose)">${brl(m.realizado)}</b></div>
        <div class="kpi"><span>A PAGAR</span><b style="color:var(--violet)">${brl(m.pagar)}</b></div>
      </div>
      <div class="section">Regra 50-30-20</div>
      <div class="bar-row"><div class="top"><span>Necessidades</span><span>${pct(m.necP)}</span></div><div class="track"><div class="fill" style="width:${Math.min(m.necP, 100)}%;background:var(--teal)"></div></div></div>
      <div class="bar-row"><div class="top"><span>Desejos</span><span>${pct(m.desP)}</span></div><div class="track"><div class="fill" style="width:${Math.min(m.desP, 100)}%;background:var(--amber)"></div></div></div>
      <div class="bar-row"><div class="top"><span>Poupança</span><span>${pct(m.pouP)}</span></div><div class="track"><div class="fill" style="width:${Math.min(m.pouP, 100)}%;background:var(--emerald)"></div></div></div>
      <div class="section">Leituras</div>
      <div class="alert"><span class="dot" style="background:${m.realizado <= m.previsto ? "var(--emerald)" : "var(--rose)"}"></span> ${m.realizado <= m.previsto ? "Despesas ainda dentro do previsto" : "Você já gastou mais do que o previsto"}</div>
      <div class="alert"><span class="dot" style="background:${m.atrasadas ? "var(--rose)" : m.breve ? "var(--amber)" : "var(--emerald)"}"></span> ${m.atrasadas ? `${m.atrasadas} conta(s) atrasada(s)` : m.breve ? `${m.breve} conta(s) vencem em breve` : "Nenhuma conta atrasada"}</div>
      ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}
      ${state.hint ? `<div class="alert"><span class="dot" style="background:var(--amber)"></span> ${esc(state.hint)}</div>` : ""}
    </div>`;
}

function orcamentoView(m) {
  const rows = state.orcamento
    .filter((o) => o.categoria)
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
  const list = sortedDespesas()
    .map(
      (d) => `
      <button type="button" class="item" data-row="${d.sheetRow}" data-kind="despesa">
        <span class="check ${d.pago ? "yes" : ""}" data-toggle="${d.sheetRow}">${d.pago ? "✓" : ""}</span>
        <span class="mid"><b>${esc(d.descricao || "(sem descrição)")}</b><small>${esc(d.categoria)} · ${d.vencimento ? "vence " + isoToBR(d.vencimento) : d.tipo || ""}</small></span>
        <span class="right"><b>${brl(despValor(d))}</b><span class="pill ${pillClass(d.status)}">${esc(d.status || (d.pago ? "Pago" : "Pendente"))}</span></span>
      </button>`
    )
    .join("");
  return `
    <div class="scroll" id="despScroll">
      <div class="hello">Lançamentos do mês</div>
      <div class="title-row">
        <div class="title">Despesas</div>
        <div class="sort-btns">
          <button type="button" class="sort-btn ${state.despSort === "vencimento" ? "on" : ""}" data-sort="vencimento">vencimento</button>
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
            <div class="field"><label>Pagamento</label><select id="fPag">${options(L.pagamentos, f.pagamento)}</select></div>
            <div class="field"><label>Conta</label><select id="fConta">${options(L.contas, f.conta)}</select></div>
          </div>
          <div class="row2">
            <div class="field"><label>Recorrente</label><select id="fRec">${options(["Não", "Sim"], f.recorrente)}</select></div>
            <div class="field"><label>Parcela</label><input id="fParc" value="${esc(f.parcela)}" placeholder="Ex.: 3/12" /></div>
          </div>
          <div class="field"><label>Observações</label><input id="fObs" value="${esc(f.observacoes)}" placeholder="Opcional" /></div>
        </div>`;
  return `
    <div class="sheet ${state.sheetOpen ? "open" : ""}" id="sheet">
      <div class="sheet-head">
        <h2>${state.editingRow ? (isRec ? "Editar receita" : "Editar despesa") : isRec ? "Nova receita" : "Nova despesa"}</h2>
        <button class="ghost" id="closeSheet">×</button>
      </div>
      <div class="sheet-body">${body}</div>
      <button class="save" id="saveBtn">${state.loading ? "Salvando…" : "Salvar na planilha"}</button>
    </div>`;
}

function appView() {
  const m = metrics();
  let body = "";
  if (state.tab === "painel") body = painelView(m);
  if (state.tab === "orcamento") body = orcamentoView(m);
  if (state.tab === "despesas") body = despesasView();
  if (state.tab === "receitas") body = receitasView();
  return `<div class="app ${state.loading ? "busy" : ""}">${body}${tabs()}${sheetView()}
    <div class="toast ${state.toast ? "show" : ""}">${esc(state.toast)}</div></div>`;
}

function render() {
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
  if (state.tab === "despesas" && state.query.trim() && (isValueQuery(state.query) || parseQueryDate(state.query))) {
    requestAnimationFrame(() => {
      document.querySelector("#despScroll .item")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }
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
  if ($("fCat")) {
    state.form.categoria = $("fCat").value;
    state.form.tipo = $("fTipo").value;
    state.form.prioridade = $("fPrio").value;
    state.form.pagamento = $("fPag").value;
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
      pagamento: d.pagamento || "Pix",
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
        pagamento: f.pagamento,
        conta: f.conta,
        recorrente: f.recorrente,
        parcela: f.parcela,
        observacoes: f.observacoes,
      };
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
  try {
    await api("/values:batchUpdate?valueInputOption=USER_ENTERED", {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: [
          { range: `${sheet}!${colLetter(d.idx.pago)}${row}`, values: [[next]] },
          ...(next && !d.realizado && d.previsto
            ? [{ range: `${sheet}!${colLetter(d.idx.realizado)}${row}`, values: [[d.previsto]] }]
            : []),
        ],
      }),
    });
    await refresh();
  } catch (err) {
    showToast(err.message);
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

function bind() {
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
    state.form.pago = !state.form.pago;
    if (state.form.pago && !state.form.realizado) state.form.realizado = state.form.previsto;
    render();
  });
  on("saveBtn", "click", saveSheet);
  on("q", "input", (e) => {
    state.query = e.target.value;
    if (isValueQuery(state.query)) state.despSort = "valor";
    else if (parseQueryDate(state.query)) state.despSort = "vencimento";
    render();
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
