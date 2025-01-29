const express = require("express");
const app = express();
const path = require("path");
const { exec } = require("child_process");

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// 获取状态信息
app.get("/api/info", (req, res) => {
    res.json({ message: "SingBox 已复活", status: "HtmlOnLive 守护中" });
});

// 执行 HY2IP 更新
app.post("/api/hy2ip", (req, res) => {
    exec(`cd ${process.env.HOME}/domains/${process.env.USER}.serv00.net/public_nodejs/ && bash hy2ip.sh`, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ success: false, error: error.message });
        res.json({ success: true, output: stdout });
    });
});

// 获取节点信息
app.get("/api/node", (req, res) => {
    exec(`cat ${process.env.HOME}/serv00-play/singbox/list`, (err, stdout) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, nodes: stdout.split("\n").filter(line => line) });
    });
});

// 获取日志信息
app.get("/api/log", (req, res) => {
    exec("ps aux", (err, stdout) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, logs: stdout });
    });
});

app.listen(3000, () => console.log("服务器已启动，监听端口 3000"));