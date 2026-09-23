// Icon painter for the DeepSeek Harness desktop client.
// Compiled by build/make-icon.ps1 through Add-Type; not part of the app runtime.
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;

public static class DshIconPainter
{
    /// <summary>Relative outline of the whale mark: body left, tail flukes right.</summary>
    private static GraphicsPath WhalePath()
    {
        GraphicsPath p = new GraphicsPath();
        p.StartFigure();
        p.AddBezier(0.19f, 0.30f, 0.27f, 0.24f, 0.37f, 0.23f, 0.46f, 0.26f);
        p.AddBezier(0.46f, 0.26f, 0.55f, 0.29f, 0.61f, 0.35f, 0.68f, 0.31f);
        p.AddBezier(0.68f, 0.31f, 0.66f, 0.42f, 0.61f, 0.45f, 0.57f, 0.47f);
        p.AddBezier(0.57f, 0.47f, 0.63f, 0.47f, 0.69f, 0.45f, 0.74f, 0.42f);
        p.AddBezier(0.74f, 0.42f, 0.72f, 0.53f, 0.68f, 0.57f, 0.63f, 0.59f);
        p.AddBezier(0.63f, 0.59f, 0.73f, 0.59f, 0.81f, 0.56f, 0.87f, 0.52f);
        p.AddBezier(0.87f, 0.52f, 0.85f, 0.66f, 0.81f, 0.71f, 0.75f, 0.75f);
        p.AddBezier(0.75f, 0.75f, 0.65f, 0.84f, 0.58f, 0.84f, 0.50f, 0.84f);
        p.AddBezier(0.50f, 0.84f, 0.31f, 0.84f, 0.22f, 0.78f, 0.19f, 0.70f);
        p.AddBezier(0.19f, 0.70f, 0.13f, 0.63f, 0.12f, 0.58f, 0.12f, 0.55f);
        p.AddLine(0.12f, 0.55f, 0.19f, 0.62f);
        p.AddBezier(0.19f, 0.62f, 0.21f, 0.53f, 0.19f, 0.48f, 0.18f, 0.45f);
        p.AddLine(0.18f, 0.45f, 0.19f, 0.30f);
        p.CloseFigure();
        return p;
    }

    private static GraphicsPath RoundedPlate(float size, float radius)
    {
        GraphicsPath p = new GraphicsPath();
        float d = radius * 2f;
        p.AddArc(0f, 0f, d, d, 180f, 90f);
        p.AddArc(size - d, 0f, d, d, 270f, 90f);
        p.AddArc(size - d, size - d, d, d, 0f, 90f);
        p.AddArc(0f, size - d, d, d, 90f, 90f);
        p.CloseFigure();
        return p;
    }

    public static Bitmap Render(int size)
    {
        Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        bmp.SetResolution(96f, 96f);
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            g.Clear(Color.Transparent);

            using (GraphicsPath plate = RoundedPlate(size, size * 0.22f))
            using (LinearGradientBrush plateBrush = new LinearGradientBrush(
                new RectangleF(0f, 0f, size, size),
                Color.FromArgb(255, 82, 112, 255),
                Color.FromArgb(255, 22, 40, 138),
                55f))
            {
                g.FillPath(plateBrush, plate);
            }

            using (SolidBrush white = new SolidBrush(Color.White))
            {
                if (size >= 32)
                {
                    float markSize = size * 0.56f;
                    GraphicsState state = g.Save();
                    g.TranslateTransform((size - markSize) / 2f, size * 0.09f);
                    g.ScaleTransform(markSize, markSize);
                    using (GraphicsPath whale = WhalePath()) g.FillPath(white, whale);
                    g.Restore(state);

                    using (Font font = new Font("Segoe UI", size * 0.30f, FontStyle.Bold, GraphicsUnit.Pixel))
                    using (SolidBrush textBrush = new SolidBrush(Color.FromArgb(242, 255, 255, 255)))
                    using (StringFormat fmt = new StringFormat())
                    {
                        fmt.Alignment = StringAlignment.Center;
                        fmt.LineAlignment = StringAlignment.Center;
                        RectangleF textRect = new RectangleF(0f, size * 0.53f, size, size * 0.32f);
                        g.DrawString("DS", font, textBrush, textRect, fmt);
                    }
                }
                else
                {
                    float markSize = size * 0.80f;
                    GraphicsState state = g.Save();
                    g.TranslateTransform((size - markSize) / 2f, (size - markSize) / 2f);
                    g.ScaleTransform(markSize, markSize);
                    using (GraphicsPath whale = WhalePath()) g.FillPath(white, whale);
                    g.Restore(state);
                }
            }
        }
        return bmp;
    }

    public static void Save(string icoPath, string pngPath)
    {
        int[] sizes = new int[] { 16, 20, 24, 32, 40, 48, 64, 128, 256 };
        byte[][] payloads = new byte[sizes.Length][];
        for (int i = 0; i < sizes.Length; i++)
        {
            using (Bitmap bmp = Render(sizes[i]))
            using (MemoryStream ms = new MemoryStream())
            {
                bmp.Save(ms, ImageFormat.Png);
                payloads[i] = ms.ToArray();
                if (sizes[i] == 256) File.WriteAllBytes(pngPath, payloads[i]);
            }
        }

        using (FileStream fs = new FileStream(icoPath, FileMode.Create, FileAccess.Write))
        using (BinaryWriter w = new BinaryWriter(fs))
        {
            w.Write((ushort)0);
            w.Write((ushort)1);
            w.Write((ushort)sizes.Length);
            int offset = 6 + 16 * sizes.Length;
            for (int i = 0; i < sizes.Length; i++)
            {
                w.Write((byte)(sizes[i] >= 256 ? 0 : sizes[i]));
                w.Write((byte)(sizes[i] >= 256 ? 0 : sizes[i]));
                w.Write((byte)0);
                w.Write((byte)0);
                w.Write((ushort)1);
                w.Write((ushort)32);
                w.Write((uint)payloads[i].Length);
                w.Write((uint)offset);
                offset += payloads[i].Length;
            }
            for (int i = 0; i < sizes.Length; i++) w.Write(payloads[i]);
        }
    }
}
