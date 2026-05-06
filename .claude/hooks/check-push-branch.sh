#!/bin/bash
# git push 전 master 브랜치 확인 — master면 사용자에게 명시 (memradar 릴리스는 로컬 npm publish 경로)
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.tool_input?.command||'')}catch{}})")

if echo "$COMMAND" | grep -q "git push"; then
  branch=$(git -C "$CLAUDE_PROJECT_DIR" branch --show-current 2>/dev/null)
  if [ "$branch" = "master" ]; then
    echo '{"decision":"allow","reason":"⚠️ master 브랜치 푸시. npm publish는 별도(.npmrc + 로컬 publish 경로)이지만 GitHub master는 즉시 갱신됩니다."}'
  fi
fi
