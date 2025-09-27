# FlowWeek – Infinite Canvas Weekly Planner
**문서 유형:** SRS + PRD (개발요청서 겸용)  
**버전:** v1.0  
**작성일:** 2025-09-28  
**요청자/담당:** Client / PM / 김태걸(Ryugi62)  
**커뮤니케이션 채널:** Upwork / Slack / Email  
**첨부(예상):** Figma 링크, 브랜드 가이드, 샘플 데이터(JSON/CSV), 아이콘/로고

---

> 이 문서는 **Google Gemini**에게 구현을 의뢰/지시할 때 그대로 전달 가능한 **실행 명세서**입니다.  
> “요구사항 → 구현 → 검증” 흐름으로 구성되어 있으며, **수용 기준(UAC)** 과 **마일스톤**이 포함되어 있습니다.

## 1) 배경 & 목표
- 단순 Todo가 아닌, 주간 타임라인 위에서 프로젝트·루틴·저널을 **흐름(Flow)** 으로 시각화/연결/추적하는 도구.
- ‘요일’과 무관하게 **멀티데이 흐름**을 만들고, 해당 흐름에 **노드(작업/메모/저널)** 를 배치·연결.
- 주간 전체를 **무한 가로 스크롤**로 탐색. 제공된 **Figma**와의 **픽셀 퍼펙트** 매칭.

**MVP 목표**
- 세로 요일 축 + **가로 무한 스크롤** 주간 캔버스
- **드래그/줌/패닝/링킹** 자연스럽고 빠르게 동작
- 1000+ 요소에서도 **60fps 근접** 인터랙션
- **실시간 동기화(Option A)** 또는 준실시간(낙관적 UI + 짧은 폴링)

**초기 성공 지표**
- 첫 플로우 생성까지 < 60초
- 1k 요소 초기 렌더 < 1.5s(캐시 후 < 800ms), 프레임 드랍 < 5%
- 1주차 활성 사용자 세션 길이 ≥ 8분

---

## 2) 사용자 & 핵심 시나리오
**페르소나**
- 메이커/개발자/디자이너: 주간 목표/프로젝트 흐름을 한 화면에서 계획
- 학생/연구자/작가: 날짜 걸친 리서치 흐름 + 저널 기록

**시나리오**
1. 새 보드 → ‘플로우(트랙)’ 생성 → 여러 요일을 가로지르며 확장  
2. 플로우에 **노드(Task/Note/Journal)** 배치, 노드 간 **링크**로 관계 맵 구성  
3. **줌/패닝**으로 주간 전개 탐색, **드래그**로 재배치  
4. 더블클릭 → **디테일 패널**(설명/태그/날짜/체크박스/리치텍스트)  
5. 완료/상태 변경은 **낙관적 업데이트** 후 서버 동기화

---

## 3) 범위 (MVP)
**In-Scope**
- 보드(주간 뷰): 세로 요일 축 + 가로 무한 캔버스
- 노드 타입: **Task(체크박스), Note(리치텍스트), Journal(타임스탬프)**
- 노드 CRUD, 멀티 선택, 드래그 이동, 스냅(옵션)
- 링크(노드-노드) 생성/삭제, 라벨(옵션)
- 줌/패닝(휠/트랙패드/터치), 모드 전환(선택/패닝/링크)
- 검색/필터(태그, 상태, 텍스트)
- Undo/Redo(로컬 히스토리)
- 기본 협업 **Option A**: 실시간 커서/선택 프리뷰(동시 편집 아님)
- 반응형(데스크톱 우선, 태블릿 대응)

**Out-of-Scope (후순위)**
- 모바일폰 완전 대응, 템플릿 갤러리, 2주/월간 뷰, 고급 권한, 버전 브랜칭, AI 보조,
  오프라인 퍼스트, 고급 내보내기(PDF/PNG/SVG)

---

## 4) UX 요구사항
- **Figma 픽셀 퍼펙트**(간격/타이포/컬러 토큰 일치)
- **핫키**: `V(선택)`, `H(패닝)`, `L(링크)`, `Ctrl/⌘+Z(Undo)`, `Ctrl/⌘+F(검색)`
- **컨텍스트 메뉴**: 노드/링크(복제, 삭제, 잠금 등)
- **가이드/Snap**: 동일 Y축 정렬, 플로우 레일 단위 스냅(옵션)
- **접근성(A11y)**: 키보드 탐색, ARIA 라벨, 명도 대비 준수

---

