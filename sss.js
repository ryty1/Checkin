const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
const PORT = 3000;
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");

// 🚀 **默认添加自身服务器的账号**
const MAIN_SERVER_USER = process.env.USER;  // 使用当前系统用户作为账号名

// 确保配置文件存在 & 默认账号添加
function ensureDefaultAccount() {
    let accounts = {};
    if (fs.existsSync(ACCOUNTS_FILE)) {
        accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
    }
    if (!accounts[MAIN_SERVER_USER]) {
        accounts[MAIN_SERVER_USER] = { user: MAIN_SERVER_USER };
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    }
}
ensureDefaultAccount();

app.use(express.json());

// 读取账号列表
app.get("/accounts", (req, res) => {
    if (!fs.existsSync(ACCOUNTS_FILE)) return res.json({});
    const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
    res.json(accounts);
});

// 添加或更新账号
app.post("/accounts", (req, res) => {
    const { user } = req.body;
    if (!user) return res.status(400).json({ error: "账号不能为空" });

    let accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
    accounts[user] = { user };
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    res.json({ message: "账号已添加/更新" });
});

// 删除账号（禁止删除自身服务器账号）
app.delete("/accounts/:user", (req, res) => {
    const { user } = req.params;
    if (user === MAIN_SERVER_USER) {
        return res.status(400).json({ error: "无法删除自身服务器账号" });
    }

    let accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
    if (accounts[user]) {
        delete accounts[user];
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    }

    res.json({ message: "账号已删除" });
});

// 获取所有账号的节点状态
app.get("/nodes", async (req, res) => {
    const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
    const users = Object.keys(accounts);
    const results = [];

    await Promise.all(users.map(async (user) => {
        const nodeUrl = `https://${user}.serv00.net/node`;
        const logUrl = `https://${user}.serv00.net/log`;
        const infoUrl = `https://${user}.serv00.net/info`;

        let singboxsbOnline = false;
        let cloudflareOnline = false;
        let status = "在线";

        try {
            const logResponse = await axios.get(logUrl, { timeout: 5000 });
            const logData = logResponse.data;

            singboxsbOnline = logData.includes("singboxsb");
            cloudflareOnline = logData.includes("cloudflare");
        } catch (error) {
            status = "离线";
        }

        if (!singboxsbOnline || !cloudflareOnline) {
            try { await axios.get(infoUrl, { timeout: 5000 }); } catch (error) {}
        }

        results.push({
            user,
            status,
            singboxsb: singboxsbOnline ? "运行中" : "未运行",
            cloudflare: cloudflareOnline ? "运行中" : "未运行"
        });
    }));

    res.json(results);
});

// 前端界面
app.get("/", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="zh">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>主控端 - 账号管理 & 状态监控</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid black; padding: 8px; text-align: center; }
                th { background-color: #f2f2f2; }
                input, button { padding: 8px; margin: 5px; }
                .danger { color: red; }
                .success { color: green; }
            </style>
        </head>
        <body>

            <h1>主控端 - 账号管理 & 状态监控</h1>

            <h2>账号管理</h2>
            <input type="text" id="newUser" placeholder="输入账号">
            <button onclick="addAccount()">添加/更新账号</button>
            <table>
                <thead>
                    <tr>
                        <th>账号</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="accountTable"></tbody>
            </table>

            <h2>节点状态监控</h2>
            <button onclick="fetchNodes()">刷新状态</button>
            <table>
                <thead>
                    <tr>
                        <th>账号</th>
                        <th>状态</th>
                        <th>singboxsb</th>
                        <th>cloudflare</th>
                    </tr>
                </thead>
                <tbody id="nodeTable"></tbody>
            </table>

            <script>
                async function fetchAccounts() {
                    const res = await fetch("/accounts");
                    const accounts = await res.json();
                    const table = document.getElementById("accountTable");
                    table.innerHTML = "";

                    Object.keys(accounts).forEach(user => {
                        const deleteButton = user === "${MAIN_SERVER_USER}" ? "不可删除" : \`<button onclick="deleteAccount('\${user}')">删除</button>\`;
                        const row = \`<tr>
                            <td>\${user}</td>
                            <td>\${deleteButton}</td>
                        </tr>\`;
                        table.innerHTML += row;
                    });
                }

                async function addAccount() {
                    const user = document.getElementById("newUser").value.trim();
                    if (!user) return alert("请输入账号");
                    await fetch("/accounts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ user })
                    });
                    fetchAccounts();
                }

                async function deleteAccount(user) {
                    await fetch(\`/accounts/\${user}\`, { method: "DELETE" });
                    fetchAccounts();
                }

                async function fetchNodes() {
                    const res = await fetch("/nodes");
                    const nodes = await res.json();
                    const table = document.getElementById("nodeTable");
                    table.innerHTML = "";

                    nodes.forEach(node => {
                        const row = \`<tr>
                            <td>\${node.user}</td>
                            <td>\${node.status === "在线" ? "<span class='success'>在线</span>" : "<span class='danger'>离线</span>"}</td>
                            <td>\${node.singboxsb === "运行中" ? "<span class='success'>运行中</span>" : "<span class='danger'>未运行</span>"}</td>
                            <td>\${node.cloudflare === "运行中" ? "<span class='success'>运行中</span>" : "<span class='danger'>未运行</span>"}</td>
                        </tr>\`;
                        table.innerHTML += row;
                    });
                }

                fetchAccounts();
                fetchNodes();
            </script>

        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});