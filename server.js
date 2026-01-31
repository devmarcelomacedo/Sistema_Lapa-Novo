const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./lapa.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS produtos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, preco REAL, estoque REAL, estoque_minimo REAL, medida TEXT, peso_referencia REAL DEFAULT 1)`);
    db.run(`CREATE TABLE IF NOT EXISTS vendas (id INTEGER PRIMARY KEY AUTOINCREMENT, produto_id INTEGER, produto_nome TEXT, quantidade REAL, preco_unitario REAL, total_venda REAL, metodo_pagamento TEXT, status TEXT DEFAULT 'CONCLUIDA', funcionario TEXT, data DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, login TEXT UNIQUE, senha TEXT)`, () => {
        db.run("INSERT OR IGNORE INTO usuarios (login, senha) VALUES ('admin', '123')");
    });
});

app.post('/login', (req, res) => {
    const { login, senha } = req.body;
    db.get("SELECT * FROM usuarios WHERE login = ? AND senha = ?", [login, senha], (err, row) => {
        if (row) res.json({ sucesso: true, usuario: row.login }); else res.status(401).send();
    });
});

app.post('/venda-multipla', (req, res) => {
    const { itens, pagamento, funcionario } = req.body;
    db.serialize(() => {
        const stmtVenda = db.prepare("INSERT INTO vendas (produto_id, produto_nome, quantidade, preco_unitario, total_venda, metodo_pagamento, funcionario) VALUES (?,?,?,?,?,?,?)");
        const stmtEstoque = db.prepare("UPDATE produtos SET estoque = estoque - (? * (SELECT peso_referencia FROM produtos WHERE id = ?)) WHERE id = ?");
        itens.forEach(item => {
            stmtVenda.run(item.id, item.nome, item.quantidade, item.preco, item.total, pagamento, funcionario);
            stmtEstoque.run(item.quantidade, item.id, item.id);
        });
        stmtVenda.finalize();
        stmtEstoque.finalize(() => res.json({ sucesso: true }));
    });
});

// CORREÇÃO: Estorno agora atualiza para 'ESTORNADO' e devolve ao estoque
app.post('/anular-venda', (req, res) => {
    const { vendaId, qtdEstorno } = req.body;
    db.get("SELECT * FROM vendas WHERE id = ?", [vendaId], (err, v) => {
        if (!v) return res.status(404).send();
        db.get("SELECT peso_referencia FROM produtos WHERE id = ?", [v.produto_id], (err, p) => {
            const peso = p ? p.peso_referencia : 1;
            const devolver = peso * qtdEstorno;
            db.run("UPDATE produtos SET estoque = estoque + ? WHERE id = ?", [devolver, v.produto_id]);
            db.run("UPDATE vendas SET status = 'ESTORNADO', total_venda = 0 WHERE id = ?", [vendaId], () => res.json({ sucesso: true }));
        });
    });
});

app.get('/relatorio-vendas', (req, res) => {
    const { filtro } = req.query;
    let query = "SELECT * FROM vendas ";
    if(filtro === 'diario') query += "WHERE data >= date('now')";
    else if(filtro === 'semanal') query += "WHERE data >= date('now', '-7 days')";
    else if(filtro === 'mensal') query += "WHERE data >= date('now', '-30 days')";
    query += " ORDER BY data DESC";
    db.all(query, [], (err, rows) => res.json(rows));
});

app.post('/editar-produto', (req, res) => {
    const { id, nome, preco, estoque } = req.body;
    db.run("UPDATE produtos SET nome = ?, preco = ?, estoque = ? WHERE id = ?", [nome, preco, estoque, id], () => res.json({ sucesso: true }));
});

// CORREÇÃO: Salvando estoque_minimo no cadastro
app.post('/cadastrar-produto', (req, res) => {
    const { nome, preco, estoque, medida, peso_ref, minimo } = req.body;
    db.run("INSERT INTO produtos (nome, preco, estoque, medida, peso_referencia, estoque_minimo) VALUES (?,?,?,?,?,?)", [nome, preco, estoque, medida, peso_ref, minimo], () => res.json({ sucesso: true }));
});

app.get('/estoque', (req, res) => {
    db.all("SELECT * FROM produtos ORDER BY nome ASC", [], (err, rows) => res.json(rows));
});

app.post('/registrar-usuario', (req, res) => {
    const { login, senha } = req.body;
    db.run("INSERT INTO usuarios (login, senha) VALUES (?, ?)", [login, senha], (err) => {
        if (err) res.status(400).send(); else res.json({ sucesso: true });
    });
});

app.listen(3000, () => console.log("SISTEMA LAPA ATIVO"));