## 5) 기술 아키텍처 제안
### (A) 프론트엔드
- **React + TypeScript** (+ Vite 또는 Next.js App Router)
- **상태관리**: Zustand(로컬 UI) + React Query(서버 상태)
- **렌더링 엔진**
  - 권장: **Canvas 2D + OffscreenCanvas + WebWorker**, 일부 UI(SVG/DOM) 오버레이
  - 차선: SVG(개발 쉬움, 대량 성능 한계) / 차후: WebGL(PixiJS, 확장성 최고)
- **공간 인덱스 & 히트테스트**: Quadtree/R-Tree + 히트맵
- **링크 라우팅**: 직선/직교/베지어, 충돌 회피
- **Undo/Redo**: immer + 커맨드 스택

### (B) 백엔드 & 실시간
- **API**: REST(초기) 또는 tRPC
- **DB**: PostgreSQL (JSONB 확장필드)
- **실시간(선택)**
  - **Option A**: Pusher/Supabase Realtime → presence/selection, 문서 잠금 수준
  - **Option B**: Y.js + WebSocket 서버(CRDT, 동시 편집) — 차후 전환 경로만 마련
- **인증/권한**: Email Magic Link or OAuth, RBAC(소유자/편집자/뷰어)
- **보안**: JWT, RateLimit, 감사로그

### (C) 성능 전략
- 뷰포트 **가상화**, 타일링, 레이어 분리
- `requestAnimationFrame` 배치, 입력 스로틀/디바운스
- **OffscreenCanvas + Worker** 로 레이아웃/히트테스트 분산
- 텍스트 라벨 **비트맵/atlas 캐시**
- 목표: **1k+ 요소**에서 **60fps 근사**

---

## 6) 데이터 모델(초안)
```sql
-- 논리 모델(요약)
User(id, email, name, avatar, createdAt)
Board(id, name, startWeekISO, ownerId, createdAt)
Membership(id, boardId, userId, role)                -- owner|editor|viewer
Flow(id, boardId, name, color, yLane, "order", createdAt)
Node(id, boardId, flowId, type, x, y, width, height,
     title, content, status, tags, meta, createdAt)   -- type: task|note|journal
Edge(id, boardId, sourceNodeId, targetNodeId, label, style, createdAt)
ActivityLog(id, boardId, userId, action, payload, createdAt)
Tag(id, boardId, label, color)

-- 인덱스 제안
-- Board 범위 질의, 뷰포트(bbox) 조회, 엣지 소스 고정 탐색 성능 확보
CREATE INDEX ON Node(boardId, x, y);
CREATE INDEX ON Edge(boardId, sourceNodeId);
CREATE INDEX ON Flow(boardId, yLane);
```

---

## 7) 기능 상세 명세
- **보드/주간 뷰**: ISO 주 시작일 기준 레일 생성, 무한 가로 스크롤
- **플로우**: yLane로 수직 정렬, 색상/라벨
- **노드**: 드래그, 리사이즈(옵션), 더블클릭 편집, 상태 토글(Task)
- **링크**: 드래그 연결, 스냅/하이라이트, 충돌 회피 라우팅
- **검색/필터**: 태그/상태/텍스트
- **단축키/우클릭**: 편집/복제/삭제/잠금/그룹화(옵션)
- **협업(Option A)**: 동시 커서/선택 표시(latency < 200ms, 동일 리전)

---

## 8) API 계약(초안)
**Auth**
- `POST /auth/login` → magic-link 요청
- `POST /auth/callback` → 토큰 발급

**Boards**
- `GET /boards` / `POST /boards` / `GET /boards/:id` / `PATCH /boards/:id`

**Flows**
- `GET /boards/:id/flows` / `POST /boards/:id/flows` / `PATCH /flows/:id` / `DELETE /flows/:id`

**Nodes**
- `GET /boards/:id/nodes?bbox=...&q=...`   ← 뷰포트/검색 가상화
- `POST /boards/:id/nodes` / `PATCH /nodes/:id` / `DELETE /nodes/:id`
- `POST /boards/:id/nodes/bulk`            ← 배치 저장

**Edges**
- `GET /boards/:id/edges` / `POST /boards/:id/edges` / `DELETE /edges/:id`

**Realtime (옵션)**
- WS: `ws://.../boards/:id` (cursor, selection, presence, CRDT-update)

---

## 9) 비기능 요구사항(NFR)
- **성능**: 1k+ 요소에서 드래그/줌/패닝 60fps 근사
- **보안**: OWASP Top 10 예방, JWT 만료/갱신, Rate Limit
- **가용성**: 99.5%(MVP), Sentry/로깅
- **국제화**: i18n 준비(EN 기본, KO 확장)
- **접근성**: WCAG 2.1 AA 지향

