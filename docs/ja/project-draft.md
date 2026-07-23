# AI Agent Skills Observability Project Draft

## 失敗履歴を持つ実行可能な集合知へ

> 歴史的な設計ドラフト。現在のセットアップ、パッケージング、MCP
> tools、dogfooding 手順については、`README.md`、`README_DEV.md`、
> `docs/architecture-decisions.md`、`docs/mcp-semantic-logger.md`、
> `docs/provider-history-event-source.md` を優先する。反復可能な demo
> 手順については `docs/type-fix-demo-mcp-test.md` を参照する。

## 1. 背景

AIエージェントと skills の登場によって、知識のあり方が変わり始めている。

従来、人類の知識蓄積の主要な単位は文章だった。書籍、論文、マニュアル、仕様書、ブログ記事、設計文書などは、人間が読み、理解し、解釈し、自分の行動へ変換するための媒体だった。

しかし AI エージェントにおける skills は、単なる文章ではない。skills は、自然言語で書かれた手順、判断条件、制約、参照資料、場合によっては scripts や tools を含み、AI エージェントによって直接利用されうる。

つまり、知識は「読むもの」から「実行されるもの」へ拡張されつつある。

本プロジェクトの出発点は、次の仮説である。

> 人類の知識蓄積の単位は、文章から、失敗履歴を持つ実行可能な作業単位へ移行しつつある。

この変化は、単なる AI エージェントの性能向上ではない。  
知識、経験、失敗、改善、信頼性が、実行可能な単位として蓄積・共有されるという、より大きな文明的変化である。

## 2. 問題意識

AIエージェントの skills は、個人や組織の専門性を再利用可能な単位にする可能性がある。それらは、人々が何を知っているかだけでなく、どのように行動し、判断し、レビューし、確認し、回復するかを記述しうる。

しかし skill は、単に共有されただけで集合知となるわけではない。信頼できる実行可能な集合知の単位となるには、skill は十分な失敗履歴を持ち、その履歴を通じて改善され、さらに自らがどの条件で破綻するのかを明示していなければならない。

そのためにはまず、現在の skill システムが抱える根本的な observability の問題に向き合う必要がある。

現在の skills には、次のような課題がある。

- skill が実際にいつ読まれたのか分からない
- skill が実際に使われたのか、単に参照されたのか分からない
- skill のどの前提・判断・手順が実行に影響したのか分からない
- skill が失敗したとき、その失敗を再構成する十分な証拠が残らない
- 失敗が skill の改善、ポストモーテム、回帰テストに接続されない
- skill の信頼性が、成功例ではなく失敗履歴によって評価されていない

tool call や MCP のような外部境界は比較的ログを取りやすい。  
一方で、skills は LLM のコンテキストと自然言語処理の内部に溶け込みやすく、呼び出しや適用判断を外部から観測しにくい。

したがって、本プロジェクトの最初の技術的課題は次のように定義できる。

> LLM の実行処理に溶け込む skill の activation と use を、できるだけ非侵襲にトレースする技術基盤を構築する。

## 3. プロジェクトの基本方針

本プロジェクトでは、最初から汎用的な skill marketplace や大規模な registry を作ることは目指さない。

まずは、自分自身が実際に使う小さな skill を対象に、以下のループを回す。

1. skill を作る
2. 実際に使う
3. 失敗する
4. 失敗を記録する
5. ポストモーテムする
6. skill を改善する
7. 回帰テストを追加する
8. 再び使う

この try-and-error のループを通じて、机上設計では見えない問題を発見する。

初期原則は次の通りである。

> skill のガバナンスは抽象設計しない。実際の失敗から育てる。

ただし、そのためにはまず、失敗を再構成できるだけの痕跡を残す必要がある。  
したがって MVP の第一目標は、postmortem platform そのものではなく、その前段にある skill observability substrate を構築することである。

## 4. MVP の中心テーマ

MVP の最初の焦点は、skill の品質評価そのものではなく、skill の呼び出しと適用をトレースする observability layer の構築である。

中心となる問いは次である。

> skill が失敗したとき、その失敗を再現・分析・改善・再評価できるだけの痕跡を残せているか？

特に、本プロジェクトでは次の問題に集中する。

