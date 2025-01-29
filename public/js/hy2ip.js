document.addEventListener("DOMContentLoaded", () => {
    const submitButton = document.getElementById("submitButton");
    const confirmationInput = document.getElementById("confirmation");
    const responseMessage = document.getElementById("responseMessage");

    submitButton.addEventListener("click", async () => {
        const confirmation = confirmationInput.value.trim();

        if (confirmation === "") {
            responseMessage.innerText = "请输入确认信息！";
            return;
        }

        const response = await fetch("/hy2ip/execute", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ confirmation })
        });

        const data = await response.json();
        responseMessage.innerText = data.message;
    });
});