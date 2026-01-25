#!/bin/bash
gcloud run deploy hometeacher-api-staging --source . --platform managed --region asia-northeast1 --allow-unauthenticated --min-instances 0 --max-instances 5 --memory 512Mi --cpu 1 --timeout 60s --set-env-vars "NODE_ENV=staging,GEMINI_MODEL=gemini-2.5-flash-lite" --update-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest"
