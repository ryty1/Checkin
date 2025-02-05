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

        // 判断进程是否存在
        const processStatus = processesToMonitor.reduce((status, processName) => {
            if (logData.includes(processName)) {
                status[processName] = "运行中";
            } else {
                status[processName] = "未运行";
            }
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
    const total = accountNames.length;
    let completed = 0;

    const results = [];

    // 向前端推送进度
    socket.emit("progress", { progress: 0 });

    await Promise.all(accountNames.map(async (account) => {
        const result = await checkProcessStatus(account);
        results.push(result);
        completed += 1;
        const progress = Math.floor((completed / total) * 100);
        socket.emit("progress", { progress });
    }));

    socket.emit("progress", { progress: 100 }); // 完成时，进度达到 100%
    return results;
}

// 获取节点汇总（成功的节点链接）
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
        const progress = Math.floor((completed / total) * 100);
        socket.emit("progress", { progress });
    }));

    socket.emit("progress", { progress: 100 }); // 完成时，进度达到 100%
    socket.emit("nodesSummary", { successfulNodes: results, failedAccounts });
}

// 客户端连接后处理
io.on("connection", (socket) => {
    console.log("Client connected");

    // 请求进程监控
    socket.on("startProcessMonitor", () => {
        checkAllProcesses(socket).then(() => {
            socket.emit("processMonitorComplete", { message: "进程监控已完成" });
        });
    });

    // 请求节点汇总
    socket.on("startNodesSummary", () => {
        getNodesSummary(socket).then(() => {
            socket.emit("nodesSummaryComplete", { message: "节点汇总已完成" });
        });
    });

    // 处理账号管理
    socket.on("saveAccount", async (accountData) => {
        await saveAccount(accountData.user, accountData);
        socket.emit("accountSaved", { message: `账号 ${accountData.user} 已保存` });
    });

    socket.on("deleteAccount", async (user) => {
        await deleteAccount(user);
        socket.emit("accountDeleted", { message: `账号 ${user} 已删除` });
    });

    // 加载所有账号信息
    socket.on("loadAccounts", async () => {
        const accounts = await getAccounts();
        socket.emit("accountsList", accounts);
    });
});

// 静态文件服务，提供前端页面
app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="zh">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>实时进度监控</title>
        <style>
            .progress { width: 100%; height: 20px; background-color: #f3f3f3; border-radius: 5px; }
            .progress-bar { height: 100%; background-color: #4CAF50; text-align: center; color: white; line-height: 20px; }
        </style>
    </head>
    <body>
        <h1>实时进度监控</h1>

        <div>
            <button onclick="showAccountManagement()">账号管理</button>
            <button onclick="startNodesSummary()">开始节点汇总</button>
            <button onclick="startProcessMonitor()">开始进程监控</button>
        </div>

        <div class="progress" id="progressBarContainer" style="display: none;">
            <div id="progressBar" class="progress-bar">0%</div>
        </div>

        <div id="resultContainer">
            <h3>节点汇总</h3>
            <div id="successfulNodes"></div>
            <div id="failedAccounts"></div>
        </div>

        <div id="accountManagement" style="display:none;">
            <h3>账号管理</h3>
            <ul id="accountList"></ul>
            <input type="text" id="accountUser" placeholder="请输入账号">
            <button onclick="saveAccount()">保存账号</button>
            <button onclick="deleteAccount()">删除账号</button>
        </div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();

            // 账号管理
            function showAccountManagement() {
                document.getElementById("accountManagement").style.display = "block";
                document.getElementById("progressBarContainer").style.display = "none";
                loadAccounts();
            }

            // 加载账号列表
            function loadAccounts() {
                socket.emit("loadAccounts");
            }

            // 保存账号
            function saveAccount() {
                const user = document.getElementById("accountUser").value;
                const accountData = { user };
                socket.emit("saveAccount", accountData);
            }

            // 删除账号
            function deleteAccount() {
                const user = document.getElementById("accountUser").value;
                socket.emit("deleteAccount", user);
            }

            // 启动进程监控
            function startProcessMonitor() {
                socket.emit("startProcessMonitor");
            }

            // 启动节点汇总
            function startNodesSummary() {
                socket.emit("startNodesSummary");
            }

            // 监听进度更新
            socket.on("progress", (data) => {
                const progressBar = document.getElementById("progressBar");
                const progressBarContainer = document.getElementById("progressBarContainer");

                if (data.progress !== undefined) {
                    progressBarContainer.style.display = "block";
                    progressBar.style.width = data.progress + "%";
                    progressBar.textContent = data.progress + "%";
                }
            });

            // 监听节点汇总结果
            socket.on("nodesSummary", (data) => {
                const successfulNodes = document.getElementById("successfulNodes");
                const failedAccounts = document.getElementById("failedAccounts");

                successfulNodes.innerHTML = "<b>成功的节点:</b><br>";

                if (data.successfulNodes.length > 0) {
                    data.successfulNodes.forEach(node => {
                        successfulNodes.innerHTML += `<strong>${node.user}</strong>: <ul><li>${node.nodeLinks.join("</li><li>")}</li></ul><br>`;
                    });
                } else {
                    successfulNodes.innerHTML += "没有找到成功的节点。<br>";
                }

                failedAccounts.innerHTML = "<b>失败的账号:</b><br>";
                if (data.failedAccounts.length > 0) {
                    failedAccounts.innerHTML += data.failedAccounts.join("<br>");
                } else {
                    failedAccounts.innerHTML += "没有失败的账号。<br>";
                }
            });

            // 监听任务完成
            socket.on("processMonitorComplete", (data) => {
                alert(data.message);
            });

            socket.on("nodesSummaryComplete", (data) => {
                alert(data.message);
            });

            socket.on("accountSaved", (data) => {
                alert(data.message);
            });

            socket.on("accountDeleted", (data) => {
                alert(data.message);
            });

            socket.on("accountsList", (accounts) => {
                const accountList = document.getElementById("accountList");
                accountList.innerHTML = "";
                for (const user in accounts) {
                    const li = document.createElement("li");
                    li.textContent = user;
                    accountList.appendChild(li);
                }
            });
        </script>
    </body>
    </html>
    `);
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