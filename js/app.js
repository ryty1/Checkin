const express = require('express');
const { exec } = require('child_process');

const app = express();

// 杀掉所有进程路由
app.get("/kill", (req, res) => {
    const command = "kill -9 $(ps aux | awk '{print $2}' | tail -n +2)"; // 杀掉所有进程，除了 shell 自身
    exec(command, (err, stdout, stderr) => {
        if (err) {
            return res.type("html").send(`
                <html>
                    <body>
                        <h1>错误</h1>
                        <pre>错误信息: ${err.message}</pre>
                    </body>
                </html>
            `);
        }
        res.type("html").send(`
            <html>
                <body>
                    <h1>进程已杀死</h1>
                    <pre>所有进程已被成功终止</pre>
                </body>
            </html>
        `);
    });
});

// 启动服务器
const port = 3000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
