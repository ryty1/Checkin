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

async function checkProcessStatus(account) {
    const logUrl = `https://${account}.serv00.net/log`;
    try {
        const response = await axios.get(logUrl, { timeout: 5000 });
        const logData = response.data;
        return {
            account,
            processStatus: processesToMonitor.reduce((status, process) => {
                status[process] = logData.includes(process) ? "运行中" : "未运行";
                return status;
            }, {}),
            error: null
        };
    } catch (error) {
        return { account, processStatus: {}, error: "无法获取日志" };
    }
}

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

async function getNodesSummary(socket) {
    const accounts = await getAccounts();
    const users = Object.keys(accounts);
    const results = [];
    const failedAccounts = [];

    socket.emit("progress", { progress: 0 });

    await Promise.all(users.map(async (user) => {
        const nodeUrl = `https://${user}.serv00.net/node`;
        let nodeLinks = [];

        try {
            const response = await axios.get(nodeUrl, { timeout: 5000 });
            const nodeData = response.data;
            nodeLinks = [...(nodeData.match(/vmess:\/\/[^\s]+/g) || []), ...(nodeData.match(/hysteria2:\/\/[^\s]+/g) || [])];

            if (nodeLinks.length > 0) results.push({ user, nodeLinks });
        } catch (error) {
            failedAccounts.push(user);
        }

        socket.emit("progress", { progress: Math.floor((results.length / users.length) * 100) });
    }));

    socket.emit("progress", { progress: 100 });
    socket.emit("nodesSummary", { successfulNodes: results, failedAccounts });
}

io.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("startProcessMonitor", () => {
        checkAllProcesses(socket).then(() => socket.emit("processMonitorComplete", { message: "进程监控已完成" }));
    });

    socket.on("startNodesSummary", () => {
        getNodesSummary(socket).then(() => socket.emit("nodesSummaryComplete", { message: "节点汇总已完成" }));
    });
});

app.get("/", (req, res) => {
    res.send(`<!DOCTYPE html>
    <html lang="zh">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>实时进度监控</title>
        <script src="/socket.io/socket.io.js"></script>
    </head>
    <body>
        <h1>实时进度监控</h1>
        <button onclick="startNodesSummary()">开始节点汇总</button>
        <button onclick="startProcessMonitor()">开始进程监控</button>
        <div>
            <h3>进度:</h3>
            <progress id="progressBar" value="0" max="100"></progress>
        </div>
        <div>
            <h3>节点汇总</h3>
            <div id="successfulNodes"></div>
            <div id="failedAccounts"></div>
        </div>
        <script>
            const socket = io();
            function startProcessMonitor() {
                socket.emit("startProcessMonitor");
            }
            function startNodesSummary() {
                socket.emit("startNodesSummary");
            }
            socket.on("progress", (data) => {
                document.getElementById("progressBar").value = data.progress;
            });
            socket.on("nodesSummary", (data) => {
                const successfulNodes = document.getElementById("successfulNodes");
                const failedAccounts = document.getElementById("failedAccounts");
                successfulNodes.innerHTML = "<b>成功的节点:</b><br>";
                data.successfulNodes.forEach(node => {
                    const nodeLinks = node.nodeLinks.length ? node.nodeLinks.join("<br>") : "无可用节点";
                    successfulNodes.innerHTML += \`<strong>\${node.user}</strong>: \${nodeLinks}<br>\`;
                });
                failedAccounts.innerHTML = "<b>失败的账号:</b><br>" + (data.failedAccounts.length ? data.failedAccounts.join("<br>") : "无");
            });
            socket.on("processMonitorComplete", (data) => alert(data.message));
            socket.on("nodesSummaryComplete", (data) => alert(data.message));
        </script>
    </body>
    </html>`);
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});