#!/bin/bash
# Memory + 하네스 감사 카운터 — SessionStart 시 증가, 10세션마다 점검 알림.
# memradar 메모리 디렉토리 옆에 카운터 파일을 둔다.

COUNTER_FILE="$HOME/.claude/projects/d--Work-vibe-promptale/memory/.audit-counter"
INTERVAL=10

if [ -f "$COUNTER_FILE" ]; then
    COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
else
    COUNT=0
fi

# 카운터 파일이 깨졌을 때 안전 기본값
if ! [[ "$COUNT" =~ ^[0-9]+$ ]]; then
    COUNT=0
fi

COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER_FILE"

if [ $((COUNT % INTERVAL)) -eq 0 ]; then
    echo "{\"systemMessage\":\"🔔 감사 주기 도달 (세션 ${COUNT}회). .claude/knowledge/lessons/ 점검 + 자주 등장한 패턴을 .claude/skills/로 승격할지 확인하세요.\"}"
fi

exit 0
