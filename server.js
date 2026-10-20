import express from 'express';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const COOKIE = 'royal_session';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
const sql = neon(process.env.DATABASE_URL);

app.use(express.json({ limit: '1mb' }));
app.use(express.static('.', { etag: false, lastModified: false, setHeaders: res => res.setHeader('Cache-Control', 'no-store') }));

const campo = valor => typeof valor === 'string' ? valor.trim() : '';
const emailValido = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const novoId = () => crypto.randomUUID();
const novoToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
function lerCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(item => {
    const pos = item.indexOf('=');
    return [item.slice(0, pos).trim(), decodeURIComponent(item.slice(pos + 1))];
  }));
}
function gravarCookie(res, token, maxAge = 604800) {
  const seguro = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${seguro}`);
}

async function prepararBanco() {
  await sql`CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY, nome VARCHAR(150) NOT NULL, email VARCHAR(200) UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL, perfil VARCHAR(20) NOT NULL CHECK (perfil IN ('admin','cliente','fornecedor')),
    ativo BOOLEAN NOT NULL DEFAULT TRUE, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS sessoes (
    token_hash TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_em TIMESTAMPTZ NOT NULL, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS solicitacoes (
    id TEXT PRIMARY KEY, protocolo VARCHAR(40) UNIQUE NOT NULL,
    cliente_id VARCHAR(100) NOT NULL, cliente VARCHAR(150) NOT NULL,
    fornecedor_id VARCHAR(100) NOT NULL, fornecedor_nome VARCHAR(150) NOT NULL,
    bloco VARCHAR(50) NOT NULL, apartamento VARCHAR(30) NOT NULL,
    prioridade VARCHAR(30) NOT NULL, problema TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pendente', criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS retornos (
    id BIGSERIAL PRIMARY KEY, solicitacao_id TEXT NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
    prestador VARCHAR(150) NOT NULL, resolvido BOOLEAN NOT NULL DEFAULT FALSE,
    motivo TEXT, observacao TEXT NOT NULL, complemento TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`DELETE FROM sessoes WHERE expira_em <= NOW()`;

  const administradores = await sql`SELECT id FROM usuarios WHERE perfil='admin' LIMIT 1`;
  if (!administradores.length) {
    const nome = campo(process.env.ADMIN_NAME) || 'Administrador Royal Garden';
    const email = campo(process.env.ADMIN_EMAIL).toLowerCase();
    const senha = campo(process.env.ADMIN_PASSWORD);
    if (!emailValido(email) || senha.length < 8) {
      throw new Error('Configure ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 8 caracteres) no Render.');
    }
    const senhaHash = await bcrypt.hash(senha, 12);
    await sql`INSERT INTO usuarios (id,nome,email,senha_hash,perfil) VALUES (${novoId()},${nome},${email},${senhaHash},'admin')`;
    console.log('Administrador inicial criado.');
  }
  console.log('Estrutura do banco verificada.');
}

async function autenticar(req, res, next) {
  try {
    const token = lerCookies(req)[COOKIE];
    if (!token) return res.status(401).json({ erro: 'Faça login para continuar.' });
    const usuarios = await sql`SELECT u.id,u.nome,u.email,u.perfil,u.ativo FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token_hash=${hashToken(token)} AND s.expira_em>NOW()`;
    if (!usuarios.length || !usuarios[0].ativo) {
      gravarCookie(res, '', 0);
      return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    }
    req.usuario = usuarios[0];
    next();
  } catch (erro) {
    console.error('Falha na sessão:', erro);
    res.status(500).json({ erro: 'Falha ao validar a sessão.' });
  }
}
const permitir = (...perfis) => (req, res, next) => perfis.includes(req.usuario.perfil) ? next() : res.status(403).json({ erro: 'Acesso não autorizado.' });

app.get('/api/saude', async (_req, res) => {
  try { const r = await sql`SELECT NOW() AS agora`; res.json({ sucesso: true, banco: 'conectado', agora: r[0].agora }); }
  catch { res.status(500).json({ sucesso: false, banco: 'desconectado' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = campo(req.body?.email).toLowerCase();
    const senha = campo(req.body?.senha);
    const resultado = await sql`SELECT id,nome,email,perfil,ativo,senha_hash FROM usuarios WHERE email=${email} LIMIT 1`;
    if (!resultado.length || !resultado[0].ativo || !(await bcrypt.compare(senha, resultado[0].senha_hash))) {
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }
    const token = novoToken();
    await sql`INSERT INTO sessoes (token_hash,usuario_id,expira_em) VALUES (${hashToken(token)},${resultado[0].id},NOW()+INTERVAL '7 days')`;
    gravarCookie(res, token);
    const { senha_hash, ...usuario } = resultado[0];
    res.json(usuario);
  } catch (erro) { console.error(erro); res.status(500).json({ erro: 'Não foi possível entrar.' }); }
});
app.get('/api/auth/sessao', autenticar, (req, res) => res.json(req.usuario));
app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = lerCookies(req)[COOKIE];
    if (token) await sql`DELETE FROM sessoes WHERE token_hash=${hashToken(token)}`;
    gravarCookie(res, '', 0);
    res.json({ sucesso: true });
  } catch { gravarCookie(res, '', 0); res.json({ sucesso: true }); }
});

app.get('/api/usuarios', autenticar, permitir('admin'), async (_req, res) => {
  res.json(await sql`SELECT id,nome,email,perfil,ativo,criado_em FROM usuarios ORDER BY nome`);
});
app.post('/api/usuarios', autenticar, permitir('admin'), async (req, res) => {
  try {
    const nome = campo(req.body?.nome), email = campo(req.body?.email).toLowerCase();
    const senha = campo(req.body?.senha), perfil = campo(req.body?.perfil);
    if (!nome || !emailValido(email) || senha.length < 8 || !['admin','cliente','fornecedor'].includes(perfil)) {
      return res.status(400).json({ erro: 'Informe nome, e-mail válido, perfil e senha de pelo menos 8 caracteres.' });
    }
    const senhaHash = await bcrypt.hash(senha, 12);
    const r = await sql`INSERT INTO usuarios (id,nome,email,senha_hash,perfil) VALUES (${novoId()},${nome},${email},${senhaHash},${perfil}) RETURNING id,nome,email,perfil,ativo,criado_em`;
    res.status(201).json(r[0]);
  } catch (erro) { res.status(erro.code === '23505' ? 409 : 500).json({ erro: erro.code === '23505' ? 'Este e-mail já está cadastrado.' : 'Não foi possível criar o usuário.' }); }
});
app.patch('/api/usuarios/:id/status', autenticar, permitir('admin'), async (req, res) => {
  if (req.params.id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode desativar o próprio acesso.' });
  const r = await sql`UPDATE usuarios SET ativo=${Boolean(req.body?.ativo)} WHERE id=${req.params.id} RETURNING id,ativo`;
  if (!r.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if (!r[0].ativo) await sql`DELETE FROM sessoes WHERE usuario_id=${req.params.id}`;
  res.json(r[0]);
});
app.patch('/api/usuarios/:id/senha', autenticar, permitir('admin'), async (req, res) => {
  const senha = campo(req.body?.senha);
  if (senha.length < 8) return res.status(400).json({ erro: 'A senha deve ter pelo menos 8 caracteres.' });
  const senhaHash = await bcrypt.hash(senha, 12);
  const r = await sql`UPDATE usuarios SET senha_hash=${senhaHash} WHERE id=${req.params.id} RETURNING id`;
  if (!r.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  await sql`DELETE FROM sessoes WHERE usuario_id=${req.params.id}`;
  res.json({ sucesso: true });
});

app.get('/api/solicitacoes', autenticar, async (req, res) => {
  try {
    const linhas = req.usuario.perfil === 'cliente'
      ? await sql`SELECT * FROM solicitacoes WHERE cliente_id=${req.usuario.id} ORDER BY criado_em DESC`
      : await sql`SELECT * FROM solicitacoes ORDER BY criado_em DESC`;
    const ids = linhas.map(x => x.id);
    const retornos = ids.length ? await sql`SELECT * FROM retornos WHERE solicitacao_id=ANY(${ids}) ORDER BY criado_em` : [];
    const mapa = {};
    retornos.forEach(r => (mapa[r.solicitacao_id] ??= []).push({ prestador:r.prestador, resolvido:r.resolvido, motivo:r.motivo, observacao:r.observacao, complemento:r.complemento, data:r.criado_em }));
    res.json(linhas.map(x => ({ id:x.id, protocolo:x.protocolo, clienteId:x.cliente_id, cliente:x.cliente, fornecedorId:x.fornecedor_id, fornecedorNome:x.fornecedor_nome, bloco:x.bloco, apto:x.apartamento, prioridade:x.prioridade, problema:x.problema, status:x.status, criado:x.criado_em, retornos:mapa[x.id] || [] })));
  } catch (erro) { console.error(erro); res.status(500).json({ erro: 'Não foi possível carregar as solicitações.' }); }
});
app.post('/api/solicitacoes', autenticar, permitir('cliente'), async (req, res) => {
  try {
    const r = req.body || {};
    if (!campo(r.protocolo) || !campo(r.bloco) || !campo(r.apto) || !campo(r.problema)) return res.status(400).json({ erro: 'Preencha os campos obrigatórios.' });
    const fornecedores = await sql`SELECT id,nome FROM usuarios WHERE perfil='fornecedor' AND ativo=TRUE ORDER BY criado_em LIMIT 1`;
    if (!fornecedores.length) return res.status(409).json({ erro: 'Nenhum fornecedor ativo foi cadastrado.' });
    const id = novoId();
    await sql`INSERT INTO solicitacoes (id,protocolo,cliente_id,cliente,fornecedor_id,fornecedor_nome,bloco,apartamento,prioridade,problema,status) VALUES (${id},${r.protocolo},${req.usuario.id},${req.usuario.nome},${fornecedores[0].id},${fornecedores[0].nome},${r.bloco},${r.apto},${r.prioridade || 'Normal'},${r.problema},'Pendente')`;
    res.status(201).json({ id, protocolo: r.protocolo });
  } catch (erro) { res.status(erro.code === '23505' ? 409 : 500).json({ erro: erro.code === '23505' ? 'Protocolo duplicado.' : 'Não foi possível cadastrar a solicitação.' }); }
});
app.patch('/api/solicitacoes/:id/iniciar', autenticar, permitir('fornecedor','admin'), async (req, res) => {
  const r = await sql`UPDATE solicitacoes SET status='Em manutenção' WHERE id=${req.params.id} RETURNING id,status`;
  if (!r.length) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
  res.json(r[0]);
});
app.post('/api/solicitacoes/:id/retornos', autenticar, permitir('fornecedor','admin'), async (req, res) => {
  try {
    const r = req.body || {};
    if (!campo(r.prestador) || !campo(r.observacao) || typeof r.resolvido !== 'boolean') return res.status(400).json({ erro: 'Preencha os dados obrigatórios.' });
    const existe = await sql`SELECT id FROM solicitacoes WHERE id=${req.params.id}`;
    if (!existe.length) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
    await sql`INSERT INTO retornos (solicitacao_id,prestador,resolvido,motivo,observacao,complemento) VALUES (${req.params.id},${r.prestador},${r.resolvido},${r.motivo || null},${r.observacao},${r.complemento || null})`;
    const status = r.resolvido ? 'Resolvido' : 'Pendente de retorno';
    await sql`UPDATE solicitacoes SET status=${status} WHERE id=${req.params.id}`;
    res.json({ sucesso: true, status });
  } catch (erro) { console.error(erro); res.status(500).json({ erro: 'Não foi possível salvar o retorno.' }); }
});
app.delete('/api/solicitacoes/:id', autenticar, permitir('fornecedor','admin'), async (req, res) => {
  const r = await sql`DELETE FROM solicitacoes WHERE id=${req.params.id} RETURNING id,protocolo`;
  if (!r.length) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
  res.json({ sucesso: true, ...r[0] });
});

app.use((_req, res) => res.sendFile('index.html', { root: process.cwd() }));
prepararBanco().then(() => app.listen(PORT, '0.0.0.0', () => console.log(`Servidor iniciado na porta ${PORT}.`))).catch(erro => { console.error('Falha ao preparar banco:', erro); process.exit(1); });
