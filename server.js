const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
const PORT = 3000;
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");

// 🚀 **默认添加自身服务器的账号**
const MAIN_SERVER_USER = "mainserver";

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

// 获取所有账号的节点汇总（包括vmess和hysteria链接）
app.get("/nodes-summary", async (req, res) => {
    const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
    const users = Object.keys(accounts);
    const results = [];

    await Promise.all(users.map(async (user) => {
        const nodeUrl = `https://${user}.serv00.net/node`;
        let nodeLinks = [];

        try {
            const nodeResponse = await axios.get(nodeUrl, { timeout: 5000 });
            const nodeData = nodeResponse.data;

            // 提取vmess://和hysteria2://链接
            const vmessLinks = nodeData.match(/vmess:\/\/[^\s]+/g) || [];
            const hysteriaLinks = nodeData.match(/hysteria2:\/\/[^\s]+/g) || [];
            nodeLinks = [...vmessLinks, ...hysteriaLinks];  // 汇总所有链接
        } catch (error) {
            console.error(`无法获取 ${user} 的节点信息`);
        }

        results.push({
            user,
            nodeLinks
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
                .account-buttons { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 20px; }
                .account-button { padding: 10px 20px; font-size: 16px; background-color: #4CAF50; color: white; border: none; cursor: pointer; border-radius: 5px; }
                .account-button:hover { background-color: #45a049; }
                .danger { color: red; }
                .success { color: green; }
            </style>
        </head>
        <body>

            <h1>主控端 - 账号管理 & 状态监控</h1>

            <h2>账号管理</h2>
            <div class="account-buttons" id="accountButtons"></div> <!-- 显示所有账号的按钮 -->

            <h2>节点汇总</h2>
            <button onclick="fetchNodesSummary()">刷新节点汇总</button>
            <table>
                <thead>
                    <tr>
                        <th>账号</th>
                        <th>节点链接</th>
                    </tr>
                </thead>
                <tbody id="nodeSummaryTable"></tbody>
            </table>

            <script>
                // 获取所有账号并展示为按钮
                async function fetchAccounts() {
                    const res = await fetch("/accounts");
                    const accounts = await res.json();
                    const buttonsContainer = document.getElementById("accountButtons");
                    buttonsContainer.innerHTML = ""; // 清空之前的内容

                    Object.keys(accounts).forEach(user => {
                        const button = document.createElement("button");
                        button.className = "account-button";
                        button.textContent = user;
                        button.onclick = () => window.location.href = `https://${user}.serv00.net/info`; // 点击后跳转到相应的info页面
                        buttonsContainer.appendChild(button);
                    });
                }

                // 刷新节点汇总
                async function fetchNodesSummary() {
                    const res = await fetch("/nodes-summary");
                    const nodes = await res.json();
                    const table = document.getElementById("nodeSummaryTable");
                    table.innerHTML = "";

                    nodes.forEach(node => {
                        const row = `<tr>
                            <td>${node.user}</td>
                            <td>${node.nodeLinks.length > 0 ? node.nodeLinks.join("<br>") : "<span class='danger'>无节点链接</span>"}</td>
                        </tr>`;
                        table.innerHTML += row;
                    });
                }

                // 页面加载后调用
                fetchAccounts();
            </script>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});