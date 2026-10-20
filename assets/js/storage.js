'use strict';
const STORAGE_KEY='interfones_v4',SESSION_KEY='interfones_sessao_v1';
const PERFIS={cliente:{id:'cliente-demo',nome:'Cliente Condomínio',perfil:'cliente'},fornecedor:{id:'fornecedor-principal',nome:'Fornecedor Principal',perfil:'fornecedor'}};
function carregarDados(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]}catch{return[]}}
function salvarDados(d){localStorage.setItem(STORAGE_KEY,JSON.stringify(d))}
function carregarSessao(){try{return JSON.parse(localStorage.getItem(SESSION_KEY))||PERFIS.cliente}catch{return PERFIS.cliente}}
function salvarSessao(p){const s=PERFIS[p]||PERFIS.cliente;localStorage.setItem(SESSION_KEY,JSON.stringify(s));return s}
