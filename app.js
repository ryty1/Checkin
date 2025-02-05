const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");

// 账号管理
async function getAccounts() {
    if (!fs.existsSync(ACCOUNTS_FILE)) return {};
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
}

async function saveAccount(user, accountData) {
    const accounts = await getAccounts();
    accounts[user] = accountData;
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

async function deleteAccount(user) {
    const accounts = await getAccounts();
    delete accounts[user];
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

// 获取节点汇总
async function getNodesSummary(socket) {
    const accounts = await getAccounts();
    const users = Object.keys(accounts);
    let successfulNodes = [];
    let failedAccounts = [];

    await Promise.all(users.map(async (user) => {
        const nodeUrl = `https://${user}.serv00.net/node`;

        try {
            const nodeResponse = await axios.get(nodeUrl, { timeout: 5000 });
            const nodeData = nodeResponse.data;

            // 解析 vmess 和 hysteria2 链接
            const nodeLinks = [
                ...(nodeData.match(/vmess:\/\/[^\s]+/g) || []),
                ...(nodeData.match(/hysteria2:\/\/[^\s]+/g) || [])
            ];

            if (nodeLinks.length > 0) {
                successfulNodes.push(...nodeLinks);
            }
        } catch (error) {
            failedAccounts.push(user);
        }
    }));

    socket.emit("nodesSummary", { successfulNodes, failedAccounts });
}

// WebSocket 处理
io.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("startNodesSummary", () => {
        getNodesSummary(socket);
    });

    socket.on("saveAccount", async (accountData) => {
        await saveAccount(accountData.user, accountData);
        socket.emit("accountSaved", { message: `账号 ${accountData.user} 已保存` });
        socket.emit("accountsList", await getAccounts()); // 立即更新前端
    });

    socket.on("deleteAccount", async (user) => {
        await deleteAccount(user);
        socket.emit("accountDeleted", { message: `账号 ${user} 已删除` });
        socket.emit("accountsList", await getAccounts()); // 立即更新前端
    });

    socket.on("loadAccounts", async () => {
        socket.emit("accountsList", await getAccounts());
    });
});

// 提供前端页面
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/accounts", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "accounts.html"));
});

app.get("/nodes", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "nodes.html"));
});

// 账号点击跳转
app.get("/info", (req, res) => {
    const user = req.query.user;
    if (!user) {
        return res.status(400).send("用户未指定");
    }
    res.redirect(`https://${user}.serv00.net/info`);
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});