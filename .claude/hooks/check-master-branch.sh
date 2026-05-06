#!/bin/bash
# master 브랜치에서 파일 수정 시 경고 (memradar 기본 브랜치)
branch=$(git -C "$CLAUDE_PROJECT_DIR" branch --show-current 2>/dev/null)
if [ "$branch" = "master" ]; then
  echo '{"systemMessage":"⚠️ MASTER 브랜치입니다. memradar는 master에서 직접 작업하는 패턴이지만, 큰 변경은 feature 브랜치 후 PR 머지를 권장합니다."}'
fi
