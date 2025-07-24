# Twitter拡散分析ツール

Twitter上の情報拡散パターンを分析し、認知戦や情報操作の検出を行うための包括的なツールです。

## 機能

- **リアルタイムツイート収集**: キーワードや特定のツイートIDによるストリーミングと分析
- **ボット検出**: 機械学習による複数シグナル分析を用いたボット検出
- **協調行動検出**: アカウント間の協調的な行動パターンの特定
- **ネットワーク分析**: 拡散ネットワークの可視化と分析、インフルエンサーの特定
- **異常検出**: 拡散行動における異常パターンの検出
- **インタラクティブ可視化**: ネットワークグラフ、タイムライン、ヒートマップ、影響力ツリー

## 技術スタック

- **バックエンド**: Node.js, Express, TypeScript
- **フロントエンド**: React, TypeScript, D3.js, Cytoscape.js
- **データベース**: PostgreSQL (時系列データ), Neo4j (グラフデータ)
- **キャッシュ**: Redis
- **機械学習**: TensorFlow.js
- **リアルタイム通信**: Socket.io
- **コンテナ**: Docker

## 前提条件

- Docker と Docker Compose
- Twitter開発者アカウントとBearer Token
- Node.js 18以上（ローカル開発用）

## クイックスタート

1. リポジトリをクローン:
```bash
git clone <repository-url>
cd twitter-spread-analyzer
```

2. 環境設定をコピー:
```bash
cp .env.example .env
```

3. `.env`にTwitter Bearer Tokenを設定:
```
TWITTER_BEARER_TOKEN=your_bearer_token_here
```

4. すべてのサービスを起動:
```bash
./scripts/start.sh
```

5. アプリケーションにアクセス:
- フロントエンド: http://localhost:5173
- バックエンドAPI: http://localhost:3000
- Neo4jブラウザ: http://localhost:7474

## 開発モード（データベースなし）

```bash
# 依存関係のインストール
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 開発サーバーの起動
./scripts/dev.sh
```

## 使い方

1. ブラウザで http://localhost:5173 を開く
2. キーワードまたはツイートURLを入力
3. 「Analyze」ボタンをクリック
4. 以下の分析結果が表示されます：
   - **ネットワークグラフ**: 情報拡散の可視化
   - **タイムライン**: 時系列での拡散状況
   - **ボット検出結果**: 疑わしいアカウントのリスト
   - **協調行動**: 検出された協調的な行動パターン

## APIエンドポイント

### 分析
- `POST /api/analysis` - 新しい分析を作成
- `GET /api/analysis/:id` - 分析の詳細を取得
- `GET /api/analysis/:id/results` - 分析結果を取得

### データ収集
- `POST /api/collect/tweet` - ツイートの拡散データを収集
- `POST /api/collect/stream` - キーワードによるストリーミング開始
- `POST /api/collect/historical` - 過去データの収集

### アカウント分析
- `POST /api/accounts/analyze` - 特定アカウントの分析
- `POST /api/accounts/batch-analyze` - アカウントの一括分析

## モックデータの生成

実際のTwitter APIなしでテストする場合：

```bash
docker-compose exec backend npm run generate-mock-data
```

## アーキテクチャ

マイクロサービスアーキテクチャを採用し、以下のコンポーネントで構成：

1. **データコレクター**: Twitter APIとのインターフェース
2. **分析エンジン**: ボット検出、協調分析、ネットワーク分析
3. **ストレージ層**: 構造化データ用PostgreSQL、グラフ関係用Neo4j
4. **キャッシュ層**: APIレスポンスキャッシュとレート制限用Redis
5. **APIサーバー**: WebSocketサポート付きRESTful API
6. **フロントエンド**: インタラクティブ可視化を備えたReactダッシュボード

## セキュリティ考慮事項

- すべてのAPIエンドポイントで認証が必要
- Twitter APIコールのレート制限実装
- データ匿名化オプション利用可能
- すべての分析リクエストの監査ログ
- 本番環境でHTTPS強制

## トラブルシューティング

### サービスが起動しない場合

```bash
# ログを確認
docker-compose logs [service-name]

# すべてのコンテナを停止して再起動
docker-compose down
docker-compose up -d
```

### ポートが使用中の場合

```bash
# 使用中のポートを確認
lsof -i :3000  # Backend
lsof -i :5173  # Frontend
lsof -i :5432  # PostgreSQL
```

## ライセンス

このツールは防御的セキュリティ目的でのみ設計されています。情報の完全性保護のために責任を持って倫理的に使用してください。