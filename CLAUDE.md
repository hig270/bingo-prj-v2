# Bingo!2（作り直し）

大人数のビンゴ大会をデジタル化する Web アプリの作り直しプロジェクト。現在は**設計の相談中**で、実装はまだ始めていない。

## まず読むもの
- [docs/decisions.md](docs/decisions.md): 決定事項と未決定の論点。「次に話す論点」から再開する
- [docs/screens.md](docs/screens.md): 画面ごとの仕様
- [docs/background.md](docs/background.md): 旧実装（`hig270/syshack-bingo`）の調査結果

## 進め方の約束
- 論点は**1つずつ**ユーザーと相談して決める。提案は叩き台として示し、採用されるまで決定扱いにしない
- 決まったことはその都度 `docs/decisions.md` に記録し、未決定の欄から外す
- 会話・ドキュメントは日本語
- **型に関してできることはできる限りやる**（開発の原則。詳細は decisions.md の「型安全の方針」）
