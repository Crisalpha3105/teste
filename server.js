import express from 'express';
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const app = express();
const PORT = process.env.PORT || 3000;
const COOKIE = 'royal_session';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
const sql = neon(process.env.DATABASE_URL);
const scrypt = promisify(crypto.scrypt);

app.use(express.json({ limit: '1mb' }));
app.use(express.static('.', { etag:false, lastModified:false, setHeaders:r => r.setHeader('Cache-Control','no-store') }));
const texto = v => typeof v === 'string' ? v.trim() : '';
const emailValido = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const tokenNovo = () => crypto.randomBytes(32).toString('hex');
const tokenHash = t => crypto.createHash('sha256').update(t).digest('hex');
async function criarHash(senha){const salt=crypto.randomBytes(16).toString('hex');const hash=await scrypt(senha,salt,64);return `${salt}:${hash.toString('hex')}`;}
async function validarHash(senha,armazenado){try{const [salt,hex]=armazenado.split(':');const atual=await scrypt(senha,salt,64);return crypto.timingSafeEqual(Buffer.from(hex,'hex'),atual);}catch{return false;}}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(x=>{const i=x.indexOf('=');return[x.slice(0,i).trim(),decodeURIComponent(x.slice(i+1))]}));}
function setCookie(res,token,idade=604800){res.setHeader('Set-Cookie',`${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${idade}${process.env.NODE_ENV==='production'?'; Secure':''}`);}

