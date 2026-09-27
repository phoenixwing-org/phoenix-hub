import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HubError } from "./errors.js";

const execFileAsync = promisify(execFile);
const WINDOWS_PICKER_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public sealed class PnhDialogOwner : IWin32Window
{
    public IntPtr Handle { get; private set; }
    public PnhDialogOwner(IntPtr handle) { Handle = handle; }

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
}
'@
$owner = New-Object PnhDialogOwner ([PnhDialogOwner]::GetForegroundWindow())
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择 Node.js 项目目录'
$dialog.ShowNewFolderButton = $false
if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  Write-Output $dialog.SelectedPath
}
`;

/** 固定系统目录选择器；不接收浏览器传入的命令或路径参数。 */
export async function pnhSelectLocalDirectory(): Promise<string | undefined> {
  if (process.platform !== "win32") {
    throw new HubError("DIRECTORY_PICKER_UNAVAILABLE", "当前平台暂不支持系统目录选择器", 501);
  }
  try {
    const result = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-STA",
      "-EncodedCommand",
      Buffer.from(WINDOWS_PICKER_SCRIPT, "utf16le").toString("base64"),
    ], {
      encoding: "utf8",
      timeout: 10 * 60_000,
      windowsHide: true,
    });
    return result.stdout.trim() || undefined;
  } catch (error) {
    throw new HubError(
      "DIRECTORY_PICKER_FAILED",
      `无法打开系统目录选择器：${error instanceof Error ? error.message : String(error)}`,
      500,
    );
  }
}
