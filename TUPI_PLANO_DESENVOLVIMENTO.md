# TuPi 2.0 — Plano mestre de desenvolvimento

> **Status:** especificação para implementação incremental com agentes de IA  
> **Idioma do produto:** português brasileiro  
> **Base analisada:** repositório `parrelladev/TuPi`, branch `master`, arquivos `README.md`, `package.json`, `server.js`, `public/index.html`, `public/style.css` e `public/app.js` (análise de 22/10/2026).  
> **Referência visual:** protótipo aprovado pelo proprietário: fundo branco, gradientes laranja/vermelho/magenta/roxo, logo próprio com duas figuras conectadas, cartões arredondados, interface de sala e versões mobile. **Não copiar o logo do Google Stadia.**

## 0. Como usar este documento com uma IA

Este arquivo é a fonte de verdade para o desenvolvimento do TuPi 2.0. Antes de qualquer alteração, o agente deve:

1. Ler este documento e inspecionar o código atual do repositório; **não assumir que a estrutura ainda é idêntica** à descrita aqui.
2. Identificar o marco em execução e **não implementar marcos posteriores sem autorização**.
3. Descrever brevemente o plano, os arquivos a modificar, riscos e testes previstos.
4. Trabalhar em uma branch específica (`feat/<nome-do-marco>`), mantendo `master` funcional; não apagar código sem compreender seu papel.
5. Fazer mudanças pequenas e coesas, executar testes, documentar o que mudou e listar limitações conhecidas.
6. Nunca declarar uma funcionalidade como testada se não houver teste real. Distinguir teste estático, teste automatizado em navegador e teste com dois dispositivos/redes.
7. Evitar dependências sem necessidade demonstrada. Não instalar framework, UI kit, banco de dados, Docker ou serviço SaaS por conveniência.

**Instrução reutilizável para o agente:**

> Leia `TUPI_PLANO_DESENVOLVIMENTO.md` integralmente. Implemente apenas o marco [IDENTIFICADOR]. Preserve o funcionamento existente, a leveza, o limite de dois participantes e a execução com `npm start`. Antes de codificar, apresente arquivos impactados e riscos. Ao finalizar, informe alterações, testes executados, critérios de aceite atendidos e pendências. Não adicione Docker, React, banco de dados ou serviços externos obrigatórios.

---

## 1. Visão e escopo do produto

**TuPi** é uma aplicação web leve, self-hosted, de comunicação P2P para **exatamente até duas pessoas por sala**, voltada especialmente a gamers e ao compartilhamento de imagem com a maior fidelidade viável. O nome combina uma referência brasileira ao termo Tupi e o trocadilho sonoro com **peer-to-peer**.

### Capacidades-alvo

- Criar sala, compartilhar link e entrar sem conta.
- Microfone confiável, com seleção de dispositivo e controles de processamento.
- Câmera e compartilhamento de tela independentes para cada participante; ambos podem compartilhar telas e usar câmeras simultaneamente.
- Layout dinâmico que prioriza o conteúdo transmitido e funciona em desktop/mobile.
- Configuração de qualidade por fonte: resolução, FPS, bitrate desejado e prioridade nitidez/fluidez; adaptação baseada em métricas reais.
- Chat P2P; transferência de arquivos P2P com progresso, cancelamento e integridade.
- YouTube Watch Together: cada navegador reproduz o vídeo diretamente do YouTube; sincronizar comandos e posição.
- Reprodução sincronizada de vídeo local, inicialmente quando ambos possuem o arquivo; posteriormente envio prévio P2P.
- Implantação simples por terminal, sem Docker ou banco de dados obrigatório.

### Não objetivos da versão 2.0

- Mais de dois participantes, SFU, gravação centralizada, armazenamento de mídia no servidor, contas obrigatórias, transcodificação no backend.
- Prometer 4K60, latência fixa ou conexão estritamente direta em todas as redes.
- Contornar DRM, restrições de incorporação do YouTube, bloqueios de navegador ou permissões de captura.

### Regras de produto