> LLM の内部処理に溶け込む自然言語 skill の activation と declared use を、どこまで観測・突き合わせできるか。

tool call は比較的観測しやすい。  
しかし skill は、LLM が `SKILL.md` を読み、その内容をコンテキスト内で解釈し、自然言語的に実行へ反映する。ここには明確な外部境界がない。

そのため MVP では、以下の2種類のログを組み合わせる。

- Passive mechanical trace
- Active semantic trace

そして、この2つを run 単位で突き合わせる。

## 5. Passive Mechanical Trace

Passive mechanical trace は、モデルの自己申告に依存せず、機械的事実を記録する。

対象例:

- `SKILL.md` が読まれた
- reference file が読まれた
- script が実行された
- skill file の hash
- skill file の path
- MCP tool call の発生と、安全に正規化された metadata
- artifact が読まれた
- artifact が生成された

これは「何が実際に起きたか」のログである。

特に重要なのは、skill file access monitoring である。

skills は自然言語として LLM の実行コンテキストに溶け込みやすい。  
そのため、少なくとも `SKILL.md` がいつ、どの run においてアクセスされたかを記録することが、skill activation を観測する第一歩となる。

ただし、`SKILL.md` が読まれたことは、skill が実際に適用されたことを意味しない。  
したがって passive trace は、skill use の証明ではなく、skill activation の強い手がかりとして扱う。

## 6. Active Semantic Trace

Active semantic trace は、LLM に skill の使用意図や判断を明示的に宣言させるログである。

対象例:

- なぜこの skill が適用可能だと判断したか
- どの前提を置いたか
- どのリスクを認識したか
- どの手順を適用する予定か
- 実際にどの手順を適用したか
- どの部分を省略・逸脱したか
- どの不確実性が残ったか
- 人間に確認すべき点があるか

これは「モデルがその skill をどう使ったつもりだったか」のログである。

重要なのは、この semantic trace はモデルの内部思考そのものではないという点である。  
raw reasoning には計画や不確実性に関する手がかりが含まれる可能性が
あるが、機密性が高く、provider ごとに形式が異なり、確実な判断根拠でも
ないため、通常の収集では保存しない。必要なのは chain-of-thought では
なく、後から失敗を再構成し、改善につなげるための、明示的で構造化された
観測可能な宣言である。retention と将来の decision signal に関する方針は
[Data And Evidence Management](../data-and-evidence-management.md) に定める。

設計原則は次である。

> 機械的事実は受動的に記録し、意味的判断は能動的に宣言させる。

## 7. Debug Instrumentation

Active semantic trace を得るため、初期案では各 `SKILL.md` の冒頭に debug instrumentation を追加する形も想定していた。現在の prototype では、skill file に SkillTrace 固有の指示を埋め込まず、外部 instrumentation overlay として次のような指示を追加する方を優先する。

```md
## Debug instrumentation

When instrumentation is enabled:

Before applying this skill, call the `skill_log_event` MCP tool with:

- event_type: "skill_use_started"
- skill_name
- skill_version
- why_applicable
- assumptions
- expected_steps
- risk_flags

After applying this skill, call the `skill_log_event` MCP tool with:

- event_type: "skill_use_finished"
- skill_name
- skill_version
- steps_applied
- deviations_from_skill
- uncertainties
- artifacts_created
- recommended_followup

If instrumentation is unavailable, continue the task normally and report that instrumentation was unavailable.
```

この instrumentation により、LLM に skill 使用前後の宣言を求める。

ただし、この instrumentation 自体がモデルの挙動を変える可能性がある。  
そのため MVP では、instrumentation ON / OFF の比較を行う。

また、instrumentation の配置方法も比較対象にする。

- Inline instrumentation: `SKILL.md` 冒頭に直接書く
- External instrumentation overlay: 実行時に外部から追加指示として注入する
- No instrumentation: 比較用

これにより、instrumentation が skill の自然な挙動に与える影響を観察する。

## 8. MVP 全体構成

MVP は、MCP semantic logging と passive file access monitoring を同じサーバーに集約し、両者を突き合わせる最小システムとして構築する。

仮称:

> SkillTrace

目的:

> skill の受動的 activation と宣言された use を突き合わせる観測基盤を作る。

全体構成:

```text
Local LLM environment
  ├─ Agent / LLM client
  ├─ Skills directory
  ├─ File access tracking harness
  │    └─ watches SKILL.md / references / scripts access
  │
  └─ MCP client
       └─ calls skill_log_event MCP tool

SkillTrace server
  ├─ MCP server
  │    └─ skill_log_event
  │
  ├─ Passive event receiver
  │    └─ receives file access events from local harness
  │
  ├─ Trace store
  │    ├─ mechanical events
  │    ├─ semantic events
  │    └─ artifacts / snapshots
  │
  ├─ Consistency checker
  │    └─ compares passive activation and declared use
  │
  └─ Web app
       ├─ run timeline
       ├─ skill access view
       ├─ semantic log view
       ├─ mismatch detection
       └─ later: LLM-assisted log analysis
```

この構成の重要な点は、強い runner を介在させないことである。

runner が実行全体を支配すると、観測対象そのものを変えてしまう可能性がある。  
そこで MVP では、主たる agent 実行はできるだけ自然に保ち、横から observability harness を追加する。

つまり、設計方針は次である。

> 実行はなるべく自然に保つ。観測だけを横から足す。

## 9. Local File Access Tracking Harness

LLM が実行されるローカル環境には、小さな file access tracking harness を置く。

この harness の役割は、推論や分析ではない。  
あくまで観測された機械的事実を記録し、SkillTrace server に送信することである。

初期機能:

- `SKILL.md` read を検知する
- reference file read を検知する
- script execution を検知する
- file hash を計算する
- run_id を付与する
- server の passive event receiver に送信する

送信例:

```json
{
  "run_id": "run_2026_001",
  "source": "passive_file_harness",
  "event_type": "skill_file_read",
  "skill": {
    "name": "pr-review",
    "path": "skills/pr-review/SKILL.md",
    "file_hash": "sha256:..."
  },
  "timestamp": "2026-06-18T12:00:00Z"
}
```

MVP の最初は、完全な非侵襲性よりも、実験可能性を優先する。

実装候補:

- file read wrapper
- filesystem watcher
- skill directory mirror / proxy
- FUSE / virtual filesystem
- MCP resource 化

最初は軽量な wrapper または監視 harness から始める。  
その後、必要に応じてより非侵襲で正確な方式へ発展させる。

## 10. MCP Semantic Logging Tool

SkillTrace server は MCP server も兼ねる。  
LLM は、Debug instrumentation に従って `skill_log_event` MCP tool を呼び出す。

`skill_log_event` の最小 schema:

```json
{
  "run_id": "run_2026_001",
  "event_type": "skill_use_started",
  "skill": {
    "name": "pr-review",
    "version": "0.1.0",
    "file_hash": "sha256:..."
  },
  "summary": "Using pr-review because the task asks for review of a pull request diff.",
  "data": {
    "why_applicable": [
      "input contains a pull request diff",
      "user asks for review rather than modification"
    ],
    "assumptions": ["diff is complete", "test results are unavailable"],
    "risk_flags": ["possible breaking change", "insufficient test coverage"],
    "expected_steps": [
      "check API compatibility",
      "check migration risk",
      "check test coverage"
    ]
  },
  "related_artifacts": [],
  "confidence": "medium"
}
```

使用後の例:

```json
{
  "run_id": "run_2026_001",
  "event_type": "skill_use_finished",
  "skill": {
    "name": "pr-review",
    "version": "0.1.0"
  },
  "summary": "Completed PR review, but runtime behavior could not be verified.",
  "data": {
    "steps_applied": ["checked API compatibility", "checked test coverage"],
    "deviations_from_skill": [
      "skipped performance review because no benchmark data was available"
    ],
    "uncertainties": [
      "CI result was not available",
      "runtime behavior was not verified"
    ],
    "recommended_followup": ["ask human to run integration tests"]
  },
  "confidence": "medium"
}
```

この semantic log は自己申告であるため、単独では信頼しすぎない。  
passive trace と突き合わせることで意味を持つ。

## 11. run_id の扱い

Passive monitoring と MCP semantic logging を突き合わせるには、全イベントを同じ run_id に紐づける必要がある。

