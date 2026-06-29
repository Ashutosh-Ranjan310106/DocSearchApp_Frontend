const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            devTools: false // optional extra safety
        }
    });

    // ❌ REMOVE devtools auto-open
    // win.webContents.openDevTools();

    // Optional: disable console logging hook (remove this if not needed)
    // win.webContents.on("console-message", (event, level, message) => {
    //     console.log("CONSOLE:", message);
    // });

    // Optional: keep only real errors if needed
    win.webContents.on("did-fail-load", (event, code, desc) => {
        console.log("LOAD FAILED:", code, desc);
    });

    win.loadFile(
        path.join(__dirname, "../dist/index.html")
    );
}

app.whenReady().then(createWindow);