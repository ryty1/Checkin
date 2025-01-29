document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch("/api/node");  // 访问 API
        const data = await response.json();
        document.getElementById("node-list").innerText = data.nodes.join("\n");
    } catch (error) {
        document.getElementById("node-list").innerText = "获取节点失败";
    }
});