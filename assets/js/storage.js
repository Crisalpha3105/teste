'use strict';
async function resposta(r){let c={};try{c=await r.json()}catch{}if(!r.ok)throw new Error(c.erro||`Erro HTTP ${r.status}`);return c}
const api=(u,o={})=>resposta(fetch(u,{credentials:'same-origin',...o}));
const json=(m,b)=>({method:m,headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
const entrar=(email,senha)=>api('/api/auth/login',json('POST',{email,senha}));
const consultarSessao=()=>api('/api/auth/sessao');
const sair=()=>api('/api/auth/logout',{method:'POST'});
const carregarDados=()=>api('/api/solicitacoes',{cache:'no-store'});
const salvarSolicitacao=x=>api('/api/solicitacoes',json('POST',x));
const iniciarSolicitacao=id=>api(`/api/solicitacoes/${encodeURIComponent(id)}/iniciar`,{method:'PATCH'});
const salvarRetorno=(id,x)=>api(`/api/solicitacoes/${encodeURIComponent(id)}/retornos`,json('POST',x));
const excluirSolicitacao=id=>api(`/api/solicitacoes/${encodeURIComponent(id)}`,{method:'DELETE'});
const listarUsuarios=()=>api('/api/usuarios',{cache:'no-store'});
const criarUsuario=x=>api('/api/usuarios',json('POST',x));
const alterarStatusUsuario=(id,ativo)=>api(`/api/usuarios/${id}/status`,json('PATCH',{ativo}));
const alterarSenhaUsuario=(id,senha)=>api(`/api/usuarios/${id}/senha`,json('PATCH',{senha}));
