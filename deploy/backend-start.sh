#!/bin/sh
set -eu
# 单实例单工作进程：当前 SQLite 与后台任务不能横向扩容。
python -m app.deployment_preflight
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}" --workers 1
