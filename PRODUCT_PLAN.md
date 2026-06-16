# FreeTimeline — Product Plan (Website + App)

> Documento mestre de planeamento. Trata o projeto como **um website (marketing/conteúdo) com duas apps lá dentro** (Universe + Biography).
> Criado 2026-06-16. Complementa — não substitui — `PROJECT_REVIEW.md` (auditoria funcional), `IMPROVEMENT_PLAN.md` (log de execução, fonte de verdade) e `VISUAL_REDESIGN_PLAN.md` (redesign visual).
> Branding isolado em `brand/` (logo SVG + brand kit).

---

## 0. O que é o produto (resumo de uma linha)

Ferramenta gratuita e **100% local** (dados no browser, sem conta, sem servidor) para mapear **timelines** — de **universos ficcionais** (Universe) e de **vidas / memórias / biografias** (Biography).

- **Problema que resolve:** ferramentas de timeline ou são pagas, ou exigem conta/nuvem, ou são complexas. Aqui é grátis, privado e imediato.
- **Público-alvo:** escritores/worldbuilders, mestres de RPG, pessoas a fazer diário/memórias, estudantes/curiosos.
- **Critério de sucesso:** visitante novo cria o **primeiro evento em < 60s** sem fricção; volta porque os dados ficam guardados.
- **Modelo:** site gratuito monetizado por **AdSense** (apenas nas páginas de conteúdo, nunca dentro das apps).

---

# PARTE A — WEBSITE

## A1. Sitemap (estado atual)

```
/ (index.html) ............... landing: hero + 2 portais (Universe, Biography)
├── /universe.html ........... APP 1 (timeline de universos)
├── /biography.html .......... APP 2 (timeline de vidas)
├── /guides.html ............. hub de guias
│   └── /guides/*.html ....... 5 artigos
├── /about.html
├── /pricing.html ............ (grátis — repensar se faz sentido manter)
├── /roadmap.html
├── /contact.html
├── /privacy.html  /terms.html  /cookies.html
└── infra: sitemap.xml, robots.txt, feed.xml, ads.txt, favicon.svg, og.png
```

**Problemas de estrutura/navegação:**
- A top-nav lista 7 links (Home, Guides, About, Contact, Privacy, Terms, Cookies) — **mistura navegação primária com legal**. Legal devia estar só no rodapé.
- **Não há link directo para as apps na top-nav** — só via cartões do hero. Deviam estar na nav ("Universe", "Biography").
- `pricing.html` num produto grátis baralha a mensagem. Decisão pendente: remover, ou transformar em "Why it's free / Support".
- `roadmap.html` é uma promessa pública — risco se desatualizado.

## A2. Wireframes
Esqueços por página em `docs/wireframes/` (a criar). Prioridade: home, app shell (toolbar + canvas + painéis), modais.

## A3. Design System / Style Guide
- **Fonte de verdade dos tokens:** `brand/` (cores, gradientes, fonte) + bloco `:root` de cada ficheiro.
- **Estado atual:** os tokens estão **duplicados e divergentes** entre `index.html`, `universe.html`, `biography.html`. → Extrair para um **`css/tokens.css`** partilhado (ver Tech Spec).
- Paleta: fundo `#050611`; azul `#5a80ff` → ciano `#40c8ff` → teal `#60e8d0`; dourado `#d4af37`; Biography `#c08040`.
- Componentes a normalizar: `.btn`, toolbar, modal/dialog, chips, painel de filtros, minimapa.

## A4. Functional Specification (Website)
| Funcionalidade | O que faz | Estado |
|---|---|---|
| Landing + portais | Apresenta produto, encaminha p/ apps | ✅ |
| Guias (SEO/conteúdo) | Artigos p/ tráfego orgânico + AdSense | ✅ |
| Consentimento cookies | Banner real, gate do AdSense | ✅ (`js/ft-consent.js`) |
| Páginas legais | Privacy/Terms/Cookies | ✅ |
| Newsletter/RSS | `feed.xml` | ✅ parcial |

## A5. Requirements Document (objetivos / restrições)
- **R1** Nenhum dado do utilizador sai do browser (privacidade é o argumento de venda).
- **R2** Funciona sem build, sem backend — ficheiros estáticos.
- **R3** AdSense só em páginas de conteúdo, **nunca** dentro de Universe/Biography.
- **R4** Acessibilidade WCAG AA como meta declarada (ver roadmap).
- **R5** Mobile-first real (já há muito CSS responsivo).

## A6. User Stories (Website)
- Como visitante, quero perceber em 5s o que isto faz e que é grátis/privado.
- Como escritor, quero abrir a app de universos sem criar conta.
- Como leitor de um guia, quero navegar para a app relacionada.

---

# PARTE B — APP (Universe + Biography)

