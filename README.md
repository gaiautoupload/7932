# 7932 昱鑽應材主力雷達

純 HTML/CSS/JavaScript 靜態網站，可直接部署到 GitHub Pages，沒有伺服器與資料庫依賴。

## 發布

1. 把此資料夾內容放到一個 GitHub repository 的根目錄。
2. 在 repository 的 **Settings → Pages → Source** 選擇 **GitHub Actions**。
3. 推送到 `main`，內附的 workflow 會自動發布。

## 每日更新

先在 `../7932_strategy/config.json` 設定每日檔來源，執行 `python tracker.py`。追蹤器會覆寫 `data/snapshot.json`；提交並推送該檔後，GitHub Pages 會自動顯示最新資料。

本網站把分點視為行為節點，並不把分點認定為特定自然人或共同實益擁有人。影響力排名是歷史關聯，不是因果或投資建議。