1. **No máximo dois peers**; limite validado no servidor.
2. O servidor sinaliza e serve a aplicação; mídia e dados seguem via WebRTC (diretamente quando possível, ou por TURN se necessário).
3. O app deve funcionar sem internet pública depois de instalado, exceto quando usar serviços escolhidos explicitamente (ex.: YouTube, STUN/TURN externos); documentar a diferença entre instalação local e conectividade entre redes.
4. Qualidade efetiva depende de hardware, navegador, codec, captura, rede e congestionamento.
5. O usuário controla separadamente áudio, câmera, tela e transferências.
6. O usuário pode entrar na sala com todos os dispositivos desligados.

---

## 2. Diagnóstico da base atual

Arquivos inspecionados:

| Arquivo | Situação atual | Implicação |
|---|---|---|
| `package.json` | `node >=20`, dependência `ws ^8.18.0`; scripts `start`, `dev`, `check` | Preservar comandos de terminal e dependências mínimas. |
| `server.js` | Servidor HTTP estático, `POST /api/rooms`, WebSocket `/signal`, salas em `Map`, limite de 2 | Base útil; modularizar com cautela. |
| `public/index.html` | Landing e sala são **duas seções do mesmo HTML**, não páginas separadas | Criar telas/estados sem necessariamente introduzir roteador externo. |
| `public/style.css` | CSS monolítico, tema escuro, responsividade básica | Separar tokens, layout, componentes e responsividade. |
| `public/app.js` | DOM, WebSocket, WebRTC, microfone, tela, chat e ciclo de vida no mesmo arquivo | Principal alvo da refatoração. |
| `README.md` | Descreve MVP e limitações | Atualizar ao longo dos marcos. |

### Problemas técnicos específicos confirmados

- `app.js` possui `audioSender` e apenas **um** `videoSender`: câmera e tela não são fontes independentes.
- `renderScreen()` escolhe tela remota ou local, sem layout para as duas simultâneas.
- `getDisplayMedia()` usa `frameRate: 20`, com áudio da tela desativado; não há painel de qualidade.
- STUN público de exemplo; TURN não configurado por padrão.
- O WebSocket de sinalização transmite `offer`, `answer`, `ice` e eventos de sala; futuras renegociações exigem disciplina para evitar colisões.
- O frontend usa DOM direto, sem estado centralizado por responsabilidade.
- Não há reconexão automática, testes automatizados robustos, persistência ou proteção antiabuso completa.
- `server.js` mantém salas em memória; isso é adequado para self-host simples, mas exige TTL para salas vazias e limitação de criação.

**Atenção:** não substituir tudo de uma vez. Primeiro isolar responsabilidades, manter a experiência atual funcionando e só depois introduzir novas fontes e protocolos.

---

## 3. Decisões de arquitetura

### Tecnologias

- **Backend:** Node.js 20+ com `node:http` e `ws`.
- **Frontend:** HTML semântico, CSS moderno, JavaScript ES modules nativos; sem React/Vue/Next/Tailwind obrigatórios.
- **Mídia:** WebRTC `RTCPeerConnection`, `RTCRtpTransceiver`, `getUserMedia`, `getDisplayMedia`.
- **Dados:** `RTCDataChannel` separado por finalidade (chat, controle/sincronização e arquivos).
- **Armazenamento:** salas em memória; configurações locais opcionais via `localStorage`, sem guardar segredos ou mídia.
- **Execução:** `npm install`, `npm start`; desenvolvimento com `npm run dev`; **não criar Dockerfile ou compose**.
- **Testes:** `node:test` para módulos isoláveis; adicionar Playwright somente se o custo for justificado, como dependência de desenvolvimento. Testes de mídia com dois navegadores e duas redes são obrigatórios antes do lançamento.

### Estrutura-alvo sugerida (adaptável)

