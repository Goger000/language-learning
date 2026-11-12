# 語言學習系統

自用的手機語言學習 PWA。目前內容：韓文（旅遊用，零基礎起步）。

## 設計依據

| 方法 | 用在哪裡 |
|---|---|
| 間隔重複（FSRS-4.5） | 所有卡片的排程，`js/fsrs.js` |
| 提取練習 | 卡片先回想再看答案；課程用測驗而非重讀 |
| 立即回饋＋錯題重問 | 字母測驗答錯會排回佇列直到答對 |
| 語塊學習 | 會話以整句為單位，不拆文法 |
| 先輸入後輸出 | 每句先出「聽懂」卡，畢業後才解鎖「說出口」卡 |
| 辨音訓練 | 平音／送氣音／緊音的聽力對比題（第 5、6 課） |
| 交錯練習 | 複習卡與新卡混合出現 |

## 執行

```sh
npm test          # FSRS 與資料檢查
npm run serve     # http://localhost:8000
```

手機和電腦在同一個 Wi-Fi 時，可用 `http://<電腦IP>:8000` 在手機上試用（離線功能需要 HTTPS，部署後才會生效）。

## 結構

```
index.html, css/, sw.js, manifest.webmanifest   App 外殼與離線快取
js/fsrs.js      排程演算法
js/store.js     進度存在 localStorage，可匯出／匯入備份
js/tts.js       手機內建語音
js/app.js       畫面與流程
lang/<語言>/    語言包（課程、卡片內容）
tests/          node --test
```

新增語言：建立 `lang/<id>/index.js`（格式同 `lang/ko/index.js`），並在 `lang/index.js` 註冊。
修改檔案清單時記得更新 `sw.js` 的 `ASSETS` 和 `CACHE` 版本號。
