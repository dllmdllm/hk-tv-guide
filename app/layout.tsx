import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "今晚睇咩｜香港免費電視節目表",
  description: "一次過查看香港 14 條免費電視頻道，由 00:00 至 23:59 的每日節目表。",
  applicationName: "今晚睇咩",
};

export const viewport: Viewport = {
  themeColor: "#10100f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-HK">
      <body>{children}</body>
    </html>
  );
}