```text
TuPi/
├── package.json
├── server.js                 # entrypoint preservado para npm start
├── server/
│   ├── rooms.js
│   ├── signaling.js
│   ├── config.js
│   └── static.js
├── public/
│   ├── index.html
│   ├── assets/
│   │   ├── tupi-logo.svg
│   │   └── icons.svg
│   ├── css/
│   │   ├── tokens.css
│   │   ├── base.css
│   │   ├── components.css
│   │   ├── home.css
│   │   ├── room.css
│   │   └── responsive.css
│   └── js/
│       ├── app.js
│       ├── state.js
│       ├── ui/
│       │   ├── home.js
│       │   ├── prejoin.js
│       │   ├── room.js
│       │   ├── media-tile.js
│       │   └── controls.js
│       ├── core/
│       │   ├── signaling.js
│       │   ├── peer.js
│       │   ├── media.js
│       │   ├── negotiation.js
│       │   ├── quality.js
│       │   └── stats.js
│       └── features/
│           ├── chat.js
│           ├── files.js
│           ├── youtube.js
│           └── local-player.js
├── tests/
├── .env.example
└── README.md
```

Não há obrigação de criar todos os arquivos imediatamente. Criar módulos conforme cada marco exigir. Evitar abstrações prematuras e bibliotecas para tarefas que APIs nativas resolvem.

### Contratos internos recomendados

- `RoomState`: `idle | creating | prejoin | joining | waiting | connecting | connected | reconnecting | failed | left`.
- `LocalMediaState` e `RemoteMediaState`: `mic`, `camera`, `screen`, cada qual com `enabled`, `track`, `stream`, `error` e metadados de qualidade, quando aplicável.
- `MediaSource`: `{ owner: 'local'|'remote', kind: 'camera'|'screen', stream, status }`.
- `QualityProfile`: `{ resolution, fps, maxBitrateBps, priority, adaptive }`.
- `ConnectionStats`: RTT, jitter, packet loss, bitrate efetivo, frames enviados/recebidos, FPS e tipo de candidato ICE quando disponível.
- Separar estado de UI (chat aberto, tile em destaque) de estado de sessão/mídia.

### Sinalização e negociação

- Preservar `POST /api/rooms` e `/signal` durante a migração.
- Introduzir um protocolo versionado e validado ao expandir mensagens; não confiar em payload do cliente.
- Implementar o padrão **perfect negotiation** (peers polite/impolite, flags de oferta e rollback conforme suporte) ou outra estratégia comprovada de serialização para evitar offer glare.
- Definir transceivers estáveis de áudio, câmera e tela; associar tracks recebidas por `mid`/metadados negociados, sem presumir ordem de `ontrack`.
- Tratar `mute`, `unmute`, `ended`, `replaceTrack`, renegociação, ICE restart, peer-left e cleanup.
- Reconexão de WebSocket não equivale a reconexão de WebRTC: desenhar recuperação dos dois estados separadamente.

---

## 4. Design system e UX

### Identidade visual aprovada

- Fundo predominante branco/off-white; texto grafite quase preto.
- Gradiente de marca laranja → vermelho → magenta → roxo, usado em CTAs e detalhes; **não cobrir todo o conteúdo com gradientes**.
- Cartões brancos, cantos arredondados, sombras discretas, espaço generoso.
- Logo **original** do TuPi com duas formas/pessoas conectadas; referência conceitual a dois peers e à identidade brasileira. Não reproduzir logo/silhueta do Google Stadia. O protótipo é referência visual, não um SVG final: redesenhar marca vetorial própria.
- Tipografia moderna legível; preferir fontes do sistema ou fonte local opcional, sem dependência obrigatória de CDN.
- Ícones SVG locais; não usar emojis como ícones definitivos de controle.
- Acessibilidade: foco visível, contraste, rótulos ARIA, atalhos não conflitantes, mensagens de erro claras e respeito a `prefers-reduced-motion`.

### Telas

**Home:** logo, título, subtítulo, CTA “Criar nova sala”, entrada por link/ID e informações discretas de privacidade. Sem menu lateral, login ou páginas de marketing complexas.

**Pré-entrada:** visualização da câmera, teste de microfone, escolha de dispositivos e botão “Entrar na sala”. Pré-entrada deve ser opcional para não adicionar fricção. Lidar com permissões negadas e ausência de dispositivos.

