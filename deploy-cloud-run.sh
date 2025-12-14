#!/bin/bash
set -e

# TutoTuto API - Google Cloud Run デプロイスクリプト

echo "🚀 TutoTuto APIをGoogle Cloud Runにデプロイします..."

# シークレットの確認
echo "ℹ️  GEMINI_API_KEYはSecret Managerから読み込まれます"

# プロジェクトIDとリージョンの設定
PROJECT_ID=$(gcloud config get-value project)
REGION="asia-northeast1"  # 東京リージョン
SERVICE_NAME="hometeacher-api"

echo "📋 デプロイ設定:"
echo "  プロジェクトID: $PROJECT_ID"
echo "  リージョン: $REGION"
echo "  サービス名: $SERVICE_NAME"
echo ""

# Cloud Runにデプロイ
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60s \
  --set-env-vars "NODE_ENV=production,GEMINI_MODEL=gemini-2.0-flash-exp" \
  --update-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest"

echo ""
echo "✅ デプロイ完了！"
echo ""
echo "サービスURL:"
gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format 'value(status.url)'
