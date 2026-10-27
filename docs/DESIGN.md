# TuPi — Design do layout (v3)

Documento de referência do layout e do sistema de interação atuais. A v3 mantém **todas as funcionalidades** da versão anterior (mesmos ids no DOM e mesma lógica P2P em `public/js/core` e `public/js/features`) e troca a camada visual: tokens do Open Props, tema claro/escuro, animação em toda interação.

Arquivos de UI: `public/index.html`, `public/style.css`, `public/js/fx.js`, `public/js/ui.js`, `public/app.js`.

## 1. Pilha de UI

| Camada | Biblioteca | Papel | Peso (gzip) |
|---|---|---|---|
| Tokens | [Open Props](https://open-props.style/) (easings, durações, animações, tamanhos, sombras, z-index) | variáveis CSS (`--ease-spring-3`, `--ease-out-4`, `--animation-shake-x`…) | ~4 kB |
| Animação em JS | [Motion](https://motion.dev/) (`motion/mini`, só `animate`) | entradas escalonadas, pops, barra do toast, ímã do botão | ~3,4 kB |
| Listas | [AutoAnimate](https://auto-animate.formkit.com/) | entrada, saída e reordenação das mensagens e do diagnóstico | ~3,3 kB |
| Ícones | [Phosphor Icons](https://phosphoricons.com/) (fonte `woff2`, pesos regular e fill) | todos os ícones da interface: `<i class="ph ph-microphone">` (regular) e `<i class="ph-fill ph-microphone">` (preenchido nos estados ligados) | ~5 kB de CSS + ~280 kB de fontes (cache de 1 dia) |
| Transições de tela | View Transitions API (nativa) | Lobby ↔ Chamada com fade | 0 |
| Mostrar/ocultar | CSS `@starting-style` + `transition-behavior: allow-discrete` (nativo) | entrada e saída de qualquer elemento `.fx` | 0 |

Os ícones do Phosphor ficam em `public/vendor/phosphor` (sem CDN, por causa da CSP `default-src 'self'`); o CSS gerado contém só os ícones que aparecem em `public/`, então use `npm run vendor` depois de adicionar um ícone novo. Os pacotes ficam em `devDependencies`. `npm run vendor` (`scripts/build-vendor.js`) gera `public/vendor/` (`open-props.css`, `motion.js`, `auto-animate.js`), que é versionado e servido pelo `server.js`. A CSP não mudou (`script-src 'self'`), porque nada vem de CDN. O Alpine.js não foi adotado: a lógica de UI continua em JS puro, sem avaliar expressões em tempo de execução.

Navegadores: Chrome/Edge 123+, Safari 17.5+, Firefox 129+ (por `light-dark()` e `allow-discrete`). Sem esses recursos o app funciona, só sem as animações de saída.

## 2. Princípios

- Duas telas: **Lobby** (pré-entrada) e **Chamada**. Sem salas, sem códigos e sem cadastro; lobby único aberto, até 2 pessoas.
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

O tema segue `prefers-color-scheme` (`color-scheme: light dark`, duas `theme-color`). O logo troca entre a versão de letras escuras e a de letras claras conforme o tema, sem placa de fundo (ver 6.6).

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
│   ├── section#landing         Lobby (aurora de fundo + prévia + painel de entrada)
│   ├── section#room.hidden     Sala
│   └── div#toast.fx.hidden     Aviso flutuante
└── footer.site-footer          oculto com .in-room
```

## 5. Lobby (`#landing`)

Tela de pré-entrada inspirada no "Pronto para participar?" do Google Meet. Não há criação de sala nem convite: o lobby é único e aberto.

```
┌─────────────────────────────────┐   ┌──────────────────────────┐
│  prévia (câmera ou avatar)      │   │ [logo]                   │
│        ( avatar grande )        │   │ Pronto para participar?  │
│   nome         [🎤] [🎥]   ▬▬▬  │   │ Seu nome  [__________]   │
└─────────────────────────────────┘   │ ● Aguardando…       1/2  │
 [🎤 Padrão ▾]   [🎥 Padrão ▾]         │ [ Participar agora ]     │
                                       └──────────────────────────┘
```

- **Prévia** (`#lobbyPreview`, 16:9, fundo escuro): mostra a câmera quando ligada (espelhada) ou o avatar grande; o avatar clicável abre o seletor de 30 ícones. Botões redondos de microfone e câmera (brancos quando ligados), medidor de nível do microfone e o nome no canto. O anel de fala também aparece aqui.
- **Seletores de dispositivo** (pílulas abaixo da prévia): microfone e câmera, espelhados com o menu "Mais" da chamada.
- **Painel de entrada:** título, texto de apoio, campo **Seu nome** (vazio usa o nome do avatar), faixa de status com contador `n/2` e o botão **Participar agora**. Depois de entrar, o botão vira **Sair do lobby**.
- **Estados da faixa de status:** `idle` (fora), `connecting`, `waiting` (ponto verde pulsando), `full` ("O lobby está cheio agora. Tentando de novo…", nova tentativa a cada 4 s) e `call` (chamada em andamento).
- **Chamada automática:** quando a segunda pessoa entra, as duas telas passam sozinhas do lobby para a chamada. Se a outra pessoa sai, a chamada espera 5 s por ela (para tolerar o botão Reconectar) e depois volta ao lobby; microfone e câmera continuam como estavam, e tela compartilhada e YouTube são encerrados.
- **Rodapé do site** só no lobby.

### 5.1 Avatares e nomes

- **Avatares:** 30 ícones de animais em SVG (`public/assets/avatars/*.svg`, vindos de `pack_icones/fundo-colorido`), recortados em círculo. O id é o nome do arquivo (`gato`, `raposa-em-pe`, `canguru-01`…). O servidor só serve os arquivos dessa pasta, listados na inicialização.
- **Seletor:** grade de 5 colunas (4 no celular) com rolagem, com o avatar atual marcado. Existe no lobby (sobre a prévia) e na chamada (no seu card).
- **Nome:** o padrão é o nome do avatar ("Gato", "Raposa-ruiva"…) e acompanha o avatar enquanto você não digitar outro. Pode ser trocado no lobby (campo **Seu nome**) e na chamada (clique no seu nome no card; Enter salva, Esc cancela; vazio volta ao padrão). Máximo de 24 caracteres, sem caracteres de controle. A escolha fica salva (`tupi-name`; só quando personalizada).
- **Sincronização:** o nome e o avatar vão no canal de presença e a outra pessoa os vê no card, nos rótulos "Nome · Tela" e "Nome · Câmera", na barra de voz e no rótulo das mensagens do chat.

## 6. Chamada (`#room`)

```
┌────────────────────────────────────────────────────────────┐
│ header: [logo]                  ● status ⟳ [👥 2]            │
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

- **Cabeçalho:** logo, chip de status com ponto colorido (âmbar = aguardando, verde = conectado, vermelho = erro, via `data-tone`), botão circular **Reconectar** (`#reconnectBtn`) dentro do chip e contador de participantes. O botão continua visível no mobile, onde o texto do status é escondido.
- **Palco:** `.screen-area` (raio 22 px) com badge de estado, botão "Ativar áudio recebido", grade de telas (1 ou 2 colunas) e, sem tela compartilhada, a **tela de participantes** (seção 6.1). As miniaturas de câmera no canto superior direito só aparecem enquanto há uma tela compartilhada; sem tela, a câmera aparece dentro do card de cada pessoa.
- **Controles de voz:** ficam dentro de cada card, acima do avatar (seção 6.1). Não há mais uma barra separada; durante o compartilhamento de tela ou o YouTube os cards ficam ocultos e os controles também (use `M` para o microfone).
- **Chat:** cabeçalho (título, botão Som, status), mensagens, painel de transferência de arquivo (criado por `files.js`) e composer. Começa recolhido no desktop e aberto sob demanda; no mobile vira overlay.
- **Dock** (`.room-toolbar`): cápsula de vidro com 4 grupos separados por linhas; botões de 80×62 px com ícone e rótulo (no mobile só ícones). **Compartilhar tela** é o botão primário.
- **Menus** (`<details>`): *Compartilhar tela* (perfis de qualidade, personalização, diagnóstico, botão de iniciar) e *Mais* (Dispositivos e áudio). Abrem para cima, centralizados.
- **YouTube Watch Together:** painel acima do palco; ao abrir, esconde a `.screen-area`. Abrir e fechar é um evento compartilhado (seção 6.1.2).
- **Toast** no canto inferior direito, com barra de tempo.

### 6.1 Tela de participantes e controles de voz

```
┌──────────────────────────────────────────────────────┐
│  ┌───────────────┐          ┌───────────────┐        │
│  │   (avatar)    │          │   (avatar)    │        │
│  │  ou câmera    │          │  ou câmera    │        │
│  └───────────────┘          └───────────────┘        │
│       Você                     Convidado             │
│   Falando ▂▅▇▅▂            Microfone desligado        │
├──────────────────────────────────────────────────────┤
│ (●) Você  [🎤] ▬▬▬        (●) Convidado [🔊] ━━●━ 35% │
└──────────────────────────────────────────────────────┘
```

- **Cards lado a lado** (`#personLocal`, `#personRemote`): avatar circular grande em um cartão com cor própria (rosa para você, roxo para o convidado), nome, estado em texto ("Falando", "Ouvindo", "Microfone desligado", "Silenciado por você", "Aguardando outra pessoa") e cinco barras de voz. Ficam lado a lado também no mobile.
- **Câmera no card:** com a câmera ligada, o vídeo ocupa o cartão no lugar do avatar (o seu aparece espelhado). Ao desligar, o avatar volta.
- **Convidado ausente:** o card fica translúcido, com borda tracejada e silhueta cinza.
- **Avatares:** os mesmos 30 ícones de animais do lobby (seção 5.1). Para trocar, clique no avatar do seu card (aparece um lápis ao passar o mouse) ou na miniatura da barra; abre o seletor.
- **Controles acima de cada card:** no **seu** card, botão de microfone (liga/desliga o mesmo microfone da dock) e medidor de nível; no card do **convidado**, botão de **mudo** (o ícone mostra som alto, baixo ou "X" vermelho), **controle de volume** de 0 a 200 % com preenchimento e o valor ao lado. De 100 % a 200 % o som é **amplificado** por um ganho de Web Audio (trecho laranja da barra, com dica "pode distorcer") e passa por um limitador (`DynamicsCompressor`) para evitar estalos. O volume do YouTube não passa de 100 %, limite da API do player. Volume e mudo ficam salvos (`tupi-voice`). O estado vazio não tem mais texto de instrução; só o ponto de espera.
- **Áudio nos dois ouvidos:** o áudio do convidado passa por Web Audio (`voice.js`), é reduzido a mono e sai igual na esquerda e na direita. Isso corrige o caso de só tocar do lado esquerdo (visto no Firefox): se o sinal chega estéreo com um canal vazio, o ganho é compensado em 2×. Enquanto o contexto de áudio não está ativo (antes do primeiro clique), o `<audio>` normal continua tocando. O microfone também é pedido em mono (`channelCount: ideal 1`).
- **Detecção de fala:** `voice.js` mede o nível do seu microfone e do áudio recebido com Web Audio (`AnalyserNode`), com limiar de entrada e saída e 320 ms de espera para não piscar. O mudo local só afeta o que você ouve: o indicador do convidado continua mostrando que ele está falando.

### 6.1.1 Reconexão manual

O botão **Reconectar** do cabeçalho refaz a conexão sem sair da sala:

- **Com duas pessoas:** descarta a conexão P2P atual, fecha a sinalização, espera o servidor liberar a vaga (a outra pessoa reinicia a negociação ao ver você entrar de novo) e entra de novo na mesma sala. Câmera, tela e microfone locais continuam ligados e são reenviados na nova conexão. Espera até 20 s e avisa o resultado por toast.
- **Sozinho na sala:** não fecha a sinalização (a sala seria removida). Só informa que a conexão com o servidor está ativa e que continua aguardando a outra pessoa. Se o socket estiver morto, refaz a entrada.
- **Quando falha:** mostra "Não foi possível reconectar" e o botão volta a ficar disponível para nova tentativa.
- A outra pessoa vê brevemente o aviso de que você saiu e volta a ver você ao reconectar.

### 6.1.2 YouTube compartilhado

O botão **YouTube** da dock é um modo compartilhado entre as duas pessoas, enviado pelo canal `control` (`{ type: "panel", open }`).

- **Abrir:** o painel abre nos dois lados, e quem recebe vê o aviso "A outra pessoa abriu o YouTube Watch Together." Qualquer um pode colar o link; o vídeo carrega nos dois navegadores, como antes.
- **Fechar:** fecha nos dois lados e **encerra o vídeo** (o player é destruído, em vez de continuar tocando escondido).
- **Botão aceso:** com o modo aberto, o botão YouTube fica vermelho-claro com anel pulsante (`.is-on`, `aria-pressed="true"`).
- **Compartilhar tela apagado:** com o YouTube aberto, o botão **Compartilhar tela** fica cinza, sem brilho e com `aria-disabled`; ao clicar, mostra "Feche o YouTube para compartilhar a tela." e não abre o menu. Se havia uma tela sendo compartilhada, ela é encerrada ao abrir o YouTube (e o outro lado, ao receber o evento, encerra a dele).
- **Quem entra depois:** o participante que já estava na sala (anfitrião) envia o estado ao novo canal: painel aberto e vídeo atual. Quem chega encontra o painel e o vídeo já abertos.
- **Volume:** compartilhado e individual (seção 6.1.3).
- **Reconexão:** o painel e o vídeo sobrevivem ao botão **Reconectar** e à entrada ou saída da outra pessoa; só **Sair da sala** encerra a sessão.

### 6.1.3 Volume do YouTube

Dois controles de volume no painel, lado a lado com o botão de mudo:

- **Volume compartilhado** (rosa): vale para as duas pessoas. Mexer em um lado move o controle do outro (`{ type: "volume", value }` no canal `control`, com limite de uma mensagem a cada 60 ms). Quem entra depois recebe o valor atual do anfitrião.
- **Só para mim** (roxo): ajuste individual, salvo no navegador (`tupi-yt-volume`); não é enviado.
- **Mudo pessoal:** o botão com ícone de alto-falante silencia o vídeo só para quem clicou; o ícone mostra 0, 1 ou 2 ondas conforme o volume efetivo.
- **Volume efetivo** = compartilhado × pessoal. Exemplo: compartilhado 40 % e pessoal 50 % tocam a 20 %. Fechar o YouTube volta o compartilhado a 100 %.

### 6.1.4 Layout sempre dentro da janela

Na sala, a página não rola: `body.in-room` ocupa `100dvh` e tudo se distribui em colunas flexíveis (cabeçalho, palco, dock, rodapé). O palco ocupa o espaço que sobra, e o player do YouTube e os cards dos participantes se ajustam a ele (os cards usam unidades de container, `cqh`). Em janelas baixas o aviso de criptografia some (abaixo de 640 px de altura) e, em palcos muito baixos, somem a dica e as barras de voz dos cards. Verificado em 1280×720, 1100×560 e 375×667 sem rolagem vertical nem horizontal. A Home pode rolar em telas muito baixas.

### 6.1.5 Tema claro, escuro ou automático

O tema fica na entrada **Tema** do menu **Mais** da chamada (mostra o modo atual: Automático, Claro ou Escuro; o menu continua aberto ao clicar) e em um botão (sol, lua ou meio círculo) no canto superior direito do lobby. Cada clique alterna **Automático** (segue o sistema) → **Claro** → **Escuro**.

- A escolha fica salva (`tupi-theme`; o modo automático não grava nada) e é aplicada antes da primeira pintura por `theme-boot.js`, sem piscar.
- Aplica-se com `data-theme` em `<html>`, que troca `color-scheme` e, com ele, todos os `light-dark()` dos tokens. Também ajusta as `theme-color` do navegador, a placa clara do logo e a intensidade da aurora.
- A troca tem transição suave (View Transitions) e o ícone gira ao mudar de modo.

### 6.3 Notificações, atalhos e chat automático

- **Chegada no lobby:** quando a outra pessoa chega e a chamada começa, toca um arpejo de 4 notas (o som respeita o botão **Som** do chat), o título da aba pisca "● A chamada começou" e, se o usuário permitiu, aparece uma notificação do navegador (a permissão é pedida ao clicar em **Participar agora**). Título e notificação só aparecem com a aba em segundo plano.
- **Mensagem ou arquivo recebido:** mensagem toca 2 notas e pedido de arquivo toca 3 notas diferentes. Nos dois casos o **chat abre sozinho** (no celular, o painel sobe) e a aba em segundo plano também pisca e notifica.
- **Atalhos de teclado:** `M` liga ou desliga o microfone, `V` a câmera, `C` abre ou fecha o chat e `F` alterna tela cheia. Ficam desativados ao digitar em campos e com Ctrl, Alt ou Cmd. As dicas aparecem nos botões; **Mais → Atalhos** abre um popup com a lista (fecha com Esc, X ou clique fora).
- **Links no chat:** URLs http(s) viram links com seta animada; o clique abre um popup "Abrir link externo?" com domínio e endereço completo, e só abre em nova aba (`noopener`) após confirmar.

### 6.4 Tela compartilhada: áudio, tela cheia e ajuste

- **Áudio da tela:** o menu **Compartilhar tela** ganhou a opção **Compartilhar áudio da tela** (ligada por padrão). No Chrome e no Edge é preciso marcar também o áudio na janela do navegador; o Firefox não captura áudio de tela. Há um 4º transceptor de áudio na conexão (separado do microfone) e um elemento `<audio id="screenAudio">` no receptor. Para evitar eco, prefira compartilhar uma aba em vez do sistema inteiro.
- **Mudo:** dois botões redondos no canto inferior direito da tela. Quem assiste silencia o áudio da tela só para si; quem compartilha silencia o áudio que envia (a captura continua). O ícone vira "X" vermelho quando mudo.
- **Tela cheia** (`F`): expande o palco.
- **Ajustar ou preencher:** alterna entre mostrar a tela inteira (sem cortar) e preencher o espaço (corta as bordas).

### 6.5 Alto-falante

Em **Mais > Dispositivos e áudio**, o seletor **Alto-falante** escolhe a saída de áudio (`setSinkId`) e o botão **Testar** toca três notas no dispositivo escolhido. A escolha vale para a voz do convidado (que agora sai por um elemento `<audio>` alimentado pelo Web Audio, para funcionar também no Firefox), para o áudio da tela e, onde o navegador permite, para os sons de aviso. Fica salva em `tupi-speaker`.

### 6.2 Canal de presença

Um quarto canal de dados (`presence`) avisa explicitamente a outra pessoa o que você está enviando: `{ t: "state", avatar, mic, camera, screen }`, reenviado a cada mudança. Quem recebe usa esse estado para mostrar ou esconder a câmera e a tela do outro. Isso corrige o defeito em que, ao parar a câmera ou a tela, o outro lado ficava com o último quadro congelado: o navegador nem sempre avisa o fim do envio (o evento `mute` não chegava), então a interface agora não depende dele. Mensagens maiores que 512 bytes, inválidas ou com avatar desconhecido são ignoradas.

## 7. Catálogo de interações e animações

Legenda: **CSS** = só CSS; **Motion** = `animate()`; **AA** = AutoAnimate; **VT** = View Transitions.

### Navegação e entrada
| Interação | Resposta visual | Como |
|---|---|---|
| Carregar o lobby | prévia e painel de entrada sobem e aparecem em sequência (70 ms de intervalo) | Motion (`enterStagger`) |
| Aurora de fundo | blobs à deriva continuamente | CSS |
| Hover no logo | cresce e inclina levemente | CSS (mola) |
| Pointer sobre "Participar agora" | botão acompanha o cursor (efeito ímã) | Motion (`magnet`) |
| Hover em "Participar agora" | brilho atravessa o botão e o gradiente desliza | CSS |
| Entrar na chamada | fade entre telas; cabeçalho desce, palco cresce, dock sobe e os botões aparecem em cascata | VT + Motion (`roomIn`) |
| Sair do lobby ou fim da chamada | fade de volta ao lobby e os itens entram em sequência | VT + Motion |

### Lobby e nomes
| Interação | Resposta | Como |
|---|---|---|
| Foco no campo "Seu nome" | anel roxo suave | CSS |
| Digitar o nome | prévia e campo mostram o nome na hora; vazio volta ao nome do avatar | JS (`voice.js`) |
| Clicar no avatar da prévia | seletor de 30 ícones abre com mola sobre a prévia | CSS (`.fx`) |
| Ligar microfone ou câmera na prévia | botão redondo fica branco; a câmera aparece espelhada; o medidor reage à voz | CSS + Web Audio |
| Falar na prévia | brilho e anéis em volta do avatar, como na chamada | CSS (`--level`) |
| Lobby cheio | ponto âmbar pulsando e texto "Tentando de novo…" | CSS |
| Segunda pessoa entra | as duas telas fazem fade para a chamada | VT + Motion |
| Clicar no seu nome no card da chamada | vira um campo de texto; o lápis aparece ao passar o mouse | CSS + JS |
| Outra pessoa muda de nome | o nome dá um "pop" no card | Motion (`pop`) |

### Botões (todos os `.btn`, "Participar agora", presets, Som, arquivos)
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
| Participante entra ou sai | contador dá um "pop" | Motion (`pop`) |
| Mudança de status | ponto muda de cor e pulsa | CSS (`data-tone`) |
| Hover em Reconectar | fundo tinge e o ícone gira 180° com mola | CSS |
| Conexão ruim (status vermelho) | botão Reconectar fica vermelho e pulsa um anel para chamar a atenção | CSS (`data-tone="bad"`) |
| Reconectando | botão fica roxo, desabilitado, com o ícone girando; toast "Tentando reconectar…" e, no fim, "Reconectado!" | CSS + toast |

### Dock de controles
| Interação | Resposta | Como |
|---|---|---|
| Hover | botão sobe 3 px, ícone cresce e gira | CSS |
| Microfone/câmera ligados | fundo verde e anel que pulsa | CSS (`ring`) |
| Microfone | troca entre ícone cortado e ativo | CSS |
| Compartilhar tela | brilho atravessa o botão ao passar o mouse | CSS |
| Abrir o YouTube | botão YouTube acende (vermelho-claro com anel pulsante), Compartilhar tela apaga (cinza, sem brilho) e o outro lado vê o painel abrir com aviso | CSS (`.is-on`, `.is-off`) + canal `control` |
| Clicar em Compartilhar tela com o YouTube aberto | toast "Feche o YouTube para compartilhar a tela." e o menu não abre | JS |
| Chat com mensagem nova | bolinha vermelha surge com mola e pulsa | CSS (`.fx`) |
| Sair (hover) | fundo vira vermelho cheio | CSS |
| Abrir menu | surge de baixo com mola (escala + deslocamento) | CSS (`menu-in`) |
| Expandir "Dispositivos e áudio" | seta gira 90° e os campos descem com fade | CSS |
| Escolher perfil de qualidade | borda rosa, fundo tingido e check que gira ao entrar | CSS |
| Hover em perfil | desliza 3 px para a direita | CSS |

### Palco e mídia
| Interação | Resposta | Como |
|---|---|---|
| Sala sem tela compartilhada | cards dos participantes "respiram" levemente; ponto de espera pulsa | CSS |
| Tela compartilhada começa/termina | cards somem com fade e escala; tile da tela entra com escala; ao parar, a tela some na hora nos dois lados | CSS (`.fx`) + presença |
| Badge de estado muda | texto reaparece com pequeno deslocamento | Motion (`swap`) |
| Câmera liga/desliga | miniatura entra/sai com escala e deslocamento | CSS (`.fx`) |
| Hover em tile | etiqueta sobe 3 px | CSS |
| Botão "Ativar áudio recebido" | desce com mola ao aparecer | CSS (`.fx`) |
| Alternar duas telas | grade muda de 1 para 2 colunas com fundo escurecendo | CSS |
| YouTube abre/fecha | painel desliza para baixo e a `.screen-area` alterna | CSS (`.fx`) |

### Participantes e voz
| Interação | Resposta | Como |
|---|---|---|
| Alguém fala | cartão ganha borda e brilho que acompanham o volume, avatar pulsa, dois anéis se expandem e somem em ciclo e as cinco barras dançam | CSS com `--level` atualizado a ~30 fps por `voice.js` |
| Parar de falar | efeitos desaparecem após 320 ms de silêncio | `voice.js` (histerese) |
| Convidado entra | card sai do estado translúcido; o avatar dele dá um "pop" | CSS + Motion (`pop`) |
| Hover no avatar (seu card) | sobe 4 px e aparece o botão de lápis com mola | CSS |
| Abrir o seletor de avatar | painel surge de baixo com mola; as opções sobem no hover e encolhem ao pressionar | CSS (`.fx`) |
| Escolher avatar | seletor fecha, avatar troca com "pop" e o outro lado vê a mudança | Motion + presença |
| Ligar o microfone | botão fica verde com anel pulsante e o medidor passa a reagir | CSS |
| Medidor de microfone | barra verde, amarela e vermelha acompanha o nível | CSS (`--level`) |
| Mudar o volume | preenchimento da barra acompanha o polegar; o polegar cresce no hover e ao arrastar; o ícone mostra mais ou menos ondas | CSS |
| Mudo | ícone vira "X" vermelho, texto muda para "Mudo" e o card mostra "Silenciado por você" | CSS |
| Câmera liga/desliga | vídeo cresce dentro do card e, ao desligar, some e o avatar volta | CSS (`.fx`) + presença |

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
| `is-on` | `#youtubeToggleBtn` | botão aceso (YouTube aberto) |
| `is-off` | `#screenBtn` | botão apagado (YouTube aberto) |
| `enabled` | `#chatSoundToggle` | som ativado |
| `connected` | `.chat-connection` | ponto verde |
| `copied` | `#copyBtn` | ícone de check |
| `shake` | `#joinForm` | tremor temporário |
| `mine` | `.message` | balão próprio |
| `has-video` | `.person` | câmera ocupa o card; avatar some |

Atributos de dados de `.person`: `data-speaking` (fala), `data-present` (convidado conectado), `data-mic` (microfone ligado), `data-muted` (silenciado por você). `--level` (0 a 1) é definido por `voice.js` em `.person`, `.avatar-mini` e `#micMeter`.

`data-tone` (`ok`, `wait`, `bad`) em `.status-chip` define a cor do ponto de status. `data-enter` marca elementos animados na entrada.

## 9. Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `public/index.html` | marcação das duas telas (mesmos ids da v2) |
| `public/style.css` | tokens, componentes, animações CSS e responsivo (arquivo único, legível) |
| `public/js/fx.js` | camada de animação: `enterStagger`, `roomIn`, `pop`, `swap`, `shake`, `flash`, `toastProgress`, `transition`, ripple, ímã, AutoAnimate |
| `public/js/ui.js` | helpers de DOM; chama `pop`, `swap` e `toastProgress`; guarda os flags de câmera/tela do outro lado (`setRemoteFlags`) e avisa mudanças locais (`onLocalMedia`) |
| `public/app.js` | orquestra; usa `transition`, `roomIn`, `enterStagger`, `shake`, `flash`; cria `Voice` e `Presence` |
| `public/js/theme-boot.js` | aplica o tema salvo antes da primeira pintura (script clássico, sem módulo) |
| `public/js/theme.js` | botão de tema: alterna automático, claro e escuro e salva a escolha |
| `public/js/features/avatars.js` | lista dos 30 avatares, nomes e persistência da escolha |
| `public/js/features/presence.js` | canal de dados `presence` (avatar e estado de mic, câmera e tela) |
| `public/js/features/voice.js` | cards, controles de voz, seletor de avatar, detecção de fala e volume |
| `public/js/core/peer.js` | cria e roteia o canal `presence` |
| demais `public/js/features/*` e `public/js/core/*` | lógica P2P, sem mudanças de comportamento |
| `public/vendor/*` | bibliotecas empacotadas por `npm run vendor` |
| `scripts/build-vendor.js` | gera `public/vendor` com esbuild |

## 10. Verificação feita

- `npm run check` e `npm test` (11 testes) passam.
- Todos os ids lidos pelo JS existem no HTML (os únicos ausentes são criados dinamicamente ou opcionais).
- No navegador (lobby único): entrada nas duas abas e chamada automática, nomes e avatares sincronizados, renomear durante a chamada, lobby cheio com espera e entrada quando abre vaga, saída e volta ao lobby, abrir chat e menu de compartilhamento, duas abas conectadas por P2P com troca de mensagens nos dois sentidos, toast, layout mobile (375 px).
- Com câmera, tela e microfone simulados por canvas e oscilador em duas abas: sincronização do avatar nos dois sentidos; câmera e tela somem na hora do outro lado ao parar (antes ficavam congeladas); indicador de fala local e remoto (após uma interação com a página); volume, mudo e persistência; seletor de avatar; layout desktop e mobile.
- Não testado: captura real de microfone, câmera e tela, microfone com voz humana, transferência de arquivo, YouTube Watch Together e Firefox/Safari.
- Limitação conhecida: o navegador só inicia o `AudioContext` depois de um clique ou tecla; quem entra por link e ainda não interagiu não vê a animação de fala até o primeiro clique.

### 6.4 Service Worker e PWA

- **Cache:** rede primeiro, cache como reserva; assim o app nunca fica preso a uma versão antiga, e o lobby abre offline. `/signal` e `/api/*` nunca passam pelo cache.
- **Download em stream:** sem `showSaveFilePicker` (Firefox, Safari), o recebimento abre um `MessagePort` com o SW, que devolve os blocos como resposta de `/sw-download/<id>` com `Content-Disposition: attachment`. O navegador grava em disco; cada bloco só é confirmado quando o SW tem espaço (contrapressão). Cancelar o download no navegador cancela a transferência.
- **Instalação:** `manifest.webmanifest` + ícones 192/512; o item **Mais > Instalar o TuPi** aparece apenas quando o navegador dispara `beforeinstallprompt`.

### 6.5 Protocolos de transferência de arquivos

- **v2 (compatível):** blocos de 64 KiB, um em voo, `ack` por bloco. A velocidade fica em torno de `64 KiB / RTT` (≈ 1,2 MiB/s com 40 ms).
- **v3 (rápido):** blocos de 128 KiB, janela de 16 blocos (`window` na oferta), `ack` cumulativo a cada `window/4` blocos e no último. Em teste local com 40 ms de RTT simulado, 8 MiB foram de 1,2 para ≈ 7,6 MiB/s.
- **Seleção:** seletor Automático / Rápido / Compatível (guardado em `tupi-file-mode`). Automático escolhe o rápido a partir de 4 MiB; o painel indica a recomendação por arquivo. Escolhas fora da recomendação são permitidas e avisadas no status.
- **Compatibilidade:** o receptor entende v2 e v3; se o receptor só conhecer v2 e rejeitar por protocolo, o remetente refaz a oferta em v2.
- **Inalterado:** hash SHA-256 por bloco, ordem estrita, consentimento, limites e download em stream.

### 6.6 Marca

- Logos vetoriais em `public/assets`: `tupi-claro.svg` (letras escuras) e `tupi-escuro.svg` (letras claras), trocados por CSS conforme o tema (`.logo-light` / `.logo-dark`, respeitando o botão de tema e o sistema); `tupi-simbolo.svg` é o símbolo isolado. As versões PNG ficam como reserva.
- `icon-192.png`, `icon-512.png` (PWA, notificações) e `favicon.ico` são gerados a partir do símbolo sobre fundo `#16131a`.