**Sala:** barra superior enxuta (logo, link, status), área de mídia adaptativa, chat lateral recolhível no desktop e painel/aba no mobile, controles inferiores acessíveis. O compartilhamento de tela tem prioridade sobre câmera; **dois compartilhamentos simultâneos devem receber espaço equivalente por padrão**, com opção de destacar um. O usuário nunca deve perder o controle de suas próprias fontes.

### Matriz de layouts

| Fontes ativas | Desktop | Mobile |
|---|---|---|
| Sem vídeo | Avatares e estados | Avatares e controles |
| Duas câmeras | Tiles lado a lado | Tiles empilhados |
| Uma tela + câmeras | Tela grande + câmeras pequenas | Tela destacada + miniaturas |
| Duas telas | Duas áreas equivalentes, alternância de foco | Alternância de foco e miniaturas; rotação quando útil |
| Tela e câmera do mesmo peer | Fontes independentes, PiP opcional | Tela prioritária, câmera minimizada |
| Chat aberto | Painel lateral sem sobrepor controles essenciais | Painel em primeiro plano com retorno rápido |

**Mobile:** usar `playsinline`, considerar safe areas e teclado virtual. Captura de tela mobile não é universal; esconder/desabilitar recurso com explicação quando não suportado. Não prometer suporte total a navegadores móveis sem teste.

---

## 5. Plano por marcos (executar na ordem)

### M0 — Baseline e testes de regressão

**Objetivo:** registrar o funcionamento atual antes de refatorar.

Tarefas:
- [x] Rodar `npm install`, `npm run check`, `npm start`.
- [x] Testar fluxo um a um: microfone, compartilhar tela, chat, sair e reentrar (confirmado pelo proprietário em dois pontos).
- [x] Registrar fluxos, mensagens de sinalização, estados e limitações em `M0_BASELINE.md`.
- [x] Adicionar testes mínimos do servidor: criação de sala, ID inválido, sala inexistente, limite de dois, saída e limpeza.
- [x] Criar checklist manual de regressão e baseline de tamanho do frontend/dependências.

**Aceite:** nenhum comportamento existente foi perdido no fluxo um a um; testes e checklist documentados. O cenário manual de terceiro participante foi dispensado pelo proprietário; o limite de duas conexões segue validado automaticamente. A correção de feedback para permissões negadas está implementada, aguardando reteste manual.

### M1 — Refatoração modular sem alteração funcional

**Status:** aprovado pelo proprietário; reteste manual de navegador segue pendente para registro de evidência.

Tarefas:
- [x] Extrair sinalização WebSocket, sessão WebRTC, mídia, chat e UI de `public/app.js` para módulos nativos.
- [x] Centralizar ciclo de vida e cleanup; eventos de formulário e controles são registrados uma vez.
- [x] Separar estado de sessão da manipulação de DOM.
- [x] Preservar rotas e URLs de convite existentes (`?room=<id>`); o servidor serve os módulos por uma lista explícita de caminhos.
- [x] Manter `npm start` e `npm run dev` sem adicionar dependências.

**Validação:** `npm run check` passou para o entrypoint e todos os módulos; `npm test` passou (3 testes). `npm start` iniciou em porta alternativa 3189 porque a porta 3000 já estava ocupada; home, entrypoint e os cinco módulos responderam HTTP 200 com tipo JavaScript correto.

**Pendente para aceite:** repetir no navegador os fluxos M0 após a extração e entrar/sair repetidamente. Não havia navegador disponível para automação nesta sessão.

**Aceite:** fluxos de M0 funcionam; sem duplicação de streams/listeners após entrar/sair repetidas vezes.

### M2 — Interface TuPi aprovada e responsividade

**Status:** aprovado pelo proprietário após revisão da interface e confirmação de responsividade.

Tarefas:
- [x] Aplicar logo local fornecido pelo proprietário em PNG e tokens de marca.
- [x] Atualizar Home e sala em HTML/CSS/JS modular, mantendo entrada direta opcional pela URL/código e controles sem ligar dispositivos automaticamente.
- [x] Criar componentes visuais de botão, painel, tile de participante, controles, status, toast e chat; não há modal nesta etapa pois não há fluxo que o exija.
- [x] Implementar estados vazios, aguardando peer, permissão negada e sala cheia com as mensagens/eventos existentes.
- [x] Adaptar estilos para desktop, tablet e celular; controles da sala permanecem disponíveis.
- [x] Não adicionar navegação lateral.

