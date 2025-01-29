document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch("/api/log");
        const data = await response.json();
        document.getElementById("log-content").innerText = data.logs;
    } catch (error) {
        document.getElementById("log-content").innerText = "获取日志失败";
    }
});