## B1. PRD
- **Problema / público / sucesso:** ver Secção 0.
- **Funcionalidades núcleo (ambas as apps):** criar/editar eventos numa timeline com zoom/pan; tracks (universos / life tracks); personagens/pessoas; categorias; filtros; vistas (Timeline, Personagens/People, Mapa de relações/conexões, Stats, Lista); guardar/abrir (HTML/JSON); tours guiados; onboarding primeira-vez.
- **Não-objetivos:** contas, sync na nuvem, colaboração em tempo real (a pricing antiga prometia isto — não existe).

## B2. User Flows (principais)
1. **Primeiro uso:** abre app → onboarding card → "+ Add first event" → modal → evento na timeline.
2. **Explorar relações:** tab Mapa → ver grafo → clicar nó → perfil.
3. **Guardar trabalho:** Save HTML/JSON → ficheiro local. Abrir: Load.

## B3. Wireframes/Mockups
App shell: `[toolbar]` topo · `[canvas/zoom]` centro · `[minimapa]` · `[painel filtros]` · `[modais]`. A formalizar em `docs/wireframes/`.

## B4. Technical Specification
- **Arquitetura atual:** dois ficheiros HTML gigantes (~270 KB cada). Universe tem JS **inline**; Biography usa **`js/biography-timeline.js`** externo. Módulos partilhados: `ft-consent`, `ft-confirm`, `ft-onboarding`, `ft-import-validate`.
- **Estado:** `localStorage` (chaves `uni_*`, `bio_*`, `ft_*`). Sem backend, sem base de dados.
- **Dívida técnica principal:**
  1. **Inconsistência de arquitetura** — extrair o JS inline do Universe para `js/universe-timeline.js` (já existe? confirmar) para emparelhar com Biography.
  2. **Código duplicado/divergente** entre as duas apps (toolbar, filtros, modais, tokens) — candidato a um `js/ft-core.js` partilhado.
  3. **Tokens CSS duplicados** → `css/tokens.css`.
- **Integrações:** AdSense (fora das apps), nenhuma API externa.

## B5. Backlog — problemas CONFIRMADOS e prioritizados

> Severidade baseada em auditoria 2026-06-16. ⚠️ = precisa de verificação no browser antes de corrigir.

### 🔴 P1 — Acessibilidade do Mapa de Conexões (Universe)
- Nós e arestas SVG (`.cm-node`, `.cm-edge`) **não têm `tabindex`, `role` nem handlers de teclado** → utilizadores de teclado/leitor de ecrã não conseguem usar a vista. (universe.html ~7600–7950)
- Botões de controlo do mapa (`.mz-btn`: zoom/fit/reset) têm `title` mas **sem `aria-label`**.
- **Fix:** dar `role="button"`/`tabindex="0"` + handlers Enter/Space aos nós; aria-labels nos controlos; foco visível. (A vista Lista já serve de alternativa acessível — confirmar que cobre o mesmo conteúdo.)

### 🟠 P2 — Botões confusos / "mortos" ⚠️
- **Minimap toggle** (universe.html ~4236): suspeita de não ter handler `onclick` (alterna por classe CSS noutro sítio). **Verificar no browser** antes de mexer.
- **Undo/Redo** aparecem a `opacity:0.4 disabled`: provavelmente é o **estado desabilitado por design** (ativam quando há histórico), não um bug. Confirmar que ativam após uma edição.

### 🟡 P3 — Acessibilidade pontual (Biography)
- Lightbox `<img id="lb-img" alt="">` com **alt vazio** (biography.html ~4597) → definir alt dinâmico.
- Tabs de vista sem `role="tab"`/`tabindex` (semântica; funcionam na mesma).

### 🟡 P4 — Higiene / organização
- Extrair JS inline do Universe → ficheiro externo (paridade com Biography).
- Tokens CSS partilhados (`css/tokens.css`).
- Avaliar `js/ft-core.js` para lógica duplicada (filtros, modais, view-switching).

### ✅ Falsos alarmes (NÃO são bugs — descartar)
- "switchView()/clearCatFilter() não definidas em Biography" → **existem** em `js/biography-timeline.js` (5936, 6464…). As vistas People/Map/Stats **funcionam**.

---

## C. Roteiro de execução proposto

| Fase | Foco | Entregável |
|---|---|---|
| **0** | Verificação no browser dos itens ⚠️ (minimap toggle, undo/redo, map view ambas as apps) | Lista de bugs reais vs falsos |
| **1** | P1 — Acessibilidade do mapa (Universe + Biography) | Mapa navegável por teclado |
| **2** | P3 — A11y pontual + foco/contraste | WCAG AA mais perto |
| **3** | Navegação do site (nav vs rodapé; links p/ apps; decidir pricing) | Sitemap limpo |
| **4** | P4 — Tokens partilhados + extrair JS Universe | Menos duplicação |
| **5** | Continuação do `VISUAL_REDESIGN_PLAN.md` (toolbar, canvas, mapa) | Visual moderno |

**Regra de trabalho (já em vigor):** um commit por issue em `main`; `IMPROVEMENT_PLAN.md` é o log/fonte de verdade; **LOOK (screenshot) antes de declarar corrigido**.