**Validação:** `npm run check` passou; `npm test` passou (3 testes); `git diff --check` sem erros; home, CSS, app, módulo de UI e logo retornaram HTTP 200 com tipos MIME esperados.

**Revisão visual:** a home e a sala foram abertas no navegador integrado a 790 px; a hierarquia visual e os controles foram conferidos. A revisão revelou transbordamento horizontal de 23 px causado por decoração da home, corrigido com recorte do elemento ornamental; após a correção, largura do documento e viewport ficaram iguais (790 px). O fluxo de criar e sair de uma sala local também foi conferido. O proprietário confirmou a responsividade no celular e dos demais elementos da interface, inclusive após a Home ficar sem navbar e sem a faixa inferior. O proprietário aprovou a direção visual final media-first.

**Ajuste posterior da Home:** por solicitação do proprietário, removido o mockup ilustrativo e centralizadas as ações principais: botão grande para criar sala, campo/call to action de entrada por código e texto de gratuidade.
Em uma iteração seguinte, removida também a navbar da Home; o logo foi centralizado acima das ações e o botão de criação teve sua altura reduzida.
Removida a faixa inferior a pedido do proprietário. A referência a featureStrip no ciclo de entrada/saída é opcional, permitindo manter a Home sem essa faixa.
Logo atualizado para o PNG fornecido pelo proprietário; favicon e imagem da Home agora usam o arquivo local public/assets/tupi-logo.png.
Adicionado rodapé escuro compartilhado pela Home e pela sala com ano, versão, link do repositório e indicação da tecnologia peer-to-peer.
Direção media-first aproximada do mockup: logo, código e copiar no cabeçalho; área de mídia principal; tela local e remota lado a lado quando ambas estão ativas; chat lateral no desktop e deslizante no celular; dock inferior com microfone, câmera, tela, chat, mais e sair. A lista de participantes foi removida, mantendo apenas um contador de pessoas na sala. Os botões de câmera e mais estão visíveis e desativados até suas funções serem implementadas; sobreposição de câmera depende da captura independente planejada para M3.

**Aceite:** aprovado pelo proprietário. Prévia de câmera/teste de microfone e menus de funções futuras continuam sem ativação até suas implementações.

**Critério de aceite:** layout responsivo, acessível e funcional com recursos existentes; sem regressões. **Atendido e aprovado pelo proprietário.**

**Ajuste posterior de salas:** corrigida a entrada manual, que exigia o ID interno completo de 128 bits enquanto a interface mostrava apenas parte dele. As salas passaram a receber nomes únicos de frutas entre dez opções; criação e entrada aceitam o nome, e os links compartilhados usam o nome da fruta (`?room=manga`). O identificador aleatório permanece interno. Há limite de dez salas simultâneas; salas criadas e não usadas expiram após cinco minutos.

### M3 — Microfone robusto e câmera independente

Tarefas:
- [ ] Separar `audioSender`, `cameraSender` e `screenSender`/transceivers.
- [ ] Adicionar câmera via `getUserMedia({video: ...})` e preview local.
- [ ] Permitir microfone, câmera e tela em qualquer combinação, em ambos os peers.
- [ ] Seleção de microfone/câmera; troca sem deixar tracks antigas abertas.
- [ ] Configurar `echoCancellation`, `noiseSuppression`, `autoGainControl` com perfis padrão e natural, quando suportados.
- [ ] Implementar negociação segura e identificação de fontes remotas.
- [ ] Lidar com permissões, dispositivos removidos e interrupção de captura pelo sistema.
- [ ] Considerar áudio de aba/sistema apenas quando suportado; não confundir com microfone.

**Aceite:** matriz completa com 0/1/2 câmeras, 0/1/2 telas e áudio de ambos; ligar/desligar qualquer fonte não derruba as outras; sem eco/duplicação de áudio em cenários comuns.

### M4 — Controle de qualidade e diagnóstico

