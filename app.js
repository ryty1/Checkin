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

// 默认添加自身服务器的账号
const MAIN_SERVER_USER = process.env.USER.toLowerCase();

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

// 获取所有账号
async function getAccounts() {
    if (!fs.existsSync(ACCOUNTS_FILE)) return {};
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
}

// 添加/修改账号
async function saveAccount(user, accountData) {
    const accounts = await getAccounts();
    accounts[user] = accountData;
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

// 删除账号
async function deleteAccount(user) {
    const accounts = await getAccounts();
    delete accounts[user];
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

// 获取节点汇总
async function getNodesSummary(socket) {
    const accounts = await getAccounts();
    const users = Object.keys(accounts);
    const results = [];
    const failedAccounts = [];

    const total = users.length;
    let completed = 0;
    socket.emit("progress", { progress: 0 });

    await Promise.all(users.map(async (user) => {
        const nodeUrl = `https://${user}.serv00.net/node`;
        let nodeLinks = [];

        try {
            const nodeResponse = await axios.get(nodeUrl, { timeout: 5000 });
            const nodeData = nodeResponse.data;

            // 确保 nodeLinks 是数组
            nodeLinks = [
                ...(nodeData.match(/vmess:\/\/[^\s]+/g) || []),
                ...(nodeData.match(/hysteria2:\/\/[^\s]+/g) || [])
            ];

            if (nodeLinks.length > 0) {
                results.push({ user, nodeLinks });
            }
        } catch (error) {
            console.error(`无法获取 ${user} 的节点信息`);
            failedAccounts.push(user);
        }

        completed += 1;
        socket.emit("progress", { progress: Math.floor((completed / total) * 100) });
    }));

    socket.emit("progress", { progress: 100 });
    socket.emit("nodesSummary", { successfulNodes: results, failedAccounts });
}

// WebSocket 处理
io.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("startNodesSummary", () => {
        getNodesSummary(socket).then(() => {
            socket.emit("nodesSummaryComplete", { message: "节点汇总已完成" });
        });
    });

    socket.on("saveAccount", async (accountData) => {
        await saveAccount(accountData.user, accountData);
        socket.emit("accountSaved", { message: `账号 ${accountData.user} 已保存` });
    });

    socket.on("deleteAccount", async (user) => {
        await deleteAccount(user);
        socket.emit("accountDeleted", { message: `账号 ${user} 已删除` });
    });

    socket.on("loadAccounts", async () => {
        socket.emit("accountsList", await getAccounts());
    });
});

// 提供前端页面
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// 账号跳转
app.get("/info", (req, res) => {
    const user = req.query.user;
    if (!user) return res.status(400).send("用户未指定");
    res.redirect(`https://${user}.serv00.net/info`);
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});