const express = require('express');
const { exec } = require('child_process');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>命令执行</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f4;
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
                background-color: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
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
                border: 1px solid #ccc;
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
                background-color: #f9f9f9;
                border-radius: 4px;
                border: 1px solid #ccc;
                min-height: 100px;
                overflow-y: auto;
                text-align: left;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>命令执行</h1>
            <input type="text" id="directory" placeholder="输入目录（可选）">
            <input type="text" id="command" placeholder="输入命令">
            <button onclick="sendCommand()">执行命令</button>
            <div class="output" id="output"></div>
        </div>

        <script>
            function sendCommand() {
                const command = document.getElementById('command').value;
                const directory = document.getElementById('directory').value; 

                if (!command) {
                    alert("请输入命令！");
                    return;
                }

                fetch('/execute-command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command, directory })
                })
                .then(response => response.json())
                .then(data => {
                    document.getElementById('output').innerHTML = '<pre>' + data.output + '</pre>';
                })
                .catch(error => {
                    document.getElementById('output').innerHTML = '<pre>执行命令时发生错误: ' + error.message + '</pre>';
                });
            }
        </script>
    </body>
    </html>
    `);
});

// 处理命令执行请求
app.post('/execute-command', (req, res) => {
    const { command, directory } = req.body;

    if (!command) {
        return res.status(400).json({ output: "命令不能为空" });
    }

    // 设置默认目录
    let targetDirectory = process.env.HOME/serv00-play;
    if (directory) {
        targetDirectory = directory;
    }

    // 组合命令
    const fullCommand = `bash -c "cd '${targetDirectory}' && ${command}"`;
    console.log("Executing:", fullCommand);

    exec(fullCommand, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ output: `执行错误: ${error.message}` });
        }
        if (stderr) {
            return res.status(500).json({ output: `stderr: ${stderr}` });
        }
        res.json({ output: stdout });
    });
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});