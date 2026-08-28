# 7932 昱鐳應材主力雷達

純 HTML/CSS/JavaScript 靜態網站，可直接部署到 GitHub Pages，沒有伺服器與資料庫依賴。

## 發布

本站使用 repository 既有的 GitHub Pages「從分支發布」設定。推送到 `main` 後，GitHub 會直接發布根目錄的靜態檔案。

## 每日更新

先在 `../7932_strategy/config.json` 設定每日檔來源，執行 `python tracker.py`。追蹤器會覆寫 `data/snapshot.json`；提交並推送該檔後，GitHub Pages 會自動顯示最新資料。

本網站把分點視為行為節點，並不把分點認定為特定自然人或共同實益擁有人。影響力排名是歷史關聯，不是因果或投資建議。
