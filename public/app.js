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

const MAIN_SERVER_USER = process.env.USER.toLowerCase();
const processesToMonitor = ["singbox", "cloudflare"];

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

async function checkProcessStatus(account) {
    const logUrl = `https://${account}.serv00.net/log`;
    try {
        const response = await axios.get(logUrl, { timeout: 5000 });
        const logData = response.data;

        const processStatus = processesToMonitor.reduce((status, processName) => {
            status[processName] = logData.includes(processName) ? "运行中" : "未运行";
            return status;
        }, {});

        return { account, processStatus, error: null };
    } catch (error) {
        return { account, processStatus: {}, error: "无法获取日志" };
    }
}

async function checkAllProcesses(socket) {
    const accounts = await getAccounts();
    const accountNames = Object.keys(accounts);
    const total = accountNames.length;
    let completed = 0;
    const results = [];

    socket.emit("progress", { progress: 0 });

    await Promise.all(accountNames.map(async (account) => {
        const result = await checkProcessStatus(account);
        results.push(result);
        completed += 1;
        socket.emit("progress", { progress: Math.floor((completed / total) * 100) });
    }));

    socket.emit("progress", { progress: 100 });
    return results;
}

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

            const vmessLinks = nodeData.match(/vmess:\/\/[^\s]+/g) || [];
            const hysteriaLinks = nodeData.match(/hysteria2:\/\/[^\s]+/g) || [];
            nodeLinks = [...vmessLinks, ...hysteriaLinks];

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

io.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("startProcessMonitor", () => {
        checkAllProcesses(socket).then(() => {
            socket.emit("processMonitorComplete", { message: "进程监控已完成" });
        });
    });

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
        const accounts = await getAccounts();
        socket.emit("accountList", accounts);
    });
});

app.get("/", (req, res) => {
    res.sendFile(path.join(public, "app.js"));
});

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