初期案:

```bash
SKILLTRACE_RUN_ID=run_2026_001
```

ローカル harness と MCP semantic logger の両方が、この run_id を使う。

将来的な発展:

- SkillTrace server が run を作成し、run_id を発行する
- `get_run_context` MCP tool で LLM が現在の run_id を取得する
- CLI や Web UI から run session を開始する
- 複数 agent / 複数 skill / 複数 MCP server を同一 run に紐づける

MVP では環境変数または簡単な session file で十分とする。

## 12. Trace Event Model

MVP では、イベントを共通 envelope + payload 形式で扱う。

```ts
type TraceEvent = {
  id: string
  runId: string
  timestamp: string

  source:
    | 'passive_file_harness'
    | 'mcp_semantic_logger'
    | 'mcp_proxy'
    | 'human_feedback'

  eventType: string

  skill?: {
    name?: string
    version?: string
    path?: string
    fileHash?: string
  }

  artifactRefs?: string[]
  payload: Record<string, unknown>
}
```

初期 event types:

Passive mechanical events:

- `skill_file_read`
- `skill_reference_read`
- `skill_script_executed`
- `artifact_read`
- `artifact_written`
- `mcp_tool_called`

Active semantic events:

- `skill_use_started`
- `skill_use_finished`
- `assumption_declared`
- `risk_declared`
- `deviation_declared`
- `uncertainty_declared`
- `failure_signal_declared`

Human / evaluation events:

- `human_feedback_added`
- `run_marked_success`
- `run_marked_failure`
- `incident_candidate_created`

## 13. Consistency Checker

MVP の最重要機能は、passive trace と active semantic trace の整合性チェックである。

### Case A: Observed and declared

- `SKILL.md` read あり
- `skill_use_started` あり
- `skill_use_finished` あり

解釈:

- skill activation と declared use が一致している
- instrumentation は概ね機能している

### Case B: Read but not declared

- `SKILL.md` read あり
- `skill_use_started` なし

解釈:

- instrumentation instruction が無視された可能性
- skill は読まれたが使用されなかった可能性
- activation と use の境界が曖昧な可能性

現行実装メモ: semantic / reflection / 同一 skill 配下の reference read が
ない `SKILL.md` entrypoint 単独の read は warning ではなく、中立的な
`discovered` evidence として扱う。reference read は引き続き、より強い
material evidence として扱う。

### Case C: Declared but not observed

- `SKILL.md` read なし
- `skill_use_started` あり

解釈:

- cached context の可能性
- passive harness の取りこぼし
- hallucinated skill use
- instrumentation overlay だけを見て宣言した可能性

### Case D: Started but not finished

- `SKILL.md` read あり
- `skill_use_started` あり
- `skill_use_finished` なし

解釈:

- 途中離脱
- tool failure
- task interruption
- 別 skill への逸脱
- completion logging の失敗

### Case E: Read and output resembles skill use, but no semantic log

- `SKILL.md` read あり
- semantic log なし
- output は skill に従っているように見える

解釈:

- 暗黙適用
- logging compliance failure
- skill instruction は効いたが、debug instrumentation は無視された可能性

MVP の Web UI では、まずこのような整合性チェックを run 単位で表示する。

## 14. Web App

SkillTrace server は簡易 Web UI を提供する。

MVP の初期画面:

### Run Timeline

run に紐づく全イベントを時系列で表示する。

- passive events
- semantic events
- MCP tool calls
- human feedback

### Skill Access View

どの skill file が読まれたかを表示する。

- skill name
- path
- file hash
- read timestamp
- related run

### Semantic Log View

LLM が宣言した skill use を表示する。

- why_applicable
- assumptions
- risk_flags
- expected_steps
- steps_applied
- deviations
- uncertainties

### Consistency Check View

passive trace と semantic trace の突き合わせ結果を表示する。

例:

```text
WARNING: skills/pr-review/SKILL.md was read, but no skill_use_started event was logged.
WARNING: skill_use_started was logged for db-migration-review, but no file access was observed.
PASS: pr-review was read, started, and finished.
```

将来的には、LLM によるログ解析や、postmortem draft generation を追加する。

