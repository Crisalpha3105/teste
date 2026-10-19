'use strict';
const STORAGE_KEY='interfones_v3';
function carregarDados(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]}catch{return[]}}
function salvarDados(dados){localStorage.setItem(STORAGE_KEY,JSON.stringify(dados))}
