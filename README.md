# 今晚睇咩

香港免費電視節目表。

Pages: https://dllmdllm.github.io/hk-tv-guide/

## 本機

npm install
npm run fetch-data
npm run test:data
npm run dev

## 保留政策

public/data 每日 JSON 約保留 30 日，由 fetch-data 清理。

頻道設定：lib/channels.json

## 資料來源

- 香港電台（31–35）
- HOY（76–78）
- TVB / myTV SUPER（81–84）
- ViuTV（96、99）

節目如有更改，以電視台最後公布為準。

## GitHub Pages

Settings → Pages → Source 選 GitHub Actions。Workflow 會先 test:data，通過後才更新 public/data 並部署。
