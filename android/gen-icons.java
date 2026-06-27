import java.awt.*;
import java.awt.geom.*;
import java.awt.image.*;
import java.io.*;
import javax.imageio.*;
import java.util.*;

/**
 * Generates the launcher icons for NEON CITY (legacy PNG mipmaps + adaptive
 * foreground/background + monochrome + playstore icon).
 *
 * Run with:  java gen-icons.java
 */
public class gen_icons {
    // ---- Brand colors (match the game's neon palette) ----
    static final Color PINK = new Color(0xFF, 0x5A, 0xC8);
    static final Color PURPLE = new Color(0x9B, 0x59, 0xFF);
    static final Color ORANGE = new Color(0xFF, 0x8A, 0x3C);
    static final Color DARK_BG = new Color(0x07, 0x03, 0x0F);
    static final Color CYAN = new Color(0x3B, 0xA8, 0xFF);

    static final String BASE = "app/src/main/res";

    public static void main(String[] args) throws Exception {
        // Legacy PNG mipmaps (full square icons).
        int[] sizes = { 48, 72, 96, 144, 192 }; // mdpi..xxxhdpi
        String[] dirs = { "mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi",
                          "mipmap-xxhdpi", "mipmap-xxxhdpi" };
        for (int i = 0; i < sizes.length; i++) {
            File d = new File(BASE, dirs[i]);
            d.mkdirs();
            writePng(fullIcon(sizes[i]), new File(d, "ic_launcher.png"));
            writePng(fullIcon(sizes[i]), new File(d, "ic_launcher_round.png"));
        }

        // Adaptive icon layers (108dp total = 432px @ xxxhdpi baseline).
        // We render at a single high-res (432) and Android scales per-density.
        int A = 432;
        String[] adirs = { "mipmap-anydpi-v26" };
        for (String ad : adirs) new File(BASE, ad).mkdirs();
        writePng(bgLayer(A), new File(BASE, "mipmap-anydpi-v26/ic_launcher_background.png"));
        writePng(fgLayer(A),  new File(BASE, "mipmap-anydpi-v26/ic_launcher_foreground.png"));
        writePng(fgLayer(A),  new File(BASE, "mipmap-anydpi-v26/ic_launcher_monochrome.png"));

        // Play Store icon (512).
        new File(BASE, "ic_launcher-playstore").mkdirs();
        writePng(fullIcon(512), new File(BASE, "ic_launcher-playstore/ic_launcher.png"));

        System.out.println("Icons generated OK.");
    }

    /** Full legacy square icon: dark bg + neon city skyline + "NC" mark. */
    static BufferedImage fullIcon(int s) {
        BufferedImage img = bgLayer(s);
        Graphics2D g = img.createGraphics();
        drawForeground(g, s);
        g.dispose();
        return img;
    }

    /** Adaptive background: vertical neon gradient. */
    static BufferedImage bgLayer(int s) {
        BufferedImage img = new BufferedImage(s, s, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        // Vertical gradient: deep purple top -> near-black bottom.
        Point2D start = new Point2D.Float(0, 0);
        Point2D end   = new Point2D.Float(0, s);
        LinearGradientPaint grad = new LinearGradientPaint(start, end,
                new float[]{0f, 0.55f, 1f},
                new Color[]{ new Color(0x2A,0x18,0x50), new Color(0x16,0x08,0x26), DARK_BG });
        g.setPaint(grad);
        g.fillRect(0, 0, s, s);

        // Subtle neon skyline silhouette along the lower third.
        g.setColor(new Color(0x14, 0x0A, 0x28));
        Random rnd = new Random(42); // deterministic
        int baseY = (int)(s * 0.68);
        int x = 0;
        while (x < s) {
            int bw = s/10 + rnd.nextInt(s/8);
            int bh = s/12 + rnd.nextInt(s/6);
            g.fillRect(x, baseY - bh, bw, bh + s);
            x += bw + 3;
        }
        // Glowing horizon line.
        g.setColor(new Color(0xFF, 0x5A, 0xC8, 120));
        g.fillRect(0, baseY, s, Math.max(1, s/120));

        g.dispose();
        return img;
    }

    /** Adaptive foreground: stylized steering-wheel / reticle "NC" mark. */
    static BufferedImage fgLayer(int s) {
        BufferedImage img = new BufferedImage(s, s, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        drawForeground(g, s);
        g.dispose();
        return img;
    }

    static void drawForeground(Graphics2D g, int s) {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);

        // Adaptive icons only show the inner ~66% safe zone; legacy icons use full.
        // We draw the mark centered around 50% with a radius of ~30% of s.
        float cx = s * 0.5f, cy = s * 0.46f;
        float R  = s * 0.30f;

        // Outer neon ring (reticle / steering wheel).
        Stroke ring = new BasicStroke(Math.max(2f, s*0.035f));
        g.setStroke(ring);
        g.setColor(PINK);
        g.draw(new Ellipse2D.Float(cx - R, cy - R, R*2, R*2));

        // Crosshair ticks.
        float tick = s * 0.05f;
        g.setColor(CYAN);
        g.setStroke(new BasicStroke(Math.max(2f, s*0.03f), BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(new Line2D.Float(cx, cy - R - tick, cx, cy - R + tick));
        g.draw(new Line2D.Float(cx, cy + R - tick, cx, cy + R + tick));
        g.draw(new Line2D.Float(cx - R - tick, cy, cx - R + tick, cy));
        g.draw(new Line2D.Float(cx + R - tick, cy, cx + R + tick, cy));

        // "NC" wordmark.
        g.setFont(g.getFont().deriveFont(Font.BOLD, s * 0.20f));
        FontMetrics fm = g.getFontMetrics();
        String t = "NC";
        float tw = fm.stringWidth(t);
        GradientPaint txt = new GradientPaint(0, cy - s*0.1f, ORANGE, 0, cy + s*0.1f, PINK);
        g.setPaint(txt);
        g.drawString(t, cx - tw/2f, cy + fm.getAscent()/2f - s*0.02f);
    }

    static void writePng(BufferedImage img, File f) throws IOException {
        f.getParentFile().mkdirs();
        ImageIO.write(img, "png", f);
    }
}
