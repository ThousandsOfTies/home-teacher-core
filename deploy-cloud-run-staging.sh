#!/bin/bash

# TutoTuto API - Google Cloud Run ステージング環境デプロイスクリプト

echo "🚀 TutoTuto API (STAGING) をGoogle Cloud Runにデプロイします..."

# シークレットの確認
echo "ℹ️  GEMINI_API_KEYはSecret Managerから読み込まれます"

# プロジェクトIDとリージョンの設定
PROJECT_ID=$(gcloud config get-value project)
REGION="asia-northeast1"  # 東京リージョン
SERVICE_NAME="hometeacher-api-staging"  # ステージング用サービス名

echo "📋 デプロイ設定 [STAGING]:"
echo "  プロジェクトID: $PROJECT_ID"
echo "  リージョン: $REGION"
echo "  サービス名: $SERVICE_NAME"
echo ""

# Cloud Runにデプロイ
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 5 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60s \
  --set-env-vars "NODE_ENV=staging,GEMINI_MODEL=gemini-2.5-flash-lite" \
  --update-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ ステージングデプロイ完了！"
  echo ""
  echo "サービスURL:"
  gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)'
  echo ""
  echo "⚠️ フロントエンドの VITE_API_URL を更新してください"
else
  echo ""
  echo "❌ デプロイに失敗しました"
  exit 1
fi
