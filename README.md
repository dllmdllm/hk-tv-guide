# 今晚睇咩

香港 14 條免費電視頻道的每日節目表，支援前後日期、頻道篩選、搜尋及「直播中」進度。

## 本機使用

```bash
npm install
npm run fetch-data
npm run dev
```

## 資料來源

- 香港電台公開節目表（31–35）
- HOY 公開節目表（76–78）
- TVB / myTV SUPER 公開節目表（81–84）
- ViuTV 公開節目表（96、99）

節目如有更改，以電視台最後公布為準。程式只保存節目名稱、播放時間、簡介及官方來源連結，不保存影片內容。

## GitHub Pages

Repository 的 **Settings → Pages → Source** 選擇 **GitHub Actions**。Workflow 會每四小時更新節目資料、保存每日 JSON archive，再發布靜態網站。
