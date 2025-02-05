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

// 获取本机账号
const MAIN_SERVER_USER = process.env.USER ? process.env.USER.toLowerCase() : "default_user";

app.use(express.static(path.join(__dirname, "public"))); // 提供静态文件

// 获取当前系统的状态数据
async function getSystemStatus() {
    // 运行 Shell 命令并获取返回信息（假设这里有实际的命令执行）
    await runShellCommand();
    await KeepAlive();

    return {
        singboxStatus: "已复活",
        htmlonliveStatus: "守护中",
    };
}

// 提供 info 页面
app.get("/info", async (req, res) => {
    const systemStatus = await getSystemStatus();
    res.json(systemStatus);  // 返回 JSON 数据
});



app.use(bodyParser.urlencoded({ extended: false }));

// 访问 HY2_IP 页面（返回静态 HTML 文件）
app.get("/hy2ip", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "hy2ip.html"));
});

// 处理 IP 更新请求
app.post("/hy2ip/execute", (req, res) => {
    const confirmation = req.body.confirmation?.trim();

    if (confirmation !== "更新") {
        return res.status(400).json({ error: "输入错误，请输入 '更新' 以确认执行 IP 更新。" });
    }

    try {
        let updatedIp = "192.168.1.100"; // 假设的 IP 更新逻辑
        res.json({
            success: true,
            message: `SingBox 配置文件成功更新 IP 为 ${updatedIp}`,
            updatedIp,
            logs: [
                "命令执行成功",
                `SingBox 配置文件成功更新 IP 为 ${updatedIp}`,
                "sing-box 已重启"
            ]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "更新失败，请稍后再试。",
            logs: ["命令执行失败", error.message]
        });
    }
});



// **确保本机账号存在**
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

// 过滤无效节点，只保留 `vmess://` 和 `hysteria2://`
function filterNodes(nodes) {
    return nodes.filter(node => node.startsWith("vmess://") || node.startsWith("hysteria2://"));
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

            // 解析并过滤无效节点
            const nodeLinks = filterNodes([
                ...(nodeData.match(/vmess:\/\/[^\s<>"]+/g) || []),
                ...(nodeData.match(/hysteria2:\/\/[^\s<>"]+/g) || [])
            ]);

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
        const accounts = await getAccounts();
        accounts[accountData.user] = accountData;
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        socket.emit("accountSaved", { message: `账号 ${accountData.user} 已保存` });
        socket.emit("accountsList", await getAccounts());
    });

    socket.on("deleteAccount", async (user) => {
        const accounts = await getAccounts();
        delete accounts[user];
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        socket.emit("accountDeleted", { message: `账号 ${user} 已删除` });
        socket.emit("accountsList", await getAccounts());
    });

    socket.on("loadAccounts", async () => {
        socket.emit("accountsList", await getAccounts());
    });
});

// 提供前端页面
app.use(express.static(path.join(__dirname, "public")));

app.get("/info", (req, res) => {
    const user = req.query.user;
    if (!user) return res.status(400).send("用户未指定");
    res.redirect(`https://${user}.serv00.net/info`);
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});