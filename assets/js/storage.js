'use strict';
async function lerResposta(resposta) {
  let corpo = {};
  try { corpo = await resposta.json(); } catch {}
  if (!resposta.ok) throw new Error(corpo.erro || `Erro HTTP ${resposta.status}`);
  return corpo;
}
const api = (url, opcoes = {}) => lerResposta(fetch(url, { credentials: 'same-origin', ...opcoes }));
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function entrar(email, senha) { return api('/api/auth/login', json('POST', { email, senha })); }
function consultarSessao() { return api('/api/auth/sessao'); }
function sair() { return api('/api/auth/logout', { method: 'POST' }); }
function carregarDados() { return api('/api/solicitacoes', { cache: 'no-store' }); }
function salvarSolicitacao(dados) { return api('/api/solicitacoes', json('POST', dados)); }
function iniciarSolicitacao(id) { return api(`/api/solicitacoes/${encodeURIComponent(id)}/iniciar`, { method: 'PATCH' }); }
function salvarRetorno(id, retorno) { return api(`/api/solicitacoes/${encodeURIComponent(id)}/retornos`, json('POST', retorno)); }
function excluirSolicitacao(id) { return api(`/api/solicitacoes/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
function listarUsuarios() { return api('/api/usuarios', { cache: 'no-store' }); }
function criarUsuario(usuario) { return api('/api/usuarios', json('POST', usuario)); }
function alterarStatusUsuario(id, ativo) { return api(`/api/usuarios/${encodeURIComponent(id)}/status`, json('PATCH', { ativo })); }
function alterarSenhaUsuario(id, senha) { return api(`/api/usuarios/${encodeURIComponent(id)}/senha`, json('PATCH', { senha })); }
