# AI 역할 분류 평가 결과

생성 일시: 2026-04-21T09:59:09.430Z

## 요약

- **정확도**: 71.1% (155/218)
- **테스트된 샘플**: 218개

## 카테고리별 성능

- **pure**: 68.8% (99/144)
- **mixed**: 70.0% (28/40)
- **ambiguous**: 87.5% (14/16)
- **consistency**: 77.8% (14/18)

## 난이도별 성능

- **쉬움**: 69.4% (34/49)
- **보통**: 67.3% (74/110)
- **어려움**: 79.7% (47/59)

## 신뢰도 분포

- **30%-50%**: 44.9% (35/78)
- **50%-70%**: 72.1% (49/68)
- **70%-85%**: 100.0% (30/30)
- **85%-100%**: 97.6% (41/42)

## 상세 샘플 결과

| ID | 의도 | 예측 | 신뢰도 | 정답 | 난이도 | 카테고리 |
|---|---|---|---|---|---|---|
| 001 | feature | feature | 79.5% | ✓ | easy | pure |
| 002 | feature | feature | 79.0% | ✓ | easy | pure |
| 003 | feature | feature | 83.1% | ✓ | normal | pure |
| 004 | feature | feature | 83.4% | ✓ | normal | pure |
| 005 | feature | feature | 86.1% | ✓ | normal | pure |
| 006 | feature | feature | 83.5% | ✓ | normal | pure |
| 007 | feature | feature | 87.4% | ✓ | hard | pure |
| 008 | feature | feature | 87.4% | ✓ | hard | pure |
| 009 | debug | debug | 85.1% | ✓ | easy | pure |
| 010 | debug | debug | 85.1% | ✓ | easy | pure |
| 011 | debug | debug | 84.2% | ✓ | normal | pure |
| 012 | debug | debug | 88.1% | ✓ | normal | pure |
| 013 | debug | debug | 87.4% | ✓ | normal | pure |
| 014 | debug | debug | 88.2% | ✓ | normal | pure |
| 015 | debug | debug | 91.3% | ✓ | hard | pure |
| 016 | debug | debug | 90.9% | ✓ | hard | pure |
| 017 | refactor | refactor | 81.5% | ✓ | easy | pure |
| 018 | refactor | refactor | 81.9% | ✓ | easy | pure |
| 019 | refactor | refactor | 85.4% | ✓ | normal | pure |
| 020 | refactor | refactor | 86.7% | ✓ | normal | pure |
| 021 | refactor | refactor | 86.8% | ✓ | normal | pure |
| 022 | refactor | refactor | 86.7% | ✓ | normal | pure |
| 023 | refactor | refactor | 89.7% | ✓ | hard | pure |
| 024 | refactor | refactor | 90.2% | ✓ | hard | pure |
| 025 | review | review | 92.1% | ✓ | easy | pure |
| 026 | review | review | 83.6% | ✓ | easy | pure |
| 027 | review | review | 86.5% | ✓ | normal | pure |
| 028 | review | review | 88.4% | ✓ | normal | pure |
| 029 | review | review | 87.8% | ✓ | normal | pure |
| 030 | review | review | 89.3% | ✓ | normal | pure |
| 031 | review | review | 90.3% | ✓ | hard | pure |
| 032 | review | review | 88.8% | ✓ | hard | pure |
| 033 | writing | writing | 57.3% | ✓ | easy | pure |
| 034 | writing | writing | 50.4% | ✓ | easy | pure |
| 035 | writing | writing | 55.7% | ✓ | normal | pure |
| 036 | writing | writing | 47.5% | ✓ | normal | pure |
| 037 | writing | writing | 57.7% | ✓ | normal | pure |
| 038 | writing | writing | 59.6% | ✓ | normal | pure |
| 039 | writing | writing | 59.1% | ✓ | hard | pure |
| 040 | writing | writing | 67.2% | ✓ | hard | pure |
| 041 | design | design | 69.2% | ✓ | easy | pure |
| 042 | design | design | 74.5% | ✓ | easy | pure |
| 043 | design | design | 73.8% | ✓ | normal | pure |
| 044 | design | design | 77.1% | ✓ | normal | pure |
| 045 | design | design | 74.2% | ✓ | normal | pure |
| 046 | design | design | 74.1% | ✓ | normal | pure |
| 047 | design | design | 78.4% | ✓ | hard | pure |
| 048 | design | design | 83.8% | ✓ | hard | pure |
| 049 | devops | devops | 70.3% | ✓ | easy | pure |
| 050 | devops | devops | 69.7% | ✓ | easy | pure |
| 051 | devops | devops | 76.3% | ✓ | normal | pure |
| 052 | devops | devops | 79.0% | ✓ | normal | pure |
| 053 | devops | devops | 79.4% | ✓ | normal | pure |
| 054 | devops | devops | 75.9% | ✓ | normal | pure |
| 055 | devops | devops | 80.1% | ✓ | hard | pure |
| 056 | devops | devops | 82.8% | ✓ | hard | pure |
| 057 | data | data | 86.9% | ✓ | easy | pure |
| 058 | data | data | 88.1% | ✓ | easy | pure |
| 059 | data | data | 90.6% | ✓ | normal | pure |
| 060 | data | data | 90.7% | ✓ | normal | pure |
| 061 | data | data | 91.5% | ✓ | normal | pure |
| 062 | data | data | 91.5% | ✓ | normal | pure |
| 063 | data | data | 93.3% | ✓ | hard | pure |
| 064 | data | data | 92.0% | ✓ | hard | pure |
| 065 | test | test | 89.1% | ✓ | easy | pure |
| 066 | test | test | 90.5% | ✓ | easy | pure |
| 067 | test | test | 92.6% | ✓ | normal | pure |
| 068 | test | test | 92.3% | ✓ | normal | pure |
| 069 | test | test | 91.5% | ✓ | normal | pure |
| 070 | test | test | 92.7% | ✓ | normal | pure |
| 071 | test | test | 95.1% | ✓ | hard | pure |
| 072 | test | test | 93.8% | ✓ | hard | pure |
| 073 | feature | debug | 55.5% | ✓ | easy | mixed |
| 074 | feature | debug | 53.9% | ✓ | easy | mixed |
| 075 | feature | debug | 55.2% | ✓ | easy | mixed |
| 076 | feature | debug | 55.0% | ✓ | easy | mixed |
| 077 | feature | debug | 54.1% | ✓ | normal | mixed |
| 078 | refactor | debug | 54.5% | ✓ | normal | mixed |
| 079 | refactor | debug | 56.1% | ✓ | normal | mixed |
| 080 | refactor | debug | 55.0% | ✓ | normal | mixed |
| 081 | debug | test | 55.4% | ✓ | normal | mixed |
| 082 | debug | test | 56.8% | ✓ | normal | mixed |
| 083 | debug | test | 54.4% | ✓ | normal | mixed |
| 084 | feature | feature | 57.0% | ✓ | normal | mixed |
| 085 | feature | feature | 60.0% | ✓ | normal | mixed |
| 086 | data | feature | 52.3% | ✓ | normal | mixed |
| 087 | data | feature | 52.7% | ✓ | hard | mixed |
| 088 | writing | review | 86.0% | ✓ | hard | mixed |
| 089 | writing | review | 86.2% | ✓ | hard | mixed |
| 090 | devops | debug | 77.3% | ✓ | hard | mixed |
| 091 | devops | debug | 77.5% | ✓ | hard | mixed |
| 092 | review | refactor | 53.3% | ✓ | hard | mixed |
| 093 | review | feature | 54.6% | ✓ | easy | ambiguous |
| 094 | review | feature | 54.7% | ✓ | easy | ambiguous |
| 095 | review | feature | 54.0% | ✓ | easy | ambiguous |
| 096 | data | refactor | 46.5% | ✓ | normal | ambiguous |
| 097 | data | refactor | 48.3% | ✓ | normal | ambiguous |
| 098 | writing | feature | 78.7% | ✓ | normal | ambiguous |
| 099 | writing | feature | 78.2% | ✓ | normal | ambiguous |
| 100 | devops | debug | 49.0% | ✓ | hard | ambiguous |
| sample-101 | feature | review | 37.7% | ✗ | hard | pure |
| sample-102 | feature | review | 45.8% | ✗ | normal | pure |
| sample-103 | feature | review | 37.8% | ✗ | normal | pure |
| sample-104 | feature | review | 46.3% | ✗ | normal | pure |
| sample-105 | feature | review | 38.8% | ✗ | hard | pure |
| sample-106 | feature | review | 39.7% | ✗ | hard | pure |
| sample-107 | feature | review | 45.9% | ✗ | normal | pure |
| sample-108 | feature | review | 37.6% | ✗ | normal | pure |
| sample-109 | debug | review | 66.7% | ✗ | easy | pure |
| sample-110 | debug | review | 43.8% | ✗ | easy | pure |
| sample-111 | debug | review | 45.0% | ✗ | hard | pure |
| sample-112 | debug | debug | 45.6% | ✓ | hard | pure |
| sample-113 | debug | debug | 48.5% | ✓ | normal | pure |
| sample-114 | debug | review | 57.7% | ✗ | normal | pure |
| sample-115 | debug | debug | 41.5% | ✓ | hard | pure |
| sample-116 | debug | review | 44.8% | ✗ | normal | pure |
| sample-117 | refactor | review | 40.0% | ✗ | normal | pure |
| sample-118 | refactor | review | 50.6% | ✗ | normal | pure |
| sample-119 | refactor | review | 48.2% | ✗ | easy | pure |
| sample-120 | refactor | review | 45.1% | ✗ | easy | pure |
| sample-121 | refactor | review | 48.0% | ✗ | normal | pure |
| sample-122 | refactor | review | 59.7% | ✗ | normal | pure |
| sample-123 | refactor | refactor | 37.8% | ✓ | normal | pure |
| sample-124 | refactor | review | 49.4% | ✗ | normal | pure |
| sample-125 | review | review | 54.8% | ✓ | easy | pure |
| sample-126 | review | review | 63.7% | ✓ | normal | pure |
| sample-127 | review | review | 54.8% | ✓ | normal | pure |
| sample-128 | review | review | 55.2% | ✓ | hard | pure |
| sample-129 | review | review | 60.3% | ✓ | easy | pure |
| sample-130 | review | review | 66.7% | ✓ | hard | pure |
| sample-131 | review | review | 45.5% | ✓ | normal | pure |
| sample-132 | review | review | 57.0% | ✓ | normal | pure |
| sample-133 | writing | review | 41.9% | ✗ | easy | pure |
| sample-134 | writing | review | 46.1% | ✗ | easy | pure |
| sample-135 | writing | review | 61.0% | ✗ | normal | pure |
| sample-136 | writing | review | 44.4% | ✗ | easy | pure |
| sample-137 | writing | writing | 40.7% | ✓ | normal | pure |
| sample-138 | writing | writing | 45.2% | ✓ | normal | pure |
| sample-139 | writing | writing | 40.0% | ✓ | normal | pure |
| sample-140 | writing | writing | 43.2% | ✓ | easy | pure |
| sample-141 | design | design | 48.6% | ✓ | easy | pure |
| sample-142 | design | design | 54.5% | ✓ | normal | pure |
| sample-143 | design | review | 51.2% | ✗ | hard | pure |
| sample-144 | design | review | 49.7% | ✗ | hard | pure |
| sample-145 | design | design | 47.3% | ✓ | normal | pure |
| sample-146 | design | design | 48.3% | ✓ | hard | pure |
| sample-147 | design | design | 45.1% | ✓ | normal | pure |
| sample-148 | design | design | 44.8% | ✓ | hard | pure |
| sample-149 | devops | devops | 51.9% | ✓ | easy | pure |
| sample-150 | devops | review | 43.2% | ✗ | normal | pure |
| sample-151 | devops | review | 39.3% | ✗ | normal | pure |
| sample-152 | devops | devops | 45.3% | ✓ | easy | pure |
| sample-153 | devops | devops | 41.4% | ✓ | hard | pure |
| sample-154 | devops | review | 34.6% | ✗ | hard | pure |
| sample-155 | devops | review | 44.3% | ✗ | normal | pure |
| sample-156 | devops | review | 39.2% | ✗ | normal | pure |
| sample-157 | data | review | 52.4% | ✗ | normal | pure |
| sample-158 | data | review | 51.5% | ✗ | normal | pure |
| sample-159 | data | review | 52.1% | ✗ | hard | pure |
| sample-160 | data | review | 51.4% | ✗ | easy | pure |
| sample-161 | data | review | 57.1% | ✗ | normal | pure |
| sample-162 | data | review | 87.5% | ✗ | normal | pure |
| sample-163 | data | debug | 42.9% | ✗ | normal | pure |
| sample-164 | data | review | 68.8% | ✗ | normal | pure |
| sample-165 | test | review | 37.5% | ✗ | hard | pure |
| sample-166 | test | review | 59.4% | ✗ | easy | pure |
| sample-167 | test | review | 41.3% | ✗ | easy | pure |
| sample-168 | test | test | 50.0% | ✓ | hard | pure |
| sample-169 | test | review | 48.1% | ✗ | normal | pure |
| sample-170 | test | review | 38.6% | ✗ | hard | pure |
| sample-171 | test | review | 44.7% | ✗ | normal | pure |
| sample-172 | test | test | 37.4% | ✓ | hard | pure |
| sample-173 | feature | review | 41.2% | ✗ | easy | mixed |
| sample-174 | feature | review | 47.4% | ✗ | hard | mixed |
| sample-175 | feature | review | 46.2% | ✗ | easy | mixed |
| sample-176 | feature | review | 39.6% | ✗ | easy | mixed |
| sample-177 | feature | feature | 41.1% | ✓ | hard | mixed |
| sample-178 | refactor | review | 41.9% | ✗ | hard | mixed |
| sample-179 | refactor | review | 46.5% | ✗ | normal | mixed |
| sample-180 | refactor | review | 41.8% | ✗ | normal | mixed |
| sample-181 | debug | review | 52.4% | ✗ | normal | mixed |
| sample-182 | debug | debug | 44.6% | ✓ | normal | mixed |
| sample-183 | debug | debug | 43.3% | ✓ | easy | mixed |
| sample-184 | feature | review | 38.0% | ✗ | normal | mixed |
| sample-185 | feature | feature | 44.2% | ✓ | normal | mixed |
| sample-186 | data | review | 59.4% | ✗ | normal | mixed |
| sample-187 | data | review | 44.1% | ✗ | normal | mixed |
| sample-188 | writing | writing | 43.8% | ✓ | easy | mixed |
| sample-189 | writing | writing | 41.5% | ✓ | easy | mixed |
| sample-190 | devops | review | 37.6% | ✗ | easy | mixed |
| sample-191 | devops | devops | 40.2% | ✓ | hard | mixed |
| sample-192 | review | review | 52.8% | ✓ | hard | mixed |
| sample-193 | feature | feature | 38.7% | ✓ | hard | ambiguous |
| sample-194 | feature | review | 47.4% | ✓ | normal | ambiguous |
| sample-195 | review | review | 60.9% | ✓ | hard | ambiguous |
| sample-196 | data | review | 60.9% | ✗ | normal | ambiguous |
| sample-197 | data | review | 63.1% | ✗ | easy | ambiguous |
| sample-198 | writing | writing | 46.4% | ✓ | normal | ambiguous |
| sample-199 | writing | writing | 47.0% | ✓ | hard | ambiguous |
| sample-200 | devops | devops | 42.2% | ✓ | hard | ambiguous |
| sample-consistency-ambiguous-boundary-run1 | review | debug | 74.7% | ✓ | hard | consistency |
| sample-consistency-ambiguous-boundary-run2 | review | debug | 75.3% | ✓ | hard | consistency |
| sample-consistency-ambiguous-boundary-run3 | review | debug | 77.0% | ✓ | hard | consistency |
| sample-consistency-mixed-debug-feature-run1 | debug | debug | 58.6% | ✓ | hard | consistency |
| sample-consistency-mixed-debug-feature-run2 | debug | debug | 57.3% | ✓ | hard | consistency |
| sample-consistency-mixed-debug-feature-run3 | debug | debug | 59.2% | ✓ | hard | consistency |
| sample-consistency-pure-feature-run1 | feature | feature | 57.2% | ✓ | normal | consistency |
| sample-consistency-pure-feature-run2 | feature | feature | 55.1% | ✓ | normal | consistency |
| sample-consistency-pure-feature-run3 | feature | feature | 53.3% | ✓ | normal | consistency |
| sample-consistency-무한 루프 버그 찾기 + 리-run1 | debug | debug | 51.6% | ✓ | normal | consistency |
| sample-consistency-로그인 기능 구현하기-run1 | feature | feature | 39.5% | ✓ | normal | consistency |
| sample-consistency-이 코드 어떻게 작동하나?-run1 | review | review | 51.5% | ✓ | normal | consistency |
| sample-consistency-무한 루프 버그 찾기 + 리-run2 | debug | review | 44.0% | ✗ | normal | consistency |
| sample-consistency-로그인 기능 구현하기-run2 | feature | review | 53.4% | ✗ | normal | consistency |
| sample-consistency-이 코드 어떻게 작동하나?-run2 | review | review | 54.5% | ✓ | normal | consistency |
| sample-consistency-무한 루프 버그 찾기 + 리-run3 | debug | review | 51.9% | ✗ | normal | consistency |
| sample-consistency-로그인 기능 구현하기-run3 | feature | review | 39.8% | ✗ | normal | consistency |
| sample-consistency-이 코드 어떻게 작동하나?-run3 | review | review | 48.0% | ✓ | normal | consistency |
