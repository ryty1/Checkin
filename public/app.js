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

// 🚀 **默认添加自身服务器的账号**
const MAIN_SERVER_USER = process.env.USER.toLowerCase();

// 需要监控的进程名
const processesToMonitor = ["singbox", "cloudflare"];

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

// 检查进程状态
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

// 获取所有账号的进程状态
async function checkAllProcesses(socket) {
    const accounts = await getAccounts();
    const accountNames = Object.keys(accounts);
    let completed = 0;

    const results = [];

    socket.emit("progress", { progress: 0 });

    await Promise.all(accountNames.map(async (account) => {
        const result = await checkProcessStatus(account);
        results.push(result);
        completed += 1;
        socket.emit("progress", { progress: Math.floor((completed / accountNames.length) * 100) });
    }));

    socket.emit("progress", { progress: 100 });
    return results;
}

// 获取节点汇总（成功的节点链接）
async function getNodesSummary(socket) {
    const accounts = await getAccounts();
    const users = Object.keys(accounts);
    const results = [];
    const failedAccounts = [];
    let completed = 0;

    socket.emit("progress", { progress: 0 });

    await Promise.all(users.map(async (user) => {
        const nodeUrl = `https://${user}.serv00.net/node`;
        let nodeLinks = [];

        try {
            const nodeResponse = await axios.get(nodeUrl, { timeout: 5000 });
            const nodeData = nodeResponse.data;

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
        socket.emit("progress", { progress: Math.floor((completed / users.length) * 100) });
    }));

    socket.emit("progress", { progress: 100 });
    socket.emit("nodesSummary", { successfulNodes: results, failedAccounts });
}

// 客户端连接处理
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
});

// 静态文件服务
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// 监听 `nodesSummary` 事件
socket.on("nodesSummary", (data) => {
    const successfulNodes = document.getElementById("successfulNodes");
    const failedAccounts = document.getElementById("failedAccounts");

    successfulNodes.innerHTML = "<b>成功的节点:</b><br>";

    if (data.successfulNodes.length > 0) {
        data.successfulNodes.forEach(node => {
            // **确保 nodeLinks 是数组**
            const nodeLinks = Array.isArray(node.nodeLinks) ? node.nodeLinks.join("</li><li>") : "无可用节点";
            successfulNodes.innerHTML += `<strong>${node.user}</strong>: <ul><li>${nodeLinks}</li></ul><br>`;
        });
    } else {
        successfulNodes.innerHTML += "没有找到成功的节点。<br>";
    }

    failedAccounts.innerHTML = "<b>失败的账号:</b><br>";
    failedAccounts.innerHTML += data.failedAccounts.length > 0 ? data.failedAccounts.join("<br>") : "没有失败的账号。<br>";
});

// 账号跳转
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