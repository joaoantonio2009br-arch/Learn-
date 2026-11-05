const DB = 'https://ecoin-b7697-default-rtdb.firebaseio.com/usuarios';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const loading = on => $('#loader').classList.toggle('on', on);

let cursos = [];
let user = JSON.parse(localStorage.getItem('lp_user') || 'null');
let busca = { q: '', area: '', tag: '' };
let aba = 'aulas';

/* ---------- dados locais (matrículas e progresso ficam só neste aparelho) ---------- */
const chave = () => 'lp_dados_' + user.id;
const DEF = () => ({ mat: [], vistas: {}, ultima: {}, fav: [], notas: {}, log: {}, nlog: {}, recente: '' });
const dados = () => Object.assign(DEF(), JSON.parse(localStorage.getItem(chave()) || '{}'));
const salvar = d => localStorage.setItem(chave(), JSON.stringify(d));
const cfg = () => Object.assign({ cor: 'azul', meta: 1, auto: true, compacto: false }, JSON.parse(localStorage.getItem('lp_cfg_' + (user ? user.id : '')) || '{}'));
const CORES = { azul: ['#5b9fdc', '#2f7fd1'], ciano: ['#38c8e8', '#1d9fc0'], indigo: ['#8a97ff', '#5566e6'], ceu: ['#6cb8ff', '#2b8cf0'] };
function aplicaCfg() {
  const c = user ? cfg() : { cor: 'azul' }, k = CORES[c.cor] || CORES.azul;
  document.documentElement.style.setProperty('--blue', k[0]);
  document.documentElement.style.setProperty('--blue2', k[1]);
  document.body.classList.toggle('compacto', !!c.compacto);
}
const dia = o => { const x = new Date(); x.setDate(x.getDate() + o); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
function sequencia(d) { let o = d.log[dia(0)] > 0 ? 0 : -1, n = 0; while (d.log[dia(o)] > 0) { n++; o--; } return n; }
let tocar = false, fsNativo = false;
let capas = JSON.parse(localStorage.getItem('lp_capas') || '{}');
const capaDe = c => c.capa || capas[c.id] || '';
const imgCapa = u => `<img class="cimg" src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
function pintaCapa(id, url) {
  document.querySelectorAll('.cover[data-cap="' + id + '"]').forEach(el => {
    if (!el.querySelector('.cimg')) el.insertAdjacentHTML('afterbegin', imgCapa(url));
  });
}
// busca a capa real da playlist no YouTube (oEmbed) e guarda no aparelho
async function buscaCapas() {
  for (const c of cursos) {
    if (!c.playlist || capaDe(c)) continue;
    const alvo = encodeURIComponent('https://www.youtube.com/playlist?list=' + c.playlist);
    for (const base of ['https://www.youtube.com/oembed?format=json&url=', 'https://noembed.com/embed?url=']) {
      try {
        const r = await fetch(base + alvo);
        const j = await r.json();
        if (j.thumbnail_url) {
          capas[c.id] = j.thumbnail_url;
          localStorage.setItem('lp_capas', JSON.stringify(capas));
          pintaCapa(c.id, capas[c.id]);
          break;
        }
      } catch (e) {}
    }
  }
}

/* ---------- utilidades ---------- */
function ytId(u) {
  const m = String(u).match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return m ? m[1] : (/^[\w-]{11}$/.test(u) ? u : '');
}
function aulasDe(c) {
  if (c.playlist && !(c.aulas && c.aulas.length))
    return Array.from({ length: c.numeroAulas || 1 }, (_, i) => ({ titulo: 'Aula ' + (i + 1), url: '', idx: i }));
  return (c.aulas || []).map((a, i) => typeof a === 'string'
    ? { titulo: 'Aula ' + (i + 1), url: a }
    : { titulo: a.titulo || 'Aula ' + (i + 1), url: a.url });
}
const pct = c => {
  const n = aulasDe(c).length;
  return n ? Math.round(((dados().vistas[c.id] || []).length / n) * 100) : 0;
};
async function hash(txt) {
  const s = 'learn+|' + txt;
  if (window.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (const ch of s) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return 'x' + h.toString(16);
}
async function pegarUsuarios() {
  const r = await fetch(DB + '.json');
  if (!r.ok) throw new Error('Não foi possível acessar o servidor de contas.');
  return (await r.json()) || {};
}

/* ---------- autenticação ---------- */
async function cadastrar(e) {
  e.preventDefault();
  const nome = $('#nome').value.trim(), email = $('#email').value.trim().toLowerCase();
  const s1 = $('#s1').value, s2 = $('#s2').value, msg = $('#msg');
  msg.textContent = '';
  if (nome.length < 2) return msg.textContent = 'Digite seu nome.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return msg.textContent = 'Digite um email válido.';
  if (s1.length < 6) return msg.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
  if (s1 !== s2) return msg.textContent = 'As senhas não são iguais.';
  loading(true);
  try {
    const todos = await pegarUsuarios();
    const lista = Object.values(todos);
    if (lista.some(u => (u.email || '').toLowerCase() === email)) throw new Error('Este email já tem conta.');
    if (lista.some(u => (u.nome || '').toLowerCase() === nome.toLowerCase())) throw new Error('Este nome já está em uso. Escolha outro.');
    const r = await fetch(DB + '.json', {
      method: 'POST',
      body: JSON.stringify({ nome, email, senha: await hash(s1), criadoEm: Date.now() })
    });
    if (!r.ok) throw new Error('Não foi possível criar a conta. Tente de novo.');
    const { name } = await r.json();
    entrar({ id: name, nome, email });
  } catch (err) {
    msg.textContent = err.message;
  }
  loading(false);
}
async function logar(e) {
  e.preventDefault();
  const id = $('#id').value.trim().toLowerCase(), senha = $('#senha').value, msg = $('#msg');
  msg.textContent = '';
  if (!id || !senha) return msg.textContent = 'Preencha nome ou email e a senha.';
  loading(true);
  try {
    const todos = await pegarUsuarios(), h = await hash(senha);
    const achado = Object.entries(todos).find(([, u]) =>
      ((u.email || '').toLowerCase() === id || (u.nome || '').toLowerCase() === id) && u.senha === h);
    if (!achado) throw new Error('Nome/email ou senha incorretos.');
    entrar({ id: achado[0], nome: achado[1].nome, email: achado[1].email });
  } catch (err) {
    msg.textContent = err.message;
  }
  loading(false);
}
function entrar(u) {
  user = u;
  localStorage.setItem('lp_user', JSON.stringify(u));
  location.hash = '#/';
  rota();
}
function sair() {
  localStorage.removeItem('lp_user');
  user = null;
  location.hash = '#/login';
}

/* ---------- telas ---------- */
const icones = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
  cfg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/></svg>'
};

function authView(modo) {
  const cad = modo === 'cadastro';
  $('#app').innerHTML = `<div class="auth"><div class="auth-box">
    <img src="logo.png" alt="Learn+"><h1>Learn+</h1>
    <p class="sub">${cad ? 'Crie sua conta para começar a estudar' : 'Entre para continuar estudando'}</p>
    <form id="f" novalidate>
      ${cad ? `<label for="nome">Nome</label><input id="nome" autocomplete="name">
      <label for="email">Email</label><input id="email" type="email" autocomplete="email">
      <label for="s1">Senha</label><input id="s1" type="password" autocomplete="new-password">
      <label for="s2">Confirmar senha</label><input id="s2" type="password" autocomplete="new-password">`
      : `<label for="id">Nome ou email</label><input id="id" autocomplete="username">
      <label for="senha">Senha</label><input id="senha" type="password" autocomplete="current-password">`}
      <button class="btn full">${cad ? 'Criar conta' : 'Entrar'}</button>
      <div class="msg" id="msg" role="alert"></div>
    </form>
    <div class="swap">${cad ? 'Já tem conta? <a href="#/login">Entrar</a>' : 'Não tem conta? <a href="#/cadastro">Criar conta</a>'}</div>
  </div></div>`;
  $('#f').onsubmit = cad ? cadastrar : logar;
}

function shell(ativo, html) {
  const l = (h, n, i, t) => `<a href="#/${h}" class="${ativo === n ? 'on' : ''}">${icones[i]}<span>${t}</span></a>`;
  $('#app').innerHTML = `
    <div class="top"><div class="brand"><img src="logo.png" alt="" width="30">Learn+</div><button onclick="sair()">Sair</button></div>
    <aside class="side">
      <div class="brand"><img src="logo.png" alt="">Learn+</div>
      <nav class="nav">${l('', 'dash', 'home', 'Dashboard')}${l('cursos', 'cursos', 'book', 'Cursos')}${l('meus', 'meus', 'play', 'Meus cursos')}${l('config', 'cfg', 'cfg', 'Configurações')}</nav>
      <div class="who"><b>${esc(user.nome)}</b>${esc(user.email)}<br><button onclick="sair()">Sair da conta</button></div>
    </aside>
    <main>${html}</main>`;
}

function card(c) {
  const mat = dados().mat.includes(c.id), p = pct(c);
  return `<article class="card">
    <div class="cover" data-cap="${esc(c.id)}">${capaDe(c) ? imgCapa(capaDe(c)) : ''}<span aria-hidden="true">${esc(c.icone || '📘')}</span><button class="star ${dados().fav.includes(c.id) ? 'on' : ''}" onclick="fav('${esc(c.id)}')" aria-label="Favoritar">★</button></div>
    <div class="cbody">
      <div class="meta">${esc(c.area)} • ${c.numeroAulas || aulasDe(c).length} aulas</div>
      <h4>${esc(c.nome)}</h4>
      <p>${esc(c.descricao)}</p>
      <div class="tags">${(c.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      ${mat ? `<div class="bar"><i style="width:${p}%"></i></div><div class="meta">${p}% concluído</div>` : ''}
      <a class="btn sm" href="#/curso/${esc(c.id)}">${mat ? (p ? 'Continuar' : 'Começar') : 'Ver curso'}</a>
    </div></article>`;
}

function dashboard() {
  const d = dados(), k = cfg(), meus = cursos.filter(c => d.mat.includes(c.id));
  const feitas = Object.values(d.vistas).reduce((a, v) => a + v.length, 0);
  const media = meus.length ? Math.round(meus.reduce((a, c) => a + pct(c), 0) / meus.length) : 0;
  const hj = d.log[dia(0)] || 0, p = Math.min(100, Math.round(hj / k.meta * 100)), seq = sequencia(d);
  const rec = meus.find(c => c.id === d.recente && pct(c) < 100) || meus.find(c => pct(c) < 100);
  const hora = new Date().getHours(), sau = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const nomeAula = rec ? aulasDe(rec)[Math.min(d.ultima[rec.id] || 0, aulasDe(rec).length - 1)].titulo : '';
  const sem = [...Array(7)].map((_, i) => { const o = i - 6, x = new Date(); x.setDate(x.getDate() + o); return { n: d.log[dia(o)] || 0, l: 'DSTQQSS'[x.getDay()], hoje: o === 0 }; });
  const mx = Math.max(1, ...sem.map(x => x.n));
  const areas = [...new Set(cursos.map(c => c.area))].map(ar => {
    const cs = cursos.filter(c => c.area === ar), tot = cs.reduce((a, c) => a + aulasDe(c).length, 0);
    const ok = cs.reduce((a, c) => a + (d.vistas[c.id] || []).length, 0);
    return { ar, ok, tot, p: tot ? Math.round(ok / tot * 100) : 0 };
  });
  const comp = meus.some(c => pct(c) === 100);
  const conq = [
    ['🚀', 'Primeira aula', feitas >= 1], ['📚', '5 aulas', feitas >= 5], ['🔟', '10 aulas', feitas >= 10],
    ['🔥', '3 dias seguidos', seq >= 3], ['🏆', 'Curso completo', comp], ['🧭', '3 matrículas', meus.length >= 3],
    ['✍️', 'Anotador', Object.values(d.notas).some(v => v.trim())], ['⭐', 'Favoritou', d.fav.length > 0]];
  const tarefas = [
    [`Cumprir a meta de hoje (${hj}/${k.meta} ${k.meta > 1 ? 'aulas' : 'aula'})`, hj >= k.meta, rec ? '#/curso/' + rec.id : '#/cursos'],
    ['Escrever uma anotação numa aula', !!d.nlog[dia(0)], rec ? '#/curso/' + rec.id : '#/cursos'],
    ['Matricular-se em um curso', meus.length > 0, '#/cursos'],
    ['Favoritar um curso', d.fav.length > 0, '#/cursos']];
  const favs = cursos.filter(c => d.fav.includes(c.id));
  const outros = cursos.filter(c => !d.mat.includes(c.id)).slice(0, 4);
  shell('dash', `
    <section class="hero">
      <div class="hero-t">
        <h2>${sau}, ${esc(user.nome.split(' ')[0])}</h2>
        ${rec ? `<p>Continue em <b>${esc(rec.nome)}</b><br><span class="meta">${esc(nomeAula)} • ${pct(rec)}% concluído</span></p><a class="btn" href="#/curso/${esc(rec.id)}">Continuar aula</a>`
          : `<p>Escolha um curso e comece a estudar hoje.</p><a class="btn" href="#/cursos">Ver cursos</a>`}
      </div>
      <div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="r0"/><circle cx="50" cy="50" r="42" class="r1" stroke-dasharray="264" stroke-dashoffset="${264 * (1 - p / 100)}"/></svg>
        <div><b>${p}%</b><span>meta de hoje</span></div></div>
    </section>
    <div class="stats s4">
      <div class="stat"><b>${meus.length}</b><span>Cursos</span></div>
      <div class="stat"><b>${feitas}</b><span>Aulas feitas</span></div>
      <div class="stat"><b>${seq}🔥</b><span>Dias seguidos</span></div>
      <div class="stat"><b>${media}%</b><span>Progresso médio</span></div>
    </div>
    <div class="duo">
      <section class="panel"><h3>Para fazer</h3>
        ${tarefas.map(t => `<a class="todo ${t[1] ? 'ok' : ''}" href="${t[2]}"><i>${t[1] ? '✓' : ''}</i><span>${esc(t[0])}</span></a>`).join('')}</section>
      <section class="panel"><h3>Atividade da semana</h3>
        <div class="week">${sem.map(x => `<div class="wd ${x.hoje ? 'h' : ''}"><em>${x.n || ''}</em><i style="height:${Math.max(6, x.n / mx * 100)}%"></i><span>${x.l}</span></div>`).join('')}</div></section>
    </div>
    <div class="duo">
      <section class="panel"><h3>Conquistas</h3><div class="badges">${conq.map(c => `<div class="bdg ${c[2] ? 'on' : ''}" title="${c[2] ? 'Conquistada' : 'Bloqueada'}"><span>${c[0]}</span>${c[1]}</div>`).join('')}</div></section>
      <section class="panel"><h3>Progresso por área</h3>
        ${areas.map(x => `<div class="area"><div><b>${esc(x.ar)}</b><span>${x.ok}/${x.tot} aulas</span></div><div class="bar"><i style="width:${x.p}%"></i></div></div>`).join('')}</section>
    </div>
    <h3>Seus cursos</h3>
    ${meus.length ? `<div class="grid">${meus.map(card).join('')}</div>` : `<div class="empty">Você ainda não está em nenhum curso. <a href="#/cursos">Escolha um curso</a> para começar.</div>`}
    ${favs.length ? `<h3>Favoritos</h3><div class="grid">${favs.map(card).join('')}</div>` : ''}
    ${outros.length ? `<h3>Descubra mais</h3><div class="grid">${outros.map(card).join('')}</div>` : ''}`);
}

function filtrar() {
  const q = busca.q.toLowerCase();
  return cursos.filter(c =>
    (!busca.area || c.area === busca.area) &&
    (!busca.tag || (c.tags || []).includes(busca.tag)) &&
    (!q || [c.nome, c.area, c.descricao, ...(c.tags || [])].join(' ').toLowerCase().includes(q)));
}
function pintaLista() {
  const r = filtrar();
  $('#res').innerHTML = r.length ? r.map(card).join('') : '<div class="empty" style="grid-column:1/-1">Nenhum curso encontrado. Tente outra palavra, área ou tag.</div>';
}
function catalogo() {
  const areas = [...new Set(cursos.map(c => c.area))].sort();
  const tags = [...new Set(cursos.flatMap(c => c.tags || []))].sort();
  shell('cursos', `
    <h2>Cursos</h2><p class="lead">Busque pelo nome, área ou tag.</p>
    <div class="filters">
      <input id="q" type="search" placeholder="Buscar curso..." value="${esc(busca.q)}" aria-label="Buscar">
      <select id="ar" aria-label="Área"><option value="">Todas as áreas</option>${areas.map(a => `<option ${a === busca.area ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
      <select id="tg" aria-label="Tag"><option value="">Todas as tags</option>${tags.map(t => `<option ${t === busca.tag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
    </div>
    <div class="grid" id="res"></div>`);
  $('#q').oninput = e => { busca.q = e.target.value; pintaLista(); };
  $('#ar').onchange = e => { busca.area = e.target.value; pintaLista(); };
  $('#tg').onchange = e => { busca.tag = e.target.value; pintaLista(); };
  pintaLista();
}

function meusCursos() {
  const d = dados(), meus = cursos.filter(c => d.mat.includes(c.id));
  shell('meus', `<h2>Meus cursos</h2><p class="lead">Os cursos em que você está matriculado.</p>
    ${meus.length ? `<div class="grid">${meus.map(card).join('')}</div>` : `<div class="empty">Nenhuma matrícula ainda. <a href="#/cursos">Ver cursos</a></div>`}`);
}

function listaInner(c) {
  const d = dados(), aulas = aulasDe(c), atual = Math.min(d.ultima[c.id] || 0, aulas.length - 1);
  const vistas = d.vistas[c.id] || [], docs = c.documentos || [];
  if (aba === 'docs') return docs.length
    ? docs.map(x => `<a class="item" href="${esc(x.url)}" target="_blank" rel="noopener"><span class="n">📄</span><span class="t">${esc(x.nome)}</span></a>`).join('')
    : '<div class="empty" style="margin:12px">Este curso não tem documentos.</div>';
  return aulas.map((x, i) => `<div class="item ${i === atual ? 'on' : ''} ${vistas.includes(i) ? 'done' : ''}" onclick="irAula('${esc(c.id)}',${i})"><span class="n">${vistas.includes(i) ? '✓' : i + 1}</span><span class="t">${esc(x.titulo)}</span></div>`).join('');
}
function mostraAula(c) {
  const d = dados(), aulas = aulasDe(c), i = Math.min(d.ultima[c.id] || 0, aulas.length - 1), v = d.vistas[c.id] || [];
  const t = $('#at'); if (t) t.textContent = aulas[i].titulo;
  const li = $('#li'); if (li) li.innerHTML = listaInner(c);
  const n = $('.nota'); if (n) n.value = d.notas[c.id + ':' + i] || '';
  const bc = $('#bc'); if (bc) bc.textContent = v.includes(i) ? 'Desmarcar como concluída' : 'Marcar como concluída';
}

function paginaCurso(id) {
  const c = cursos.find(x => x.id === id);
  if (!c) return shell('cursos', '<div class="empty">Curso não encontrado. <a href="#/cursos">Voltar aos cursos</a></div>');
  const d = dados(), aulas = aulasDe(c), mat = d.mat.includes(c.id);
  const atual = Math.min(d.ultima[c.id] || 0, aulas.length - 1);
  if (mat) { d.recente = c.id; salvar(d); }
  const vistas = d.vistas[c.id] || [], docs = c.documentos || [], a = aulas[atual];
  const quer = tocar && cfg().auto; tocar = false;
  const lista = c.playlist && !a.url;
  const video = lista
    ? `<div class="player" id="pl"><div id="yt"></div><button class="fsx" onclick="sairFs()">✕ Voltar ao normal</button></div>`
    : (a && ytId(a.url) ? `<div class="player" id="pl"><iframe src="https://www.youtube.com/embed/${ytId(a.url)}?rel=0${quer ? '&autoplay=1' : ''}" title="${esc(a.titulo)}" allow="autoplay; accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><button class="fsx" onclick="sairFs()">✕ Voltar ao normal</button></div>` : '<div class="empty">Vídeo indisponível.</div>');
  shell('cursos', `
    <a href="#/cursos" class="meta">← Voltar aos cursos</a>
    <div class="ch"><div><h2 style="margin-top:6px">${esc(c.nome)}</h2><p class="lead">${esc(c.descricao)}</p></div>
      <button class="btn sm ghost fv ${d.fav.includes(c.id) ? 'on' : ''}" onclick="fav('${esc(c.id)}')">★ ${d.fav.includes(c.id) ? 'Favorito' : 'Favoritar'}</button></div>
    <div class="course"><div>
      ${video}
      <h3 id="at" style="margin:14px 0 0">${esc(a ? a.titulo : '')}</h3>
      <div class="actions">
        <button class="btn sm ghost" onclick="entrarFs()">⛶ Tela cheia horizontal</button>
        ${mat ? `<button class="btn sm" id="bc" onclick="concluir('${esc(c.id)}')">${vistas.includes(atual) ? 'Desmarcar como concluída' : 'Marcar como concluída'}</button>
        <button class="btn sm ghost" onclick="proximaAula('${esc(c.id)}')">Próxima aula</button>
        <button class="btn sm ghost" onclick="matricular('${esc(c.id)}')">Cancelar matrícula</button>`
        : `<button class="btn sm" onclick="matricular('${esc(c.id)}')">Matricular-se neste curso</button>`}
      </div>
      <div class="tags">${(c.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <section class="panel" style="margin-top:16px"><h3 style="margin:0 0 8px">Minhas anotações desta aula</h3>
        <textarea class="nota" placeholder="Escreva o que aprendeu, dúvidas, minutos importantes..." oninput="nota('${esc(c.id)}',this.value)">${esc(d.notas[c.id + ':' + atual] || '')}</textarea>
        <div class="meta">Salvo automaticamente neste aparelho.</div></section>
    </div>
    <div class="list"><div class="tabs">
      <button class="${aba === 'aulas' ? 'on' : ''}" onclick="trocaAba('aulas')">Aulas (${aulas.length})</button>
      <button class="${aba === 'docs' ? 'on' : ''}" onclick="trocaAba('docs')">Documentos${docs.length ? ' (' + docs.length + ')' : ''}</button>
    </div><div id="li">${listaInner(c)}</div></div></div>`);
  if (lista) iniciaYT(c, atual, quer);
}

/* ---------- player de playlist (API do YouTube) ---------- */
let ytp = null, ytProm = null;
function ytApi() {
  if (ytProm) return ytProm;
  ytProm = new Promise(res => {
    if (window.YT && YT.Player) return res();
    window.onYouTubeIframeAPIReady = res;
    const t = document.createElement('script'); t.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(t);
  });
  return ytProm;
}
const ytVivo = () => ytp && ytp.getIframe && document.body.contains(ytp.getIframe());
async function iniciaYT(c, idx, auto) {
  await ytApi();
  if (!$('#yt')) return;
  try { ytp && ytp.destroy && ytp.destroy(); } catch (e) {}
  ytp = new YT.Player('yt', {
    width: '100%', height: '100%', playerVars: { rel: 0, playsinline: 1 },
    events: {
      onReady: e => {
        const o = { listType: 'playlist', list: c.playlist, index: idx };
        auto ? e.target.loadPlaylist(o) : e.target.cuePlaylist(o);
      },
      onStateChange: e => {
        if (!$('#pl')) return;
        const i = ytp.getPlaylistIndex();
        if (e.data === 1 && i >= 0) { // tocando: acompanha em qual aula está
          const d = dados();
          if ((d.ultima[c.id] || 0) !== i) { d.ultima[c.id] = i; salvar(d); mostraAula(c); }
        }
        if (e.data === 0 && i >= 0) { // terminou: conclui a aula
          const d = dados(), v = d.vistas[c.id] || [];
          if (d.mat.includes(c.id) && !v.includes(i)) {
            v.push(i); d.vistas[c.id] = v; d.log[dia(0)] = (d.log[dia(0)] || 0) + 1; salvar(d); mostraAula(c);
          }
        }
      }
    }
  });
}

function configuracoes() {
  const k = cfg(), d = dados();
  const sw = (id, on, t, sub) => `<label class="row"><div><b>${t}</b><span>${sub}</span></div><input type="checkbox" class="sw" ${on ? 'checked' : ''} onchange="setCfg('${id}',this.checked)"></label>`;
  shell('cfg', `
    <h2>Configurações</h2><p class="lead">Ajuste a Learn+ do seu jeito.</p>
    <section class="panel"><h3>Conta</h3>
      <div class="row"><div><b>${esc(user.nome)}</b><span>${esc(user.email)}</span></div><button class="btn sm ghost" onclick="sair()">Sair da conta</button></div></section>
    <section class="panel"><h3>Aparência</h3>
      <div class="row"><div><b>Cor de destaque</b><span>Escolha o tom de azul</span></div>
        <div class="cores">${Object.entries(CORES).map(([n, v]) => `<button class="cor ${k.cor === n ? 'on' : ''}" style="background:${v[0]}" onclick="setCfg('cor','${n}')" aria-label="${n}"></button>`).join('')}</div></div>
      ${sw('compacto', k.compacto, 'Modo compacto', 'Menos espaço entre os elementos')}</section>
    <section class="panel"><h3>Estudo</h3>
      <div class="row"><div><b>Meta diária</b><span>Aulas por dia para fechar o anel do dashboard</span></div>
        <select class="mini" onchange="setCfg('meta',+this.value)">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${k.meta === n ? 'selected' : ''}>${n} ${n > 1 ? 'aulas' : 'aula'}</option>`).join('')}</select></div>
      ${sw('auto', k.auto, 'Reprodução automática', 'Começa o vídeo ao trocar de aula')}</section>
    <section class="panel"><h3>Dados deste aparelho</h3>
      <div class="row"><div><b>Zerar progresso</b><span>Apaga aulas concluídas e sequência</span></div><button class="btn sm ghost" onclick="limpar('prog')">Zerar</button></div>
      <div class="row"><div><b>Apagar anotações</b><span>${Object.keys(d.notas).length} anotações salvas</span></div><button class="btn sm ghost" onclick="limpar('notas')">Apagar</button></div>
      <div class="row"><div><b>Remover matrículas e favoritos</b><span>Sua conta continua existindo</span></div><button class="btn sm ghost" onclick="limpar('mat')">Remover</button></div>
      <p class="meta" style="margin-top:10px">Matrículas, progresso e anotações ficam salvos só neste aparelho. No servidor ficam apenas os dados da conta.</p></section>`);
}

/* ---------- ações ---------- */
function matricular(id) {
  const d = dados(), i = d.mat.indexOf(id);
  i < 0 ? d.mat.push(id) : d.mat.splice(i, 1);
  salvar(d); rota();
}
function irAula(id, i) {
  const c = cursos.find(x => x.id === id), d = dados();
  d.ultima[id] = i; salvar(d);
  if (c.playlist && ytVivo() && ytp.playVideoAt) { ytp.playVideoAt(i); mostraAula(c); return; }
  tocar = true; rota();
}
function proximaAula(id) {
  const c = cursos.find(x => x.id === id), d = dados(), n = aulasDe(c).length;
  irAula(id, Math.min((d.ultima[id] || 0) + 1, n - 1));
}
function concluir(id) {
  const c = cursos.find(x => x.id === id), d = dados(), i = d.ultima[id] || 0, v = d.vistas[id] || [], k = v.indexOf(i);
  if (k < 0) { v.push(i); d.log[dia(0)] = (d.log[dia(0)] || 0) + 1; }
  else { v.splice(k, 1); if (d.log[dia(0)] > 0) d.log[dia(0)]--; }
  d.vistas[id] = v; salvar(d); mostraAula(c);
}
function trocaAba(a) {
  aba = a;
  const li = $('#li'), c = cursos.find(x => x.id === location.hash.split('/')[2]);
  if (!li || !c) return rota();
  li.innerHTML = listaInner(c);
  document.querySelectorAll('.tabs button').forEach((b, i) => b.classList.toggle('on', (i === 0) === (a === 'aulas')));
}
function fav(id) {
  const d = dados(), i = d.fav.indexOf(id); i < 0 ? d.fav.push(id) : d.fav.splice(i, 1); salvar(d);
  const b = $('.fv');
  if (b) { const on = d.fav.includes(id); b.classList.toggle('on', on); b.textContent = '★ ' + (on ? 'Favorito' : 'Favoritar'); } else rota();
}
function nota(id, v) { const d = dados(), i = d.ultima[id] || 0; d.notas[id + ':' + i] = v; if (v.trim()) d.nlog[dia(0)] = 1; salvar(d); }
function setCfg(k, v) { const c = cfg(); c[k] = v; localStorage.setItem('lp_cfg_' + user.id, JSON.stringify(c)); aplicaCfg(); rota(); }
function limpar(t) {
  if (!confirm('Tem certeza? Isso não pode ser desfeito.')) return;
  const d = dados();
  if (t === 'prog') { d.vistas = {}; d.ultima = {}; d.log = {}; d.recente = ''; }
  if (t === 'notas') { d.notas = {}; d.nlog = {}; }
  if (t === 'mat') { d.mat = []; d.fav = []; }
  salvar(d); rota();
}

/* ---------- tela cheia horizontal (funciona sem depender do navegador) ---------- */
function limpaFs() {
  const el = $('#pl');
  if (el) el.classList.remove('fs');
  document.body.classList.remove('fsb');
  fsNativo = false;
  try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) {}
}
async function sairFs() {
  const nat = document.fullscreenElement || document.webkitFullscreenElement;
  limpaFs();
  try { if (nat) await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {}
}
async function entrarFs() {
  const el = $('#pl'); if (!el) return;
  el.classList.add('fs'); document.body.classList.add('fsb');
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  let travou = false;
  try { if (req) { await req.call(el, { navigationUI: 'hide' }); fsNativo = true; } } catch (e) {}
  try { if (screen.orientation && screen.orientation.lock) { await screen.orientation.lock('landscape'); travou = true; } } catch (e) {}
  // Se o navegador não girou a tela, sai do modo nativo e usa o giro por CSS
  if (fsNativo && !travou && window.innerHeight > window.innerWidth) {
    fsNativo = false;
    try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {}
    el.classList.add('fs'); document.body.classList.add('fsb');
  }
}
['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => {
  if (fsNativo && !(document.fullscreenElement || document.webkitFullscreenElement)) limpaFs();
}));



/* ---------- rotas ---------- */
function rota() {
  const [p, arg] = (location.hash.slice(2) || '').split('/');
  const livre = ['login', 'cadastro'].includes(p);
  if (!user && !livre) return location.hash = '#/login';
  if (user && livre) return location.hash = '#/';
  if (!user) return authView(p);
  limpaFs(); aplicaCfg();
  if (p === 'config') configuracoes();
  else if (p === 'cursos') catalogo();
  else if (p === 'meus') meusCursos();
  else if (p === 'curso') paginaCurso(arg);
  else dashboard();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/curso/')) aba = 'aulas'; rota(); });

(async function iniciar() {
  loading(true);
  try {
    const r = await fetch('cursos.json');
    cursos = await r.json();
  } catch (e) {
    $('#app').innerHTML = '<div class="auth"><div class="auth-box"><h1>Ops</h1><p class="sub">Não foi possível carregar cursos.json. Abra o site por um servidor (GitHub Pages, Live Server) e não direto pelo arquivo.</p></div></div>';
    loading(false);
    return;
  }
  loading(false);
  rota();
  buscaCapas();
})();