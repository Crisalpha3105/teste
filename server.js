import express from 'express';
import { neon } from '@neondatabase/serverless';

const app = express();
const PORT = process.env.PORT || 3000;
if (!process.env.DATABASE_URL) throw new Error('A variável DATABASE_URL não foi configurada.');
const sql = neon(process.env.DATABASE_URL);

app.use(express.json({ limit: '1mb' }));
app.use(express.static('.'));

async function prepararBanco() {
  await sql`CREATE TABLE IF NOT EXISTS solicitacoes (
    id TEXT PRIMARY KEY, protocolo VARCHAR(40) UNIQUE NOT NULL,
    cliente_id VARCHAR(100) NOT NULL, cliente VARCHAR(150) NOT NULL,
    fornecedor_id VARCHAR(100) NOT NULL, fornecedor_nome VARCHAR(150) NOT NULL,
    bloco VARCHAR(50) NOT NULL, apartamento VARCHAR(30) NOT NULL,
    prioridade VARCHAR(30) NOT NULL, problema TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pendente',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS retornos (
    id BIGSERIAL PRIMARY KEY, solicitacao_id TEXT NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
    prestador VARCHAR(150) NOT NULL, resolvido BOOLEAN NOT NULL DEFAULT FALSE,
    motivo TEXT, observacao TEXT NOT NULL, complemento TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  console.log('Estrutura do banco verificada.');
}

function campo(valor) { return typeof valor === 'string' ? valor.trim() : ''; }
app.get('/api/saude', async (_req, res) => {
  try { const r = await sql`SELECT NOW() AS agora`; res.json({ sucesso:true, banco:'conectado', agora:r[0].agora }); }
  catch (erro) { console.error(erro); res.status(500).json({ sucesso:false, banco:'desconectado' }); }
});

app.get('/api/solicitacoes', async (req, res) => {
  try {
    const perfil = campo(req.query.perfil), usuarioId = campo(req.query.usuarioId);
    if (!['cliente','fornecedor'].includes(perfil) || !usuarioId) return res.status(400).json({ erro:'Perfil e usuário são obrigatórios.' });
    const registros = perfil === 'fornecedor'
      ? await sql`SELECT s.*, COALESCE(json_agg(json_build_object('data',r.criado_em,'prestador',r.prestador,'resolvido',r.resolvido,'motivo',r.motivo,'observacao',r.observacao,'complemento',r.complemento) ORDER BY r.criado_em) FILTER (WHERE r.id IS NOT NULL),'[]'::json) retornos FROM solicitacoes s LEFT JOIN retornos r ON r.solicitacao_id=s.id WHERE s.fornecedor_id=${usuarioId} GROUP BY s.id ORDER BY s.criado_em DESC`
      : await sql`SELECT s.*, COALESCE(json_agg(json_build_object('data',r.criado_em,'prestador',r.prestador,'resolvido',r.resolvido,'motivo',r.motivo,'observacao',r.observacao,'complemento',r.complemento) ORDER BY r.criado_em) FILTER (WHERE r.id IS NOT NULL),'[]'::json) retornos FROM solicitacoes s LEFT JOIN retornos r ON r.solicitacao_id=s.id WHERE s.cliente_id=${usuarioId} GROUP BY s.id ORDER BY s.criado_em DESC`;
    res.json(registros.map(x => ({ id:x.id, protocolo:x.protocolo, clienteId:x.cliente_id, cliente:x.cliente, fornecedorId:x.fornecedor_id, fornecedorNome:x.fornecedor_nome, bloco:x.bloco, apto:x.apartamento, prioridade:x.prioridade, problema:x.problema, status:x.status, criado:x.criado_em, retornos:x.retornos || [] })));
  } catch (erro) { console.error('Erro ao consultar:', erro); res.status(500).json({ erro:'Não foi possível consultar as solicitações.' }); }
});

app.post('/api/solicitacoes', async (req, res) => {
  try {
    const s = req.body || {};
    const obrigatorios = ['id','protocolo','clienteId','cliente','fornecedorId','fornecedorNome','bloco','apto','prioridade','problema','status','criado'];
    if (obrigatorios.some(k => !s[k])) return res.status(400).json({ erro:'Preencha todos os campos obrigatórios.' });
    const r = await sql`INSERT INTO solicitacoes (id,protocolo,cliente_id,cliente,fornecedor_id,fornecedor_nome,bloco,apartamento,prioridade,problema,status,criado_em) VALUES (${s.id},${s.protocolo},${s.clienteId},${s.cliente},${s.fornecedorId},${s.fornecedorNome},${s.bloco},${s.apto},${s.prioridade},${s.problema},${s.status},${s.criado}) RETURNING id, protocolo`;
    res.status(201).json(r[0]);
  } catch (erro) { console.error('Erro ao cadastrar:', erro); res.status(500).json({ erro: erro?.code === '23505' ? 'Protocolo duplicado. Tente novamente.' : 'Não foi possível cadastrar a solicitação.' }); }
});

app.patch('/api/solicitacoes/:id/iniciar', async (req, res) => {
  try { const r = await sql`UPDATE solicitacoes SET status='Em manutenção' WHERE id=${req.params.id} RETURNING id,status`; if (!r.length) return res.status(404).json({ erro:'Solicitação não encontrada.' }); res.json(r[0]); }
  catch (erro) { console.error(erro); res.status(500).json({ erro:'Não foi possível iniciar o atendimento.' }); }
});

app.delete('/api/solicitacoes/:id', async (req, res) => {
  try {
    const perfil = campo(req.body?.perfil);
    const usuarioId = campo(req.body?.usuarioId);
    if (perfil !== 'fornecedor' || !usuarioId) {
      return res.status(403).json({ erro:'Somente o fornecedor responsável pode excluir solicitações.' });
    }
    const removidos = await sql`DELETE FROM solicitacoes WHERE id=${req.params.id} AND fornecedor_id=${usuarioId} RETURNING id, protocolo`;
    if (!removidos.length) {
      return res.status(404).json({ erro:'Solicitação não encontrada ou sem permissão para excluir.' });
    }
    res.json({ sucesso:true, id:removidos[0].id, protocolo:removidos[0].protocolo });
  } catch (erro) {
    console.error('Erro ao excluir solicitação:', erro);
    res.status(500).json({ erro:'Não foi possível excluir a solicitação.' });
  }
});

app.post('/api/solicitacoes/:id/retornos', async (req, res) => {
  try {
    const r = req.body || {};
    if (!campo(r.prestador) || !campo(r.observacao) || typeof r.resolvido !== 'boolean') return res.status(400).json({ erro:'Preencha os dados obrigatórios do retorno.' });
    const existe = await sql`SELECT id FROM solicitacoes WHERE id=${req.params.id}`;
    if (!existe.length) return res.status(404).json({ erro:'Solicitação não encontrada.' });
    await sql`INSERT INTO retornos (solicitacao_id,prestador,resolvido,motivo,observacao,complemento) VALUES (${req.params.id},${r.prestador},${r.resolvido},${r.motivo || null},${r.observacao},${r.complemento || null})`;
    const status = r.resolvido ? 'Resolvido' : 'Pendente de retorno';
    await sql`UPDATE solicitacoes SET status=${status} WHERE id=${req.params.id}`;
    res.json({ sucesso:true, status });
  } catch (erro) { console.error('Erro ao salvar retorno:', erro); res.status(500).json({ erro:'Não foi possível salvar o retorno.' }); }
});

app.use((req, res) => res.sendFile('index.html', { root:process.cwd() }));
prepararBanco().then(() => app.listen(PORT, '0.0.0.0', () => console.log(`Servidor iniciado na porta ${PORT}.`))).catch(erro => { console.error('Falha ao preparar banco:', erro); process.exit(1); });
