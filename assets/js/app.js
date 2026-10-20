'use strict';

let dados = [];
let sessao = carregarSessao();
let atualizando = false;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data = v => new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(new Date(v));

function aviso(texto) {
  $('#toast').textContent = texto;
  $('#toast').classList.add('show');
  setTimeout(() => $('#toast').classList.remove('show'), 2600);
}

async function atualizarDados(mostrarErro = true) {
  if (atualizando) return;
  atualizando = true;
  try {
    dados = await carregarDados(sessao.perfil, sessao.id);
    render();
  } catch (erro) {
    console.error('Falha ao carregar dados:', erro);
    if (mostrarErro) aviso('Não foi possível acessar o banco. Verifique o Render.');
  } finally {
    atualizando = false;
  }
}

function base() { return dados; }
function nav(pagina) {
  if (pagina === 'novo' && sessao.perfil !== 'cliente') pagina = 'acompanhar';
  $$('.page').forEach(x => x.classList.toggle('active', x.id === pagina));
  $$('nav button').forEach(x => x.classList.toggle('active', x.dataset.p === pagina));
  render();
}
$$('nav button').forEach(b => b.onclick = () => nav(b.dataset.p));

function protocolo() {
  const sufixo = `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`;
  return `${new Date().getFullYear()}-${sufixo}`;
}

function aplicarPerfil() {
  const cliente = sessao.perfil === 'cliente';
  $('#perfilAcesso').value = sessao.perfil;
  $('#usuarioAtual').textContent = sessao.nome;
  $$('[data-role="cliente"]').forEach(x => x.classList.toggle('hidden', !cliente));
  $('#menuAcompanhar').textContent = cliente ? 'Minhas solicitações' : 'Solicitações recebidas';
  $('#tituloAcompanhamento').textContent = $('#menuAcompanhar').textContent;
  $('#avisoPerfil').textContent = cliente
    ? 'Perfil Cliente: abra e acompanhe suas solicitações.'
    : 'Perfil Fornecedor: inicie, atualize e conclua os atendimentos recebidos.';
  if (cliente) $('#cliente').value = sessao.nome;
}

$('#perfilAcesso').onchange = async e => {
  sessao = salvarSessao(e.target.value);
  dados = [];
  aplicarPerfil();
  nav('inicio');
  await atualizarDados();
};

$('#cadastro').onsubmit = async e => {
  e.preventDefault();
  if (sessao.perfil !== 'cliente') return aviso('Somente clientes podem abrir solicitações.');
  const botao = e.submitter;
  if (botao) botao.disabled = true;
  try {
    const criado = new Date().toISOString();
    const solicitacao = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      protocolo: protocolo(), clienteId: sessao.id,
      cliente: $('#cliente').value.trim(),
      fornecedorId: $('#fornecedor').value,
      fornecedorNome: $('#fornecedor').selectedOptions[0].text,
      bloco: $('#bloco').value.trim().toUpperCase(), apto: $('#apto').value.trim(),
      prioridade: $('#prioridade').value, problema: $('#problema').value.trim(),
      status: 'Pendente', criado, retornos: []
    };
    await salvarSolicitacao(solicitacao);
    e.target.reset();
    $('#cliente').value = sessao.nome;
    await atualizarDados(false);
    aviso('Solicitação gravada no banco e enviada ao fornecedor.');
    nav('acompanhar');
  } catch (erro) {
    console.error('Falha ao cadastrar:', erro);
    aviso(erro.message || 'Não foi possível salvar a solicitação.');
  } finally {
    if (botao) botao.disabled = false;
  }
};

