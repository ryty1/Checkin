const express = require('express');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const app = express();
const userHome = os.homedir(); // 获取当前用户的 HOME 目录

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>实时命令执行</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background-color: #1e1e1e;
                color: #ffffff;
                margin: 0;
                padding: 0;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
            }
            .container {
                width: 100%;
                max-width: 600px;
                background-color: #252526;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
                text-align: center;
            }
            h1 {
                font-size: 24px;
                margin-bottom: 20px;
            }
            input {
                width: 100%;
                padding: 10px;
                font-size: 16px;
                background-color: #3e3e3e;
                color: #ffffff;
                border: 1px solid #555;
                border-radius: 4px;
                box-sizing: border-box;
                margin-bottom: 10px;
            }
            button {
                width: 100%;
                padding: 10px;
                font-size: 16px;
                background-color: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.3s ease;
            }
            button:hover {
                background-color: #0056b3;
            }
            .output {
                margin-top: 20px;
                padding: 10px;
                background-color: #000;
                color: #0f0;
                font-family: monospace;
                border-radius: 4px;
                border: 1px solid #444;
                min-height: 200px;
                overflow-y: auto;
                text-align: left;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>实时命令执行</h1>
            <input type="text" id="directory" placeholder="输入目录（可选，默认为用户主目录）">
            <input type="text" id="command" placeholder="输入命令">
            <button onclick="sendCommand()">执行命令</button>
            <div class="output" id="output"></div>
        </div>

        <script>
            function sendCommand() {
                const command = document.getElementById('command').value;
                const directory = document.getElementById('directory').value || "~"; 

                if (!command) {
                    alert("请输入命令！");
                    return;
                }

                const outputDiv = document.getElementById("output");
                outputDiv.innerHTML = "<pre>🔍 执行中...</pre>";

                fetch('/execute-command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command, directory })
                })
                .then(response => response.body)
                .then(body => {
                    const reader = body.getReader();
                    outputDiv.innerHTML = ""; // 清空旧输出

                    function readChunk() {
                        reader.read().then(({ done, value }) => {
                            if (done) return;
                            outputDiv.innerHTML += `<pre>${new TextDecoder().decode(value)}</pre>`;
                            outputDiv.scrollTop = outputDiv.scrollHeight;
                            readChunk();
                        });
                    }

                    readChunk();
                })
                .catch(error => {
                    outputDiv.innerHTML = `<pre>⚠️ 发生错误: ${error.message}</pre>`;
                });
            }
        </script>
    </body>
    </html>
    `);
});

app.post('/execute-command', (req, res) => {
    const { command, directory } = req.body;
    if (!command) return res.status(400).json({ output: "命令不能为空" });

    let targetDirectory = userHome; // 默认是用户主目录
    if (directory && directory !== "~") {
        targetDirectory = path.resolve(userHome, directory);
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");

    const shellCommand = spawn('bash', ['-c', `cd '${targetDirectory}' && ${command}`], { shell: true });

    shellCommand.stdout.on('data', (data) => res.write(data));
    shellCommand.stderr.on('data', (data) => res.write(`⚠️ 错误: ${data}`));

    shellCommand.on('close', (code) => {
        res.write(`✅ 进程结束 (退出码: ${code})\n`);
        res.end();
    });
});

app.listen(3000, () => console.log('Server running at http://localhost:3000'));