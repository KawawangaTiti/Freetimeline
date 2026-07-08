# FreeTimeline — Game Design Document (GDD)

> **Versão:** 1.0-draft · **Data:** 2026-07-07 · **Dono:** HAZEDEV
> Este é o documento-mestre de design do produto FreeTimeline. Define o que a ferramenta É,
> para quem é, como se interage com ela, e para onde vai. Atualizar sempre que uma decisão
> de produto mudar. (Chama-se "GDD" por convenção do dono — é um Product Design Document.)

---

## 1. Visão

**"A timeline gratuita de QUALQUER universo."**

- **Universe Timeline** (`universe.html`) — constrói a cronologia de qualquer mundo ficcional:
  Lord of the Rings, Harry Potter, DC, Marvel, Pokémon, o teu próprio worldbuilding ou campanha
  de RPG. Múltiplos universos/tracks paralelos, personagens, ligações, eras personalizadas.
- **Biography Timeline** (`biography.html`) — a linha da tua vida (ou de qualquer pessoa):
  memórias, pessoas, relações, tons emocionais, períodos.

### Princípios (não negociáveis)

1. **Grátis e sem backend.** Tudo corre no browser; os dados vivem no `localStorage` (+ IndexedDB
   para imagens de mapa) do utilizador. Sem contas, sem servidores, sem tracking dos dados.
2. **Os dados são do utilizador.** Export a qualquer momento: JSON leve ou HTML com os dados
   embebidos (re-importável; nota: não é uma app standalone — ver Fase 9 no roadmap). Import
   de volta sem perdas (validado por `js/ft-import-validate.js`, a única fronteira de confiança).
3. **Funciona offline.** Zero dependências de CDN; vendors (GSAP, ECharts) servidos localmente.
4. **Sem polícia de cânone.** Universos com cronologia disputada (Pokémon é o caso-modelo:
   sem história oficial detalhada → dezenas de teorias de fãs) são cidadãos de primeira classe:
   o utilizador representa **várias continuidades/teorias em simultâneo e compara-as visualmente**.
5. **Universal.** Nenhuma feature pode assumir um universo específico. Categorias, eras,
   localizações, facções — tudo definível pelo utilizador.

---

## 2. Personas & casos de uso

| Persona | O que precisa | Features-chave |
|---|---|---|
| **Fã de LOTR** | Eras profundas (Primeira/Segunda/Terceira Era), datas não-gregorianas | Range/epoch config, tracks por era, mapa da Terra Média com pins |
| **Fã de Harry Potter** | Elenco grande, casas/facções, arcos por personagem | Characters/dossiers, Organizations/Groups, connection map |
| **Teórico de Pokémon** ⭐ | Várias cronologias em competição, comparação visível | **Continuidades + modo Compare** (o diferenciador do produto) |
| **Diarista** | Privacidade, memórias, pessoas, tons emocionais | Biography, localStorage-only (ver guia "why local browser storage"), Reading Mode, Memory Tour |
| **GM de RPG** | Campanhas paralelas, sessões como eventos, geografia do mundo | Tracks por campanha, **Mapas & Localizações**, export HTML para os jogadores |

---

## 3. Inventário de features (estado em 2026-07-07, pós-WS1)

### Universe
| Feature | Estado |
|---|---|
| Canvas timeline (tracks, zoom, pan, minimap, hash deep-links) | ✅ |
| Eventos + sub-eventos, categorias, tags, tone, status | ✅ |
| Characters (dossiers, counterparts, battle records) | ✅ |
| Map view = grafo de ligações *(a renomear "Relations" no WS3)* | ✅ (redesign visual V3 pendente) |
| Stats (tab ECharts + painel rápido "Stats panel") | ✅ |
| List view acessível | ✅ |
| Tours: Continuity Tour + **Memory Tour (restaurado WS1)** | ✅ |
| Story line, Reading Mode **(botão restaurado WS1)** | ✅ |
| Range/epoch config **(fecho corrigido WS1)** | ✅ |
| Save HTML / JSON / Load / Blank, autosave | ✅ (WS3 corrigiu o Save HTML, que **nunca** embebia dados — o round-trip export→import funciona agora pela primeira vez) |
| Undo/Redo profundo | ✅ |
| Filtros (texto, categoria, status, tags, tone, personagem, universo) | ✅ |
| Onboarding + empty-state | ✅ |
| **Mapas & Localizações** (tab Places: mapa custom + pins + filtro 📍) | ✅ WS3 (2026-07-08) |
| **Continuidades/Teorias** (Organise ▸ Continuities + filtro ⑂ + ⇄ Compare) | ✅ WS4 (2026-07-08) |

### Biography
Espelho do Universe com: Life Tracks, People/Relationships, tons emocionais,
turning points, Memory/Continuity Tours, stats ECharts. **Jump, Fit, + New Person,
Reading Mode e Memories restaurados no WS1.** Mobile: sheet ≡ com secções (WS1).
**Places/mapa custom portados no WS3; Continuidades no WS4** (caso de uso: leituras
alternativas/ramos de uma história de vida, memórias disputadas na família).

### Site
Landing + 5 guias + páginas legais; consent AdSense conforme; GitHub Pages
(`freetimeline.pt`).

