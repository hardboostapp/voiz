using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;

[assembly: AssemblyTitle("Voiz")]
[assembly: AssemblyDescription("Voiz")]
[assembly: AssemblyProduct("Voiz")]
[assembly: AssemblyCompany("hardboostapp")]
[assembly: AssemblyCopyright("Voiz contributors")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

internal static class VoizLauncher {
    // Windows command-line quoting, including quotes and trailing backslashes.
    private static string Quote(string value) {
        var text = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { text.Append('\\', slashes * 2 + 1); text.Append(c); }
            else { text.Append('\\', slashes); text.Append(c); }
            slashes = 0;
        }
        text.Append('\\', slashes * 2); text.Append('"');
        return text.ToString();
    }
    [STAThread]
    private static int Main(string[] args) {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        try {
            string app = Path.Combine(root, "app");
            string runtime = Path.Combine(root, "runtime", "electron.exe");
            string setting = Path.Combine(root, "settings", "launcher-runtime.txt");
            if (!File.Exists(runtime) && File.Exists(setting)) runtime = File.ReadAllText(setting).Trim();
            if (!Path.IsPathRooted(runtime) || !File.Exists(runtime) || !File.Exists(Path.Combine(app, "main.cjs")))
                throw new IOException("Instalacao do Voiz incompleta.");
            var command = new StringBuilder(Quote(app));
            foreach (string arg in args) { command.Append(' '); command.Append(Quote(arg)); }
            var start = new ProcessStartInfo(runtime, command.ToString());
            start.WorkingDirectory = root;
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            start.EnvironmentVariables.Remove("VOIZ_TEST_DATA");
            using (Process child = Process.Start(start)) { }
            return 0;
        } catch (Exception error) {
            try {
                Directory.CreateDirectory(Path.Combine(root, "logs"));
                File.AppendAllText(Path.Combine(root, "logs", "launcher.log"), DateTime.UtcNow.ToString("o") + " " + error.Message + Environment.NewLine);
            } catch { }
            return 1;
        }
    }
}
