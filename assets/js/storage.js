'use strict';

const SESSION_KEY = 'interfones_sessao_v1';
const PERFIS = {
  cliente: { id: 'cliente-demo', nome: 'Cliente Condomínio', perfil: 'cliente' },
  fornecedor: { id: 'fornecedor-principal', nome: 'Fornecedor Principal', perfil: 'fornecedor' }
};

function carregarSessao() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || PERFIS.cliente;
  } catch {
    return PERFIS.cliente;
  }
}

function salvarSessao(perfil) {
  const sessao = PERFIS[perfil] || PERFIS.cliente;
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessao));
  return sessao;
}

async function lerResposta(resposta) {
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.erro || `Erro HTTP ${resposta.status}`);
  return corpo;
}

async function carregarDados(perfil, usuarioId) {
  const qs = new URLSearchParams({ perfil, usuarioId });
  return lerResposta(await fetch(`/api/solicitacoes?${qs}`, { cache: 'no-store' }));
}

async function salvarSolicitacao(solicitacao) {
  return lerResposta(await fetch('/api/solicitacoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(solicitacao)
  }));
}

async function iniciarSolicitacao(id) {
  return lerResposta(await fetch(`/api/solicitacoes/${encodeURIComponent(id)}/iniciar`, {
    method: 'PATCH'
  }));
}

async function salvarRetorno(id, retorno) {
  return lerResposta(await fetch(`/api/solicitacoes/${encodeURIComponent(id)}/retornos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(retorno)
  }));
}