function classeStatus(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll(' ', ''); }
function badge(s) { return `<span class="badge ${classeStatus(s)}">${esc(s)}</span>`; }
function tabela(itens, historico = false) {
  if (!itens.length) return '<div class="empty">Nenhum registro encontrado.</div>';
  const fornecedor = sessao.perfil === 'fornecedor';
  return `<div class="wrap"><table><thead><tr><th>Protocolo</th><th>Cliente / Local</th><th>Fornecedor</th><th>Abertura</th><th>Status</th><th>Problema</th><th>Observação</th><th>Ação</th></tr></thead><tbody>${itens.map(x => {
    const r = x.retornos?.at(-1);
    const acao = historico || !fornecedor
      ? `<button class="btn secondary small" onclick="detalhes('${x.id}')">Detalhes</button>`
      : `<button class="btn primary small" onclick="abrir('${x.id}')">Atualizar</button>${x.status === 'Pendente' ? `<button class="btn secondary small" onclick="iniciar('${x.id}')">Iniciar</button>` : ''}`;
    return `<tr><td><b>${esc(x.protocolo)}</b></td><td>${esc(x.cliente)}<br><span class="muted">Bloco ${esc(x.bloco)} · Apto ${esc(x.apto)}</span></td><td>${esc(x.fornecedorNome || 'Fornecedor Principal')}</td><td>${data(x.criado)}</td><td>${badge(x.status)}</td><td>${esc(x.problema)}</td><td>${r ? esc(r.observacao) : '<span class="muted">Aguardando retorno</span>'}</td><td><div class="actions">${acao}</div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function filtrados() {
  const q = $('#busca').value.toLowerCase(), s = $('#status').value, b = $('#fbloco').value;
  return base().filter(x => (!q || [x.protocolo,x.cliente,x.bloco,x.apto,x.problema,x.retornos?.at(-1)?.observacao].some(v => String(v || '').toLowerCase().includes(q))) && (!s || x.status === s) && (!b || x.bloco === b));
}
function render() {
  const d = base(), contar = s => d.filter(x => x.status === s).length;
  $('#total').textContent = d.length; $('#pendentes').textContent = contar('Pendente');
  $('#manutencao').textContent = contar('Em manutenção'); $('#retorno').textContent = contar('Pendente de retorno');
  $('#resolvidos').textContent = contar('Resolvido');
  const atual = $('#fbloco').value, blocos = [...new Set(d.map(x => x.bloco))].sort();
  $('#fbloco').innerHTML = '<option value="">Todos</option>' + blocos.map(b => `<option ${b === atual ? 'selected' : ''}>${esc(b)}</option>`).join('');
  $('#recentes').innerHTML = tabela(d.slice(0,5)); $('#lista').innerHTML = tabela(filtrados());
  $('#hist').innerHTML = tabela(d.filter(x => x.status === 'Resolvido'), true);
}
['busca','status','fbloco'].forEach(id => $('#'+id).addEventListener(id === 'busca' ? 'input' : 'change', render));
$('#limpar').onclick = () => { $('#busca').value=''; $('#status').value=''; $('#fbloco').value=''; render(); };

window.iniciar = async id => {
  try { await iniciarSolicitacao(id); await atualizarDados(false); aviso('Atendimento iniciado e salvo no banco.'); }
  catch (erro) { console.error(erro); aviso(erro.message); }
};
window.abrir = id => {
  const x = dados.find(y => y.id === id);
  if (!x || sessao.perfil !== 'fornecedor') return;
  $('#retornoForm').reset(); $('#edit').value = id; $('#prestador').value = sessao.nome;
  $('#motivoBox').hidden = true;
  $('#resumo').innerHTML = `<b>${esc(x.protocolo)} · ${esc(x.cliente)}</b><br>Bloco ${esc(x.bloco)} · Apartamento ${esc(x.apto)}<br><span class="muted">${esc(x.problema)}</span>`;
  $('#modal').classList.add('open');
};
function fechar() { $('#modal').classList.remove('open'); }
$('.close').onclick = fechar; $('.fechar').onclick = fechar;
$('#modal').onclick = e => { if (e.target.id === 'modal') fechar(); };
$('#solucao').onchange = e => { const nao = e.target.value === 'nao'; $('#motivoBox').hidden = !nao; $('#motivo').required = nao; };
$('#retornoForm').onsubmit = async e => {
  e.preventDefault();
  const botao = e.submitter;
  if (botao) botao.disabled = true;
  try {
    const resolvido = $('#solucao').value === 'sim';
    await salvarRetorno($('#edit').value, { prestador:$('#prestador').value.trim(), resolvido, motivo:resolvido ? '' : $('#motivo').value, observacao:$('#obsPrestador').value.trim(), complemento:$('#complemento').value.trim() });
    fechar(); await atualizarDados(false); aviso('Retorno gravado no banco.');
  } catch (erro) { console.error(erro); aviso(erro.message); }
  finally { if (botao) botao.disabled = false; }
};
window.detalhes = id => {
  const x = base().find(y => y.id === id), r = x?.retornos?.at(-1);
  alert(r ? `Protocolo: ${x.protocolo}\nPrestador: ${r.prestador}\nObservação: ${r.observacao}\nComplemento: ${r.complemento || '-'}\nData: ${data(r.data)}` : `Protocolo: ${x?.protocolo || '-'}\nAguardando retorno do fornecedor.`);
};

aplicarPerfil();
render();
atualizarDados();
setInterval(() => atualizarDados(false), 30000);
