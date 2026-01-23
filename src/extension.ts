import * as vscode from "vscode";
import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "sharecode.takeCodeSnapshot",
    async () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
      }

      const selection = editor.selection;
      const code = editor.document.getText(selection);

      if (!code || code.trim().length === 0) {
        vscode.window.showWarningMessage("No code selected");
        return;
      }

      // STEP 1: Save dialog
      const saveUri = await vscode.window.showSaveDialog({
        title: "Save Code Snapshot",
        defaultUri: vscode.Uri.file("code-snapshot.png"),
        filters: {
          Images: ["png"]
        }
      });

      if (!saveUri) {
        return; // User cancelled
      }

      // 2️⃣ Escape HTML to prevent tags from being parsed
      const escapedCode = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

      // 3️⃣ Read HTML template from dist
      const templatePath = path.join(context.extensionPath, "dist", "template.html");
      let html = fs.readFileSync(templatePath, "utf-8");

      html = html.replace("{{CODE}}", () => escapedCode);
      html = html.replace("{{FILENAME}}", () => path.basename(editor.document.fileName));

      // 4️⃣ Puppeteer → Image
      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });

      const page = await browser.newPage();

      // Important: set viewport to avoid cropped screenshot
      await page.setViewport({ width: 1400, height: 3000, deviceScaleFactor: 2 });

      await page.setContent(html, { waitUntil: "networkidle0" });

      // ✅ Clip the body (includes padding/shadow) instead of just the container
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
          // fallback
          await page.screenshot({ path: saveUri.fsPath, fullPage: true });
        }
      } else {
        // fallback
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
