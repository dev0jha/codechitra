import * as vscode from "vscode";
import puppeteer from "puppeteer-core";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function findBrowser(): string | undefined {
  const platform = os.platform();
  let paths: string[] = [];

  if (platform === "win32") {
    paths = [
      path.join(process.env["PROGRAMFILES"] || "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
      path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
      path.join(process.env["LOCALAPPDATA"] || "", "Google\\Chrome\\Application\\chrome.exe"),
      path.join(process.env["PROGRAMFILES"] || "C:\\Program Files", "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(process.env["PROGRAMFILES"] || "C:\\Program Files", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
    ];
  } else if (platform === "darwin") {
    const home = os.homedir();
    paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      path.join(home, "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      path.join(home, "Applications/Brave Browser.app/Contents/MacOS/Brave Browser"),
      "/Applications/Arc.app/Contents/MacOS/Arc",
      "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi",
    ];
  } else if (platform === "linux") {
    paths = [
      "/usr/bin/google-chrome",
      "/usr/bin/microsoft-edge",
      "/usr/bin/brave-browser",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
    ];
  }

  return paths.find((p) => fs.existsSync(p));
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "codechitra.takeCodeSnapshot",
    async () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
      }

      const executablePath = findBrowser();
      if (!executablePath) {
        vscode.window.showErrorMessage(
          "Could not find Google Chrome, Microsoft Edge, or Brave. Please install one of these browsers to use CodeChitra."
        );
        return;
      }

      const selection = editor.selection;
      const code = editor.document.getText(selection);

      if (!code || code.trim().length === 0) {
        vscode.window.showWarningMessage("No code selected");
        return;
      }

      const saveUri = await vscode.window.showSaveDialog({
        title: "Save Code Snapshot",
        defaultUri: vscode.Uri.file("code-snapshot.png"),
        filters: {
          Images: ["png"],
        },
      });

      if (!saveUri) {
        return;
      }

      const escapedCode = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

      const templatePath = path.join(
        context.extensionPath,
        "dist",
        "template.html"
      );
      if (!fs.existsSync(templatePath)) {
        vscode.window.showErrorMessage("Template file not found in dist folder.");
        return;
      }
      let html = fs.readFileSync(templatePath, "utf-8");

      html = html.replace("{{CODE}}", () => escapedCode);
      html = html.replace("{{FILENAME}}", () =>
        path.basename(editor.document.fileName)
      );

      const browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();

      await page.setViewport({ width: 1400, height: 3000, deviceScaleFactor: 2 });

      await page.setContent(html, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      const container = await page.$("body");

      if (container) {
        const boundingBox = await container.boundingBox();

        if (boundingBox) {
          await page.screenshot({
            path: saveUri.fsPath,
            clip: {
              x: boundingBox.x,
              y: boundingBox.y,
              width: Math.ceil(boundingBox.width),
              height: Math.ceil(boundingBox.height),
            },
            omitBackground: true,
          });
        } else {
          await page.screenshot({ path: saveUri.fsPath, fullPage: true });
        }
      } else {
        await page.screenshot({ path: saveUri.fsPath, fullPage: true });
      }

      await browser.close();

      vscode.window.showInformationMessage(
        `Snapshot saved at: ${saveUri.fsPath}`
      );
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() { }
