import express from "express";
import { neon } from "@neondatabase/serverless";

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error("A variável DATABASE_URL não foi configurada.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

app.use(express.json({ limit: "1mb" }));
app.use(express.static("."));

async function prepararBanco() {
  await sql`
    CREATE TABLE IF NOT EXISTS solicitacoes (
      id TEXT PRIMARY KEY,
      protocolo VARCHAR(30) UNIQUE NOT NULL,
      cliente_id VARCHAR(100) NOT NULL,
      cliente VARCHAR(150) NOT NULL,
      fornecedor_id VARCHAR(100) NOT NULL,
      fornecedor_nome VARCHAR(150) NOT NULL,
      bloco VARCHAR(50) NOT NULL,
      apartamento VARCHAR(30) NOT NULL,
      prioridade VARCHAR(30) NOT NULL,
      problema TEXT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Pendente',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS retornos (
      id BIGSERIAL PRIMARY KEY,
      solicitacao_id TEXT NOT NULL,
      prestador VARCHAR(150) NOT NULL,
      resolvido BOOLEAN NOT NULL DEFAULT FALSE,
      motivo TEXT,
      observacao TEXT NOT NULL,
      complemento TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT retornos_solicitacao_fk
        FOREIGN KEY (solicitacao_id)
        REFERENCES solicitacoes(id)
        ON DELETE CASCADE
    )
  `;

  console.log("Estrutura do banco verificada.");
}

app.get("/api/saude", async (req, res) => {
  try {
    const resultado = await sql`SELECT NOW() AS agora`;

    res.json({
      sucesso: true,
      banco: "conectado",
      agora: resultado[0].agora
    });
  } catch (erro) {
    console.error("Erro no teste do banco:", erro);

    res.status(500).json({
      sucesso: false,
      banco: "desconectado"
    });
  }
});

app.get("/api/solicitacoes", async (req, res) => {
  try {
    const { perfil, usuarioId } = req.query;

    if (!perfil || !usuarioId) {
      return res.status(400).json({
        erro: "Perfil e usuário são obrigatórios."
      });
    }

    let registros;

    if (perfil === "fornecedor") {
      registros = await sql`
        SELECT
          s.*,
          COALESCE(
            json_agg(
              json_build_object(
                'data', r.criado_em,
                'prestador', r.prestador,
                'resolvido', r.resolvido,
                'motivo', r.motivo,
                'observacao', r.observacao,
                'complemento', r.complemento
              )
              ORDER BY r.criado_em
            ) FILTER (WHERE r.id IS NOT NULL),
            '[]'
          ) AS retornos
        FROM solicitacoes s
        LEFT JOIN retornos r
          ON r.solicitacao_id = s.id
        WHERE s.fornecedor_id = ${usuarioId}
        GROUP BY s.id
        ORDER BY s.criado_em DESC
      `;
    } else {
      registros = await sql`
        SELECT
          s.*,
          COALESCE(
            json_agg(
              json_build_object(
                'data', r.criado_em,
                'prestador', r.prestador,
                'resolvido', r.resolvido,
                'motivo', r.motivo,
                'observacao', r.observacao,
                'complemento', r.complemento
              )
              ORDER BY r.criado_em
            ) FILTER (WHERE r.id IS NOT NULL),
            '[]'
          ) AS retornos
        FROM solicitacoes s
        LEFT JOIN retornos r
          ON r.solicitacao_id = s.id
        WHERE s.cliente_id = ${usuarioId}
        GROUP BY s.id
        ORDER BY s.criado_em DESC
      `;
    }

    const dados = registros.map(item => ({
      id: item.id,
      protocolo: item.protocolo,
      clienteId: item.cliente_id,
      cliente: item.cliente,
      fornecedorId: item.fornecedor_id,
      fornecedorNome: item.fornecedor_nome,
      bloco: item.bloco,
      apto: item.apartamento,
      prioridade: item.prioridade,
      problema: item.problema,
      status: item.status,
      criado: item.criado_em,
      retornos: item.retornos
    }));

    res.json(dados);
  } catch (erro) {
    console.error("Erro ao consultar solicitações:", erro);

    res.status(500).json({
      erro: "Não foi possível consultar as solicitações."
    });
  }
});

app.post("/api/solicitacoes", async (req, res) => {
  try {
    const solicitacao = req.body;

    const resultado = await sql`
      INSERT INTO solicitacoes (
        id,
        protocolo,
        cliente_id,
        cliente,
        fornecedor_id,
        fornecedor_nome,
        bloco,
        apartamento,
        prioridade,
        problema,
        status,
        criado_em
      )
      VALUES (
        ${solicitacao.id},
        ${solicitacao.protocolo},
        ${solicitacao.clienteId},
        ${solicitacao.cliente},
        ${solicitacao.fornecedorId},
        ${solicitacao.fornecedorNome},
        ${solicitacao.bloco},
        ${solicitacao.apto},
        ${solicitacao.prioridade},
        ${solicitacao.problema},
        ${solicitacao.status},
        ${solicitacao.criado}
      )
      RETURNING *
    `;

    res.status(201).json(resultado[0]);
  } catch (erro) {
    console.error("Erro ao cadastrar solicitação:", erro);

    res.status(500).json({
      erro: "Não foi possível cadastrar a solicitação."
    });
  }
});

app.patch("/api/solicitacoes/:id/iniciar", async (req, res) => {
  try {
    const resultado = await sql`
      UPDATE solicitacoes
      SET status = 'Em manutenção'
      WHERE id = ${req.params.id}
      RETURNING *
    `;

    if (!resultado.length) {
      return res.status(404).json({
        erro: "Solicitação não encontrada."
      });
    }

    res.json(resultado[0]);
  } catch (erro) {
    console.error("Erro ao iniciar atendimento:", erro);

    res.status(500).json({
      erro: "Não foi possível iniciar o atendimento."
    });
  }
});

app.post("/api/solicitacoes/:id/retornos", async (req, res) => {
  try {
    const retorno = req.body;
    const status = retorno.resolvido
      ? "Resolvido"
      : "Pendente de retorno";

    await sql.transaction([
      sql`
        INSERT INTO retornos (
          solicitacao_id,
          prestador,
          resolvido,
          motivo,
          observacao,
          complemento
        )
        VALUES (
          ${req.params.id},
          ${retorno.prestador},
          ${retorno.resolvido},
          ${retorno.motivo || null},
          ${retorno.observacao},
          ${retorno.complemento || null}
        )
      `,
      sql`
        UPDATE solicitacoes
        SET status = ${status}
        WHERE id = ${req.params.id}
      `
    ]);

    res.json({
      sucesso: true,
      status
    });
  } catch (erro) {
    console.error("Erro ao salvar retorno:", erro);

    res.status(500).json({
      erro: "Não foi possível salvar o retorno."
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile("index.html", { root: process.cwd() });
});

prepararBanco()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor iniciado na porta ${PORT}.`);
    });
  })
  .catch(erro => {
    console.error("Falha ao preparar o banco:", erro);
    process.exit(1);
  });