---

## 4. Modelo de interação (o contrato "calibrado")

O dilema: botões escondidos matam a descoberta; tudo visível entulha. Resolução em **3 tiers
+ 1 escape hatch**, idêntico em desktop e mobile:

- **Tier 1 — sempre visível (≤10 controlos):** Menu/logo · **＋Event** (accent) · +Track ·
  view tabs · Today · Fit · Undo/Redo.
- **Tier 2 — menus nomeados:** **Data▾** (Save HTML/JSON/Load/Blank) · **Organise▾**
  (Categories/Groups/Row · Places… · Continuities…) · **View▾** (Stats panel/Story/Tours/
  Reading/Range/Jump/Today/Reset/Fit) · **Help▾** (Keys/Help).
- **Tier 3 — contextual:** ações no clique do objeto (editar evento/track/personagem).
  Direção futura: popover de seleção; por agora vive nos modais.
- **Escape hatch — paleta de comandos (Ctrl+K):** `js/ft-palette.js`. TODAS as ações Tier 1+2
  registadas e pesquisáveis. Nada precisa de estar visível para ser encontrável.

### Invariantes (testáveis)
1. Toda a ação alcançável em **≤2 interações** (abrir menu + clicar, ou Ctrl+K + Enter).
2. Toda a ação **pesquisável na paleta**.
3. **Zero labels duplicadas** com comportamentos diferentes.
4. Secções do sheet mobile ≡ **===** menus desktop (Timeline/Data/Organise/View/Help).
5. Toda a ação destrutiva passa pelo confirm-gate (`js/ft-confirm.js`) e oferece backup.

---

## 5. Dados & persistência

- **Chaves:** `inf_universe_v4` / `inf_biography_v1` (localStorage, autosave).
- **Schema (S):** `universes|lifeTracks[]`, `events[]` (+`placeIds[]`, `continuityIds[]`),
  `characters|people[]` (+`placeIds[]`), `categories[]`, `affiliations[]`,
  **`places[]`** `{id,name,description,parentId,color,icon,pin{x,y∈0..1}}` (WS3),
  **`mapMeta`** `{has,w,h,name}` (WS3), **`continuities[]`** `{id,name,color,notes}` (WS4).
- **Imagem de mapa:** IndexedDB (`ft-maps`, key = chave da app), comprimida no upload
  (≤2048px, JPEG q0.82, recusa >4MB). localStorage nunca leva a imagem.
- **Export/Import:** JSON e HTML embutem `mapImage` como dataURL; import valida TUDO em
  `ft-import-validate.js` (sanitização de strings/cores/URLs, clamps, whitelists) e
  reescreve a imagem para IDB.
- **Trust boundary:** nenhum dado importado toca o estado sem passar pelo validador.

---

## 6. Roadmap

| Fase | Conteúdo | Estado |
|---|---|---|
| **WS1 — Fix pack** | Merge UI (overlays presos, Jump/Fit), regressões do declutter, Reading Mode, Memory Tour, New Person, tecla F | ✅ 2026-07-07 (38/38 smoke) |
| **WS2 — Calibração** | Paleta Ctrl+K (30+ ações), coachmark, Today/Fit em Tier 1, -1750 linhas de mobile legacy | ✅ 2026-07-07 |
| **WS3 — Mapas & Localizações** | Places + mapa custom (IndexedDB) com pins + filtro + export/import; fix do Save HTML vazio | ✅ 2026-07-08 (ambas as apps) |
| **WS4 — Continuidades** | Teorias por evento + filtro ⑂ + modo ⇄ Compare com anéis coloridos | ✅ 2026-07-08 |
| Fase 6 (antiga) | Performance (render scheduler, rAF gating) | backlog |
| Fase 7 | Security (CSP, validar localStorage no load, escaping) | backlog |
| Fase 8 | Deploy hardening (404.html, headers) | backlog |
| Fase 9 | Polish (wording "Marvel" em about, honestidade do roadmap, CSS dup, AdSense slots únicos, e rever a claim "abre offline em qualquer lado" do Save HTML — o ficheiro exportado referencia js/ externos, por isso é um contentor de dados re-importável, não uma app standalone) | backlog |
| V3/V5 (visual) | Redesign do grafo Relations; QA visual | backlog |
| MOB-7 | Canvas DPR-sharp (precisa de teste em device real) | backlog |
| v2 ideias | `ev.dateOverrides` por continuidade; popover de seleção Tier 3; print/PDF | ideias |

---

## 7. Non-goals

- ❌ Contas, sync na cloud, colaboração em tempo real.
- ❌ Apps nativas; build step / frameworks (mantém-se vanilla, zero-build).
- ❌ Geração de cânone por IA (a ferramenta representa o que o utilizador decide, não inventa).
- ❌ Monetização além de AdSense com consentimento.

---

## 8. Verificação (hábitos do repo)

- `node --check` em todos os `.js` após cada edição; extractor de scripts inline para os HTML.
- Smoke Puppeteer (Chrome do sistema via `puppeteer-core`) com screenshots em `.shots/`
  a cada workstream — desktop 1440×900 + mobile 390×844, ambas as apps.
- Round-trip export→import como teste obrigatório de qualquer mudança de schema.
