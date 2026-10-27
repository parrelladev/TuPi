# TuPi — Design do layout (v3)

Documento de referência do layout e do sistema de interação atuais. A v3 mantém **todas as funcionalidades** da versão anterior (mesmos ids no DOM e mesma lógica P2P em `public/js/core` e `public/js/features`) e troca a camada visual: tokens do Open Props, tema claro/escuro, animação em toda interação.

Arquivos de UI: `public/index.html`, `public/style.css`, `public/js/fx.js`, `public/js/ui.js`, `public/app.js`.

## 1. Pilha de UI

| Camada | Biblioteca | Papel | Peso (gzip) |
|---|---|---|---|
| Tokens | [Open Props](https://open-props.style/) (easings, durações, animações, tamanhos, sombras, z-index) | variáveis CSS (`--ease-spring-3`, `--ease-out-4`, `--animation-shake-x`…) | ~4 kB |
| Animação em JS | [Motion](https://motion.dev/) (`motion/mini`, só `animate`) | entradas escalonadas, pops, barra do toast, ímã do botão | ~3,4 kB |
| Listas | [AutoAnimate](https://auto-animate.formkit.com/) | entrada, saída e reordenação das mensagens e do diagnóstico | ~3,3 kB |
| Transições de tela | View Transitions API (nativa) | Home ↔ Sala com fade | 0 |
| Mostrar/ocultar | CSS `@starting-style` + `transition-behavior: allow-discrete` (nativo) | entrada e saída de qualquer elemento `.fx` | 0 |

Os pacotes ficam em `devDependencies`. `npm run vendor` (`scripts/build-vendor.js`) gera `public/vendor/` (`open-props.css`, `motion.js`, `auto-animate.js`), que é versionado e servido pelo `server.js`. A CSP não mudou (`script-src 'self'`), porque nada vem de CDN. O Alpine.js não foi adotado: a lógica de UI continua em JS puro, sem avaliar expressões em tempo de execução.

Navegadores: Chrome/Edge 123+, Safari 17.5+, Firefox 129+ (por `light-dark()` e `allow-discrete`). Sem esses recursos o app funciona, só sem as animações de saída.

## 2. Princípios

- Duas telas (Home e Sala), sem cadastro, até 2 pessoas.
- Quente, claro e arredondado; o gradiente da marca aparece só em ações primárias.
- Sala centrada em mídia: palco grande, chat lateral e barra de controles flutuante.
- Toda interação tem resposta visual: hover, pressão, foco, mudança de estado, entrada e saída.
- Movimento com propósito: curto (150–600 ms), com mola nos controles e suave nos painéis.
- Acessibilidade: `aria-*` preservados, `.sr-only`, foco visível roxo, `prefers-reduced-motion` desliga animações (CSS e JS).
- Estados de mídia (mic, câmera, tela) continuam independentes e nunca ligam sozinhos.

## 3. Tokens

### Cores (`light-dark(claro, escuro)`)
| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#fffaf8` | `#14111a` | fundo da página |
| `--surface` | `#fff` | `#1f1b27` | painéis, inputs |
| `--surface-2` / `--surface-3` | `#f4f3f6` / `#f7f4f6` | `#2a2533` / `#322c3d` | pílulas, botões neutros, hover |
| `--stage` | `#f7f6f8` | `#1a1721` | palco vazio |
| `--ink` / `--ink-2` / `--muted` | `#29242b` / `#544d55` / `#827b83` | `#f4eff6` / `#cfc6d6` / `#a79eae` | texto |
| `--line` | `#f0e8e8` | `#342e3f` | bordas |
| `--tint` | `#fff0ed` | `#3a2230` | balão próprio, botões suaves |
| `--ok`, `--ok-bg`, `--ok-ink` | `#35bd8a`, `#e9f8f1`, `#2e9b72` | `#35bd8a`, `#143428`, `#58d6a6` | conectado, mic/câmera ativos |
| `--danger-bg`, `--danger-ink` | `#fff0f1`, `#d6535e` | `#3a1c22`, `#ff8a93` | Sair |
| `--warn`, `--bad` | `#e6a54c`, `#e34459` | iguais | aguardando, erro, não lida |
| `--focus` | `#a777f2` | igual | anel de foco |
| `--brand` | `linear-gradient(105deg,#ff7a35,#f24b59 42%,#d83b9e 72%,#824fe8)` | igual | ações primárias |

O tema segue `prefers-color-scheme` (`color-scheme: light dark`, duas `theme-color`). O logo tem letras escuras, então no tema escuro ele ganha uma placa clara (`#fffaf8`).

### Forma, elevação e tipografia
- Raios: 10 / 14 / 20 / 28 px e pílulas de 99 px. Sombras `--shadow-card`, `--shadow-lift`, `--shadow-brand`.
- Fonte: `Inter, ui-sans-serif, system-ui, …` (sem webfont). Tamanhos 9–13 px nos controles, 14–19 px em títulos, 18 px no botão principal.

### Movimento
| Token | Valor | Uso |
|---|---|---|
| `--spring` | `--ease-spring-3` | controles, ícones, menus |
| `--pop` | `--ease-elastic-out-3` | badge, toast, check do preset |
| `--out` | `--ease-out-4` | painéis, opacidade, grade |
| Durações | 100 ms (pressão), 200–300 ms (cor, opacidade), 350–550 ms (movimento), 600 ms (entradas) | |

### Breakpoints
`900px`, `760px` (sala mobile: barra fixa e chat em overlay), `380px`.

## 4. Estrutura da página

```
body (flex coluna, min-height 100dvh)
├── main.app
│   ├── section#landing         Home (aurora de fundo + card)
│   ├── section#room.hidden     Sala
│   └── div#toast.fx.hidden     Aviso flutuante
└── footer.site-footer          oculto com .in-room
```

## 5. Home (`#landing`)

- **Fundo:** três blobs desfocados (`.aurora`, `position: fixed`) à deriva em loops de 14–22 s.
- **Card** (`.home-card`, 470 px, vidro com `backdrop-filter`): logo, botão **Criar nova sala**, divisor "ou entre com um convite", formulário de código/link, chips de recursos (Voz, Tela, Câmera, Chat, Arquivos, YouTube) e linha "Grátis · Sem conta · Até 2 pessoas".
- **Rodapé do site** só na Home.

## 6. Sala (`#room`)

```
┌────────────────────────────────────────────────────────────┐
│ header: [logo] [● Sala caju ⧉]            ● status   [👥 2] │
├───────────────────────────────────────────┬────────────────┤
│ stage                                     │ chat (340 px)  │
│  youtube-panel (opcional)                 │  cabeçalho     │
│  screen-area: badge · áudio · câmeras     │  mensagens     │
│   telas ou placeholder animado            │  arquivo       │
│                                           │  composer      │
├───────────────────────────────────────────┴────────────────┤
│  dock: [Mic][Câmera] | [Compartilhar tela][YouTube] |      │
│        [Chat][Mais] | [Sair]                               │
└────────────────────────────────────────────────────────────┘
```

- **Cabeçalho:** logo, pílula com nome da sala e botão de copiar, chip de status com ponto colorido (âmbar = aguardando, verde = conectado, vermelho = erro, via `data-tone`) e contador de participantes.
- **Palco:** `.screen-area` (raio 22 px) com badge de estado, botão "Ativar áudio recebido", miniaturas de câmera no canto superior direito, grade de telas (1 ou 2 colunas) e placeholder ilustrado.
- **Chat:** cabeçalho (título, botão Som, status), mensagens, painel de transferência de arquivo (criado por `files.js`) e composer. Começa recolhido no desktop e aberto sob demanda; no mobile vira overlay.
- **Dock** (`.room-toolbar`): cápsula de vidro com 4 grupos separados por linhas; botões de 80×62 px com ícone e rótulo (no mobile só ícones). **Compartilhar tela** é o botão primário.
- **Menus** (`<details>`): *Compartilhar tela* (perfis de qualidade, personalização, diagnóstico, botão de iniciar) e *Mais* (Dispositivos e áudio). Abrem para cima, centralizados.
- **YouTube Watch Together:** painel acima do palco; ao abrir, esconde a `.screen-area`.
- **Toast** no canto inferior direito, com barra de tempo.

## 7. Catálogo de interações e animações

Legenda: **CSS** = só CSS; **Motion** = `animate()`; **AA** = AutoAnimate; **VT** = View Transitions.

### Navegação e entrada
| Interação | Resposta visual | Como |
|---|---|---|
| Carregar a Home | itens do card sobem e aparecem em sequência (70 ms de intervalo) | Motion (`enterStagger`) |
| Aurora de fundo | blobs à deriva continuamente | CSS |
| Hover no logo | cresce e inclina levemente | CSS (mola) |
| Pointer sobre "Criar nova sala" | botão acompanha o cursor (efeito ímã) | Motion (`magnet`) |
| Hover em "Criar nova sala" | brilho atravessa o botão, gradiente desliza, ícone "+" gira | CSS |
| Criar sala em andamento | botão desabilitado com gradiente em shimmer | CSS |
| Hover nos chips de recursos | sobem, crescem e ganham cor | CSS |
| Entrar na sala | fade entre telas; cabeçalho desce, palco cresce, dock sobe e os botões aparecem em cascata | VT + Motion (`roomIn`) |
| Sair da sala | fade de volta à Home e card entra em sequência | VT + Motion |

### Formulário de entrada
| Interação | Resposta | Como |
|---|---|---|
| Foco no campo de convite | anel roxo suave e o campo sobe 2 px | CSS |
| Hover em "Entrar →" | fundo tinge e a seta desliza | CSS |
| Enviar vazio ou código inválido | formulário treme | CSS (`--animation-shake-x`) via `shake` |

### Botões (todos os `.btn`, "Entrar", presets, Som, copiar, arquivos)
| Interação | Resposta | Como |
|---|---|---|
| Hover | sobem 2 px | CSS (mola) |
| Pressionar | encolhem (`scale .95`) | CSS |
| Clique/toque | onda (ripple) a partir do ponto de clique | Motion/CSS (`ripple` em `fx.js`) |
| Foco por teclado | anel roxo de 3 px | CSS |
| Desabilitado | opacidade reduzida, cursor bloqueado | CSS |

### Cabeçalho da sala
| Interação | Resposta | Como |
|---|---|---|
| Copiar link | ícone vira um check que se desenha e volta depois de 1,4 s | CSS (`flash`) |
| Copiar link (aviso) | toast com barra de tempo | CSS + Motion |
| Participante entra ou sai | contador dá um "pop" | Motion (`pop`) |
| Mudança de status | ponto muda de cor e pulsa | CSS (`data-tone`) |

### Dock de controles
| Interação | Resposta | Como |
|---|---|---|
| Hover | botão sobe 3 px, ícone cresce e gira | CSS |
| Microfone/câmera ligados | fundo verde e anel que pulsa | CSS (`ring`) |
| Microfone | troca entre ícone cortado e ativo | CSS |
| Compartilhar tela | brilho atravessa o botão ao passar o mouse | CSS |
| Chat com mensagem nova | bolinha vermelha surge com mola e pulsa | CSS (`.fx`) |
| Sair (hover) | fundo vira vermelho cheio | CSS |
| Abrir menu | surge de baixo com mola (escala + deslocamento) | CSS (`menu-in`) |
| Expandir "Dispositivos e áudio" | seta gira 90° e os campos descem com fade | CSS |
| Escolher perfil de qualidade | borda rosa, fundo tingido e check que gira ao entrar | CSS |
| Hover em perfil | desliza 3 px para a direita | CSS |

### Palco e mídia
| Interação | Resposta | Como |
|---|---|---|
| Sala vazia | ilustração flutua, órbita gira, estrelas piscam, ponto de espera pulsa | CSS |
| Tela compartilhada começa/termina | placeholder some com fade e escala; tile da tela entra com escala | CSS (`.fx`) |
| Badge de estado muda | texto reaparece com pequeno deslocamento | Motion (`swap`) |
| Câmera liga/desliga | miniatura entra/sai com escala e deslocamento | CSS (`.fx`) |
| Hover em tile | etiqueta sobe 3 px | CSS |
| Botão "Ativar áudio recebido" | desce com mola ao aparecer | CSS (`.fx`) |
| Alternar duas telas | grade muda de 1 para 2 colunas com fundo escurecendo | CSS |
| YouTube abre/fecha | painel desliza para baixo e a `.screen-area` alterna | CSS (`.fx`) |

### Chat
| Interação | Resposta | Como |
|---|---|---|
| Abrir/fechar no desktop | coluna do chat expande/recolhe e o painel desliza com fade | CSS (grade animada + `allow-discrete`) |
| Abrir/fechar no mobile | painel sobe com mola a partir do dock | CSS |
| Mensagem chega ou é enviada | balão sobe e cresce a partir do canto de origem | AA (plugin próprio) |
| Indicador de conexão | ponto verde pulsa quando conectado | CSS |
| Botão Som | ícone balança ao clicar; estado ativo tinge o botão | CSS |
| Enviar | ícone de envio voa para fora no clique | CSS |
| Foco no campo | anel roxo suave | CSS |

### Transferência de arquivo
| Interação | Resposta | Como |
|---|---|---|
| Pedido de recebimento | cartão surge com escala; "Receber" em gradiente | CSS (`.fx`) |
| Transferência em andamento | barra de progresso com gradiente e botão Cancelar aparece | CSS (`.fx`) |
| Hover/pressão nos botões | sobem/encolhem com mola | CSS |

### Avisos
| Interação | Resposta | Como |
|---|---|---|
| Toast | entra com mola vindo de baixo; barra de tempo encolhe em 4,3 s; sai com fade | CSS + Motion (`toastProgress`) |
| Diagnóstico de conexão | linhas novas entram com animação | AA |

### Acessibilidade de movimento
Com `prefers-reduced-motion: reduce`: o CSS zera durações e repetições; `fx.js` deixa de chamar Motion, AutoAnimate, View Transitions, ripple, ímã e tremor. A interface funciona igual, sem movimento.

## 8. Classes de estado (controladas por JS)

| Classe | Elemento | Efeito |
|---|---|---|
| `hidden` | qualquer | `display:none`; em `.fx` vira saída animada |
| `fx` | elementos que entram/saem | transição de opacidade, transform e `display` |
| `in-room` | `body` | esconde o rodapé do site |
| `chat-collapsed` / `chat-open` | `.room` | chat recolhido (desktop) / overlay aberto (mobile) |
| `youtube-active` | `#stagePanel` | esconde a `.screen-area` |
| `has-media`, `dual` | `#screenViews` | mostra a grade; duas telas |
| `active` | `.screen-area` | fundo escuro |
| `mic-enabled` | `#micBtn`, `#cameraBtn` | verde com anel pulsante |
| `enabled` | `#chatSoundToggle` | som ativado |
| `connected` | `.chat-connection` | ponto verde |
| `copied` | `#copyBtn` | ícone de check |
| `shake` | `#joinForm` | tremor temporário |
| `mine` | `.message` | balão próprio |

`data-tone` (`ok`, `wait`, `bad`) em `.status-chip` define a cor do ponto de status. `data-enter` marca elementos animados na entrada.

## 9. Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `public/index.html` | marcação das duas telas (mesmos ids da v2) |
| `public/style.css` | tokens, componentes, animações CSS e responsivo (arquivo único, legível) |
| `public/js/fx.js` | camada de animação: `enterStagger`, `roomIn`, `pop`, `swap`, `shake`, `flash`, `toastProgress`, `transition`, ripple, ímã, AutoAnimate |
| `public/js/ui.js` | helpers de DOM; chama `pop`, `swap` e `toastProgress` |
| `public/app.js` | orquestra; usa `transition`, `roomIn`, `enterStagger`, `shake`, `flash` |
| `public/js/features/*`, `public/js/core/*` | lógica P2P, sem mudanças de comportamento |
| `public/vendor/*` | bibliotecas empacotadas por `npm run vendor` |
| `scripts/build-vendor.js` | gera `public/vendor` com esbuild |

## 10. Verificação feita

- `npm run check` e `npm test` (11 testes) passam.
- Todos os ids lidos pelo JS existem no HTML (os únicos ausentes são criados dinamicamente ou opcionais).
- No navegador: Home em tema claro e escuro, criar sala, abrir chat e menu de compartilhamento, duas abas conectadas por P2P com troca de mensagens nos dois sentidos, toast, layout mobile (375 px).
- Não testado: captura real de microfone, câmera e tela, transferência de arquivo, YouTube Watch Together e Firefox/Safari.
