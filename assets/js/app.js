'use strict';
let sessao=null,dados=[];
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data=v=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),3000)}
function pagina(id){$$('.page').forEach(x=>x.classList.toggle('active',x.id===id));$$('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===id));if(id==='usuarios')carregarUsuarios()}
$$('nav button').forEach(b=>b.onclick=()=>pagina(b.dataset.page));
$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#erro').textContent='';try{sessao=await entrar($('#email').value,$('#senha').value);await abrir()}catch(x){$('#erro').textContent=x.message}};
$('#sair').onclick=async()=>{await sair();location.reload()};
async function inicio(){try{sessao=await consultarSessao();await abrir()}catch{$('#login').hidden=false}}
async function abrir(){$('#login').hidden=true;$('#sistema').hidden=false;$('#nomeUsuario').textContent=sessao.nome;$('#perfilUsuario').textContent={admin:'Administrador',cliente:'Cliente',fornecedor:'Fornecedor'}[sessao.perfil];$$('[data-role]').forEach(x=>x.hidden=x.dataset.role!==sessao.perfil);await atualizar();pagina(sessao.perfil==='cliente'?'novo':sessao.perfil==='admin'?'usuarios':'inicio')}
async function atualizar(){try{dados=await carregarDados();render()}catch(x){toast(x.message)}}
function classeStatus(status){
  const valor=String(status??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  if(valor==='pendente')return 'status-pendente';
  if(valor==='em manutencao')return 'status-manutencao';
  if(valor==='pendente de retorno')return 'status-retorno';
  if(valor==='resolvido')return 'status-resolvido';
  if(valor==='cancelado')return 'status-cancelado';
  return 'status-outro';
}
function tabela(arr,historico=false){if(!arr.length)return'<p>Nenhum registro encontrado.</p>';const op=['admin','fornecedor'].includes(sessao.perfil);return `<div class="table"><table><thead><tr><th>Protocolo</th><th>Cliente/local</th><th>Fornecedor</th><th>Status</th><th>Problema</th><th>Observação</th><th>Ações</th></tr></thead><tbody>${arr.map(x=>{const r=x.retornos?.at(-1);let a=`<button class="btn secondary small" onclick="detalhes('${x.id}')">Detalhes</button>`;if(op&&!historico)a=`<button class="btn primary small" onclick="abrirRetorno('${x.id}')">Atualizar</button>${x.status==='Pendente'?`<button class="btn secondary small" onclick="iniciarAtendimento('${x.id}')">Iniciar</button>`:''}<button class="btn danger small" onclick="excluir('${x.id}')">Excluir</button>`;return `<tr><td><b>${esc(x.protocolo)}</b><br>${data(x.criado)}</td><td>${esc(x.cliente)}<br>Bloco ${esc(x.bloco)} · Apto ${esc(x.apto)}</td><td>${esc(x.fornecedorNome)}</td><td><span class="badge ${classeStatus(x.status)}">${esc(x.status)}</span></td><td>${esc(x.problema)}</td><td>${esc(r?.observacao||'Aguardando retorno')}</td><td><div class="actions">${a}</div></td></tr>`}).join('')}</tbody></table></div>`}
function filtrados(){const q=$('#busca').value.toLowerCase(),s=$('#status').value;return dados.filter(x=>(!q||[x.protocolo,x.cliente,x.bloco,x.apto,x.problema].some(v=>String(v||'').toLowerCase().includes(q)))&&(!s||x.status===s))}
function render(){$('#total').textContent=dados.length;$('#pendentes').textContent=dados.filter(x=>x.status==='Pendente').length;$('#manutencao').textContent=dados.filter(x=>x.status==='Em manutenção').length;$('#resolvidos').textContent=dados.filter(x=>x.status==='Resolvido').length;$('#lista').innerHTML=tabela(filtrados());$('#hist').innerHTML=tabela(dados.filter(x=>x.status==='Resolvido'),true)}
$('#busca').oninput=$('#status').onchange=()=>$('#lista').innerHTML=tabela(filtrados());
$('#solicitacaoForm').onsubmit=async e=>{e.preventDefault();try{await salvarSolicitacao({protocolo:`${new Date().getFullYear()}-${Date.now().toString().slice(-9)}`,bloco:$('#bloco').value.trim(),apto:$('#apto').value.trim(),prioridade:$('#prioridade').value,problema:$('#problema').value.trim()});e.target.reset();await atualizar();pagina('solicitacoes');toast('Solicitação cadastrada.')}catch(x){toast(x.message)}};
window.iniciarAtendimento=async id=>{try{await iniciarSolicitacao(id);await atualizar();toast('Atendimento iniciado.')}catch(x){toast(x.message)}};
window.excluir=async id=>{if(!confirm('Deseja excluir definitivamente esta solicitação?'))return;try{await excluirSolicitacao(id);await atualizar();toast('Solicitação excluída.')}catch(x){toast(x.message)}};
window.detalhes=id=>{const x=dados.find(d=>d.id===id),r=x.retornos?.at(-1);alert(`${x.protocolo}\nStatus: ${x.status}\nProblema: ${x.problema}\nObservação: ${r?.observacao||'Aguardando retorno'}`)};
window.abrirRetorno=id=>{const x=dados.find(d=>d.id===id);$('#edit').value=id;$('#prestador').value=sessao.nome;$('#modal').classList.add('open')};
$('#fechar').onclick=()=>$('#modal').classList.remove('open');
$('#retornoForm').onsubmit=async e=>{e.preventDefault();const ok=$('#resolvido').value==='sim';try{await salvarRetorno($('#edit').value,{prestador:$('#prestador').value.trim(),resolvido:ok,motivo:ok?'':$('#motivo').value,observacao:$('#observacao').value.trim(),complemento:$('#complemento').value.trim()});e.target.reset();$('#modal').classList.remove('open');await atualizar();toast('Retorno salvo.')}catch(x){toast(x.message)}};
async function carregarUsuarios(){if(sessao.perfil!=='admin')return;try{const u=await listarUsuarios();$('#listaUsuarios').innerHTML=`<div class="table"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead><tbody>${u.map(x=>`<tr><td>${esc(x.nome)}</td><td>${esc(x.email)}</td><td>${esc(x.perfil)}</td><td>${x.ativo?'Ativo':'Inativo'}</td><td><button class="btn secondary small" onclick="statusUsuario('${x.id}',${!x.ativo})">${x.ativo?'Desativar':'Ativar'}</button> <button class="btn primary small" onclick="novaSenha('${x.id}')">Nova senha</button></td></tr>`).join('')}</tbody></table></div>`}catch(x){toast(x.message)}}
$('#usuarioForm').onsubmit=async e=>{e.preventDefault();try{await criarUsuario({nome:$('#uNome').value.trim(),email:$('#uEmail').value.trim(),perfil:$('#uPerfil').value,senha:$('#uSenha').value});e.target.reset();await carregarUsuarios();toast('Usuário criado.')}catch(x){toast(x.message)}};
window.statusUsuario=async(id,ativo)=>{try{await alterarStatusUsuario(id,ativo);await carregarUsuarios()}catch(x){toast(x.message)}};
window.novaSenha=async id=>{const s=prompt('Nova senha com no mínimo 8 caracteres:');if(!s)return;try{await alterarSenhaUsuario(id,s);toast('Senha alterada.')}catch(x){toast(x.message)}};
inicio();setInterval(()=>{if(sessao)atualizar()},30000);