async function prepararBanco(){
  await sql`CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY, nome VARCHAR(150), email VARCHAR(200),
    senha_hash TEXT, perfil VARCHAR(20), ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nome VARCHAR(150)`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email VARCHAR(200)`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha_hash TEXT`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil VARCHAR(20)`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT NOW()`;
  await sql`UPDATE usuarios SET ativo=TRUE WHERE ativo IS NULL`;
  await sql`UPDATE usuarios SET criado_em=NOW() WHERE criado_em IS NULL`;
  await sql`CREATE SEQUENCE IF NOT EXISTS usuarios_id_seq`;
  await sql`ALTER SEQUENCE usuarios_id_seq OWNED BY usuarios.id`;
  await sql`ALTER TABLE usuarios ALTER COLUMN id SET DEFAULT nextval('usuarios_id_seq')`;
  await sql`SELECT setval('usuarios_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM usuarios),0)+1,1), false)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unico ON usuarios (LOWER(email)) WHERE email IS NOT NULL`;
  await sql`CREATE TABLE IF NOT EXISTS sessoes (
    token_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
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
    motivo TEXT, observacao TEXT NOT NULL, complemento TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`DELETE FROM sessoes WHERE expira_em<=NOW()`;
  const admin=await sql`SELECT id FROM usuarios WHERE perfil='admin' LIMIT 1`;
  if(!admin.length){
    const nome=texto(process.env.ADMIN_NAME)||'Administrador Royal Garden';
    const email=texto(process.env.ADMIN_EMAIL).toLowerCase();
    const senha=texto(process.env.ADMIN_PASSWORD);
    if(!emailValido(email)||senha.length<8)throw new Error('Configure ADMIN_EMAIL e ADMIN_PASSWORD com no mínimo 8 caracteres no Render.');
    await sql`INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES(${nome},${email},${await criarHash(senha)},'admin')`;
  }
  console.log('Banco preparado com sucesso.');
}
async function autenticar(req,res,next){try{const token=cookies(req)[COOKIE];if(!token)return res.status(401).json({erro:'Faça login para continuar.'});const r=await sql`SELECT u.id,u.nome,u.email,u.perfil,u.ativo FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token_hash=${tokenHash(token)} AND s.expira_em>NOW()`;if(!r.length||!r[0].ativo){setCookie(res,'',0);return res.status(401).json({erro:'Sessão inválida ou expirada.'});}req.usuario=r[0];next();}catch(e){console.error(e);res.status(500).json({erro:'Falha ao validar a sessão.'});}}
const permitir=(...p)=>(req,res,next)=>p.includes(req.usuario.perfil)?next():res.status(403).json({erro:'Acesso não autorizado.'});

app.get('/api/saude',async(_q,res)=>{try{await sql`SELECT 1`;res.json({sucesso:true});}catch{res.status(500).json({sucesso:false});}});
app.post('/api/auth/login',async(req,res)=>{try{const email=texto(req.body?.email).toLowerCase(),senha=texto(req.body?.senha);const r=await sql`SELECT id,nome,email,perfil,ativo,senha_hash FROM usuarios WHERE email=${email} LIMIT 1`;if(!r.length||!r[0].ativo||!(await validarHash(senha,r[0].senha_hash)))return res.status(401).json({erro:'E-mail ou senha inválidos.'});const token=tokenNovo();await sql`INSERT INTO sessoes(token_hash,usuario_id,expira_em) VALUES(${tokenHash(token)},${r[0].id},NOW()+INTERVAL '7 days')`;setCookie(res,token);const{senha_hash,...u}=r[0];res.json(u);}catch(e){console.error(e);res.status(500).json({erro:'Não foi possível entrar.'});}});
app.get('/api/auth/sessao',autenticar,(req,res)=>res.json(req.usuario));
app.post('/api/auth/logout',async(req,res)=>{const token=cookies(req)[COOKIE];if(token)await sql`DELETE FROM sessoes WHERE token_hash=${tokenHash(token)}`;setCookie(res,'',0);res.json({sucesso:true});});

app.get('/api/usuarios',autenticar,permitir('admin'),async(_q,res)=>res.json(await sql`SELECT id,nome,email,perfil,ativo,criado_em FROM usuarios ORDER BY nome`));
app.post('/api/usuarios',autenticar,permitir('admin'),async(req,res)=>{try{const nome=texto(req.body?.nome),email=texto(req.body?.email).toLowerCase(),senha=texto(req.body?.senha),perfil=texto(req.body?.perfil);if(!nome||!emailValido(email)||senha.length<8||!['admin','cliente','fornecedor'].includes(perfil))return res.status(400).json({erro:'Preencha os dados e use senha com no mínimo 8 caracteres.'});const r=await sql`INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES(${nome},${email},${await criarHash(senha)},${perfil}) RETURNING id,nome,email,perfil,ativo,criado_em`;res.status(201).json(r[0]);}catch(e){res.status(e.code==='23505'?409:500).json({erro:e.code==='23505'?'E-mail já cadastrado.':'Não foi possível criar o usuário.'});}});
app.patch('/api/usuarios/:id/status',autenticar,permitir('admin'),async(req,res)=>{if(String(req.usuario.id)===req.params.id)return res.status(400).json({erro:'Você não pode desativar o próprio acesso.'});const r=await sql`UPDATE usuarios SET ativo=${Boolean(req.body?.ativo)} WHERE id=${req.params.id} RETURNING id,ativo`;if(!r.length)return res.status(404).json({erro:'Usuário não encontrado.'});if(!r[0].ativo)await sql`DELETE FROM sessoes WHERE usuario_id=${req.params.id}`;res.json(r[0]);});
app.patch('/api/usuarios/:id/senha',autenticar,permitir('admin'),async(req,res)=>{const senha=texto(req.body?.senha);if(senha.length<8)return res.status(400).json({erro:'A senha deve ter no mínimo 8 caracteres.'});const r=await sql`UPDATE usuarios SET senha_hash=${await criarHash(senha)} WHERE id=${req.params.id} RETURNING id`;if(!r.length)return res.status(404).json({erro:'Usuário não encontrado.'});await sql`DELETE FROM sessoes WHERE usuario_id=${req.params.id}`;res.json({sucesso:true});});

app.get('/api/solicitacoes',autenticar,async(req,res)=>{try{const uid=String(req.usuario.id);const linhas=req.usuario.perfil==='cliente'?await sql`SELECT * FROM solicitacoes WHERE cliente_id=${uid} ORDER BY criado_em DESC`:await sql`SELECT * FROM solicitacoes ORDER BY criado_em DESC`;const ids=linhas.map(x=>x.id);const rets=ids.length?await sql`SELECT * FROM retornos WHERE solicitacao_id=ANY(${ids}) ORDER BY criado_em`:[];const mapa={};rets.forEach(r=>(mapa[r.solicitacao_id]??=[]).push({prestador:r.prestador,resolvido:r.resolvido,motivo:r.motivo,observacao:r.observacao,complemento:r.complemento,data:r.criado_em}));res.json(linhas.map(x=>({id:x.id,protocolo:x.protocolo,cliente:x.cliente,fornecedorNome:x.fornecedor_nome,bloco:x.bloco,apto:x.apartamento,prioridade:x.prioridade,problema:x.problema,status:x.status,criado:x.criado_em,retornos:mapa[x.id]||[]})));}catch(e){console.error(e);res.status(500).json({erro:'Não foi possível carregar as solicitações.'});}});
app.post('/api/solicitacoes',autenticar,permitir('cliente'),async(req,res)=>{try{const r=req.body||{};if(!texto(r.protocolo)||!texto(r.bloco)||!texto(r.apto)||!texto(r.problema))return res.status(400).json({erro:'Preencha os campos obrigatórios.'});const f=await sql`SELECT id,nome FROM usuarios WHERE perfil='fornecedor' AND ativo=TRUE ORDER BY criado_em LIMIT 1`;if(!f.length)return res.status(409).json({erro:'Cadastre um fornecedor ativo antes de abrir solicitações.'});const id=crypto.randomUUID(),cid=String(req.usuario.id),fid=String(f[0].id);await sql`INSERT INTO solicitacoes(id,protocolo,cliente_id,cliente,fornecedor_id,fornecedor_nome,bloco,apartamento,prioridade,problema,status) VALUES(${id},${r.protocolo},${cid},${req.usuario.nome},${fid},${f[0].nome},${r.bloco},${r.apto},${r.prioridade||'Normal'},${r.problema},'Pendente')`;res.status(201).json({id});}catch(e){res.status(e.code==='23505'?409:500).json({erro:e.code==='23505'?'Protocolo duplicado.':'Não foi possível cadastrar.'});}});
app.patch('/api/solicitacoes/:id/iniciar',autenticar,permitir('fornecedor','admin'),async(req,res)=>{const r=await sql`UPDATE solicitacoes SET status='Em manutenção' WHERE id=${req.params.id} RETURNING id`;if(!r.length)return res.status(404).json({erro:'Solicitação não encontrada.'});res.json({sucesso:true});});
app.post('/api/solicitacoes/:id/retornos',autenticar,permitir('fornecedor','admin'),async(req,res)=>{try{const r=req.body||{};if(!texto(r.prestador)||!texto(r.observacao)||typeof r.resolvido!=='boolean')return res.status(400).json({erro:'Preencha os campos obrigatórios.'});await sql`INSERT INTO retornos(solicitacao_id,prestador,resolvido,motivo,observacao,complemento) VALUES(${req.params.id},${r.prestador},${r.resolvido},${r.motivo||null},${r.observacao},${r.complemento||null})`;await sql`UPDATE solicitacoes SET status=${r.resolvido?'Resolvido':'Pendente de retorno'} WHERE id=${req.params.id}`;res.json({sucesso:true});}catch(e){console.error(e);res.status(500).json({erro:'Não foi possível salvar o retorno.'});}});
app.delete('/api/solicitacoes/:id',autenticar,permitir('fornecedor','admin'),async(req,res)=>{const r=await sql`DELETE FROM solicitacoes WHERE id=${req.params.id} RETURNING id`;if(!r.length)return res.status(404).json({erro:'Solicitação não encontrada.'});res.json({sucesso:true});});
app.use((_q,res)=>res.sendFile('index.html',{root:process.cwd()}));
prepararBanco().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`Servidor iniciado na porta ${PORT}.`))).catch(e=>{console.error('Falha ao preparar banco:',e);process.exit(1);});
