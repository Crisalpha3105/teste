'use strict';
let dados = [], sessao = null, usuarios = [];
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatarData = v => new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(new Date(v));
function aviso(texto) { $('#toast').textContent = texto; $('#toast').classList.add('show'); setTimeout(() => $('#toast').classList.remove('show'), 3500); }
function navegar(pagina) { $$('.page').forEach(x => x.classList.toggle('active', x.id === pagina)); $$('nav button').forEach(x => x.classList.toggle('active', x.dataset.p === pagina)); if (pagina === 'usuarios') carregarUsuarios(); }
$$('nav button').forEach(b => b.onclick = () => navegar(b.dataset.p));
$('#mostrarSenha').onclick = () => { const i=$('#loginSenha'); i.type=i.type==='password'?'text':'password'; $('#mostrarSenha').textContent=i.type==='password'?'Mostrar':'Ocultar'; };
$('#loginForm').onsubmit = async e => { e.preventDefault(); $('#loginErro').textContent=''; try { sessao=await entrar($('#loginEmail').value,$('#loginSenha').value); await abrirSistema(); } catch(erro) { $('#loginErro').textContent=erro.message; } };
$('#sairBtn').onclick = async () => { await sair(); location.reload(); };
async function iniciar() { try { sessao=await consultarSessao(); await abrirSistema(); } catch { $('#loginTela').hidden=false; } }
async function abrirSistema() {
  $('#loginTela').hidden=true; $('#sistema').hidden=false; $('#usuarioAtual').textContent=sessao.nome;
  $('#perfilAtual').textContent={admin:'Administrador',cliente:'Cliente',fornecedor:'Fornecedor'}[sessao.perfil];
  $$('[data-role]').forEach(x => x.hidden=x.dataset.role!==sessao.perfil);
  const cliente=sessao.perfil==='cliente';
  $('#menuAcompanhar').textContent=cliente?'Minhas solicitações':'Solicitações recebidas';
  $('#tituloAcompanhamento').textContent=$('#menuAcompanhar').textContent;
  $('#avisoPerfil').textContent=cliente?'Perfil Cliente: abra e acompanhe suas solicitações.':sessao.perfil==='fornecedor'?'Perfil Fornecedor: atualize e conclua os atendimentos recebidos.':'Perfil Administrador: gerencie acessos e acompanhe as solicitações.';
  await atualizarDados(); navegar(cliente?'novo':sessao.perfil==='admin'?'usuarios':'inicio');
}
async function atualizarDados() { try { dados=await carregarDados(); renderizar(); } catch(erro) { if (/login|sessão/i.test(erro.message)) location.reload(); else aviso(erro.message); } }
function criarProtocolo() { return `${new Date().getFullYear()}-${Date.now().toString().slice(-7)}${Math.floor(Math.random()*90+10)}`; }
$('#chamadoForm').onsubmit = async e => { e.preventDefault(); try { await salvarSolicitacao({protocolo:criarProtocolo(),bloco:$('#bloco').value.trim(),apto:$('#apto').value.trim(),prioridade:$('#prioridade').value,problema:$('#problema').value.trim()}); e.target.reset(); await atualizarDados(); aviso('Solicitação cadastrada.'); navegar('acompanhar'); } catch(erro) { aviso(erro.message); } };
function badge(status) { const classe=status.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll(' ',''); return `<span class="badge ${classe}">${esc(status)}</span>`; }
function tabela(itens,historico=false) {
  if(!itens.length) return '<div class="empty">Nenhum registro encontrado.</div>';
  const operador=['fornecedor','admin'].includes(sessao.perfil);
  return `<div class="wrap"><table><thead><tr><th>Protocolo</th><th>Cliente / Local</th><th>Fornecedor</th><th>Abertura</th><th>Status</th><th>Problema</th><th>Observação</th><th>Ação</th></tr></thead><tbody>${itens.map(x=>{
    const r=x.retornos?.at(-1); let acao=`<button class="btn secondary small" onclick="detalhes('${x.id}')">Detalhes</button>`;
    if(operador&&!historico) acao=`<button class="btn primary small" onclick="abrir('${x.id}')">Atualizar</button>${x.status==='Pendente'?`<button class="btn secondary small" onclick="iniciarAtendimento('${x.id}')">Iniciar</button>`:''}<button class="btn danger small" onclick="excluir('${x.id}')">Excluir</button>`;
    return `<tr><td><b>${esc(x.protocolo)}</b></td><td>${esc(x.cliente)}<br><span class="muted">Bloco ${esc(x.bloco)} · Apto ${esc(x.apto)}</span></td><td>${esc(x.fornecedorNome)}</td><td>${formatarData(x.criado)}</td><td>${badge(x.status)}</td><td>${esc(x.problema)}</td><td>${r?esc(r.observacao):'<span class="muted">Aguardando retorno</span>'}</td><td><div class="actions">${acao}</div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function filtrados() { const q=$('#busca').value.toLowerCase(),s=$('#status').value,b=$('#fbloco').value; return dados.filter(x=>(!q||[x.protocolo,x.cliente,x.bloco,x.apto,x.problema].some(v=>String(v||'').toLowerCase().includes(q)))&&(!s||x.status===s)&&(!b||x.bloco===b)); }
function renderizar() {
  const resolvidos=dados.filter(x=>x.status==='Resolvido');
  $('#kTotal').textContent=dados.length; $('#kPend').textContent=dados.filter(x=>x.status==='Pendente').length; $('#kMan').textContent=dados.filter(x=>x.status==='Em manutenção').length; $('#kRet').textContent=dados.filter(x=>x.status==='Pendente de retorno').length; $('#kRes').textContent=resolvidos.length;
  $('#recentes').innerHTML=tabela(dados.slice(0,5)); $('#lista').innerHTML=tabela(filtrados()); $('#hist').innerHTML=tabela(resolvidos,true);
  const blocos=[...new Set(dados.map(x=>x.bloco))].sort(); $('#fbloco').innerHTML='<option value="">Todos os blocos</option>'+blocos.map(b=>`<option>${esc(b)}</option>`).join('');
}
['busca','status','fbloco'].forEach(id => $(`#${id}`).oninput=()=>$('#lista').innerHTML=tabela(filtrados()));
$('#limpar').onclick=()=>{ $('#busca').value=$('#status').value=$('#fbloco').value=''; renderizar(); };
window.iniciarAtendimento=async id=>{try{await iniciarSolicitacao(id);await atualizarDados();aviso('Atendimento iniciado.')}catch(erro){aviso(erro.message)}};
window.excluir=async id=>{const x=dados.find(y=>y.id===id);if(!x||!confirm(`Excluir definitivamente a solicitação ${x.protocolo}?`))return;try{await excluirSolicitacao(id);await atualizarDados();aviso('Solicitação excluída.')}catch(erro){aviso(erro.message)}};
window.abrir=id=>{const x=dados.find(y=>y.id===id);$('#edit').value=id;$('#resumo').innerHTML=`<b>${esc(x.protocolo)}</b> · ${esc(x.cliente)} · Bloco ${esc(x.bloco)}, Apto ${esc(x.apto)}<br>${esc(x.problema)}`;$('#prestador').value=sessao.nome;$('#modal').classList.add('open');};
window.detalhes=id=>{const x=dados.find(y=>y.id===id),r=x.retornos?.at(-1);alert(`${x.protocolo}\nStatus: ${x.status}\nProblema: ${x.problema}\nObservação: ${r?.observacao||'Aguardando retorno'}`);};
$('.close').onclick=$('.fechar').onclick=()=>$('#modal').classList.remove('open');
$('#solucao').onchange=()=>{$('#motivoBox').hidden=$('#solucao').value!=='nao';};
$('#retornoForm').onsubmit=async e=>{e.preventDefault();const resolvido=$('#solucao').value==='sim';if(!resolvido&&!$('#motivo').value)return aviso('Informe o motivo.');try{await salvarRetorno($('#edit').value,{prestador:$('#prestador').value.trim(),resolvido,motivo:resolvido?'':$('#motivo').value,observacao:$('#obsPrestador').value.trim(),complemento:$('#complemento').value.trim()});e.target.reset();$('#modal').classList.remove('open');await atualizarDados();aviso('Retorno salvo.')}catch(erro){aviso(erro.message)}};
async function carregarUsuarios(){if(sessao.perfil!=='admin')return;try{usuarios=await listarUsuarios();$('#listaUsuarios').innerHTML=`<div class="wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead><tbody>${usuarios.map(u=>`<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td><td>${esc(u.perfil)}</td><td>${u.ativo?'Ativo':'Inativo'}</td><td><div class="actions"><button class="btn secondary small" onclick="statusUsuario('${u.id}',${!u.ativo})">${u.ativo?'Desativar':'Ativar'}</button><button class="btn primary small" onclick="novaSenha('${u.id}')">Nova senha</button></div></td></tr>`).join('')}</tbody></table></div>`;}catch(erro){aviso(erro.message)}}
$('#usuarioForm').onsubmit=async e=>{e.preventDefault();try{await criarUsuario({nome:$('#uNome').value.trim(),email:$('#uEmail').value.trim(),perfil:$('#uPerfil').value,senha:$('#uSenha').value});e.target.reset();await carregarUsuarios();aviso('Usuário criado.')}catch(erro){aviso(erro.message)}};
window.statusUsuario=async(id,ativo)=>{try{await alterarStatusUsuario(id,ativo);await carregarUsuarios();aviso('Status atualizado.')}catch(erro){aviso(erro.message)}};
window.novaSenha=async id=>{const senha=prompt('Digite a nova senha (mínimo 8 caracteres):');if(!senha)return;try{await alterarSenhaUsuario(id,senha);aviso('Senha redefinida.')}catch(erro){aviso(erro.message)}};
iniciar(); setInterval(()=>{if(sessao)atualizarDados();},30000);
