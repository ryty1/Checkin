document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch("/api/log");  // 访问 API
        const data = await response.json();
        document.getElementById("log-content").innerText = data.logs.join("\n");
    } catch (error) {
        document.getElementById("log-content").innerText = "获取日志失败";
    }
});