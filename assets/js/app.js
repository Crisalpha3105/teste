console.info('RG-VERSAO-20261021-1327-DATAHORA-V4');
'use strict';
let sessao=null,dados=[];
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data=v=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));
const dataHora=v=>{if(!v)return 'Data n\u00e3o informada';const d=new Date(v);if(Number.isNaN(d.getTime()))return 'Data n\u00e3o informada';return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d).replace(',', ' \u00e0s');};
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
function tabela(arr,historico=false){if(!arr.length)return'<p>Nenhum registro encontrado.</p>';const op=['admin','fornecedor'].includes(sessao.perfil);return `<div class="table"><table><thead><tr><th>Protocolo</th><th>Cliente/local</th><th>Fornecedor</th><th>Status</th><th>Problema</th><th>Observa&#231;&#227;o</th><th>A&#231;&#245;es</th></tr></thead><tbody>${arr.map(x=>{const r=x.retornos?.at(-1);let a=`<button class="btn secondary small" onclick="detalhes('${x.id}')">Detalhes</button>`;if(op&&!historico)a=`<button class="btn secondary small" onclick="detalhes('${x.id}')">Detalhes</button><button class="btn primary small" onclick="abrirRetorno('${x.id}')">Atualizar</button>${x.status==='Pendente'?`<button class="btn secondary small" onclick="iniciarAtendimento('${x.id}')">Iniciar</button>`:''}<button class="btn danger small" onclick="excluir('${x.id}')">Excluir</button>`;return `<tr><td><b>${esc(x.protocolo)}</b><br>${data(x.criado)}</td><td>${esc(x.cliente)}<br>Bloco ${esc(x.bloco)} \u00b7 Apto ${esc(x.apto)}</td><td>${esc(x.fornecedorNome)}</td><td><span class="badge ${classeStatus(x.status)}">${esc(x.status)}</span></td><td>${esc(x.problema)}</td><td>${esc(r?.observacao||'Aguardando retorno')}</td><td><div class="actions">${a}</div></td></tr>`}).join('')}</tbody></table></div>`}
function textoBusca(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function filtrados(){const q=textoBusca($('#busca').value),s=$('#status').value;return dados.filter(x=>(!q||[x.protocolo,x.cliente,x.bloco,x.apto,x.problema,x.fornecedorNome,x.status,...(x.retornos||[]).map(r=>r.observacao)].some(v=>textoBusca(v).includes(q)))&&(!s||x.status===s))}
function agrupar(lista,chave){const mapa=new Map();lista.forEach(x=>{const k=chave(x);if(!k)return;const atual=mapa.get(k)||{rotulo:k,total:0,pendentes:0,resolvidos:0};atual.total++;x.status==='Resolvido'?atual.resolvidos++:atual.pendentes++;mapa.set(k,atual)});return [...mapa.values()].sort((a,b)=>b.total-a.total||a.rotulo.localeCompare(b.rotulo,'pt-BR'))}
function listaRanking(itens,tipo){if(!itens.length)return '<div class="empty-state">Ainda n\u00e3o h\u00e1 dados suficientes.</div>';const max=Math.max(...itens.map(x=>x.total));return itens.slice(0,8).map((x,i)=>`<article class="rank-item"><span class="rank-position ${i<3?'top':''}">${i+1}\u00ba</span><div class="rank-content"><div class="rank-title"><b>${esc(x.rotulo)}</b><strong>${x.total}</strong></div><div class="rank-track"><span style="width:${x.total/max*100}%"></span></div><small>${tipo==='apt'?`${x.pendentes} pendentes \u00b7 ${x.resolvidos} resolvidos`:`${Math.round(x.total*100/Math.max(1,dados.length))}% do total`}</small></div></article>`).join('')}
function renderRankings(){const apt=agrupar(dados,x=>`${x.cliente||'Cliente n\u00e3o informado'} \u00b7 Bloco ${x.bloco||'-'} \u00b7 Apto ${x.apto||'-'}`);const prob=agrupar(dados,x=>String(x.problema||'').trim().replace(/\s+/g,' '));$('#rankingApartamentos').innerHTML=listaRanking(apt,'apt');$('#rankingProblemas').innerHTML=listaRanking(prob,'problema')}
function csvCelula(v){return `"${String(v??'').replace(/"/g,'""')}"`}
function baixarCSV(nome,linhas){const blob=new Blob(['\ufeff'+linhas.map(l=>l.map(csvCelula).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nome;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
window.exportarCSV=()=>{const lista=filtrados(),cab=['Protocolo','Cliente','Bloco','Apartamento','Fornecedor','Status','Problema','Observa\u00e7\u00e3o','Data de abertura'];baixarCSV(`atendimentos_${new Date().toISOString().slice(0,10)}.csv`,[cab,...lista.map(x=>{const r=x.retornos?.at(-1);return[x.protocolo,x.cliente,x.bloco,x.apto,x.fornecedorNome,x.status,x.problema,r?.observacao||'',new Date(x.criado).toLocaleString('pt-BR')]})]);toast(`${lista.length} registros exportados`)};
window.exportarRankings=()=>{const apt=agrupar(dados,x=>`${x.cliente||'Cliente n\u00e3o informado'} \u00b7 Bloco ${x.bloco||'-'} \u00b7 Apto ${x.apto||'-'}`),prob=agrupar(dados,x=>String(x.problema||'').trim().replace(/\s+/g,' '));baixarCSV(`rankings_${new Date().toISOString().slice(0,10)}.csv`,[['RANKING DE APARTAMENTOS'],['Posi\u00e7\u00e3o','Apartamento','Ocorr\u00eancias','Pendentes','Resolvidos'],...apt.map((x,i)=>[i+1,x.rotulo,x.total,x.pendentes,x.resolvidos]),[],['PRINCIPAIS PROBLEMAS'],['Posi\u00e7\u00e3o','Problema','Ocorr\u00eancias'],...prob.map((x,i)=>[i+1,x.rotulo,x.total])])};
window.imprimirRelatorio=()=>window.print();
function dataMovimento(x){
  const retornos=Array.isArray(x.retornos)?x.retornos:[];
  const ultimo=retornos.at(-1)||{};
  const valor=ultimo.criado||ultimo.data||ultimo.dataHora||ultimo.updatedAt||x.atualizado||x.updatedAt||x.criado||x.createdAt;
  const d=new Date(valor);return Number.isNaN(d.getTime())?new Date():d
}
function diasSemMovimento(x){return Math.max(0,Math.floor((Date.now()-dataMovimento(x).getTime())/86400000))}
function faixaSla(dias){return dias>=15?'critico':dias>=8?'atencao':'prazo'}
function renderGerencial(){
  const abertos=dados.filter(x=>x.status!=='Resolvido'&&x.status!=='Cancelado').map(x=>({...x,diasParado:diasSemMovimento(x)}));
  const status=['Pendente','Em manuten\u00e7\u00e3o','Pendente de retorno','Resolvido'];
  const cores=['#d97706','#2563eb','#ea580c','#16a34a'];
  const totais=status.map(s=>dados.filter(x=>x.status===s).length),max=Math.max(1,...totais);
  $('#graficoStatus').innerHTML=status.map((s,i)=>`<div class="chart-row"><span>${esc(s)}</span><div class="chart-track"><i style="width:${totais[i]/max*100}%;background:${cores[i]}"></i></div><b>${totais[i]}</b></div>`).join('');
  const grupos=[['prazo','Dentro do prazo','0 a 7 dias'],['atencao','Aten\u00e7\u00e3o','8 a 14 dias'],['critico','Cr\u00edtico','15 dias ou mais']];
  $('#farol').innerHTML=grupos.map(([c,t,p])=>{const n=abertos.filter(x=>faixaSla(x.diasParado)===c).length;return `<article class="traffic-item ${c}"><span class="traffic-dot"></span><div><b>${t}</b><small>${p} sem informa\u00e7\u00e3o</small></div><strong>${n}</strong></article>`}).join('');
  const atencao=abertos.filter(x=>x.diasParado>=8).sort((a,b)=>b.diasParado-a.diasParado);
  $('#totalAtencao').textContent=`${atencao.length} ${atencao.length===1?'pend\u00eancia':'pend\u00eancias'}`;
  $('#listaAtencao').innerHTML=atencao.length?`<div class="attention-list">${atencao.map(x=>`<article class="attention-item ${faixaSla(x.diasParado)}"><div><b>Bloco ${esc(x.bloco)} \u00b7 Apto ${esc(x.apto)}</b><span>${esc(x.protocolo)} \u00b7 ${esc(x.status)}</span><small>${esc(x.problema)}</small></div><div class="days"><strong>${x.diasParado}</strong><span>dias sem atualiza\u00e7\u00e3o</span>${['admin','fornecedor'].includes(sessao.perfil)?`<button class="btn primary small" onclick="abrirRetorno('${x.id}')">Atualizar</button>`:''}</div></article>`).join('')}</div>`:'<div class="empty-state">Nenhum atendimento exige aten\u00e7\u00e3o no momento.</div>';
  $('#ultimaAtualizacao').textContent=`Atualizado em ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date())}`;
  renderReincidentes()
}
function chaveApartamento(x){return `${String(x.bloco||'').trim().toLowerCase()}|${String(x.apto||'').trim().toLowerCase()}`}
function renderReincidentes(){
  const mapa=new Map();
  dados.forEach(x=>{const chave=chaveApartamento(x);if(chave==='|')return;const lista=mapa.get(chave)||[];lista.push(x);mapa.set(chave,lista)});
  const agora=Date.now(),janela=90*86400000;
  const grupos=[...mapa.values()].filter(lista=>lista.length>=2).map(lista=>{
    lista.sort((a,b)=>new Date(b.criado||b.createdAt)-new Date(a.criado||a.createdAt));
    const recentes=lista.filter(x=>agora-new Date(x.criado||x.createdAt).getTime()<=janela).length;
    return {lista,recentes,ultima:new Date(lista[0].criado||lista[0].createdAt).getTime()}
  }).sort((a,b)=>b.recentes-a.recentes||b.lista.length-a.lista.length||b.ultima-a.ultima);
  $('#totalReincidentes').textContent=`${grupos.length} ${grupos.length===1?'apartamento':'apartamentos'}`;
  $('#listaReincidentes').innerHTML=grupos.length?`<div class="recurrence-list">${grupos.map(g=>{
    const atual=g.lista[0],anteriores=g.lista.slice(1),mesmoMotivo=anteriores.some(x=>textoBusca(x.problema)===textoBusca(atual.problema));
    const alerta=g.recentes>=2?'recente':'historico';
    return `<details class="recurrence-item ${alerta}"><summary><div><b>Bloco ${esc(atual.bloco)} · Apto ${esc(atual.apto)}</b><span>${g.lista.length} ocorrências no histórico · ${g.recentes} nos últimos 90 dias</span></div><span class="recurrence-badge">${mesmoMotivo?'Possível repetição do problema':'Motivos diferentes'}</span></summary><div class="recurrence-detail"><h4>Ocorrência mais recente</h4><p><b>${esc(atual.protocolo)}</b> · ${data(atual.criado||atual.createdAt)} · <span class="badge ${classeStatus(atual.status)}">${esc(atual.status)}</span></p><p><b>Motivo:</b> ${esc(atual.problema)}</p><h4>Ocorrências anteriores</h4>${anteriores.map(x=>`<article><b>${esc(x.protocolo)}</b> · ${data(x.criado||x.createdAt)} · ${esc(x.status)}<br><span>${esc(x.problema)}</span></article>`).join('')}<div class="recurrence-question"><b>Verificação sugerida</b><span>${mesmoMotivo?'Comparar o serviço anterior, peça utilizada, prestador e prazo de garantia antes de encerrar a nova ocorrência.':'Confirmar se os problemas têm a mesma causa técnica, como cabeamento, fonte, aparelho ou instalação da unidade.'}</span></div><button class="btn secondary small" onclick="detalhes('${atual.id}')">Ver ocorrência atual</button></div></details>`
  }).join('')}</div>`:'<div class="empty-state">Ainda não há apartamentos com duas ou mais ocorrências.</div>'
}
function render(){$('#total').textContent=dados.length;$('#pendentes').textContent=dados.filter(x=>x.status==='Pendente').length;$('#manutencao').textContent=dados.filter(x=>x.status==='Em manuten\u00e7\u00e3o').length;$('#resolvidos').textContent=dados.filter(x=>x.status==='Resolvido').length;$('#lista').innerHTML=tabela(filtrados());$('#hist').innerHTML=tabela(dados.filter(x=>x.status==='Resolvido'),true);renderGerencial()}
$('#busca').oninput=$('#status').onchange=()=>$('#lista').innerHTML=tabela(filtrados());
$('#solicitacaoForm').onsubmit=async e=>{e.preventDefault();try{await salvarSolicitacao({protocolo:`${new Date().getFullYear()}-${Date.now().toString().slice(-9)}`,bloco:$('#bloco').value.trim(),apto:$('#apto').value.trim(),prioridade:$('#prioridade').value,problema:$('#problema').value.trim()});e.target.reset();await atualizar();pagina('solicitacoes');toast('Solicita\u00e7\u00e3o cadastrada.')}catch(x){toast(x.message)}};
window.iniciarAtendimento=async id=>{try{await iniciarSolicitacao(id);await atualizar();toast('Atendimento iniciado.')}catch(x){toast(x.message)}};
window.excluir=async id=>{if(!confirm('Deseja excluir definitivamente esta solicita\u00e7\u00e3o?'))return;try{await excluirSolicitacao(id);await atualizar();toast('Solicita\u00e7\u00e3o exclu\u00edda.')}catch(x){toast(x.message)}};
function obterDataResolucao(x){
  if(x.status!=='Resolvido')return null;
  const retornos=[...(x.retornos||[])].reverse();
  const r=retornos.find(v=>v.resolvido===true||v.status==='Resolvido')||retornos[0];
  return x.dataResolucao||x.data_resolucao||x.resolvidoEm||x.resolvido_em||r?.dataResolucao||r?.data_resolucao||r?.resolvidoEm||r?.resolvido_em||r?.criado||r?.createdAt||r?.created_at||r?.data||x.atualizado||x.updatedAt||x.updated_at||null;
}
function formatarDataHora(v){
  if(!v)return 'Data nao informada';
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return 'Data nao informada';
  const partes=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
  const get=t=>partes.find(p=>p.type===t)?.value||'';
  return `${get('day')}/${get('month')}/${get('year')} as ${get('hour')}:${get('minute')}`;
}
window.detalhes=id=>{
  const x=dados.find(d=>d.id===id);
  if(!x)return toast('Atendimento nao encontrado.');
  const r=x.retornos?.at(-1),resolucao=obterDataResolucao(x);
  const nl=String.fromCharCode(10), cedilha=String.fromCharCode(231), atil=String.fromCharCode(227), ao=String.fromCharCode(245);
  const observacao=`Observa${cedilha}${atil}o`;
  const resolucaoTexto=`resolu${cedilha}${atil}o`;
  const asTexto=`${String.fromCharCode(224)}s`;
  const abertura=formatarDataHora(x.criado).replace(' as ',` ${asTexto} `);
  const fim=resolucao?formatarDataHora(resolucao).replace(' as ',` ${asTexto} `):'Atendimento ainda nao resolvido';
  alert(`${x.protocolo}${nl}Status: ${x.status}${nl}Problema: ${x.problema}${nl}${observacao}: ${r?.observacao||'Aguardando retorno'}${nl}Data e hora da abertura: ${abertura}${nl}Data e hora da ${resolucaoTexto}: ${fim}`);
};
window.abrirRetorno=id=>{const x=dados.find(d=>d.id===id);$('#edit').value=id;$('#prestador').value=sessao.nome;$('#modal').classList.add('open')};
$('#fechar').onclick=()=>$('#modal').classList.remove('open');
$('#retornoForm').onsubmit=async e=>{e.preventDefault();const ok=$('#resolvido').value==='sim';try{await salvarRetorno($('#edit').value,{prestador:$('#prestador').value.trim(),resolvido:ok,motivo:ok?'':$('#motivo').value,observacao:$('#observacao').value.trim(),complemento:$('#complemento').value.trim()});e.target.reset();$('#modal').classList.remove('open');await atualizar();toast('Retorno salvo.')}catch(x){toast(x.message)}};
async function carregarUsuarios(){if(sessao.perfil!=='admin')return;try{const u=await listarUsuarios();$('#listaUsuarios').innerHTML=`<div class="table"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>A&#231;&#245;es</th></tr></thead><tbody>${u.map(x=>`<tr><td>${esc(x.nome)}</td><td>${esc(x.email)}</td><td>${esc(x.perfil)}</td><td>${x.ativo?'Ativo':'Inativo'}</td><td><button class="btn secondary small" onclick="statusUsuario('${x.id}',${!x.ativo})">${x.ativo?'Desativar':'Ativar'}</button> <button class="btn primary small" onclick="novaSenha('${x.id}')">Nova senha</button></td></tr>`).join('')}</tbody></table></div>`}catch(x){toast(x.message)}}
$('#usuarioForm').onsubmit=async e=>{e.preventDefault();try{await criarUsuario({nome:$('#uNome').value.trim(),email:$('#uEmail').value.trim(),perfil:$('#uPerfil').value,senha:$('#uSenha').value});e.target.reset();await carregarUsuarios();toast('Usu\u00e1rio criado.')}catch(x){toast(x.message)}};
window.statusUsuario=async(id,ativo)=>{try{await alterarStatusUsuario(id,ativo);await carregarUsuarios()}catch(x){toast(x.message)}};
window.novaSenha=async id=>{const s=prompt('Nova senha com no m\u00ednimo 8 caracteres:');if(!s)return;try{await alterarSenhaUsuario(id,s);toast('Senha alterada.')}catch(x){toast(x.message)}};
inicio();setInterval(()=>{if(sessao)atualizar()},30000);
