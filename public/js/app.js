document.addEventListener("DOMContentLoaded", async () => {
    try {
        // 从后端获取数据
        const response = await fetch("/api/info");
        const data = await response.json();

        // 显示获取的消息
        document.getElementById("singbox-text").innerHTML = data.message.split("").map((char, index) => 
            `<span style="--char-index: ${index};">${char}</span>`
        ).join("");

        document.getElementById("htmlonlive-text").innerHTML = data.status.split("").map((char, index) => 
            `<span style="--char-index: ${index + data.message.length};">${char}</span>`
        ).join("");
    } catch (error) {
        // 如果请求失败，显示错误信息
        document.getElementById("singbox-text").innerText = "获取 SingBox 状态失败";
        document.getElementById("htmlonlive-text").innerText = "获取 HtmlOnLive 状态失败";
    }
});