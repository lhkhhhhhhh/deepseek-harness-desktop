// Console shim around the real 7za.exe for packaging on Windows.
//
// electron-builder unpacks its winCodeSign tool archive before stamping the icon
// and version info onto the packaged executable. That archive contains two macOS
// symlinks, and 7-Zip cannot create them without SeCreateSymbolicLinkPrivilege
// (developer mode or an elevated shell). 7-Zip then exits with code 2 even though
// every file Windows packaging needs - rcedit-x64.exe and friends - was written
// correctly, and electron-builder treats that exit code as fatal.
//
// This shim runs the real 7-Zip with "-snl" (store symlinks as plain files) and
// rewrites exit code 2 to 0 when the extracted payload is present. It is build
// tooling only: nothing in the shipped application depends on it.
public static class SevenZipShim
{
    public static int Main(string[] args)
    {
        System.Collections.Generic.List<string> forwarded = new System.Collections.Generic.List<string>();
        bool hasSnl = false;
        foreach (string arg in args)
        {
            if (arg == "-snl" || arg == "-snld") hasSnl = true;
            forwarded.Add(arg);
        }
        if (!hasSnl) forwarded.Insert(0, "-snl");

        string exeDir = System.IO.Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
        string real = System.IO.Path.Combine(exeDir, "7za-real.exe");
        if (!System.IO.File.Exists(real)) return 127;

        System.Diagnostics.ProcessStartInfo psi = new System.Diagnostics.ProcessStartInfo(real);
        psi.Arguments = JoinArguments(forwarded);
        psi.UseShellExecute = false;

        int exitCode;
        using (System.Diagnostics.Process child = System.Diagnostics.Process.Start(psi))
        {
            child.WaitForExit();
            exitCode = child.ExitCode;
        }

        // Exit code 2 means "some files could not be written"; the only such
        // files are Unix-only symlinks, so a successful listing of the payload
        // is the real success signal.
        if (exitCode == 2 && PayloadLooksComplete(forwarded)) return 0;
        return exitCode;
    }

    /// <summary>Quote for the Windows command line (the argument-list API is .NET Core only).</summary>
    private static string JoinArguments(System.Collections.Generic.List<string> args)
    {
        System.Text.StringBuilder builder = new System.Text.StringBuilder();
        foreach (string arg in args)
        {
            if (builder.Length > 0) builder.Append(' ');
            if (arg.Length > 0 && arg.IndexOfAny(new char[] { ' ', '\t', '"' }) < 0)
            {
                builder.Append(arg);
                continue;
            }
            builder.Append('"');
            int backslashes = 0;
            foreach (char c in arg)
            {
                if (c == '\\') { backslashes++; continue; }
                if (c == '"')
                {
                    builder.Append('\\', backslashes * 2 + 1).Append('"');
                    backslashes = 0;
                    continue;
                }
                builder.Append('\\', backslashes).Append(c);
                backslashes = 0;
            }
            builder.Append('\\', backslashes * 2).Append('"');
        }
        return builder.ToString();
    }

    private static bool PayloadLooksComplete(System.Collections.Generic.List<string> args)
    {
        string output = null;
        for (int i = 0; i < args.Count; i++)
        {
            if (args[i] == "-o" && i + 1 < args.Count) output = args[i + 1];
            else if (args[i].StartsWith("-o") && args[i].Length > 2) output = args[i].Substring(2);
        }
        if (output == null || !System.IO.Directory.Exists(output)) return false;

        string[] expected = new string[] { "rcedit-x64.exe", "rcedit-ia32.exe", "windows-10", "windows-6" };
        foreach (string name in expected)
        {
            if (!System.IO.File.Exists(System.IO.Path.Combine(output, name)) &&
                !System.IO.Directory.Exists(System.IO.Path.Combine(output, name))) return false;
        }
        return true;
    }
}