ただし MVP v0 では、簡単な整合性チェックのみを提供する。

## 15. 初期実験計画

最初の実験では、同じ skill、同じ task、同じ model に対して、以下を比較する。

### Condition A: No instrumentation

- 通常の skill 実行
- 入力と出力のみ保存

### Condition B: Passive monitoring only

- file access tracking harness あり
- semantic logging なし

### Condition C: Passive monitoring + legacy inline debug instrumentation

- 比較条件として `SKILL.md` に Debug instrumentation を追加
- `skill_log_event` MCP tool を使う

### Condition D: Passive monitoring + external instrumentation overlay

- `SKILL.md` 本体は変更しない
- 外部指示として instrumentation を注入する

### Condition E: Strong debug protocol

- skill 使用前後の宣言を強く要求
- assumptions / risks / deviations / uncertainties まで記録する

比較指標:

- task output quality
- tool call count
- latency
- token usage
- skill access frequency
- logging compliance
- passive / active trace consistency
- failure reconstructability
- postmortem draftability
- regression case extractability
- instrumentation による behavior drift

この実験により、次を明らかにする。

- instrumentation がモデルの挙動をどの程度変えるか
- inline instrumentation と external overlay のどちらが守られやすいか
- passive monitoring はどの程度取りこぼすか
- semantic logging はどの程度信頼できるか
- 両者の突き合わせで skill use をどこまで理解できるか

## 16. 最初の対象 skill

最初の対象 skill は、自分が日常的に使えるものにする。

候補:

- PR review skill
- implementation planning skill
- technical research skill
- test failure triage skill
- DB migration review skill

最初は `PR review skill` が有力である。

理由:

- 入力と出力が明確
- Git diff、test、CI、review comment などの artifacts が扱いやすい
- 失敗を検出しやすい
- regression case に落とし込みやすい
- 自分自身の開発作業で dogfooding できる

## 17. MVP v0 のスコープ

MVP v0 に含めるもの:

- `skill_log_event` MCP tool
- passive file access event receiver
- local file access tracking harness
- trace event store
- run_id による event correlation
- simple consistency checker
- run timeline Web UI
- instrumentation ON/OFF comparison support

MVP v0 に含めないもの:

- 高度な postmortem generation
- regression test 自動生成
- skill trust card
- public skill registry
- 複雑な権限管理
- 複数ユーザー対応
- supply-chain security
- 完全な OpenTelemetry 対応

まずは、skill の activation と declared use を観測し、突き合わせることに集中する。

## 18. このプロジェクトの独自性

多くの agent / skill 議論は、以下に集中している。

- agent がより自律的に動く
- tool call がより正確になる
- skill によって task success rate が上がる
- workflow が自動化される

本プロジェクトの焦点は異なる。

> skill が失敗したとき、その失敗を集合知に変換できるか。

そのための第一歩として、

> skill がいつ読まれ、いつ使われたと宣言され、どのように適用され、どこで失敗したのかを観測できるか

を問う。

この観点から、skills を「便利なプロンプト」ではなく、次のように捉える。

> skills are executable procedural knowledge units that should mature through failures.

日本語では、

> skills は、失敗を通じて成熟する実行可能な手続き知である。

## 19. 将来的な展望

MVP の先には、以下の発展が考えられる。

- skill incident schema
- skill postmortem schema
- skill trust card
- known failure modes
- regression case registry
- skill version lineage
- GitHub PR integration
- OpenTelemetry integration
- skill reliability score
- public / private skill trace sharing
- LLM-assisted postmortem drafting
- postmortem-backed skill registry

最終的には、単なる skill repository ではなく、以下を目指す。

> 実行可能な知識に、失敗履歴と改善履歴を結びつけて共有する仕組み。

これは、書籍、論文、OSS、SRE、事故調査、品質管理、AIエージェントが交差する新しい知識基盤である。

## 20. スローガン

> Trace skill activation passively.  
> Ask models to declare skill use actively.  
> Compare the two.  
> Turn failures into reusable procedural knowledge.

日本語:

> skill の activation は受動的に記録する。  
> skill の use は能動的に宣言させる。  
> その差分を見る。  
> 失敗を、再利用可能な手続き知へ変換する。