Tarefas:
- [ ] Perfis iniciais de tela: economia (720p30), equilibrado (1080p30), fluidez (1080p60), ultra (tentativa de 4K60). **Perfis são solicitações, não garantias.**
- [ ] Perfil de câmera independente, com limites adequados.
- [ ] UI para resolução, FPS, bitrate máximo desejado e prioridade fluidez/nitidez.
- [ ] Verificar capacidades de codecs e codificação de hardware quando possível; não assumir AV1/VP9 em todos os dispositivos.
- [ ] Aplicar `getDisplayMedia`/`getUserMedia` constraints e `RTCRtpSender.setParameters()` quando suportado; verificar valores efetivos.
- [ ] Monitorar `getStats()` e mostrar bitrate real, FPS, RTT, jitter, perda e estado ICE.
- [ ] Ajuste adaptativo conservador, com histerese, evitando oscilações rápidas e sem competir com o controle de congestionamento do WebRTC.
- [ ] Indicador “direto/relay TURN” apenas quando as estatísticas permitirem identificar.
- [ ] Testar carga CPU/GPU, estabilidade e consumo de rede durante duas telas simultâneas.

**Aceite:** mudanças de perfil refletem solicitações verificáveis, métricas exibem valores reais, queda de rede não causa travamento permanente e configurações não prometem qualidade impossível.

### M5 — Transferência de arquivos P2P

Tarefas:
- [ ] Criar DataChannel específico para arquivos, separado de chat/controle.
- [ ] Protocolo de metadados (ID, nome, tamanho, MIME, chunks, status); validação e limite configurável.
- [ ] Consentimento explícito para recebimento.
- [ ] Envio em chunks com `bufferedAmount` e `bufferedAmountLowThreshold`, backpressure e controle de memória.
- [ ] Progresso, cancelamento e limpeza de transferências interrompidas.
- [ ] Verificação de integridade por hash quando viável sem carregar o arquivo inteiro na memória.
- [ ] Priorizar mídia: limitar/pausar transferência quando RTT, perda ou congestionamento aumentarem.
- [ ] Documentar diferenças de suporte para gravação em disco/streaming e fallback de memória.

**Aceite:** arquivo recebido íntegro; cancelamento funciona; arquivos grandes não exigem buffer completo em RAM; transferência não inviabiliza áudio/vídeo em testes de rede.

### M6 — Watch Together: YouTube

Tarefas:
- [ ] UI para colar URL/ID de vídeo e abrir player incorporado.
- [ ] Integrar YouTube IFrame Player API; cada peer baixa o vídeo diretamente do YouTube.
- [ ] Sincronizar play/pause/seek/estado e estimativa de posição via DataChannel de controle.
- [ ] Usar relógio/estimativa de offset e correção suave de drift, com tolerância configurável.
- [ ] Resolver comandos concorrentes (versão sequencial, timestamp lógico ou autoridade explícita).
- [ ] Tratar autoplay bloqueado, anúncios, buffering, vídeo indisponível e embed desabilitado.
- [ ] Não baixar/redistribuir vídeos do YouTube nem tentar contornar restrições.

**Aceite:** dois navegadores podem abrir o mesmo vídeo e sincronizar comandos em condições normais; erros de embed e divergências são apresentados claramente; sem tráfego de vídeo pelo servidor TuPi.

### M7 — Vídeo local sincronizado

Tarefas:
- [ ] Modo inicial: cada peer seleciona localmente o mesmo arquivo, sem upload.
- [ ] Comparar identidade do conteúdo (hash ou verificação robusta apropriada); não confiar apenas no nome.
- [ ] Sincronizar play/pause/seek/posição com o mesmo protocolo de M6, adaptado ao `<video>` nativo.
- [ ] Tratar codecs incompatíveis, buffering, duração diferente e autoplay.
- [ ] Modo opcional posterior: transferir o arquivo por M5 e iniciar após confirmação de integridade.
- [ ] Deixar streaming progressivo P2P de arquivo arbitrário para uma fase futura, após avaliação técnica.

