# 7932 昱鐳應材主力雷達

純 HTML/CSS/JavaScript 靜態網站，可直接部署到 GitHub Pages，沒有伺服器與資料庫依賴。

## 發布

本站使用 repository 既有的 GitHub Pages「從分支發布」設定。推送到 `main` 後，GitHub 會直接發布根目錄的靜態檔案。

## 本地每日更新

唯一正式更新入口是 `../7932_strategy/update_website_scheduled.bat`。Windows 工作排程於週一至週五 18:15 執行後，會在本機依序更新 7932 興櫃分點、核心成本與產業點火雷達，驗證 JSON，再提交並推送 `data/` 到 GitHub Pages。網站不需要伺服器、資料庫或 GitHub Actions。

追蹤器會依 7932 全部可得歷史的累積淨投入資金選出 20 個核心候選，記錄每日順位升降及當日部位增減，再計算每日、近 5、近 10、近 20 個交易日的買賣超張數與金額。7932 行情採 TPEx 興櫃每日加權均價，不用收盤價代替。

產業雷達由本機 Python 標準函式庫抓取台光電、M8/M9 proxy basket、PPO/MPPO proxy/event 與富喬/台玻 proxy，寫入 `data/current.json`、`data/catalyst.json`、`data/events.json` 與逐日歷史。主力籌碼與外部催化獨立評分，再以 55% / 45% 組合點火分數；無 LLM 判讀，也不偽造 M8/M9 報價。

推估成本使用 EMdss004 的每筆「分點 × 成交價位」買進明細加權；原始檔未提供同日成交時間，故同日買賣採比例留存估算，並同時提供可能成本區間與採用的價位明細筆數。

本網站把分點視為行為節點，並不把分點認定為特定自然人或共同實益擁有人。影響力排名是歷史關聯，不是因果或投資建議。
