document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch("/api/info");
        const data = await response.json();
        document.getElementById("status-message").innerText = `${data.message} | ${data.status}`;
    } catch (error) {
        document.getElementById("status-message").innerText = "获取状态失败";
    }
});