**Aceite:** reprodução sincronizada do mesmo arquivo em dois dispositivos, sem enviar o conteúdo pelo servidor.

### M8 — Estabilidade, segurança e lançamento self-host

Tarefas:
- [ ] TTL para salas vazias; rate limiting e limites de payload/criação/conexão.
- [ ] Validar mensagens de sinalização e de DataChannel; não usar `innerHTML` com conteúdo de peers.
- [ ] Política de segurança de conteúdo compatível com WebRTC e YouTube opcional; cabeçalhos HTTP básicos.
- [ ] Reconexão controlada de sinalização e recuperação WebRTC/ICE restart; evitar duplicação de peers.
- [ ] Configuração de STUN/TURN via `.env`, sem credenciais hardcoded no frontend/repositório; documentar que credenciais TURN entregues ao navegador são visíveis e preferir credenciais temporárias quando possível.
- [ ] Documentar HTTPS/WSS em acesso remoto; `localhost` pode ser usado no desenvolvimento.
- [ ] Documentar proxy reverso opcional (Caddy/Nginx) sem torná-lo obrigatório para teste local.
- [ ] Validar `npm install`, `npm start`, `npm run dev`, `npm run check` e `npm test`.
- [ ] Testar Chrome, Firefox, Edge e navegadores móveis suportados; redes diferentes, NAT restritivo, TURN e perda de conexão.
- [ ] Medir bundle estático, uso de memória, CPU, bitrate e comportamento em sessão prolongada.
- [ ] Atualizar README, `.env.example`, troubleshooting, permissões e limitações.

**Aceite:** instalação pelo terminal documentada e reproduzível, sem Docker; aplicação funcional em cenários suportados e limitações conhecidas registradas.

---

## 6. Critérios globais de qualidade

### Testes mínimos por mudança

- Executar checagem de sintaxe e testes existentes.
- Testar criação, entrada, saída e retorno à sala.
- Testar estados sem peer e com dois peers.
- Testar permissão negada para microfone/câmera/tela.
- Testar encerramento da captura pelo navegador.
- Testar com chat aberto e fechado.
- Verificar se streams/tracks e listeners são liberados após sair.
- Verificar comportamento em viewport pequeno e teclado mobile.
- Não introduzir chamadas externas de telemetria, fontes ou analytics sem decisão explícita.

### Matriz de integração prioritária

| Cenário | Resultado esperado |
|---|---|
| Peer A câmera, Peer B câmera | Ambos se veem |
| Peer A tela, Peer B tela | Ambas as telas visíveis e independentes |
| A câmera + tela, B câmera + tela | Quatro fontes de vídeo gerenciadas corretamente |
| A microfone, B microfone | Áudio bidirecional estável |
| A desliga câmera durante tela | Tela continua sem interrupção |
| B sai durante transferência | Transferência cancela/recupera estado sem corromper UI |
| Rede cai e retorna | Estados claros; recuperação quando possível |
| Dois links de sala em paralelo | Salas isoladas |
| Terceiro usuário tenta entrar | Servidor recusa sem afetar os dois conectados |
| Celular sem `getDisplayMedia` | Interface explica indisponibilidade, sem botão quebrado |

### Orçamento de leveza

- Não adicionar dependência de runtime frontend sem justificativa explícita.
- Medir tamanho total dos assets (JS/CSS/SVG) em M0 e a cada marco; **não fixar orçamento arbitrário antes do baseline**.
- Evitar polling intenso; usar eventos e coleta de `getStats()` em frequência moderada.
- Evitar decodificar/duplicar streams desnecessariamente; pausar renderizações invisíveis quando apropriado sem interromper a transmissão.
- O servidor não deve decodificar/transcodificar mídia nem receber arquivos para armazenamento.
- TURN é um relay opcional necessário em algumas redes e pode consumir muita banda; documentar seu custo operacional.

---

## 7. Segurança, privacidade e limites