---

## 10) 분석/로그/텔레메트리
- 이벤트: 노드/링크 생성/삭제, 세션 길이, 뷰포트 이동량
- 퍼포먼스: FPS, 렌더 시간, 워커 처리 시간
- 개인정보 비식별화, 옵트아웃

---

## 11) 개발 계획 & 마일스톤(예시, 10주)
- **M0 (0.5주)**: 킥오프, Figma 정합성 검토, 아키 최종(Canvas2D 하이브리드)
- **M1 (1–2주)**: 스캐폴드, 보드/주간 그리드, 줌/패닝, 렌더 루프
- **M2 (3–4주)**: 노드/링크 CRUD, 히트테스트, 멀티선택, 단축키
- **M3 (5–6주)**: 검색/필터, Undo/Redo, 성능 최적화(가상화/타일링)
- **M4 (7–8주)**: 협업 Option A, 액티비티 로그, 권한
- **M5 (9주)**: QA/버그픽스, 반응형/접근성, 로깅/분석
- **M6 (10주)**: UAT, 성능 벤치마크 리포트, 런치 체크리스트

**인도물**
- 운영 가능한 MVP, README/아키문서, 테스트 스크립트, 성능 벤치마크 결과

---

## 12) 테스트 전략
- **단위/통합**: 렌더 유틸, 히트테스트, 라우팅, 상태전이
- **E2E**: 핵심 플로우(노드/링크 생성·이동·검색)
- **성능**: 1k/5k 샘플 데이터 자동 벤치마크(FPS/응답 시간)
- **크로스브라우저**: Chrome/Edge/Safari 최근 2버전, 태블릿 Safari

---

## 13) 수용 기준(UAC)
- 1k 요소에서 드래그/줌 체감 지연 없음(정량 지표 첨부)
- Figma 대비 시각 차이 ≤ 2px/토큰 일치
- 노드/링크 CRUD, Undo/Redo, 검색/필터 정상
- 협업 Option A: 커서/선택 반영 지연 < 200ms(동일 리전)

---

## 14) 위험/완화
- **성능 병목**: 캔버스 레이어 분리/워커·오프스크린 활용
- **실시간 복잡도**: MVP는 Option A로 범위 제어, 이후 Y.js 전환 경로
- **브라우저 차이**: 텍스트/IME/히트테스트 차이 E2E로 커버
- **스코프 크립**: CR 프로세스 운영(변경요청 템플릿/로그)

---

## 15) 가정/전제
- Figma는 컴포넌트/토큰 구조 정리 & Export 가능
- 백엔드 신규 구축 또는 제공 API 명세 제공
- 1k/5k 더미 데이터 제공

---

## 16) 비용/과금(예시)
- 시급 **$20–35** (Upwork 조건 준수)  
- 마일스톤 기준 청구(M1~M6), UAT 통과 후 잔금

---

## 17) 클라이언트 제출용 Q&A 초안
1) **생산성/마인드맵/저널 사용 경험?**  
   - Obsidian(데일리 노트/태그), Notion(프로젝트 DB), Excalidraw/Whimsical(아이디어 다이어그램) 실사용.
2) **무한 캔버스/다이어그램 앱 경험?**  
   - Canvas 2D 보드/플로우차트 에디터, 1k+ 가상화/히트테스트/링크 라우팅 경험. 역할: FE 리드.
3) **실시간(Firebase/WebSocket) 경험?**  
   - Supabase Realtime/Pusher, Custom WS. Presence/selection + 낙관적 UI 정합성 재조정.
4) **1,000+ 드래그 요소 성능 전략?**  
   - 가상화/레이어/워커/쿼드트리/텍스트 아틀라스/배치 업데이트.
5) **프레임워크 선택 이유?**  
   - React+TS(+Vite/Next) + Canvas2D 하이브리드: 생산성·생태계·테스트 용이, WebGL 확장 경로.

---

## 18) 릴리즈 & 핸드오프
- 운영 빌드, env/스크립트, 성능 리포트, 사용 가이드(1p), 5분 스크린캐스트

---

## 19) 변경 관리
- 변경요청 템플릿/이슈 트래킹(Jira/Linear), 주간 리포트, 데모 데이

---

### 부록 A. 화면 목록(요약)
- Board(주간 캔버스), Node Detail Panel, Global Search Modal, Settings(단축키/그리드 옵션)

### 부록 B. 컴포넌트 초안
- CanvasLayer, NodeView, EdgeView, InteractionManager, Minimap(옵션), Toolbar, ContextMenu, DetailDrawer

