// opencode chat launcher stub
// 作用：用便携 Python 无窗口运行 app\launcher.py；出错时弹窗提示。
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class Program
{
    [STAThread]
    static void Main()
    {
        string baseDir;
        try { baseDir = AppDomain.CurrentDomain.BaseDirectory; }
        catch { baseDir = Directory.GetCurrentDirectory(); }

        string pythonw = Path.Combine(baseDir, "runtime", "python", "pythonw.exe");
        string script = Path.Combine(baseDir, "app", "launcher.py");

        if (!File.Exists(pythonw) || !File.Exists(script))
        {
            MessageBox.Show(
                "安装不完整：缺少 runtime\\python\\pythonw.exe 或 app\\launcher.py。\n请重新解压完整的压缩包后再运行。",
                "opencode chat", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        try
        {
            var psi = new ProcessStartInfo();
            psi.FileName = pythonw;
            psi.Arguments = "\"" + script + "\"";
            psi.WorkingDirectory = baseDir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            Process.Start(psi);
        }
        catch (Exception ex)
        {
            try
            {
                File.AppendAllText(Path.Combine(baseDir, "launcher-error.log"),
                    DateTime.Now.ToString("s") + " " + ex.ToString() + Environment.NewLine);
            }
            catch { }
            MessageBox.Show("启动失败：" + ex.Message,
                "opencode chat", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