- Links de sala funcionam como credenciais de acesso: gerar IDs criptograficamente aleatórios, não registrar links completos em logs e permitir encerramento/expiração.
- WebRTC cifra transporte, mas isso **não equivale** a E2EE com autenticação/verificação de identidade. Documentar modelo de confiança.
- Solicitar permissão para captura e recepção de arquivos; indicar claramente quando câmera/microfone/tela estão ativos.
- Validar e limitar mensagens, nomes de arquivos e URLs; proteger contra XSS, DoS e consumo excessivo de memória.
- Não registrar conteúdo de chats, arquivos ou mídia no servidor.
- Para o YouTube, respeitar políticas e limitações da plataforma; o serviço externo poderá receber dados de acesso conforme seu funcionamento.
- O navegador pode bloquear autoplay, captura de tela e áudio do sistema; comunicar limitações sem mascará-las.

---

## 8. Estratégia de versionamento e entregas para IA

Branches sugeridas:

```text
feat/m0-baseline
refactor/m1-modules
feat/m2-visual
feat/m3-multimedia
feat/m4-quality
feat/m5-file-transfer
feat/m6-youtube-sync
feat/m7-local-video-sync
chore/m8-selfhost-hardening
```

Para cada marco, entregar:

1. Resumo de alterações e motivação.
2. Lista de arquivos criados/modificados.
3. Comandos para executar e testar.
4. Evidências de teste e cenários **não testados**.
5. Critérios de aceite marcados como atendidos/não atendidos.
6. Limitações, riscos e recomendações para o próximo marco.
7. README atualizado quando a instalação, UX ou configuração mudar.

**Regra de bloqueio:** não avançar se o marco atual introduzir regressão crítica em conexão, microfone, tela, chat, criação de sala ou limite de dois peers.

---

## 9. Comandos de execução desejados

```bash
# Instalação
npm install

# Execução normal
npm start

# Desenvolvimento
npm run dev

# Checagem (preservar e ampliar)
npm run check

# Testes (adicionar conforme marcos)
npm test
```

O servidor deverá continuar acessível em `http://localhost:3000` por padrão. Acesso remoto a APIs de captura requer HTTPS em navegadores modernos, com WSS para sinalização. Proxy TLS é opcional na instalação local, mas normalmente necessário para implantação pública.

**Não usar Docker. Não exigir build frontend. Não exigir banco de dados.**

---

## 10. Decisões em aberto (não inventar requisitos)

- Qual o conjunto de navegadores móveis oficialmente suportados? Definir após testes reais.
- A transmissão de áudio da aba/sistema é prioritária? Implementar somente onde houver suporte comprovado.
- Qual o comportamento desejado ao clicar em “sair”: destruir a sala ou permitir que o peer restante aguarde? Hoje o servidor mantém a sala enquanto há participante; preservar inicialmente.
- Qual limite padrão de arquivo e política de transferência simultânea? Definir por teste de rede/memória.
- Como lidar com vídeo local de codec incompatível? Mostrar erro e oferecer alternativa manual; evitar transcodificação no servidor.
- O modo “qualidade automática” terá qual agressividade? Calibrar com medições, não por números inventados.
- O ícone TuPi final deverá ser redesenhado em SVG a partir do conceito visual aprovado e revisado antes de aplicação em todas as telas.

---

## 11. Primeiro prompt de execução recomendado

> Analise o repositório TuPi e este plano. Comece exclusivamente pelo **M0 — Baseline e testes de regressão**. Não altere a arquitetura ainda. Verifique os comandos de terminal, documente o comportamento atual com dois peers, adicione testes mínimos do servidor sem dependências pesadas e produza um relatório de lacunas. Mantenha o código existente funcional. Ao terminar, apresente evidências e proponha o conjunto mínimo de alterações do M1, sem executá-lo automaticamente.

## 12. Definição de pronto do TuPi 2.0

TuPi 2.0 estará pronto quando dois participantes puderem entrar por link, controlar independentemente microfone, câmera e tela, transmitir simultaneamente com configurações de qualidade observáveis, trocar mensagens e arquivos diretamente, assistir juntos a um vídeo do YouTube ou arquivo local em cenários suportados, usar a interface responsiva aprovada e hospedar tudo com comandos Node.js documentados, sem Docker, banco de dados ou framework pesado obrigatório — com testes e limitações registrados.
